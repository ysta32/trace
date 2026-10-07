import { describe, expect, it } from 'vitest';
import { toSvg } from './svg.js';
import { toPdf } from './pdf.js';
import { toEps } from './eps.js';
import { toDxf } from './dxf.js';
import { flattenPath, parsePathData } from './pathdata.js';
import type { TraceResult } from './types.js';

const result: TraceResult = {
  width: 120, height: 80, palette: ['#ff0000', '#0000ff'],
  shapes: [
    { id: 7, colorIndex: 0, fill: '#ff0000', d: 'M1.2345 2L30 2L30 20Z' },
    { id: 8, colorIndex: -1, fill: 'url(#gradient)', d: 'M40 10Q50 30 60 10C65 0 75 0 80 10Z M45 12L50 12L48 15Z' },
  ],
  gradients: [{ id: 'gradient', x1: 40, y1: 10, x2: 80, y2: 10, stops: [{ offset: 0, color: '#000000' }, { offset: 0.5, color: '#00ff00' }, { offset: 1, color: '#ffffff' }] }],
  stats: { paths: 2, nodes: 11, colors: 2, ms: 1, preset: 'logo' },
};

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Expected a value to be present');
  return value;
}

function pdfText(input = result): string { return new TextDecoder().decode(toPdf(input)); }

describe('SVG export', () => {
  it('preserves paint order, gradients, dimensions, and configurable precision', () => {
    const svg = toSvg(result);
    expect(svg).toContain('viewBox="0 0 120 80"');
    expect(svg).toContain('<defs><linearGradient id="gradient" gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('<stop offset="0.5" stop-color="#00ff00"/>');
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg.indexOf('fill="#ff0000"')).toBeLessThan(svg.indexOf('fill="url(#gradient)"'));
    const d = required(/<path\b[^>]*\sd="([^"]+)"/.exec(svg)?.[1]);
    expect(d).toBe(required(result.shapes[0]).d);
    expect(parsePathData(d)[0]).toEqual({ command: 'M', x: 1.2345, y: 2 });
    expect(toSvg(result, { precision: 3 })).toContain('1.234');
  });
  it('hides by stable ID and applies overrides', () => {
    const svg = toSvg(result, { hidden: [7], overrides: { 8: '#123456' } });
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#123456"');
    expect(svg).not.toContain('fill="#ff0000"');
  });
  it('escapes attribute values and preserves adjacent numeric tokens', () => {
    const svg = toSvg({ ...result, shapes: [{ ...required(result.shapes[0]), d: 'M.123.456L1e-3-2z' }] }, { precision: 2, overrides: { 7: '"/><script>' } });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;/&gt;&lt;script&gt;');
    expect(parsePathData(required(/<path\b[^>]*\sd="([^"]+)"/.exec(svg)?.[1]))).toEqual([
      { command: 'M', x: 0.12, y: 0.46 }, { command: 'L', x: 0, y: -2 }, { command: 'Z' },
    ]);
    expect(() => toSvg(result, { precision: -1 })).toThrow();
  });
  it('passes path data through unchanged without explicit precision', () => {
    const d = 'M10.5 3c-.2.4 .12345-.6789 1e-3-2z M1,2 L3 4';
    const input = { ...result, shapes: [{ ...required(result.shapes[0]), d }] };
    for (const opts of [{}, { precision: undefined }, { overrides: { 7: '#123456' } }]) {
      const svg = toSvg(input, opts);
      const exported = required(/<path\b[^>]*\sd="([^"]+)"/.exec(svg)?.[1]);
      expect(exported).toBe(d);
      expect(parsePathData(exported)).toEqual(parsePathData(d));
    }
  });
  it.each([
    ['M1.499.501L1.001-.499L.499.501L-.499-.501', 2, 'M1.5.5L1-.5L.5.5L-.5-.5'],
    ['M.999.499L1.001-2.001L-.001.501', 2, 'M1 .5L1-2L0 .5'],
    ['M.499.501L1.499-2.501', 0, 'M0 1L1-3'],
    ['M1e-3-2L+3.456,+.789', 3, 'M.001-2L3.456.789'],
  ])('compacts rounded tokens without changing their boundaries: %s', (d, precision, expected) => {
    const svg = toSvg({ ...result, shapes: [{ ...required(result.shapes[0]), d }] }, { precision });
    const exported = required(/<path\b[^>]*\sd="([^"]+)"/.exec(svg)?.[1]);
    expect(exported).toBe(expected);
    const rounded = d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, value => `${Number(Number(value).toFixed(precision))} `);
    expect(parsePathData(exported)).toEqual(parsePathData(rounded));
  });
});

describe('path data', () => {
  it('expands relative, repeated, horizontal and vertical commands into absolute coordinates', () => {
    expect(parsePathData('m10 20 5-5 h10 v5 l-5 5 q1 2 3 4 c1 2 3 4 5 6 z m2 3 H40 V50')).toEqual([
      { command: 'M', x: 10, y: 20 }, { command: 'L', x: 15, y: 15 },
      { command: 'L', x: 25, y: 15 }, { command: 'L', x: 25, y: 20 },
      { command: 'L', x: 20, y: 25 }, { command: 'Q', x1: 21, y1: 27, x: 23, y: 29 },
      { command: 'C', x1: 24, y1: 31, x2: 26, y2: 33, x: 28, y: 35 }, { command: 'Z' },
      { command: 'M', x: 12, y: 23 }, { command: 'L', x: 40, y: 23 }, { command: 'L', x: 40, y: 50 },
    ]);
  });
  it('handles exponents, repeated curve groups and empty data', () => {
    expect(parsePathData('M1e1 -.5 Q11 1 12 2 13 3 14 4 C15 5 16 6 17 7 18 8 19 9 20 10')).toHaveLength(5);
    expect(parsePathData('')).toEqual([]);
  });
  it.each(['M0', 'L0 0', 'M0 0 A1 1 0 0 0 2 2', 'M0 0 Z1 2', 'M1e999 0', 'M0 0Q1 2 3'])('rejects malformed or unsupported data %s', d => {
    expect(() => parsePathData(d)).toThrow();
  });
  it('flattens curves adaptively and retains subpaths and closures', () => {
    const d = 'M0 0Q50 100 100 0Z M10 10C20 50 30 -50 40 10';
    const coarse = flattenPath(d, 2), fine = flattenPath(d, 0.1);
    expect(fine).toHaveLength(2);
    expect(required(fine[0]).closed).toBe(true);
    expect(required(fine[1]).closed).toBe(false);
    expect(required(fine[0]).points.length).toBeGreaterThan(required(coarse[0]).points.length);
    expect(required(fine[0]).points.at(-1)).toEqual({ x: 100, y: 0 });
    expect(required(fine[1]).points.at(-1)).toEqual({ x: 40, y: 10 });
    for (let step = 0; step <= 100; step++) {
      const t = step / 100, x = 100 * t, y = 200 * t * (1 - t);
      const points = required(fine[0]).points;
      const index = Math.max(1, points.findIndex(point => point.x >= x));
      const a = required(points[index - 1]), b = required(points[index]);
      const ratio = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
      expect(Math.hypot(x - a.x - ratio * (b.x - a.x), y - a.y - ratio * (b.y - a.y))).toBeLessThanOrEqual(0.1);
    }
    expect(required(flattenPath('M0 0C100 0 -100 0 0 0', 0.1)[0]).points.length).toBeGreaterThan(2);
    expect(() => flattenPath(d, 0)).toThrow();
  });
});

describe('PDF export', () => {
  it('writes byte-correct object offsets, startxref and stream length', () => {
    const bytes = toPdf(result), pdf = new TextDecoder().decode(bytes);
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    const xref = Number(required(/startxref\n(\d+)/.exec(pdf)?.[1]));
    expect(new TextDecoder().decode(bytes.slice(xref, xref + 4))).toBe('xref');
    const entries = pdf.slice(xref).split('\n').slice(3, 7);
    entries.forEach((entry, i) => {
      const offset = Number(entry.slice(0, 10));
      expect(new TextDecoder().decode(bytes.slice(offset)).startsWith(`${i + 1} 0 obj\n`)).toBe(true);
    });
    const stream = required(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/.exec(pdf));
    expect(new TextEncoder().encode(required(stream[2])).length).toBe(Number(required(stream[1])));
    expect(pdf).toContain('/MediaBox [0 0 120 80]');
    expect(pdf).toContain('/Count 1');
    expect(pdf).toContain('1 0 0 -1 0 80 cm');
    expect(pdf).toContain('0 1 0 rg');
    expect(pdf.match(/\nf\n/g)).toHaveLength(2);
    expect(pdf).toContain('46.666667 23.333333 53.333333 23.333333 60 10 c');
    expect(pdf).not.toContain('f*');
  });
  it('exports empty results and supports hidden shapes and fill overrides', () => {
    expect(pdfText({ ...result, shapes: [], gradients: [] })).toContain('xref');
    const pdf = new TextDecoder().decode(toPdf(result, { hidden: [7], overrides: { 8: '#0000ff' } }));
    expect(pdf).toContain('0 0 1 rg');
    expect(pdf).not.toContain('1 0 0 rg');
    expect(pdf.match(/\nf\n/g)).toHaveLength(1);
  });
});

describe('EPS export', () => {
  it('writes the bounding box, coordinate transform, curves and nonzero fills', () => {
    const eps = toEps(result);
    expect(eps.startsWith('%!PS-Adobe-3.0 EPSF-3.0')).toBe(true);
    expect(eps).toContain('%%BoundingBox: 0 0 120 80');
    expect(eps).toContain('0 80 translate\n1 -1 scale');
    expect(eps).toContain('0 1 0 setrgbcolor');
    expect(eps).toContain('46.666667 23.333333 53.333333 23.333333 60 10 curveto');
    expect(eps.match(/\nfill\n/g)).toHaveLength(2);
    expect(toEps({ ...result, width: 120.5 })).toContain('%%BoundingBox: 0 0 121 80');
    expect(toEps(result, { hidden: [7, 8] })).not.toContain('setrgbcolor');
  });
});

describe('DXF export', () => {
  it('writes R12 closed polylines per subpath with color layers and flipped y coordinates', () => {
    const dxf = toDxf(result);
    expect(dxf).toContain('0\nSECTION\n2\nENTITIES\n');
    expect(dxf).toContain('9\n$ACADVER\n1\nAC1009\n');
    expect(dxf.endsWith('0\nENDSEC\n0\nEOF\n')).toBe(true);
    expect(dxf.match(/0\nPOLYLINE\n/g)).toHaveLength(3);
    expect(dxf.match(/0\nSEQEND\n/g)).toHaveLength(3);
    expect(dxf).toContain('2\nCOLOR_FF0000\n');
    expect(dxf).toContain('2\nCOLOR_00FF00\n');
    expect(dxf).toContain('10\n1.2345\n20\n78\n');
    const entities = required(dxf.split('2\nENTITIES\n')[1]);
    expect(entities.match(/70\n1\n/g)).toHaveLength(3);
    expect(dxf).not.toContain('LWPOLYLINE');
  });
  it('applies visibility and overrides and closes open filled subpaths', () => {
    const dxf = toDxf(result, { hidden: [8], overrides: { 7: '#0000ff' } });
    expect(dxf.match(/0\nPOLYLINE\n/g)).toHaveLength(1);
    expect(dxf).toContain('COLOR_0000FF');
    expect(dxf).not.toContain('COLOR_FF0000');
    const open = toDxf({ ...result, shapes: [{ ...required(result.shapes[0]), d: 'M0 0L10 10L20 0' }] });
    expect(open).toContain('70\n1\n0\nVERTEX');
  });
});
