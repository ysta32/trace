import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { ssim } from 'ssim.js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const IMG = join(here, 'images');
const OUT = join(here, 'out');
mkdirSync(OUT, { recursive: true });

// ---- args ----
const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const only = arg('--only')?.split(',').map((s) => s.trim());
const filter = arg('--filter');

// ---- tools ----
type ToolFn = (png: Buffer, img: { width: number; height: number; data: Uint8Array }, category: string) => Promise<string> | string;
const TOOL_ORDER = ['ours', 'imagetracer', 'potrace'] as const;
type ToolName = (typeof TOOL_ORDER)[number];

async function loadOurs(): Promise<ToolFn> {
  let mod: any;
  try {
    mod = await import('trace-vectorizer');
  } catch (e1) {
    const pkg = join(here, '..', 'packages', 'trace-vectorizer');
    const alt = [join(pkg, 'dist', 'index.js'), join(pkg, 'src', 'index.ts')].find(existsSync) ?? '';
    if (!alt) throw new Error(`trace-vectorizer not available: ${(e1 as Error).message}`);
    mod = await import(alt);
  }
  return async (png) => {
    const res = await mod.trace(new Uint8Array(png), { preset: 'auto' });
    return mod.toSvg(res);
  };
}

const imagetracer: ToolFn = (_p, img) => {
  const IT = require('imagetracerjs');
  return IT.imagedataToSVG({ width: img.width, height: img.height, data: img.data });
};

const potraceTool: ToolFn = (png, _img, category) => {
  const potrace = require('potrace');
  const bw = category === 'lineart';
  return new Promise<string>((resolve, reject) => {
    const cb = (err: Error | null, svg: string) => (err ? reject(err) : resolve(svg));
    if (bw) potrace.trace(png, { threshold: 160 }, cb);
    else potrace.posterize(png, { steps: category === 'photos' ? 5 : 4 }, cb);
  });
};

const tools: Partial<Record<ToolName, () => Promise<ToolFn>>> = {
  ours: loadOurs,
  imagetracer: async () => imagetracer,
  potrace: async () => potraceTool,
};
const activeTools = TOOL_ORDER.filter((t) => !only || only.includes(t));

// ---- helpers ----
function decode(buf: Buffer) {
  const p = PNG.sync.read(buf);
  return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
}
function rasterize(svg: string, width: number, height: number): { png: Buffer; img: { width: number; height: number; data: Uint8Array } } {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'white' });
  const out = r.render();
  const png = Buffer.from(out.asPng());
  let img = decode(png);
  if (img.width !== width || img.height !== height) {
    // aspect drift from tool output: resample nearest to source size so SSIM stays defined
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / width));
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
      data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * width + x) * 4);
    }
    img = { width, height, data };
  }
  return { png, img };
}
function channelSsim(a: { width: number; height: number; data: Uint8ClampedArray }, b: { width: number; height: number; data: Uint8ClampedArray }): number {
  let total = 0;
  for (let c = 0; c < 3; c++) {
    const planes = [a, b].map((im) => {
      const data = new Uint8ClampedArray(im.data.length);
      for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = im.data[i + c]; data[i + 3] = 255; }
      return { width: im.width, height: im.height, data };
    });
    total += ssim(planes[0] as any, planes[1] as any, { ssim: 'original' } as any).mssim;
  }
  return total / 3;
}
function flatten(img: { width: number; height: number; data: Uint8Array }) {
  const d = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = img.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(img.data[i + c] * a + 255 * (1 - a));
    d[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: d };
}
function countPaths(svg: string): number {
  return (svg.match(/<path\b/g) ?? []).length;
}
/** Geometric nodes: segment endpoints (M/L/H/V/C/S/Q/T/A each count 1 per implicit repeat); Z is not a node. */
function countNodes(svg: string): number {
  const argc: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  let nodes = 0;
  for (const m of svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)) {
    const tokens = m[1].match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
    let cmd = '';
    for (let i = 0; i < tokens.length;) {
      if (/[A-Za-z]/.test(tokens[i])) { cmd = tokens[i].toUpperCase(); i++; if (cmd === 'Z') cmd = ''; continue; }
      const n = argc[cmd];
      if (!n) { i++; continue; }
      // arc flags may be packed without separators only in minified output; tokens here assume separated numbers
      i += n;
      nodes++;
      if (cmd === 'M') cmd = 'L';
    }
  }
  return nodes;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

interface Row {
  name: string;
  category: string;
  tool: ToolName;
  ssim?: number;
  paths?: number;
  nodes?: number;
  bytes?: number;
  ms?: number;
  error?: string;
}

// ---- main ----
const catOf = (f: string) => ({ logo: 'logos', icon: 'icons', line: 'lineart', pixel: 'pixelart', photo: 'photos' } as Record<string, string>)[f.split('-')[0]] ?? 'other';
const CATS = ['logos', 'icons', 'lineart', 'pixelart', 'photos'];
const files = readdirSync(IMG).filter((f) => f.endsWith('.png')).sort().filter((f) => !filter || f.includes(filter));
if (!files.length) throw new Error(`no images match filter ${filter}`);

const loaded: Partial<Record<ToolName, ToolFn>> = {};
const loadErr: Partial<Record<ToolName, string>> = {};
for (const t of activeTools) {
  try { loaded[t] = await tools[t]!(); } catch (e) { loadErr[t] = (e as Error).message; console.warn(`[${t}] unavailable: ${loadErr[t]}`); }
}

const rows: Row[] = [];
const panels = new Map<string, { tool: string; png: Buffer; caption: string }[]>();

for (const f of files) {
  const name = f.replace(/\.png$/, '');
  const category = catOf(name);
  const srcBuf = readFileSync(join(IMG, f));
  const src = decode(srcBuf);
  const srcFlat = flatten(src);
  const pl: { tool: string; png: Buffer; caption: string }[] = [{ tool: 'source', png: srcBuf, caption: `source ${src.width}x${src.height}` }];
  for (const t of activeTools) {
    const row: Row = { name, category, tool: t };
    rows.push(row);
    try {
      if (!loaded[t]) throw new Error(loadErr[t] ?? 'tool not loaded');
      const t0 = performance.now();
      const svg = await loaded[t]!(srcBuf, src, category);
      row.ms = Math.round((performance.now() - t0) * 10) / 10;
      row.bytes = Buffer.byteLength(svg);
      row.paths = countPaths(svg);
      row.nodes = countNodes(svg);
      const r = rasterize(svg, src.width, src.height);
      row.ssim = Math.round(channelSsim(srcFlat, flatten(r.img)) * 10000) / 10000;
      pl.push({ tool: t, png: r.png, caption: `${t}  SSIM ${row.ssim.toFixed(4)}  paths ${row.paths}  nodes ${row.nodes}  ${(row.bytes / 1024).toFixed(1)}KB  ${row.ms}ms` });
    } catch (e) {
      row.error = (e as Error).message.split('\n')[0];
      console.warn(`[${t}] ${name}: ${row.error}`);
      pl.push({ tool: t, png: Buffer.alloc(0), caption: `${t}  ERROR  ${row.error.slice(0, 44)}` });
    }
  }
  panels.set(name, pl);
  console.log(`${name}: ` + rows.filter((r) => r.name === name).map((r) => `${r.tool}=${r.ssim ?? 'ERR'}`).join(' '));
}

// ---- compare composites ----
for (const [name, pl] of panels) {
  const src = decode(pl[0].png);
  const cell = 300, pad = 12, capH = 84;
  const scale = Math.min(cell / src.width, cell / src.height);
  const pw = Math.round(src.width * scale), ph = Math.round(src.height * scale);
  const totalW = pl.length * (cell + pad) + pad, totalH = cell + capH + pad * 2 + 22;
  let body = `<rect width="${totalW}" height="${totalH}" fill="#f4f4f6"/><text x="${pad}" y="16" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="bold" fill="#222">${esc(name)}</text>`;
  pl.forEach((p, i) => {
    const x = pad + i * (cell + pad), y = 22 + pad;
    body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#fff" stroke="#ccc"/>`;
    if (p.png.length) body += `<image x="${x + (cell - pw) / 2}" y="${y + (cell - ph) / 2}" width="${pw}" height="${ph}" image-rendering="${scale > 1 ? 'pixelated' : 'auto'}" href="data:image/png;base64,${p.png.toString('base64')}"/>`;
    const words = p.caption.split(/\s{2,}/);
    words.forEach((w, k) => { body += `<text x="${x}" y="${y + cell + 14 + k * 13}" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="${p.png.length || i === 0 ? '#222' : '#b00020'}">${esc(w)}</text>`; });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">${body}</svg>`;
  const out = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  writeFileSync(join(OUT, `compare-${name}.png`), out);
}

// ---- results ----
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ generated: new Date().toISOString(), tools: activeTools, rows }, null, 2));

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (v: number | undefined, d = 0) => (v === undefined || Number.isNaN(v) ? '-' : v.toFixed(d));
const toolTitle = (t: string) => t;
let md = `# Benchmark results\n\nSSIM is computed per R/G/B channel (averaged) between the source and the SVG rasterized at source size on white (higher is better). Winner per row (bold) is the highest SSIM; ties and errored tools excluded. \`vtracer\` is skipped (no usable npm/WASM build). potrace uses \`trace\` for lineart and \`posterize\` otherwise.\n\n`;
const header = `| image | tool | SSIM | paths | nodes | bytes | ms |\n|---|---|---:|---:|---:|---:|---:|\n`;
for (const cat of CATS) {
  const cr = rows.filter((r) => r.category === cat);
  if (!cr.length) continue;
  md += `## ${cat}\n\n**Averages**\n\n| tool | SSIM | paths | nodes | bytes | ms | ok/total |\n|---|---:|---:|---:|---:|---:|---:|\n`;
  const avgs = activeTools.map((t) => {
    const tr = cr.filter((r) => r.tool === t), ok = tr.filter((r) => r.ssim !== undefined);
    return { t, s: avg(ok.map((r) => r.ssim!)), p: avg(ok.map((r) => r.paths!)), n: avg(ok.map((r) => r.nodes!)), b: avg(ok.map((r) => r.bytes!)), m: avg(ok.map((r) => r.ms!)), ok: ok.length, tot: tr.length };
  });
  const best = Math.max(...avgs.map((a) => (Number.isNaN(a.s) ? -1 : a.s)));
  for (const a of avgs) {
    const s = fmt(a.s, 4);
    md += `| ${toolTitle(a.t)} | ${!Number.isNaN(a.s) && a.s === best ? `**${s}**` : s} | ${fmt(a.p, 1)} | ${fmt(a.n, 0)} | ${fmt(a.b, 0)} | ${fmt(a.m, 1)} | ${a.ok}/${a.tot} |\n`;
  }
  md += `\n**Per image**\n\n${header}`;
  for (const n of [...new Set(cr.map((r) => r.name))]) {
    const ir = cr.filter((r) => r.name === n);
    const top = Math.max(...ir.map((r) => r.ssim ?? -1));
    for (const r of ir) {
      if (r.error) { md += `| ${n} | ${r.tool} | error: ${r.error.replace(/\|/g, '/')} | | | | |\n`; continue; }
      const s = r.ssim!.toFixed(4);
      md += `| ${n} | ${r.tool} | ${r.ssim === top ? `**${s}**` : s} | ${r.paths} | ${r.nodes} | ${r.bytes} | ${r.ms} |\n`;
    }
  }
  md += '\n';
}
writeFileSync(join(here, 'RESULTS.md'), md);
console.log(`wrote ${rows.length} rows -> out/results.json, RESULTS.md, ${panels.size} compare PNGs`);
