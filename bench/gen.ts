import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'src-svg');
const IMG = join(here, 'images');
mkdirSync(SRC, { recursive: true });
mkdirSync(IMG, { recursive: true });

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const svgs: Record<string, string> = {};
const wrap = (w: number, h: number, body: string, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>\n`;

// ---- logos (flat, antialiased) ----
svgs['logo-circles'] = wrap(256, 256,
  `<rect width="256" height="256" fill="#ffffff"/><circle cx="104" cy="112" r="70" fill="#e63946"/><circle cx="152" cy="112" r="70" fill="#1d3557" fill-opacity="1"/><path d="M128 52 A70 70 0 0 1 128 172 A70 70 0 0 1 128 52Z" fill="#a8dadc"/><rect x="48" y="200" width="160" height="14" rx="7" fill="#1d3557"/>`);
svgs['logo-text'] = wrap(320, 160,
  `<rect width="320" height="160" fill="#f1faee"/><path d="M30 40H110V62H80V122H58V62H30Z" fill="#1d3557"/><path d="M125 40H150Q185 40 185 64Q185 82 168 87L190 122H165L146 90H147V122H125Z M147 58V76H152Q162 76 162 67Q162 58 152 58Z" fill="#1d3557" fill-rule="evenodd"/><path d="M200 122L226 40H250L276 122H252L238 70L224 122Z" fill="#e63946"/><rect x="30" y="134" width="260" height="6" fill="#457b9d"/>`);
svgs['logo-shield'] = wrap(240, 280,
  `<rect width="240" height="280" fill="#ffffff"/><path d="M120 16 L216 48 V132 Q216 214 120 264 Q24 214 24 132 V48Z" fill="#264653"/><path d="M120 40 L192 64 V132 Q192 192 120 232 Q48 192 48 132 V64Z" fill="#2a9d8f"/><path d="M120 76 L140 118 L186 124 L152 156 L162 202 L120 178 L78 202 L88 156 L54 124 L100 118Z" fill="#e9c46a"/>`);
svgs['logo-swoosh'] = wrap(300, 200,
  `<rect width="300" height="200" fill="#ffffff"/><path d="M20 140 C70 20 190 10 280 60 C200 50 110 70 60 160Z" fill="#f77f00"/><path d="M40 170 C110 100 190 90 270 120 C200 120 130 140 90 190Z" fill="#003049"/><circle cx="240" cy="40" r="18" fill="#d62828"/>`);

// ---- icons ----
svgs['icon-home'] = wrap(128, 128,
  `<rect width="128" height="128" fill="#ffffff"/><path d="M16 64 L64 18 L112 64 H98 V108 H30 V64Z" fill="#3a86ff"/><rect x="52" y="70" width="24" height="38" rx="3" fill="#ffffff"/><rect x="82" y="22" width="12" height="26" fill="#ff006e"/>`);
svgs['icon-gear'] = (() => {
  let teeth = '';
  for (let i = 0; i < 8; i++) teeth += `<rect x="56" y="8" width="16" height="24" rx="3" fill="#495057" transform="rotate(${i * 45} 64 64)"/>`;
  return wrap(128, 128, `<rect width="128" height="128" fill="#ffffff"/>${teeth}<circle cx="64" cy="64" r="40" fill="#495057"/><circle cx="64" cy="64" r="18" fill="#ffffff"/>`);
})();
svgs['icon-heart'] = wrap(96, 96,
  `<rect width="96" height="96" fill="#ffffff"/><path d="M48 84 C8 54 6 26 26 18 C38 13 46 20 48 28 C50 20 58 13 70 18 C90 26 88 54 48 84Z" fill="#e5383b"/><path d="M26 30 C30 24 38 24 40 30" stroke="#ffb3c1" stroke-width="5" fill="none" stroke-linecap="round"/>`);
svgs['icon-cloud'] = wrap(192, 128,
  `<rect width="192" height="128" fill="#caf0f8"/><path d="M52 98 A26 26 0 0 1 50 46 A36 36 0 0 1 118 40 A30 30 0 0 1 144 98Z" fill="#ffffff" stroke="#0077b6" stroke-width="5"/><circle cx="150" cy="30" r="14" fill="#ffd60a"/>`);

// ---- lineart (black strokes on white) ----
svgs['line-spiral'] = (() => {
  let d = 'M150 150';
  for (let i = 1; i <= 120; i++) { const t = i * 0.16, r = 3 + i * 1.05; d += ` L${(150 + r * Math.cos(t)).toFixed(2)} ${(150 + r * Math.sin(t)).toFixed(2)}`; }
  return wrap(300, 300, `<rect width="300" height="300" fill="#fff"/><path d="${d}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
})();
svgs['line-flower'] = (() => {
  let p = '';
  for (let i = 0; i < 8; i++) p += `<path d="M150 150 C110 90 130 40 150 30 C170 40 190 90 150 150Z" fill="none" stroke="#000" stroke-width="3" transform="rotate(${i * 45} 150 150)"/>`;
  return wrap(300, 300, `<rect width="300" height="300" fill="#fff"/>${p}<circle cx="150" cy="150" r="14" fill="none" stroke="#000" stroke-width="4"/><path d="M150 164 C140 220 170 250 150 290" fill="none" stroke="#000" stroke-width="2.5"/>`);
})();
svgs['line-scribble'] = (() => {
  const r = rng(7);
  let d = 'M20 150';
  for (let i = 0; i < 9; i++) d += ` C${40 + i * 30} ${40 + r() * 220} ${60 + i * 30} ${40 + r() * 220} ${50 + i * 30} ${100 + r() * 100}`;
  return wrap(320, 300, `<rect width="320" height="300" fill="#fff"/><path d="${d}" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round"/><path d="M30 270 Q160 230 300 275" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>`);
})();

// ---- pixelart: sprites at native size, upscaled x8 ----
const sprites: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  'pixel-mushroom': {
    pal: { r: '#d62828', w: '#fcfcfc', b: '#5c3a21', s: '#f4d9b0', k: '#1b1b1b' },
    rows: ['................', '.....kkkkkk.....', '...kkrrwwrrkk...', '..krrwwwwrrrrk..', '.krrrwwrrrwwrrk.', '.krwwrrrrrwwrrk.', 'krrwwrrrrrrrrrrk', 'krrrrrrwwwrrrrrk', 'krrwwrrwwwrrwwrk', 'kkkkkkkkkkkkkkkk', '...kssssssssk...', '...ksskssksk....', '...kssssssssk...', '...kssssssssk...', '....kkkkkkkk....', '................'],
  },
  'pixel-heart': {
    pal: { r: '#ff355e', d: '#9d0b2c', h: '#ffc2d1', k: '#2b2b2b' },
    rows: ['................', '..kkkk....kkkk..', '.krrhhk..krrrrk.', 'krrhhrrkkrrrrrrk', 'krhhrrrrrrrrrrrk', 'krhrrrrrrrrrrrdk', 'krrrrrrrrrrrrrdk', '.krrrrrrrrrrrdk.', '..krrrrrrrrrdk..', '...krrrrrrrdk...', '....krrrrrdk....', '.....krrrdk.....', '......krdk......', '.......kk.......', '................', '................'],
  },
  'pixel-sword': {
    pal: { g: '#c0c8d0', l: '#eef2f5', d: '#6c7680', y: '#e0a526', b: '#6b3b1f', k: '#14141c' },
    rows: ['..............kk', '.............kllk', '............kllgk', '...........kllgk.', '..........kllgk..', '.........kllgk...', '........kllgk....', '.k.....kllgk.....', 'kyk...kllgk......', 'kyyk.kllgk.......', '.kyykllgk........', '..kyyggk.........', '...kyyk..........', '..kbbkyk.........', '.kbbk.kk..........', 'kkkk............'],
  },
};
const pixelSvgs: Record<string, string> = {};
for (const [name, s] of Object.entries(sprites)) {
  let rects = '';
  s.rows.forEach((row, y) => [...row].forEach((c, x) => { if (s.pal[c]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${s.pal[c]}"/>`; }));
  const n = s.rows.length;
  pixelSvgs[name] = wrap(n, n, `<rect width="${n}" height="${n}" fill="#8ecae6"/>${rects}`, ' shape-rendering="crispEdges"');
}

// ---- render ----
function render(svg: string, scale = 1, nearest = false): PNG {
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, background: 'white', shapeRendering: nearest ? 0 : 2 });
  const img = r.render();
  const p = new PNG({ width: img.width, height: img.height });
  Buffer.from(img.pixels).copy(p.data);
  return p;
}
function save(name: string, p: PNG) {
  const buf = PNG.sync.write(p, { colorType: 2, inputColorType: 6, inputHasAlpha: true });
  writeFileSync(join(IMG, `${name}.png`), buf);
  console.log(`${name}.png ${p.width}x${p.height} ${(buf.length / 1024).toFixed(1)}KB`);
}

for (const [name, svg] of Object.entries(svgs)) {
  writeFileSync(join(SRC, `${name}.svg`), svg);
  save(name, render(svg));
}
for (const [name, svg] of Object.entries(pixelSvgs)) {
  writeFileSync(join(SRC, `${name}.svg`), svg);
  save(name, render(svg, 8, true));
}

// ---- photos: procedural scene + noise / texture ----
const W = 288, H = 216;
const photoSvgs: Record<string, string> = {
  'photo-landscape': wrap(W, H,
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b6cb0"/><stop offset="0.6" stop-color="#9ccbe8"/><stop offset="1" stop-color="#f7d9a8"/></linearGradient><radialGradient id="sun" cx="0.7" cy="0.45" r="0.25"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.3" stop-color="#ffe9a0" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient><linearGradient id="h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b7a5a"/><stop offset="1" stop-color="#2f4a35"/></linearGradient><linearGradient id="h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a9b5c"/><stop offset="1" stop-color="#3d5a2a"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#sun)"/><circle cx="200" cy="96" r="14" fill="#fffdf0"/><path d="M0 150 Q50 90 110 130 T230 120 T288 140 V216 H0Z" fill="url(#h1)"/><path d="M0 180 Q70 130 140 170 T288 160 V216 H0Z" fill="url(#h2)"/><ellipse cx="60" cy="40" rx="40" ry="9" fill="#fff" fill-opacity="0.55"/><ellipse cx="120" cy="55" rx="30" ry="6" fill="#fff" fill-opacity="0.4"/>`),
  'photo-portrait': wrap(W, H,
    `<defs><radialGradient id="bg" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="#9aa9b8"/><stop offset="1" stop-color="#3b4452"/></radialGradient><radialGradient id="face" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#f3c9a5"/><stop offset="1" stop-color="#c58d68"/></radialGradient><linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#46607a"/><stop offset="1" stop-color="#1f2d3d"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/><path d="M30 216 Q40 150 144 146 Q248 150 258 216Z" fill="url(#cloth)"/><rect x="124" y="120" width="40" height="34" rx="10" fill="#b9825e"/><ellipse cx="144" cy="84" rx="46" ry="56" fill="#3a2418"/><ellipse cx="144" cy="94" rx="38" ry="48" fill="url(#face)"/><ellipse cx="128" cy="90" rx="5" ry="3" fill="#2a1a12"/><ellipse cx="160" cy="90" rx="5" ry="3" fill="#2a1a12"/><path d="M130 118 Q144 128 158 118" stroke="#8a3b3b" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M144 92 L140 108 L148 108" stroke="#b07a58" stroke-width="2" fill="none"/>`),
  'photo-texture': (() => {
    const r = rng(99);
    let s = '';
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * H, rx = 10 + r() * 34, ry = 8 + r() * 24, hue = 20 + r() * 50, l = 30 + r() * 35;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="hsl(${hue.toFixed(0)} 45% ${l.toFixed(0)}%)" fill-opacity="0.75" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    s += `<rect x="70" y="60" width="150" height="100" rx="8" fill="#d9c9a3" fill-opacity="0.85"/><circle cx="145" cy="110" r="28" fill="#6b8f71"/>`;
    return wrap(W, H, `<rect width="${W}" height="${H}" fill="#8a7458"/>${s}`);
  })(),
};
const noiseCfg: Record<string, { sigma: number; grain: number; seed: number }> = {
  'photo-landscape': { sigma: 3.5, grain: 2, seed: 1 },
  'photo-portrait': { sigma: 3, grain: 1.5, seed: 2 },
  'photo-texture': { sigma: 4, grain: 4, seed: 3 },
};
for (const [name, svg] of Object.entries(photoSvgs)) {
  writeFileSync(join(SRC, `${name}.svg`), svg);
  const p = render(svg);
  const { sigma, grain, seed } = noiseCfg[name];
  const r = rng(seed);
  // fine gaussian sensor noise + low-frequency luminance grain + blocky JPEG-ish 8x8 DC jitter
  const blocks = new Map<number, number>();
  const bw = Math.ceil(p.width / 8);
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const bk = (y >> 3) * bw + (x >> 3);
    if (!blocks.has(bk)) blocks.set(bk, gauss(r) * grain);
    const i = (y * p.width + x) * 4;
    const lum = gauss(r) * sigma + blocks.get(bk)!;
    for (let c = 0; c < 3; c++) p.data[i + c] = Math.max(0, Math.min(255, Math.round(p.data[i + c] + lum + gauss(r) * sigma * 0.4)));
    p.data[i + 3] = 255;
  }
  save(name, p);
}
