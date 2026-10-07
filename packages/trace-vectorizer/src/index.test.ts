import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import * as api from './index.js';
import { init, isNode } from './wasm.js';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Two-color RGBA PNG: left half red, right half blue. */
function makePng(w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    for (let x = 0; x < w; x++) {
      const o = row + 1 + x * 4;
      const left = x < w / 2;
      raw[o] = left ? 220 : 20;
      raw[o + 1] = 20;
      raw[o + 2] = left ? 20 : 220;
      raw[o + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

describe('module surface', () => {
  it('exports the public API', () => {
    for (const k of ['init', 'analyze', 'trace', 'traceImageData', 'toSvg', 'toPdf', 'toEps', 'toDxf']) {
      expect(typeof (api as Record<string, unknown>)[k]).toBe('function');
    }
  });

  it('init() resolves in Node and is idempotent', async () => {
    const a = init();
    expect(init()).toBe(a);
    const mod = await a;
    expect(typeof mod.trace).toBe('function');
  });

  it('trace() rejects unsupported input', async () => {
    await expect(api.trace({} as never)).rejects.toThrow(TypeError);
  });
});

describe('isNode', () => {
  it('detects environments', () => {
    expect(isNode()).toBe(true);
    expect(isNode({})).toBe(false);
    expect(isNode({ process: { versions: { node: '20' } }, window: {} })).toBe(false);
    expect(isNode({ process: { versions: { node: '20' } }, importScripts: () => {} })).toBe(false);
    expect(isNode({ process: { versions: {} } })).toBe(false);
    expect(isNode({ process: { versions: { node: '20' } } })).toBe(true);
  });
});

describe('end-to-end (requires trace-core)', () => {
  it('trace() of a generated PNG', async () => {
    const res = await api.trace(makePng(32, 32), { colors: 2 });
    expect(res.width).toBe(32);
    expect(res.height).toBe(32);
    expect(res.shapes.length).toBeGreaterThan(0);
    expect(res.palette.length).toBeGreaterThanOrEqual(2);
  });

  it('analyze() of a generated PNG', async () => {
    const a = await api.analyze(makePng(32, 32));
    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
  });
});
