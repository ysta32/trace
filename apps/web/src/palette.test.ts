import { describe, it, expect } from 'vitest';
import type { TraceResult } from 'trace-vectorizer';
import { computeCoverage, planMerge, forcedPalette, resolveMerge, normalizeHex, formatShare } from './palette';

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;

function fixture(): TraceResult {
  return {
    width: 100, height: 100,
    palette: ['#ffffff', '#ff0000', '#0000ff'],
    shapes: [
      { id: 0, fill: '#ffffff', colorIndex: 0, d: rect(0, 0, 100, 100) },     // background
      { id: 1, fill: '#ff0000', colorIndex: 1, d: rect(0, 0, 50, 50) },       // 25 %
      { id: 2, fill: '#0000ff', colorIndex: 2, d: rect(50, 50, 20, 50) },     // 10 %
      { id: 3, fill: '#ff0000', colorIndex: 1, d: rect(60, 0, 10, 10) },      // 1 %
      // donut: outer 0..40 at (0,60) with a counter-wound hole 10..30 → 1600-400 = 1200 = 12 %
      { id: 4, fill: '#0000ff', colorIndex: 2, d: `${rect(0, 60, 40, 40)}M10 70L10 90L30 90L30 70Z` },
    ],
    gradients: [],
    stats: { paths: 5, nodes: 0, colors: 3, ms: 1, preset: 'logo' },
  };
}

describe('computeCoverage', () => {
  it('measures top-most paint per color (nonzero, occlusion, holes)', () => {
    const { colors, unmeasured, grid } = computeCoverage(fixture(), { grid: 100 });
    expect(grid).toEqual({ width: 100, height: 100 });
    expect(unmeasured).toBe(0);
    const by = Object.fromEntries(colors.map((c) => [c.hex, c]));
    expect(by['#ff0000']!.share).toBeCloseTo(0.26, 3);
    expect(by['#0000ff']!.share).toBeCloseTo(0.22, 3);
    expect(by['#ffffff']!.share).toBeCloseTo(0.52, 3);
    expect(colors.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
    expect(by['#ff0000']!.shapes).toBe(2);
  });

  it('respects hidden shapes and works on a coarse grid', () => {
    const { colors } = computeCoverage(fixture(), { hidden: new Set([1]), grid: 20 });
    const red = colors.find((c) => c.index === 1)!;
    expect(red.shapes).toBe(1);
    expect(red.share).toBeCloseTo(0.01, 2);
  });

  it('folds merged colors into the target and applies edits', () => {
    const { colors } = computeCoverage(fixture(), { merged: { 2: 1 }, edits: { 1: '#00ff00' }, grid: 100 });
    expect(colors.map((c) => c.index)).toEqual([0, 1]);
    const t = colors[1]!;
    expect(t.hex).toBe('#00ff00');
    expect(t.mergedFrom).toEqual([2]);
    expect(t.shapes).toBe(4);
    expect(t.share).toBeCloseTo(0.48, 3);
  });

  it('counts unparseable shapes instead of failing', () => {
    const r = fixture();
    r.shapes.push({ id: 9, fill: '#ff0000', colorIndex: 1, d: 'M0 0 A 1 1 0 0 0 5 5' });
    expect(computeCoverage(r).unmeasured).toBe(1);
  });
});

describe('merge logic', () => {
  it('plans a merge with affected shapes', () => {
    const plan = planMerge(fixture(), {}, 2, 1)!;
    expect(plan.target).toBe(1);
    expect(plan.merged).toEqual({ 2: 1 });
    expect(plan.recolor).toEqual([2]);
    expect(plan.ids).toEqual([2, 4]);
  });

  it('follows chains and carries merged-in colors along', () => {
    // 2 → 1, then 1 → 0: shapes of 1 and 2 both become 0
    const plan = planMerge(fixture(), { 2: 1 }, 1, 0)!;
    expect(plan.target).toBe(0);
    expect(plan.recolor.sort()).toEqual([1, 2]);
    expect(plan.ids.sort()).toEqual([1, 2, 3, 4]);
    expect(resolveMerge(plan.merged, 2)).toBe(0);
  });

  it('merging into a merged-away color targets its survivor', () => {
    const plan = planMerge(fixture(), { 2: 1 }, 0, 2)!;
    expect(plan.target).toBe(1);
  });

  it('rejects no-ops and cycles', () => {
    expect(planMerge(fixture(), {}, 1, 1)).toBeNull();
    expect(planMerge(fixture(), { 2: 1 }, 2, 0)).toBeNull();  // 2 is no longer a swatch
    expect(planMerge(fixture(), { 2: 1 }, 1, 2)).toBeNull();  // 2 resolves to 1 itself
    expect(planMerge(fixture(), {}, 0, 7)).toBeNull();
    expect(resolveMerge({ 1: 2, 2: 1 }, 1)).toBe(2);           // defensive cycle guard
  });
});

describe('forced palette (locks)', () => {
  it('is undefined with no locks', () => {
    expect(forcedPalette(['#000000'], new Set(), {}, {})).toBeUndefined();
  });
  it('pins locked first, then surviving edited colors, dropping merged-away and dupes', () => {
    const p = forcedPalette(['#ffffff', '#ff0000', '#0000ff'], new Set(['#FF0000']), { 0: '#eeeeee' }, { 2: 1 });
    expect(p).toEqual(['#ff0000', '#eeeeee']);
  });
});

describe('formatting', () => {
  it('normalizes hex and shares', () => {
    expect(normalizeHex('FFF')).toBe('#ffffff');
    expect(normalizeHex('#A1b2C3')).toBe('#a1b2c3');
    expect(normalizeHex('#12345')).toBeNull();
    expect(formatShare(0.342)).toBe('34 %');
    expect(formatShare(0.0123)).toBe('1.2 %');
    expect(formatShare(0.0004)).toBe('<0.1 %');
  });
});

// ---- Palette undo across re-traces (editorState + store, tracer simulated) ----
import { beforeEach } from 'vitest';
import { result, opts, overrides, setResult, resetOpts } from './store';
import {
  lockedColors, mergedColors, paletteEdits, paletteUndo,
  beginRecolor, recolor, mergeColors, toggleLock, resetPalette, undoPaletteEdit,
} from './editorState';

/** What the tracer would return for the current opts: forced palette when pinned, auto otherwise. */
function retrace(): TraceResult {
  const r = fixture();
  const forced = opts.value.palette;
  if (forced) {
    const map = r.palette.map((h) => forced.indexOf(h));
    r.palette = [...forced];
    for (const s of r.shapes) if (map[s.colorIndex]! >= 0) { s.colorIndex = map[s.colorIndex]!; s.fill = forced[s.colorIndex]!; }
  }
  setResult(r);
  return r;
}
const flush = () => Promise.resolve();

describe('palette undo', () => {
  beforeEach(() => {
    resetOpts();
    lockedColors.value = new Set();
    setResult(null);
    setResult(fixture());
  });

  it('restores overrides on the same result (merge → reset → undo → undo)', () => {
    mergeColors(2, 1);
    expect(overrides.value).toEqual({ 2: '#ff0000', 4: '#ff0000' });
    resetPalette();
    expect(overrides.value).toEqual({});
    expect(undoPaletteEdit()).toBe('Reset palette');
    expect(overrides.value).toEqual({ 2: '#ff0000', 4: '#ff0000' });
    expect(mergedColors.value).toEqual({ 2: 1 });
    expect(undoPaletteEdit()).toMatch(/^Merge/);
    expect(overrides.value).toEqual({});
    expect(undoPaletteEdit()).toBeNull();
  });

  it('a lock-triggered re-trace keeps the stack; undo restores locks + palette option and replays merges by hex', async () => {
    mergeColors(2, 1);
    toggleLock(0);
    expect(opts.value.palette).toEqual(['#ffffff', '#ff0000']);
    retrace();
    await flush();
    expect(paletteUndo.value.map((s) => s.label)).toEqual(['Merge #0000ff into #ff0000', 'Lock #ffffff']);

    expect(undoPaletteEdit()).toBe('Lock #ffffff');
    expect(lockedColors.value.size).toBe(0);
    expect(opts.value.palette).toBeUndefined();
    const r3 = retrace();                       // auto palette again: blue is back as its own index
    await flush();
    expect(result.value).toBe(r3);
    expect(mergedColors.value).toEqual({ 2: 1 });
    expect(overrides.value).toEqual({ 2: '#ff0000', 4: '#ff0000' });
    expect(paletteUndo.value).toHaveLength(1);

    expect(undoPaletteEdit()).toMatch(/^Merge/); // different result, same option: replayed in place
    expect(mergedColors.value).toEqual({});
    expect(overrides.value).toEqual({});
  });

  it('recolor of a locked color re-pins; undo restores the old lock and palette atomically', async () => {
    toggleLock(1);
    retrace();
    await flush();
    const idx = result.value!.palette.indexOf('#ff0000');
    const session = beginRecolor(idx);
    recolor(idx, '#00ff00', session, false);
    recolor(idx, '#00ff00', session, true);
    expect([...lockedColors.value]).toEqual(['#00ff00']);
    expect(opts.value.palette![0]).toBe('#00ff00');
    retrace();
    await flush();
    expect(paletteUndo.value).toHaveLength(2);

    undoPaletteEdit();
    expect([...lockedColors.value]).toEqual(['#ff0000']);
    expect(opts.value.palette![0]).toBe('#ff0000');
    retrace();
    await flush();
    expect(paletteEdits.value).toEqual({});
    expect(paletteUndo.value).toHaveLength(1);
  });

  it('a re-trace we did not cause clears the stack', () => {
    mergeColors(2, 1);
    opts.value = { ...opts.value, denoise: 0.9 };
    retrace();
    expect(paletteUndo.value).toHaveLength(0);
    expect(mergedColors.value).toEqual({});
  });
});
