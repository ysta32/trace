// Diff Lens math: per-pixel OKLab ΔE heatmap + SSIM (luma, 8x8 windows) + worst region.
// Pure and DOM-free so it runs in tests, on the main thread in idle chunks, or in a worker.

export interface DiffRect { x: number; y: number; w: number; h: number }
export interface DiffResult { heat: ImageData; ssim: number; meanDeltaE: number; worst: DiffRect }

/** RGBA stop: r,g,b in 0..255, a in 0..1. */
export type RampStop = readonly [number, number, number, number];

/** Mirrors tokens.css --diff-0..3 (light). DiffLens passes the live token values at runtime. */
export const DEFAULT_DIFF_RAMP: readonly RampStop[] = [
  [255, 90, 31, 0],
  [255, 176, 143, 0.55],
  [255, 90, 31, 0.75],
  [193, 31, 58, 0.9],
];

/** OKLab ΔE at which each ramp stop is reached (≈0.02 is one just-noticeable difference). */
export const DIFF_STOPS: readonly number[] = [0, 0.04, 0.12, 0.3];

export interface DiffOptions { ramp?: readonly RampStop[]; stops?: readonly number[] }

type Pixels = Pick<ImageData, 'data' | 'width' | 'height'>;

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lin(v: number): number {
  // v is a composited 0..255 float; interpolate the LUT so alpha blending stays smooth.
  const i = v | 0;
  if (i >= 255) return SRGB_TO_LINEAR[255]!;
  const f = v - i;
  return SRGB_TO_LINEAR[i]! * (1 - f) + SRGB_TO_LINEAR[i + 1]! * f;
}

/** sRGB (0..255, already composited) → OKLab into out[o..o+2]. */
function oklab(r: number, g: number, b: number, out: Float64Array, o: number): void {
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

function makeImageData(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(data, width, height);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

function rampColor(dE: number, ramp: readonly RampStop[], stops: readonly number[], out: Uint8ClampedArray, o: number): void {
  const last = ramp.length - 1;
  let k = 0;
  while (k < last && dE > stops[k + 1]!) k++;
  const a = ramp[k]!;
  if (k === last) {
    out[o] = a[0]; out[o + 1] = a[1]; out[o + 2] = a[2]; out[o + 3] = Math.round(a[3] * 255);
    return;
  }
  const b = ramp[k + 1]!;
  const lo = stops[k]!, hi = stops[k + 1]!;
  const t = hi > lo ? Math.min(1, Math.max(0, (dE - lo) / (hi - lo))) : 1;
  out[o] = a[0] + (b[0] - a[0]) * t;
  out[o + 1] = a[1] + (b[1] - a[1]) * t;
  out[o + 2] = a[2] + (b[2] - a[2]) * t;
  out[o + 3] = Math.round((a[3] + (b[3] - a[3]) * t) * 255);
}

/** Block edge for the worst-region search: ~1/24 of the long side, never below one SSIM window. */
export function worstBlockSize(width: number, height: number): number {
  return Math.max(8, Math.ceil(Math.max(width, height) / 24));
}

const SSIM_WIN = 8;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/**
 * Incremental diff. Yields progress (0..1) after each row / SSIM band so a scheduler can stop
 * between steps; one step is O(width) or O(8·width) work. Returns the full result when done.
 */
export function* diffSteps(src: Pixels, vec: Pixels, options: DiffOptions = {}): Generator<number, DiffResult, void> {
  const { width: w, height: h } = src;
  if (vec.width !== w || vec.height !== h) {
    throw new RangeError(`Image sizes differ: ${w}x${h} vs ${vec.width}x${vec.height}`);
  }
  const n = w * h;
  if (src.data.length < n * 4 || vec.data.length < n * 4) throw new RangeError('Pixel buffer is shorter than width x height x 4');
  const ramp = options.ramp ?? DEFAULT_DIFF_RAMP;
  const stops = options.stops ?? DIFF_STOPS;
  if (ramp.length < 2 || stops.length !== ramp.length) throw new RangeError('Ramp and stops must have the same length (>= 2)');

  const heat = new Uint8ClampedArray(n * 4);
  const lumA = new Float32Array(n);
  const lumB = new Float32Array(n);
  const B = worstBlockSize(w, h);
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const blockSum = new Float64Array(bw * bh);
  const blockCount = new Uint32Array(bw * bh);
  const labs = new Float64Array(6);
  const A = src.data, V = vec.data;
  let total = 0;
  const totalSteps = h + Math.ceil(h / SSIM_WIN);

  // Phase 1: composite over white, OKLab ΔE, heat color, luma.
  for (let y = 0; y < h; y++) {
    const brow = ((y / B) | 0) * bw;
    for (let x = 0; x < w; x++) {
      const p = y * w + x, o = p * 4;
      const aa = A[o + 3]! / 255, va = V[o + 3]! / 255;
      const ar = A[o]! * aa + 255 * (1 - aa), ag = A[o + 1]! * aa + 255 * (1 - aa), ab = A[o + 2]! * aa + 255 * (1 - aa);
      const vr = V[o]! * va + 255 * (1 - va), vg = V[o + 1]! * va + 255 * (1 - va), vb = V[o + 2]! * va + 255 * (1 - va);
      let dE = 0;
      if (ar !== vr || ag !== vg || ab !== vb) {
        oklab(ar, ag, ab, labs, 0);
        oklab(vr, vg, vb, labs, 3);
        dE = Math.hypot(labs[0]! - labs[3]!, labs[1]! - labs[4]!, labs[2]! - labs[5]!);
      }
      total += dE;
      const bi = brow + ((x / B) | 0);
      blockSum[bi]! += dE;
      blockCount[bi]! += 1;
      rampColor(dE, ramp, stops, heat, o);
      lumA[p] = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
      lumB[p] = 0.2126 * vr + 0.7152 * vg + 0.0722 * vb;
    }
    yield (y + 1) / totalSteps;
  }

  // Phase 2: SSIM on luma over non-overlapping 8x8 windows (edge windows are partial).
  let ssimSum = 0, windows = 0;
  for (let wy = 0, band = 0; wy < h; wy += SSIM_WIN, band++) {
    const y1 = Math.min(h, wy + SSIM_WIN);
    for (let wx = 0; wx < w; wx += SSIM_WIN) {
      const x1 = Math.min(w, wx + SSIM_WIN);
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, cnt = 0;
      for (let y = wy; y < y1; y++) {
        for (let x = wx; x < x1; x++) {
          const p = y * w + x;
          const a = lumA[p]!, b = lumB[p]!;
          sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; cnt++;
        }
      }
      const ma = sa / cnt, mb = sb / cnt;
      const va = Math.max(0, saa / cnt - ma * ma), vb = Math.max(0, sbb / cnt - mb * mb);
      const cov = sab / cnt - ma * mb;
      ssimSum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows++;
    }
    yield (h + band + 1) / totalSteps;
  }

  // Worst region: block with the highest mean ΔE (mean, so partial edge blocks are not penalized).
  let worst: DiffRect = { x: 0, y: 0, w: 0, h: 0 };
  let worstMean = 0;
  for (let i = 0; i < blockSum.length; i++) {
    const c = blockCount[i]!;
    if (c === 0) continue;
    const mean = blockSum[i]! / c;
    if (mean > worstMean) {
      worstMean = mean;
      const bx = (i % bw) * B, by = Math.floor(i / bw) * B;
      worst = { x: bx, y: by, w: Math.min(B, w - bx), h: Math.min(B, h - by) };
    }
  }

  return {
    heat: makeImageData(heat, w, h),
    ssim: windows ? ssimSum / windows : 1,
    meanDeltaE: n ? total / n : 0,
    worst,
  };
}

export function computeDiff(src: ImageData, vec: ImageData, options?: DiffOptions): DiffResult {
  const it = diffSteps(src, vec, options);
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
  }
}

/** Parse a computed CSS color ('rgba(…)', 'rgb(…)', '#rrggbb[aa]') into a ramp stop. */
export function parseCssColor(value: string): RampStop | null {
  const v = value.trim();
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return [Number(fn[1]), Number(fn[2]), Number(fn[3]), alpha];
  }
  const hex = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  }
  return null;
}
