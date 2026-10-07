import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CliError, HELP, IMAGE_EXT, formatFromPath, globToRegExp, hasGlob, outputName, parseCli,
  type CliConfig, type Format,
} from './cli-args.js';
import type { TraceResult } from './types.js';

export { CliError, parseCli } from './cli-args.js';

export interface Io {
  stdin: () => Promise<Uint8Array>;
  stdout: (data: string | Uint8Array) => void;
  stderr: (text: string) => void;
}

export interface Engine {
  trace: (bytes: Uint8Array, opts: CliConfig['trace']) => Promise<TraceResult>;
}

export interface Job { input: string; output: string | undefined }

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function walkImages(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isFile() && IMAGE_EXT.test(e.name)).map(e => join(dir, e.name)).sort();
}

/** Expand files, directories (non-recursive) and simple globs (* and ? in the last segment). */
export async function expandInputs(inputs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const input of inputs) {
    if (input === '-') out.push(input);
    else if (await isDir(input)) {
      const files = await walkImages(input);
      if (files.length === 0) throw new CliError(`No images found in directory: ${input}`, 1);
      out.push(...files);
    } else if (hasGlob(input)) {
      const dir = dirname(input);
      const re = globToRegExp(input.slice(input.lastIndexOf('/') + 1));
      let names: string[] = [];
      try { names = await readdir(dir); } catch { /* reported below as no match */ }
      const hits = names.filter(n => re.test(n)).sort().map(n => join(dir, n));
      if (hits.length === 0) throw new CliError(`No files match: ${input}`, 1);
      out.push(...hits);
    } else out.push(input);
  }
  return out;
}

export function planJobs(files: string[], cfg: CliConfig, format: Format): Job[] {
  if (cfg.out !== undefined && files.length > 1) {
    throw new CliError('-o/--out accepts a single input; use --out-dir for batches');
  }
  const stdinCount = files.filter(f => f === '-').length;
  if (stdinCount > 1) throw new CliError('stdin ("-") can only be given once');
  return files.map(input => {
    if (cfg.out !== undefined) return { input, output: cfg.out === '-' ? undefined : cfg.out };
    if (cfg.outDir !== undefined) {
      if (input === '-') throw new CliError('stdin input needs -o; --out-dir cannot name the file');
      return { input, output: join(cfg.outDir, outputName(input, format)) };
    }
    if (input === '-') return { input, output: undefined };
    if (cfg.json) return { input, output: undefined };
    return { input, output: join(dirname(input), outputName(input, format)) };
  });
}

export async function renderPng(svg: string): Promise<Uint8Array> {
  let mod: { Resvg: new (svg: string) => { render(): { asPng(): Uint8Array } } };
  try {
    const name = '@resvg/resvg-js';
    mod = await import(name);
  } catch {
    throw new CliError('PNG output needs the optional package @resvg/resvg-js. Install it with: npm install @resvg/resvg-js', 1);
  }
  return new Uint8Array(new mod.Resvg(svg).render().asPng());
}

export async function encode(result: TraceResult, format: Format, precision?: number): Promise<string | Uint8Array> {
  const lib = await import('./index.js');
  const o = precision === undefined ? {} : { precision };
  switch (format) {
    case 'svg': return lib.toSvg(result, o);
    case 'pdf': return lib.toPdf(result, o);
    case 'eps': return lib.toEps(result, o);
    case 'dxf': return lib.toDxf(result, o);
    case 'png': return renderPng(lib.toSvg(result, o));
  }
}

async function defaultEngine(): Promise<Engine> {
  const lib = await import('./index.js');
  return { trace: (b, o) => lib.trace(b, o) };
}

export function formatStats(name: string, r: TraceResult): string {
  const s = r.stats;
  return `${name}: ${r.width}x${r.height} preset=${s.preset} paths=${s.paths} nodes=${s.nodes} colors=${s.colors} ${s.ms}ms`;
}

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function concurrency(): number {
  return Math.max(1, Math.min(4, availableParallelism()));
}

/** Run the CLI; returns the process exit code. Never calls process.exit. */
export async function run(argv: string[], io: Io, engine?: Engine, version = readVersion()): Promise<number> {
  let cfg: CliConfig;
  try {
    cfg = parseCli(argv);
  } catch (e) {
    if (e instanceof CliError) { io.stderr(`tracevec: ${e.message}\n`); return e.exitCode; }
    throw e;
  }
  if (cfg.help) { io.stdout(HELP); return 0; }
  if (cfg.version) { io.stdout(`${version}\n`); return 0; }

  let jobs: Job[];
  try {
    const files = await expandInputs(cfg.inputs);
    const format = cfg.format ?? (cfg.out && cfg.out !== '-' ? formatFromPath(cfg.out) : undefined) ?? 'svg';
    jobs = planJobs(files, cfg, format);
    cfg = { ...cfg, format };
  } catch (e) {
    if (e instanceof CliError) { io.stderr(`tracevec: ${e.message}\n`); return e.exitCode; }
    throw e;
  }
  const format = cfg.format as Format;
  const stdoutCount = jobs.filter(j => j.output === undefined && !cfg.json).length;
  if (stdoutCount > 1) { io.stderr('tracevec: multiple outputs cannot share stdout; use --out-dir\n'); return 2; }
  if (cfg.json && jobs.length > 1) { io.stderr('tracevec: --json supports a single input\n'); return 2; }
  if (cfg.json && jobs.some(j => j.output === undefined) && cfg.out === '-') {
    io.stderr('tracevec: --json already uses stdout; give -o <file> or drop -o -\n');
    return 2;
  }

  const eng = engine ?? await defaultEngine();
  const total = jobs.length;
  let done = 0;
  let failed = 0;
  const progress = (name: string) => {
    if (!cfg.quiet && total > 1) io.stderr(`[${done}/${total}] ${name}\n`);
  };

  await pool(jobs, concurrency(), async job => {
    const label = job.input === '-' ? '<stdin>' : job.input;
    try {
      let bytes: Uint8Array;
      if (job.input === '-') bytes = await io.stdin();
      else {
        try { bytes = await readFile(job.input); } catch (e) {
          throw new CliError(`cannot read ${job.input}: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (e as Error).message}`, 1);
        }
      }
      if (bytes.length === 0) throw new CliError('input is empty', 1);
      const result = await eng.trace(bytes, cfg.trace);
      if (cfg.json) io.stdout(`${JSON.stringify(result, null, 2)}\n`);
      if (cfg.stats && !cfg.quiet) io.stderr(`${formatStats(label, result)}\n`);
      if (!cfg.json || job.output !== undefined) {
        const data = await encode(result, format, cfg.precision);
        if (job.output === undefined) io.stdout(data);
        else {
          await mkdir(dirname(job.output), { recursive: true });
          await writeFile(job.output, data);
        }
      }
      done++;
      progress(job.output ?? label);
    } catch (e) {
      failed++;
      done++;
      io.stderr(`tracevec: ${label}: ${(e as Error).message}\n`);
    }
  });
  return failed > 0 ? 1 : 0;
}

function readVersion(): string {
  try {
    return (JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}


async function readStdin(): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const c of process.stdin) chunks.push(c as Uint8Array);
  return Buffer.concat(chunks);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const code = await run(argv, {
    stdin: readStdin,
    stdout: d => { process.stdout.write(d); },
    stderr: t => { process.stderr.write(t); },
  });
  process.exitCode = code;
}
