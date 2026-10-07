import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError, formatFromPath, outputName, parseCli, parsePalette } from './cli-args.js';
import { expandInputs, planJobs, run, type Engine, type Io } from './cli.js';
import type { TraceResult } from './types.js';

const fake: TraceResult = {
  width: 4, height: 2, palette: ['#000000'], gradients: [],
  shapes: [{ id: 0, fill: '#000000', colorIndex: 0, d: 'M0 0L4 0L4 2L0 2Z' }],
  stats: { paths: 1, nodes: 4, colors: 1, ms: 3, preset: 'logo' },
};
const engine: Engine = { trace: async () => fake };

function mkIo(stdin = new Uint8Array([1, 2, 3])) {
  const out: (string | Uint8Array)[] = [];
  let err = '';
  const io: Io = { stdin: async () => stdin, stdout: d => { out.push(d); }, stderr: t => { err += t; } };
  return { io, out, err: () => err };
}

describe('parseCli', () => {
  it('parses all options', () => {
    const c = parseCli(['a.png', 'b.png', '--format', 'pdf', '--preset', 'logo', '--colors', '8', '--palette', '#000,#FFF',
      '--simplify', '0.5', '--denoise', '0.2', '--mode', 'cutout', '--gradients', '--corner', '45', '--speckle', '4',
      '--precision', '3', '--json', '--stats', '-q']);
    expect(c.inputs).toEqual(['a.png', 'b.png']);
    expect(c.format).toBe('pdf');
    expect(c.trace).toEqual({
      preset: 'logo', colors: 8, palette: ['#000000', '#ffffff'], simplify: 0.5, denoise: 0.2,
      mode: 'cutout', gradients: true, cornerThreshold: 45, filterSpeckle: 4,
    });
    expect(c.precision).toBe(3);
    expect(c.json && c.stats && c.quiet).toBe(true);
  });
  it('accepts colors auto and stdin', () => {
    const c = parseCli(['-', '--colors', 'auto', '-o', '-']);
    expect(c.trace.colors).toBe('auto');
    expect(c.out).toBe('-');
  });
  it('infers format from -o extension', () => {
    expect(parseCli(['a.png', '-o', 'x.eps']).format).toBe('eps');
  });
  it.each([
    [['a.png', '--format', 'gif'], /unknown format/],
    [['a.png', '--preset', 'zzz'], /unknown preset/],
    [['a.png', '--colors', '1'], /out of range/],
    [['a.png', '--colors', 'x'], /not a number/],
    [['a.png', '--simplify', '2'], /out of range/],
    [['a.png', '--palette', 'red'], /invalid color/],
    [['a.png', '--bogus'], /bogus/],
    [[], /No input/],
    [['a.png', '-o', 'x.svg', '--out-dir', 'd'], /not both/],
    [['a.png', '-o', 'x.pdf', '--format', 'svg'], /conflicts/],
    [['a.png', '--precision', '1.5'], /integer/],
  ])('rejects %j', (argv, re) => {
    expect(() => parseCli(argv as string[])).toThrow(CliError);
    expect(() => parseCli(argv as string[])).toThrow(re as RegExp);
  });
  it('help and version need no input', () => {
    expect(parseCli(['-h']).help).toBe(true);
    expect(parseCli(['--version']).version).toBe(true);
  });
});

describe('helpers', () => {
  it('names outputs', () => {
    expect(outputName('dir/photo.v2.jpg', 'svg')).toBe('photo.v2.svg');
    expect(formatFromPath('a/b.DXF')).toBe('dxf');
    expect(formatFromPath('a.txt')).toBeUndefined();
    expect(parsePalette('abc')).toEqual(['#aabbcc']);
  });
  it('plans jobs', () => {
    const cfg = parseCli(['a.png', 'b.png', '--out-dir', 'o']);
    expect(planJobs(['a.png', 'b.png'], cfg, 'svg').map(j => j.output)).toEqual(['o/a.svg', 'o/b.svg']);
    expect(() => planJobs(['a.png', 'b.png'], parseCli(['a.png', 'b.png', '-o', 'x.svg']), 'svg')).toThrow(/single input/);
    expect(() => planJobs(['-'], parseCli(['-', '--out-dir', 'o']), 'svg')).toThrow(/stdin/);
  });
  it('expands dirs and globs', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tv-'));
    for (const n of ['a.png', 'b.jpg', 'c.txt']) await writeFile(join(d, n), 'x');
    expect(await expandInputs([d])).toEqual([join(d, 'a.png'), join(d, 'b.jpg')]);
    expect(await expandInputs([join(d, '*.png')])).toEqual([join(d, 'a.png')]);
    await expect(expandInputs([join(d, '*.gif')])).rejects.toThrow(/No files match/);
  });
});

describe('run (stub engine)', () => {
  it('prints help and version', async () => {
    const t = mkIo();
    expect(await run(['--help'], t.io, engine)).toBe(0);
    expect(String(t.out[0])).toContain('Usage:');
    const v = mkIo();
    expect(await run(['-v'], v.io, engine, '9.9.9')).toBe(0);
    expect(v.out[0]).toBe('9.9.9\n');
  });
  it('usage error gives exit 2', async () => {
    const t = mkIo();
    expect(await run(['--nope'], t.io, engine)).toBe(2);
    expect(t.err()).toMatch(/^tracevec: /);
  });
  it('stdin to stdout svg', async () => {
    const t = mkIo();
    expect(await run(['-'], t.io, engine)).toBe(0);
    expect(String(t.out[0])).toContain('<svg');
  });
  it('--json prints the result', async () => {
    const t = mkIo();
    expect(await run(['-', '--json'], t.io, engine)).toBe(0);
    expect(JSON.parse(String(t.out[0]))).toEqual(fake);
  });
  it('writes pdf/eps/dxf via -o', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tv-'));
    await writeFile(join(d, 'in.png'), 'png');
    for (const f of ['pdf', 'eps', 'dxf']) {
      const t = mkIo();
      expect(await run([join(d, 'in.png'), '-o', join(d, `o.${f}`)], t.io, engine)).toBe(0);
    }
    expect((await readFile(join(d, 'o.pdf'))).subarray(0, 4).toString()).toBe('%PDF');
    expect((await readFile(join(d, 'o.eps'))).toString()).toContain('%!PS');
  });
  it('batch to --out-dir, reports progress, and nonzero on a failure', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tv-'));
    await writeFile(join(d, 'a.png'), 'x');
    await writeFile(join(d, 'b.png'), 'x');
    const t = mkIo();
    const code = await run([join(d, 'a.png'), join(d, 'b.png'), join(d, 'missing.png'), '--out-dir', join(d, 'out')], t.io, engine);
    expect(code).toBe(1);
    expect((await readdir(join(d, 'out'))).sort()).toEqual(['a.svg', 'b.svg']);
    expect(t.err()).toContain('missing.png: cannot read');
    expect(t.err()).toMatch(/\[\d\/3\]/);
  });
  it('--stats prints to stderr unless --quiet', async () => {
    const a = mkIo();
    await run(['-', '--stats'], a.io, engine);
    expect(a.err()).toContain('paths=1');
    const b = mkIo();
    await run(['-', '--stats', '-q'], b.io, engine);
    expect(b.err()).toBe('');
  });
  it('rejects outputs that would overwrite an input', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tv-'));
    await writeFile(join(d, 'a.png'), 'x');
    const t = mkIo();
    expect(await run([join(d, 'a.png'), '--format', 'png'], t.io, engine)).toBe(2);
    expect(t.err()).toContain('overwrite the input');
    expect(await readFile(join(d, 'a.png'), 'utf8')).toBe('x');
    const u = mkIo();
    expect(await run([join(d, 'a.png'), '-o', join(d, 'a.png'), '-f', 'png'], u.io, engine)).toBe(2);
  });
  it('disambiguates same-stem inputs', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tv-'));
    await writeFile(join(d, 'a.png'), 'x');
    await writeFile(join(d, 'a.jpg'), 'x');
    const t = mkIo();
    expect(await run([join(d, 'a.png'), join(d, 'a.jpg')], t.io, engine)).toBe(0);
    expect((await readdir(d)).sort()).toEqual(['a-jpg.svg', 'a-png.svg', 'a.jpg', 'a.png']);
  });
  it('errors when disambiguation cannot separate outputs', () => {
    const cfg = parseCli(['x/a.png', 'y/a.png', '--out-dir', 'o']);
    expect(() => planJobs(['x/a.png', 'y/a.png'], cfg, 'svg')).toThrow(/same output/);
  });
  it('--batch traces a directory recursively', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tv-'));
    await mkdir(join(d, 'in', 'sub'), { recursive: true });
    await writeFile(join(d, 'in', 'a.png'), 'x');
    await writeFile(join(d, 'in', 'sub', 'b.png'), 'x');
    await writeFile(join(d, 'in', 'sub', 'n.txt'), 'x');
    expect(parseCli(['--batch', 'in']).batch).toBe('in');
    expect(await expandInputs([], join(d, 'in'))).toEqual([join(d, 'in', 'a.png'), join(d, 'in', 'sub', 'b.png')]);
    const t = mkIo();
    expect(await run(['--batch', join(d, 'in'), '--out-dir', join(d, 'out')], t.io, engine)).toBe(0);
    expect((await readdir(join(d, 'out'))).sort()).toEqual(['a.svg', 'b.svg']);
    const u = mkIo();
    expect(await run(['--batch', join(d, 'nope')], u.io, engine)).toBe(1);
  });
});

const hasResvg = await import('@resvg/resvg-js').then(() => true, () => false);

describe(hasResvg ? 'png output (resvg available)' : 'png output (resvg missing)', () => {
  if (hasResvg) {
    it('writes a valid PNG with the traced dimensions', async () => {
      const d = await mkdtemp(join(tmpdir(), 'tv-'));
      const out = join(d, 'o.png');
      const t = mkIo();
      expect(await run(['-', '-o', out], t.io, engine)).toBe(0);
      const b = await readFile(out);
      expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(b.subarray(12, 16).toString()).toBe('IHDR');
      expect(b.readUInt32BE(16)).toBe(fake.width);
      expect(b.readUInt32BE(20)).toBe(fake.height);
    });
  } else {
    it('exits 1 with install guidance', async () => {
      const t = mkIo();
      expect(await run(['-', '-f', 'png', '-o', '-'], t.io, engine)).toBe(1);
      expect(t.err()).toContain('npm install @resvg/resvg-js');
    });
  }
});

describe('e2e (real engine)', () => {
  it('traces a PNG into an SVG', async () => {
    // 2x2 red/blue PNG generated inline.
    const { deflateSync } = await import('node:zlib');
    const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b: Buffer) => {
      let c = 0xffffffff;
      for (const x of b) {
        const entry = crcT[(c ^ x) & 255];
        if (entry === undefined) throw new Error('Missing CRC table entry');
        c = entry ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (t: string, d: Buffer) => {
      const body = Buffer.concat([Buffer.from(t), d]);
      const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, c]);
    };
    const w = 16, h = 16;
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      if (x < 8) raw[o] = 255; else raw[o + 2] = 255;
    }
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    const t = mkIo(png);
    expect(await run(['-', '--colors', '2'], t.io)).toBe(0);
    expect(String(t.out[0])).toContain('<svg');
  });
});
