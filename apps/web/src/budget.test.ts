import { describe, it, expect, vi } from 'vitest';

// The engine loads wasm, which is not available (or needed) for pure logic tests.
vi.mock('trace-vectorizer', () => ({ toSvg: () => '', toPdf: () => new Uint8Array(), toEps: () => '', toDxf: () => '' }));

import { nextSimplify, searchBudget, nextColors, gaugeRatio, MAX_TRACES } from './budget';
import type { TraceOptions, TraceResult } from 'trace-vectorizer';

describe('nextSimplify', () => {
  it('moves up when too big', () => {
    expect(nextSimplify(0, 1, 60, 40)).toEqual({ lo: 0.5, hi: 1, next: 0.75, fits: false });
  });
  it('moves down when it fits', () => {
    expect(nextSimplify(0, 1, 30, 40)).toEqual({ lo: 0, hi: 0.5, next: 0.25, fits: true });
  });
  it('treats equal as fit', () => {
    expect(nextSimplify(0.5, 1, 40, 40).fits).toBe(true);
  });
});

function fake(nodes: number): TraceResult {
  return { width: 10, height: 10, palette: [], shapes: [], gradients: [], stats: { paths: 1, nodes, colors: 1, ms: 1, preset: 'auto' } };
}

describe('searchBudget', () => {
  // nodes fall linearly with simplify and with color count
  const run = (o: TraceOptions) => Promise.resolve(fake(Math.round((1000 - 800 * (o.simplify ?? 0)) * ((typeof o.colors === 'number' ? o.colors : 10) / 10))));

  it('converges below target within the trace cap', async () => {
    const out = await searchBudget({}, { unit: 'nodes', target: 500 }, run, 10);
    expect(out.status).toBe('fit');
    expect(out.traces).toBeLessThanOrEqual(MAX_TRACES);
    expect(out.measured).toBeLessThanOrEqual(500);
    expect(out.opts.simplify).toBeGreaterThan(0.5);
  });
  it('drops colors when simplify alone cannot fit', async () => {
    const out = await searchBudget({}, { unit: 'nodes', target: 150 }, run, 10);
    expect(out.status).toBe('fit');
    expect(typeof out.opts.colors).toBe('number');
    expect(out.measured).toBeLessThanOrEqual(150);
    expect(out.traces).toBeLessThanOrEqual(MAX_TRACES);
  });
  it('reports unreachable', async () => {
    const out = await searchBudget({}, { unit: 'nodes', target: 1 }, run, 10);
    expect(out.status).toBe('unreachable');
    expect(out.traces).toBeLessThanOrEqual(MAX_TRACES);
  });
});

describe('helpers', () => {
  it('shrinks colors', () => { expect(nextColors(10)).toBe(6); expect(nextColors(2)).toBe(2); });
  it('ratio', () => { expect(gaugeRatio(20, 40)).toBe(0.5); expect(gaugeRatio(1, 0)).toBe(0); });
});
