import { describe, it, expect, beforeEach } from 'vitest';
import {
  opts, DEFAULT_OPTS, setOpts, setPreset, resetOpts, selection, select, clearSelection,
  hidden, setHidden, overrides, setOverride, setPaletteColor, setResult, result, viewMode, setViewMode,
} from './store';
import type { TraceResult } from 'trace-vectorizer';

const fake: TraceResult = {
  width: 10, height: 10, palette: ['#000000', '#ffffff'],
  shapes: [
    { id: 0, fill: '#000000', colorIndex: 0, d: 'M0 0' },
    { id: 1, fill: '#ffffff', colorIndex: 1, d: 'M0 0' },
    { id: 2, fill: '#000000', colorIndex: 0, d: 'M0 0' },
  ],
  gradients: [],
  stats: { paths: 3, nodes: 3, colors: 2, ms: 1, preset: 'logo' },
};

beforeEach(() => { resetOpts(); setResult(null); });

describe('store', () => {
  it('patches opts and resets', () => {
    setOpts({ colors: 8 });
    setPreset('logo');
    expect(opts.value.colors).toBe(8);
    expect(opts.value.preset).toBe('logo');
    resetOpts();
    expect(opts.value).toEqual(DEFAULT_OPTS);
  });
  it('selects single and additive', () => {
    select(1); select(2);
    expect([...selection.value]).toEqual([2]);
    select(1, true);
    expect([...selection.value].sort()).toEqual([1, 2]);
    select(1, true);
    expect([...selection.value]).toEqual([2]);
    clearSelection();
    expect(selection.value.size).toBe(0);
  });
  it('hides and shows', () => {
    setHidden([1, 2], true);
    expect(hidden.value.has(2)).toBe(true);
    setHidden([2], false);
    expect([...hidden.value]).toEqual([1]);
  });
  it('overrides and palette recolor', () => {
    setResult(fake);
    setOverride(1, '#ff0000');
    expect(overrides.value[1]).toBe('#ff0000');
    setOverride(1, null);
    expect(overrides.value[1]).toBeUndefined();
    expect(setPaletteColor(0, '#00ff00')).toEqual([0, 2]);
    expect(overrides.value[2]).toBe('#00ff00');
  });
  it('new result clears edits', () => {
    setResult(fake);
    select(1); setHidden([1], true); setOverride(1, '#fff000');
    setResult({ ...fake });
    expect(selection.value.size + hidden.value.size + Object.keys(overrides.value).length).toBe(0);
    expect(result.value).not.toBeNull();
  });
  it('view mode', () => {
    setViewMode('outlines');
    expect(viewMode.value).toBe('outlines');
  });
});
