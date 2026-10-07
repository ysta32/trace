import { parseArgs } from 'node:util';
import type { Mode, Preset, TraceOptions } from './types.js';

export const FORMATS = ['svg', 'pdf', 'eps', 'dxf', 'png'] as const;
export type Format = (typeof FORMATS)[number];
export const PRESETS: readonly Preset[] = ['auto', 'logo', 'lineart', 'pixelart', 'photo', 'icon'];
export const MODES: readonly Mode[] = ['stacked', 'cutout'];

export class CliError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message);
    this.name = 'CliError';
  }
}

export interface CliConfig {
  inputs: string[];
  out?: string;
  outDir?: string;
  format?: Format;
  trace: TraceOptions;
  precision?: number;
  json: boolean;
  stats: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

export const HELP = `tracevec - convert raster images to clean vector graphics

Usage:
  tracevec <input...|dir> [options]
  cat in.png | tracevec - -o out.svg

Output:
  -o, --out <file>        Output file ("-" for stdout). Single input only.
      --out-dir <dir>     Output directory for batch conversion
  -f, --format <fmt>      svg | pdf | eps | dxf | png (default: from -o extension, else svg)

Tracing:
      --preset <name>     auto | logo | lineart | pixelart | photo | icon
      --colors <N|auto>   Palette size 2..64
      --palette <list>    Forced palette, e.g. "#000000,#ffffff"
      --simplify <0..1>   0 = max fidelity, 1 = fewest nodes
      --denoise <0..1>    Denoising strength
      --mode <mode>       stacked | cutout
      --gradients         Detect linear gradients
      --corner <deg>      Corner threshold in degrees
      --speckle <px>      Minimum region area in pixels
      --precision <N>     Decimal places in output coordinates (0..15)

Misc:
      --json              Print the TraceResult as JSON to stdout
      --stats             Print statistics to stderr
  -q, --quiet             No progress or stats output
  -h, --help              Show this help
  -v, --version           Show version

Exit codes: 0 success, 1 processing error, 2 usage error.
`;

function num(name: string, raw: string, min: number, max: number, integer = false): number {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) throw new CliError(`--${name}: "${raw}" is not a number`);
  if (n < min || n > max) throw new CliError(`--${name}: ${raw} is out of range (${min}..${max})`);
  if (integer && !Number.isInteger(n)) throw new CliError(`--${name}: ${raw} must be an integer`);
  return n;
}

export function parsePalette(raw: string): string[] {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 1) throw new CliError('--palette: expected a comma-separated list of colors');
  return parts.map(p => {
    const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(p);
    if (!m) throw new CliError(`--palette: invalid color "${p}" (use #rgb or #rrggbb)`);
    let h = m[1].toLowerCase();
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    return `#${h}`;
  });
}

export function formatFromPath(path: string): Format | undefined {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const ext = m?.[1].toLowerCase();
  return (FORMATS as readonly string[]).includes(ext ?? '') ? (ext as Format) : undefined;
}

export function parseCli(argv: string[]): CliConfig {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        'out-dir': { type: 'string' },
        format: { type: 'string', short: 'f' },
        preset: { type: 'string' },
        colors: { type: 'string' },
        palette: { type: 'string' },
        simplify: { type: 'string' },
        denoise: { type: 'string' },
        mode: { type: 'string' },
        gradients: { type: 'boolean' },
        corner: { type: 'string' },
        speckle: { type: 'string' },
        precision: { type: 'string' },
        json: { type: 'boolean' },
        stats: { type: 'boolean' },
        quiet: { type: 'boolean', short: 'q' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    throw new CliError((e as Error).message.replace(/^Unknown option/, 'Unknown option'));
  }
  const v = parsed.values;
  const cfg: CliConfig = {
    inputs: parsed.positionals,
    out: v.out,
    outDir: v['out-dir'],
    trace: {},
    json: v.json ?? false,
    stats: v.stats ?? false,
    quiet: v.quiet ?? false,
    help: v.help ?? false,
    version: v.version ?? false,
  };
  if (cfg.help || cfg.version) return cfg;

  if (v.format !== undefined) {
    const f = v.format.toLowerCase();
    if (!(FORMATS as readonly string[]).includes(f)) {
      throw new CliError(`--format: unknown format "${v.format}" (expected ${FORMATS.join(', ')})`);
    }
    cfg.format = f as Format;
  }
  const t = cfg.trace;
  if (v.preset !== undefined) {
    if (!PRESETS.includes(v.preset as Preset)) throw new CliError(`--preset: unknown preset "${v.preset}" (expected ${PRESETS.join(', ')})`);
    t.preset = v.preset as Preset;
  }
  if (v.mode !== undefined) {
    if (!MODES.includes(v.mode as Mode)) throw new CliError(`--mode: unknown mode "${v.mode}" (expected ${MODES.join(', ')})`);
    t.mode = v.mode as Mode;
  }
  if (v.colors !== undefined) t.colors = v.colors === 'auto' ? 'auto' : num('colors', v.colors, 2, 64, true);
  if (v.palette !== undefined) t.palette = parsePalette(v.palette);
  if (v.simplify !== undefined) t.simplify = num('simplify', v.simplify, 0, 1);
  if (v.denoise !== undefined) t.denoise = num('denoise', v.denoise, 0, 1);
  if (v.corner !== undefined) t.cornerThreshold = num('corner', v.corner, 0, 180);
  if (v.speckle !== undefined) t.filterSpeckle = num('speckle', v.speckle, 0, 1e9, true);
  if (v.gradients) t.gradients = true;
  if (v.precision !== undefined) cfg.precision = num('precision', v.precision, 0, 15, true);

  if (cfg.inputs.length === 0) throw new CliError('No input given. Run "tracevec --help" for usage.');
  if (cfg.out !== undefined && cfg.outDir !== undefined) throw new CliError('Use either -o/--out or --out-dir, not both');
  if (cfg.out === '') throw new CliError('-o/--out: empty path');
  if (cfg.out !== undefined) {
    const fromExt = cfg.out === '-' ? undefined : formatFromPath(cfg.out);
    if (cfg.format === undefined && fromExt) cfg.format = fromExt;
    else if (cfg.format !== undefined && fromExt && fromExt !== cfg.format) {
      throw new CliError(`--format ${cfg.format} conflicts with output extension .${fromExt}`);
    }
  }
  return cfg;
}

/** Output path for one input in batch mode (extension replaced by the format). */
export function outputName(input: string, format: Format): string {
  const base = input.replace(/\\/g, '/').split('/').pop() ?? input;
  const stem = base.replace(/\.[^.]*$/, '') || base;
  return `${stem}.${format}`;
}

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

/** Minimal glob matching for a single path segment pattern (* ? and [..] not supported). */
export function hasGlob(p: string): boolean {
  return /[*?]/.test(p);
}

export function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
