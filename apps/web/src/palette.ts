// Palette Lab logic: coverage by rasterizing the visible shapes (paint order, nonzero fill),
// merge planning, and the forced palette used when colors are locked. Pure; no DOM.
import type { TraceResult } from 'trace-vectorizer';
import { flattenPath } from '../../../packages/trace-vectorizer/src/pathdata';

export interface ColorCoverage {
  index: number;          // palette index
  hex: string;            // effective hex (edit applied)
  shapes: number;         // visible shapes resolved to this color (merged-in included)
  share: number;          // 0..1 of the image area where this color is the top-most paint
  mergedFrom: number[];   // palette indices merged into this one
}

export interface CoverageReport {
  colors: ColorCoverage[];
  unmeasured: number;     // shapes whose path data could not be flattened (counted, area 0)
  grid: { width: number; height: number };
}

export type MergeMap = Readonly<Record<number, number>>;

export function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[\da-f]{6}$/.test(v)) return v;
  const short = /^#([\da-f])([\da-f])([\da-f])$/.exec(v);
  return short ? `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}` : null;
}

/** Follow merge chains (a→b→c) to the surviving index. Cycles resolve to the first repeat. */
export function resolveMerge(merged: MergeMap, index: number): number {
  let cur = index;
  const seen = new Set<number>([cur]);
  for (;;) {
    const next = merged[cur];
    if (next === undefined || seen.has(next)) return cur;
    seen.add(next);
    cur = next;
  }
}

export function effectiveHex(palette: readonly string[], edits: Readonly<Record<number, string>>, index: number): string {
  return edits[index] ?? palette[index] ?? '#000000';
}

export interface MergePlan {
  merged: Record<number, number>;
  target: number;
  /** Palette indices whose shapes now render as the target color (target excluded). */
  recolor: number[];
  /** Shape ids that change color. */
  ids: number[];
}

/** Merge palette color `from` into `to`. Returns null for no-ops (same color, already merged, out of range). */
export function planMerge(result: TraceResult, merged: MergeMap, from: number, to: number): MergePlan | null {
  const n = result.palette.length;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n) return null;
  if (resolveMerge(merged, from) !== from) return null; // `from` is no longer a visible swatch
  const target = resolveMerge(merged, to);
  if (target === from) return null;
  const next: Record<number, number> = { ...merged, [from]: target };
  const recolor: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i !== target && resolveMerge(merged, i) === from) recolor.push(i);
  }
  const moving = new Set(recolor);
  const ids = result.shapes.filter((s) => moving.has(s.colorIndex)).map((s) => s.id);
  return { merged: next, target, recolor, ids };
}

/**
 * Forced palette for re-trace while colors are locked. The engine's `palette` option is
 * all-or-nothing, so locking pins the whole current palette: locked colors keep their exact
 * hex, every other surviving swatch is seeded from its current (edited) hex, and merged-away
 * colors are dropped. Returns undefined when nothing is locked (back to auto `colors`).
 */
export function forcedPalette(
  palette: readonly string[],
  locked: ReadonlySet<string>,
  edits: Readonly<Record<number, string>>,
  merged: MergeMap,
): string[] | undefined {
  if (locked.size === 0) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (hex: string): void => {
    const h = normalizeHex(hex);
    if (h && !seen.has(h)) { seen.add(h); out.push(h); }
  };
  for (const h of locked) push(h);
  for (let i = 0; i < palette.length; i++) {
    if (resolveMerge(merged, i) === i) push(effectiveHex(palette, edits, i));
  }
  return out;
}

interface Edge { x0: number; y0: number; x1: number; y1: number; dir: number }

/**
 * Coverage per palette color: rasterize visible shapes back-to-front on a grid (long side
 * `grid` samples) with the nonzero rule SVG uses by default; the top-most paint wins.
 */
export function computeCoverage(
  result: TraceResult,
  opts: { hidden?: ReadonlySet<number>; merged?: MergeMap; edits?: Readonly<Record<number, string>>; grid?: number } = {},
): CoverageReport {
  const merged = opts.merged ?? {};
  const edits = opts.edits ?? {};
  const hidden = opts.hidden ?? new Set<number>();
  const { width, height } = result;
  const scale = width > 0 && height > 0 ? Math.min(1, (opts.grid ?? 160) / Math.max(width, height)) : 0;
  const gw = Math.max(1, Math.round(width * scale));
  const gh = Math.max(1, Math.round(height * scale));
  const sx = gw / Math.max(width, 1e-9), sy = gh / Math.max(height, 1e-9);
  const labels = new Int32Array(gw * gh).fill(-1);
  const shapeCount = new Map<number, number>();
  let unmeasured = 0;
  const tolerance = Math.max(0.25, 0.5 / Math.max(sx, 1e-9));

  for (const shape of result.shapes) {
    if (hidden.has(shape.id)) continue;
    const label = shape.colorIndex >= 0 ? resolveMerge(merged, shape.colorIndex) : -2; // -2: gradient, still occludes
    if (label >= 0) shapeCount.set(label, (shapeCount.get(label) ?? 0) + 1);
    let polylines;
    try {
      polylines = flattenPath(shape.d, tolerance);
    } catch {
      unmeasured++;
      continue;
    }
    const edges: Edge[] = [];
    let minY = Infinity, maxY = -Infinity;
    for (const pl of polylines) {
      const pts = pl.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!; // fills close implicitly
        if (a.y === b.y) continue;
        const ay = a.y * sy, by = b.y * sy;
        edges.push(ay < by
          ? { x0: a.x * sx, y0: ay, x1: b.x * sx, y1: by, dir: 1 }
          : { x0: b.x * sx, y0: by, x1: a.x * sx, y1: ay, dir: -1 });
        minY = Math.min(minY, ay, by);
        maxY = Math.max(maxY, ay, by);
      }
    }
    if (!edges.length) continue;
    const r0 = Math.max(0, Math.floor(minY - 0.5)), r1 = Math.min(gh - 1, Math.ceil(maxY));
    const xs: { x: number; dir: number }[] = [];
    for (let row = r0; row <= r1; row++) {
      const yc = row + 0.5;
      xs.length = 0;
      for (const e of edges) {
        if (yc >= e.y0 && yc < e.y1) xs.push({ x: e.x0 + ((yc - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), dir: e.dir });
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p.x - q.x);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wind += xs[k]!.dir;
        if (wind === 0) continue;
        const c0 = Math.max(0, Math.ceil(xs[k]!.x - 0.5));
        const c1 = Math.min(gw, Math.ceil(xs[k + 1]!.x - 0.5));
        const base = row * gw;
        for (let c = c0; c < c1; c++) labels[base + c] = label;
      }
    }
  }

  const area = new Map<number, number>();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!;
    if (l >= 0) area.set(l, (area.get(l) ?? 0) + 1);
  }
  const total = gw * gh;
  const colors: ColorCoverage[] = [];
  for (let i = 0; i < result.palette.length; i++) {
    if (resolveMerge(merged, i) !== i) continue;
    const mergedFrom: number[] = [];
    for (let j = 0; j < result.palette.length; j++) if (j !== i && resolveMerge(merged, j) === i) mergedFrom.push(j);
    colors.push({
      index: i,
      hex: effectiveHex(result.palette, edits, i),
      shapes: shapeCount.get(i) ?? 0,
      share: (area.get(i) ?? 0) / total,
      mergedFrom,
    });
  }
  return { colors, unmeasured, grid: { width: gw, height: gh } };
}

/** "34.2 %" / "0.4 %" / "<0.1 %" — tabular, unit after a thin space per README. */
export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 0.1) return '<0.1 %';
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)} %`;
}
