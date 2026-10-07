import { describe, it, expect } from 'vitest';
import { computeDiff, diffSteps, parseCssColor, worstBlockSize } from './diff';

function img(w: number, h: number, fill: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}
function paint(im: ImageData, x0: number, y0: number, w: number, h: number, c: [number, number, number, number]): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) im.data.set(c, (y * im.width + x) * 4);
}
function gradient(w: number, h: number): ImageData {
  const im = img(w, h, [0, 0, 0, 255]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.data.set([x * 4, y * 4, (x + y) * 2, 255], (y * w + x) * 4);
  return im;
}

describe('computeDiff', () => {
  it('identical images: ssim 1, ΔE 0, empty worst rect, transparent heat', () => {
    const a = gradient(40, 24);
    const b = gradient(40, 24);
    const d = computeDiff(a, b);
    expect(d.ssim).toBeCloseTo(1, 6);
    expect(d.meanDeltaE).toBe(0);
    expect(d.worst).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(d.heat.width).toBe(40);
    expect(d.heat.height).toBe(24);
    expect(d.heat.data.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });

  it('locates a known difference and scores it', () => {
    const a = img(64, 48, [255, 255, 255, 255]);
    const b = img(64, 48, [255, 255, 255, 255]);
    paint(b, 41, 29, 5, 5, [0, 0, 0, 255]);
    const d = computeDiff(a, b);
    expect(d.ssim).toBeLessThan(0.99);
    expect(d.meanDeltaE).toBeGreaterThan(0);
    // worst rect contains the changed pixels' centre
    const { x, y, w, h } = d.worst;
    expect(w).toBeGreaterThan(0);
    expect(x <= 43 && 43 < x + w && y <= 31 && 31 < y + h).toBe(true);
    // black on white is maximal: heat at the changed pixel is the last ramp stop (crimson, opaque-ish)
    const o = (31 * 64 + 43) * 4;
    expect([...d.heat.data.slice(o, o + 4)]).toEqual([193, 31, 58, 230]);
    // unchanged pixel stays transparent
    expect(d.heat.data[3]).toBe(0);
  });

  it('composites alpha over white (transparent ≡ white)', () => {
    const a = img(8, 8, [0, 0, 0, 0]);
    const b = img(8, 8, [255, 255, 255, 255]);
    const d = computeDiff(a, b);
    expect(d.meanDeltaE).toBe(0);
    expect(d.ssim).toBeCloseTo(1, 6);
  });

  it('ΔE is in OKLab units (black vs white ≈ 1)', () => {
    const d = computeDiff(img(4, 4, [0, 0, 0, 255]), img(4, 4, [255, 255, 255, 255]));
    expect(d.meanDeltaE).toBeCloseTo(1, 2);
  });

  it('rejects mismatched sizes', () => {
    expect(() => computeDiff(img(4, 4, [0, 0, 0, 255]), img(4, 5, [0, 0, 0, 255]))).toThrow(RangeError);
  });

  it('is chunked: one step per row then per SSIM band, progress monotonic to 1', () => {
    const it = diffSteps(gradient(16, 20), gradient(16, 20));
    const progress: number[] = [];
    for (;;) {
      const s = it.next();
      if (s.done) break;
      progress.push(s.value);
    }
    expect(progress.length).toBe(20 + Math.ceil(20 / 8));
    expect(progress.at(-1)).toBeCloseTo(1);
    expect(progress.every((p, i) => i === 0 || p > progress[i - 1]!)).toBe(true);
  });

  it('worst block scales with size and maps partial edge blocks', () => {
    expect(worstBlockSize(64, 48)).toBe(8);
    expect(worstBlockSize(2400, 100)).toBe(100);
    const a = img(20, 20, [255, 255, 255, 255]);
    const b = img(20, 20, [255, 255, 255, 255]);
    paint(b, 18, 18, 2, 2, [0, 0, 0, 255]);
    expect(computeDiff(a, b).worst).toEqual({ x: 16, y: 16, w: 4, h: 4 });
  });
});

describe('parseCssColor', () => {
  it('parses computed token values', () => {
    expect(parseCssColor(' rgba(255, 176, 143, 0.55)')).toEqual([255, 176, 143, 0.55]);
    expect(parseCssColor('rgb(193 31 58 / 90%)')).toEqual([193, 31, 58, 0.9]);
    expect(parseCssColor('#ff5a1f')).toEqual([255, 90, 31, 1]);
    expect(parseCssColor('')).toBeNull();
  });
});
