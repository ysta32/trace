import { signal } from '@preact/signals';
import { toSvg } from 'trace-vectorizer';
import type { TraceOptions, TraceResult } from 'trace-vectorizer';
import type { WorkerRequest, WorkerResponse } from './worker';
import { image, opts, setOpts } from './store';

export type BudgetUnit = 'kb' | 'nodes';
export interface Budget { unit: BudgetUnit; target: number; }
export type FitStatus = 'idle' | 'fitting' | 'fit' | 'unreachable' | 'error';

export const MAX_TRACES = 6;

export const budget = signal<Budget | null>(null);
export const fitStatus = signal<FitStatus>('idle');
export const fitTraces = signal(0);

export interface SearchStep { lo: number; hi: number; next: number; fits: boolean; }

/**
 * One bisection step over simplify. `measured` is the size at mid = (lo + hi) / 2.
 * Higher simplify means fewer nodes, so a fit moves `hi` down (try more fidelity)
 * and a miss moves `lo` up (simplify harder).
 */
export function nextSimplify(lo: number, hi: number, measured: number, target: number): SearchStep {
  const mid = (lo + hi) / 2;
  const fits = measured <= target;
  const nlo = fits ? lo : mid;
  const nhi = fits ? mid : hi;
  return { lo: nlo, hi: nhi, next: round2((nlo + nhi) / 2), fits };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Size of a result in the budget's unit (kb = 1000 bytes of SVG). */
export function measure(r: TraceResult, unit: BudgetUnit, precision = 2): number {
  if (unit === 'nodes') return r.stats.nodes;
  return new TextEncoder().encode(toSvg(r, { precision })).length / 1000;
}

/** Fraction of the target used, for the gauge (can exceed 1). */
export function gaugeRatio(current: number, target: number): number {
  return target > 0 ? current / target : 0;
}

/** Next smaller palette size to try when simplify alone cannot reach the target. */
export function nextColors(current: number): number {
  return Math.max(2, Math.floor(current * 0.6));
}

export type TraceFn = (o: TraceOptions) => Promise<TraceResult>;

export interface FitOutcome { opts: Partial<TraceOptions>; status: 'fit' | 'unreachable'; traces: number; measured: number; }

/**
 * Search simplify, then palette size, to meet the budget in at most MAX_TRACES traces.
 * Probe 1: simplify 1 (the floor). If even that misses, only colors can help.
 */
export async function searchBudget(
  base: TraceOptions, b: Budget, run: TraceFn, baseColors: number, precision = 2,
  onTrace: (n: number) => void = () => {},
): Promise<FitOutcome> {
  let traces = 0;
  const go = async (o: TraceOptions) => {
    const r = await run(o);
    traces++;
    onTrace(traces);
    return { r, m: measure(r, b.unit, precision) };
  };

  let probe = await go({ ...base, simplify: 1 });
  let colors = baseColors;
  let bestOpts: Partial<TraceOptions> = { simplify: 1 };
  let bestM = probe.m;

  while (probe.m > b.target && traces < MAX_TRACES && colors > 2) {
    colors = nextColors(colors);
    probe = await go({ ...base, simplify: 1, colors });
    bestOpts = { simplify: 1, colors };
    bestM = probe.m;
  }
  if (probe.m > b.target) return { opts: bestOpts, status: 'unreachable', traces, measured: bestM };

  let lo = 0;
  let hi = 1;
  let next = 0.5;
  const fitColors = colors !== baseColors ? { colors } : {};
  while (traces < MAX_TRACES && hi - lo > 0.02) {
    const { r, m } = await go({ ...base, ...fitColors, simplify: next });
    void r;
    const step = nextSimplify(lo, hi, m, b.target);
    if (step.fits) { bestOpts = { ...fitColors, simplify: next }; bestM = m; }
    lo = step.lo; hi = step.hi; next = step.next;
  }
  return { opts: bestOpts, status: 'fit', traces, measured: bestM };
}

let fitWorker: Worker | null = null;
let fitSeq = 1_000_000;

function runInWorker(bytes: Uint8Array, o: TraceOptions): Promise<TraceResult> {
  fitWorker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const w = fitWorker;
  const id = fitSeq++;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMsg);
      if (e.data.kind === 'trace') resolve(e.data.result);
      else if (e.data.kind === 'error') reject(new Error(e.data.message));
    };
    w.addEventListener('message', onMsg);
    const req: WorkerRequest = { kind: 'trace', id, bytes: bytes.slice(), opts: o };
    w.postMessage(req);
  });
}

/** Tune simplify, then colors, to hit the current budget; applies the result to the editor options. */
export async function fitToBudget(precision = 2): Promise<FitOutcome | null> {
  const b = budget.value;
  const img = image.value;
  if (!b || !img || fitStatus.value === 'fitting') return null;
  fitStatus.value = 'fitting';
  fitTraces.value = 0;
  try {
    const base = opts.value;
    const baseColors = typeof base.colors === 'number' ? base.colors : 16;
    const out = await searchBudget(base, b, (o) => runInWorker(img.bytes, o), baseColors, precision, (n) => { fitTraces.value = n; });
    setOpts(out.opts);
    fitStatus.value = out.status;
    return out;
  } catch {
    fitStatus.value = 'error';
    return null;
  }
}
