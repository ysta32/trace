import type { TraceOptions } from 'trace-vectorizer';
import type { WorkerRequest, WorkerResponse } from './worker';
import {
  image, opts, busy, error, setResult, setAnalysis, type ImageState,
} from './store';
import { RequestTracker } from './requests';
import { effect } from '@preact/signals';

const DEBOUNCE_MS = 250;

let worker: Worker | null = null;
const tracker = new RequestTracker<{ image: ImageState; opts: TraceOptions }>();
let nextAnalyzeId = -1;     // analyze ids are negative so they never collide with trace ids
let analyzeId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.id < 0) {
      if (m.kind === 'analyze' && m.id === analyzeId) setAnalysis(m.analysis);
      return; // analysis failures must not affect trace bookkeeping
    }
    const { current } = tracker.finish(m.id);
    if (current && m.kind === 'trace') {
      setResult(m.result);
      error.value = null;
    } else if (current && m.kind === 'error') {
      error.value = m.message;
    }
    pump();
    if (tracker.idle) busy.value = false;
  };
  worker.onerror = (e) => {
    error.value = e.message || 'Worker failed';
    busy.value = false;
  };
  return worker;
}

function post(req: WorkerRequest): void {
  getWorker().postMessage(req);
}

function pump(): void {
  const q = tracker.take();
  if (!q) return;
  post({ kind: 'trace', id: q.id, bytes: q.job.image.bytes.slice(), opts: q.job.opts });
}

/** Request a trace; a newer request supersedes any queued or in-flight one (stale results are dropped). */
export function requestTrace(img: ImageState, o: TraceOptions): void {
  tracker.request({ image: img, opts: o });
  busy.value = true;
  pump();
}

export function requestAnalyze(img: ImageState): void {
  analyzeId = nextAnalyzeId--;
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
      tracker.invalidate();
      busy.value = false;
      return;
    }
    if (img !== lastImage) {
      lastImage = img;
      requestAnalyze(img);
      requestTrace(img, o);
      return;
    }
    tracker.invalidate(); // old replies and queued jobs are obsolete as soon as options change
    busy.value = true;
    timer = setTimeout(() => requestTrace(img, o), DEBOUNCE_MS);
  });
}
