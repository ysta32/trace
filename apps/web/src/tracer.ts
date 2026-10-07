import type { TraceOptions } from 'trace-vectorizer';
import type { WorkerRequest, WorkerResponse } from './worker';
import {
  image, opts, busy, error, setResult, setAnalysis, type ImageState,
} from './store';
import { effect } from '@preact/signals';

const DEBOUNCE_MS = 250;

let worker: Worker | null = null;
let nextId = 1;
let latestId = 0;          // id of the newest requested trace; older replies are stale
let inFlight = false;      // worker handles one job at a time
let queued: { id: number; image: ImageState; opts: TraceOptions } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let analyzeId = 0;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.kind === 'analyze') {
      if (m.id === analyzeId) setAnalysis(m.analysis);
      return;
    }
    inFlight = false;
    if (m.kind === 'trace' && m.id === latestId) {
      setResult(m.result);
      error.value = null;
    } else if (m.kind === 'error' && m.id === latestId) {
      error.value = m.message;
    }
    pump();
    if (!inFlight && !queued) busy.value = false;
  };
  worker.onerror = (e) => {
    inFlight = false;
    busy.value = false;
    error.value = e.message || 'Worker failed';
  };
  return worker;
}

function post(req: WorkerRequest): void {
  getWorker().postMessage(req);
}

function pump(): void {
  if (inFlight || !queued) return;
  const job = queued;
  queued = null;
  inFlight = true;
  post({ kind: 'trace', id: job.id, bytes: job.image.bytes.slice(), opts: job.opts });
}

/** Request a trace; a newer request supersedes any queued or in-flight one (stale results are dropped). */
export function requestTrace(img: ImageState, o: TraceOptions): void {
  const id = nextId++;
  latestId = id;
  queued = { id, image: img, opts: o };
  busy.value = true;
  pump();
}

export function requestAnalyze(img: ImageState): void {
  analyzeId = nextId++;
  post({ kind: 'analyze', id: analyzeId, bytes: img.bytes.slice() });
}

/** Wire signals to the worker: new image traces immediately, option changes are debounced. */
export function startTracing(): () => void {
  let lastImage: ImageState | null = null;
  return effect(() => {
    const img = image.value;
    const o = opts.value;
    clearTimeout(timer);
    if (!img) {
      lastImage = null;
      latestId = nextId++;
      queued = null;
      busy.value = false;
      return;
    }
    if (img !== lastImage) {
      lastImage = img;
      requestAnalyze(img);
      requestTrace(img, o);
      return;
    }
    timer = setTimeout(() => requestTrace(img, o), DEBOUNCE_MS);
  });
}
