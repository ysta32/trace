import { describe, it, expect, vi } from 'vitest';

// The engine loads wasm, which is not available (or needed) for pure logic tests.
vi.mock('trace-vectorizer', () => ({ toSvg: () => '', toPdf: () => new Uint8Array(), toEps: () => '', toDxf: () => '' }));

import { batchReducer, initialBatch, batchProgress, uniqueNames, concurrency, type BatchState } from './batch';

const add = (names: string[]) => batchReducer(initialBatch, { type: 'add', names });

describe('batchReducer', () => {
  it('adds queued items with unique ids', () => {
    const s = batchReducer(add(['a.png', 'b.png']), { type: 'add', names: ['c.png'] });
    expect(s.items.map((i) => [i.id, i.status])).toEqual([[1, 'queued'], [2, 'queued'], [3, 'queued']]);
  });
  it('runs queued -> running -> done', () => {
    let s = add(['a.png']);
    s = batchReducer(s, { type: 'start', id: 1 });
    expect(s.items[0]?.status).toBe('running');
    s = batchReducer(s, { type: 'done', id: 1, paths: 4, svgBytes: 1200, ms: 30 });
    expect(s.items[0]).toMatchObject({ status: 'done', paths: 4, svgBytes: 1200, ms: 30 });
  });
  it('ignores illegal transitions', () => {
    const s = add(['a.png']);
    expect(batchReducer(s, { type: 'done', id: 1, paths: 1, svgBytes: 1, ms: 1 })).toEqual(s);
    expect(batchReducer(s, { type: 'retry', id: 1 })).toEqual(s);
  });
  it('fails and retries', () => {
    let s = batchReducer(batchReducer(add(['a.png']), { type: 'start', id: 1 }), { type: 'fail', id: 1, error: 'bad' });
    expect(s.items[0]).toMatchObject({ status: 'error', error: 'bad' });
    s = batchReducer(s, { type: 'retry', id: 1 });
    expect(s.items[0]).toMatchObject({ status: 'queued', error: undefined });
  });
  it('cancel stops queued and running but keeps done', () => {
    let s: BatchState = add(['a', 'b', 'c']);
    s = batchReducer(s, { type: 'start', id: 1 });
    s = batchReducer(s, { type: 'done', id: 1, paths: 1, svgBytes: 1, ms: 1 });
    s = batchReducer(s, { type: 'start', id: 2 });
    s = batchReducer(s, { type: 'cancel' });
    expect(s.items.map((i) => i.status)).toEqual(['done', 'cancelled', 'cancelled']);
    s = batchReducer(s, { type: 'retry', id: 3 });
    expect(s.items[2]?.status).toBe('queued');
  });
  it('removes and clears', () => {
    const s = add(['a', 'b']);
    expect(batchReducer(s, { type: 'remove', id: 1 }).items).toHaveLength(1);
    expect(batchReducer(s, { type: 'clear' }).items).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('progress', () => {
    let s = add(['a', 'b', 'c', 'd']);
    s = batchReducer(batchReducer(s, { type: 'start', id: 1 }), { type: 'done', id: 1, paths: 1, svgBytes: 1, ms: 1 });
    s = batchReducer(batchReducer(s, { type: 'start', id: 2 }), { type: 'fail', id: 2, error: 'x' });
    expect(batchProgress(s.items)).toMatchObject({ total: 4, done: 1, failed: 1, fraction: 0.5 });
  });
  it('dedupes zip names', () => {
    expect(uniqueNames(['logo.png', 'sub/logo.jpg', 'x.png'], 'svg')).toEqual(['logo.svg', 'logo-2.svg', 'x.svg']);
  });
  it('never reuses a suffixed name', () => {
    const out = uniqueNames(['logo.png', 'logo.jpg', 'logo-2.png'], 'svg');
    expect(new Set(out).size).toBe(3);
    expect(out).toEqual(['logo.svg', 'logo-2.svg', 'logo-2-2.svg']);
  });
  it('concurrency is min(4, cores-1), at least 1', () => {
    expect(concurrency(16)).toBe(4);
    expect(concurrency(4)).toBe(3);
    expect(concurrency(1)).toBe(1);
  });
});
