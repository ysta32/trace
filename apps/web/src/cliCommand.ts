import type { TraceOptions } from 'trace-vectorizer';

/** Engine defaults; flags equal to these are omitted from the generated command. */
const DEFAULTS = { preset: 'auto', denoise: 0.2, simplify: 0.5, mode: 'stacked', corner: 60, precision: 2 } as const;

/** Quote an argument for POSIX shells only when it needs it. */
export function shellQuote(arg: string): string {
  if (arg !== '' && /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Strip directories and the final extension; fall back to "trace". */
export function baseName(name: string): string {
  const leaf = name.split(/[\\/]/).pop() ?? name;
  const dot = leaf.lastIndexOf('.');
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  const clean = stem.trim().replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '-');
  return clean || 'trace';
}

/** File name for an export: `logo.png` + `svg` -> `logo.svg`. */
export function deriveFilename(imageName: string, format: string): string {
  return `${baseName(imageName)}.${format.toLowerCase()}`;
}

/**
 * Build the `npx trace-vectorizer` command that reproduces the editor state.
 * `filename` is the output name (its extension decides the format); only non-default flags are emitted.
 */
export function toCliCommand(opts: TraceOptions, filename: string, format: string, precision: number = DEFAULTS.precision): string {
  const fmt = format.toLowerCase();
  const out = `${baseName(filename)}.${fmt}`;
  const input = `${baseName(filename)}.png`;
  const args: string[] = ['npx', 'trace-vectorizer', shellQuote(input)];
  const flag = (name: string, value: string | number) => args.push(`--${name}`, shellQuote(String(value)));

  if (opts.preset && opts.preset !== DEFAULTS.preset) flag('preset', opts.preset);
  if (opts.palette && opts.palette.length > 0) flag('palette', opts.palette.join(','));
  else if (typeof opts.colors === 'number') flag('colors', opts.colors);
  if (opts.simplify !== undefined && opts.simplify !== DEFAULTS.simplify) flag('simplify', opts.simplify);
  if (opts.denoise !== undefined && opts.denoise !== DEFAULTS.denoise) flag('denoise', opts.denoise);
  if (opts.mode && opts.mode !== DEFAULTS.mode) flag('mode', opts.mode);
  if (opts.gradients) args.push('--gradients');
  if (opts.cornerThreshold !== undefined && opts.cornerThreshold !== DEFAULTS.corner) flag('corner', opts.cornerThreshold);
  if (opts.filterSpeckle !== undefined) flag('speckle', opts.filterSpeckle);
  if (precision !== DEFAULTS.precision) flag('precision', precision);
  args.push('-o', shellQuote(out));
  return args.join(' ');
}

/** Preset JSON: the options object, minus anything undefined. */
export function toPresetJson(opts: TraceOptions, precision: number = DEFAULTS.precision): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) clean[k] = v;
  if (precision !== DEFAULTS.precision) clean.precision = precision;
  return JSON.stringify(clean, null, 2);
}
