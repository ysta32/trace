import { signal } from '@preact/signals';
import type { TraceOptions, TraceResult } from 'trace-vectorizer';
import { toSvg, toPdf, toEps, toDxf } from 'trace-vectorizer';
import { zipSync, strToU8 } from 'fflate';
import type { WorkerRequest, WorkerResponse } from './worker';
import { opts } from './store';
import { deriveFilename } from './cliCommand';

export type ItemStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export interface BatchItem {
  id: number;
  name: string;
  status: ItemStatus;
  paths: number;
  svgBytes: number;
  ms: number;
  error?: string;
}
export interface BatchState { items: BatchItem[]; nextId: number; }

export type BatchAction =
  | { type: 'add'; names: string[] }
  | { type: 'start'; id: number }
  | { type: 'done'; id: number; paths: number; svgBytes: number; ms: number }
  | { type: 'fail'; id: number; error: string }
  | { type: 'retry'; id: number }
  | { type: 'cancel' }
  | { type: 'remove'; id: number }
  | { type: 'clear' };

export const initialBatch: BatchState = { items: [], nextId: 1 };

function patch(s: BatchState, id: number, from: ItemStatus[], to: Partial<BatchItem>): BatchState {
  return { ...s, items: s.items.map((it) => (it.id === id && from.includes(it.status) ? { ...it, ...to } : it)) };
}

/** Pure queue state machine: queued -> running -> done | error; cancelled/error can be retried. */
export function batchReducer(s: BatchState, a: BatchAction): BatchState {
  switch (a.type) {
    case 'add': {
      const items = a.names.map((name, i): BatchItem => ({ id: s.nextId + i, name, status: 'queued', paths: 0, svgBytes: 0, ms: 0 }));
      return { items: [...s.items, ...items], nextId: s.nextId + items.length };
    }
    case 'start': return patch(s, a.id, ['queued'], { status: 'running' });
    case 'done': return patch(s, a.id, ['running'], { status: 'done', paths: a.paths, svgBytes: a.svgBytes, ms: a.ms, error: undefined });
    case 'fail': return patch(s, a.id, ['running', 'queued'], { status: 'error', error: a.error });
    case 'retry': return patch(s, a.id, ['error', 'cancelled'], { status: 'queued', error: undefined });
    case 'cancel': return { ...s, items: s.items.map((it) => (it.status === 'queued' || it.status === 'running' ? { ...it, status: 'cancelled' } : it)) };
    case 'remove': return { ...s, items: s.items.filter((it) => it.id !== a.id) };
    case 'clear': return { ...s, items: [] };
  }
}

export interface BatchProgress { total: number; done: number; failed: number; running: number; fraction: number; }
export function batchProgress(items: BatchItem[]): BatchProgress {
  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const running = items.filter((i) => i.status === 'running').length;
  return { total, done, failed, running, fraction: total ? (done + failed) / total : 0 };
}

/** Unique zip entry names: `logo.svg`, `logo-2.svg`... */
export function uniqueNames(names: string[], format: string): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = deriveFilename(n, format);
    const c = (seen.get(base) ?? 0) + 1;
    seen.set(base, c);
    if (c === 1) return base;
    const dot = base.lastIndexOf('.');
    return `${base.slice(0, dot)}-${c}${base.slice(dot)}`;
  });
}

export function concurrency(hw: number = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2): number {
  return Math.max(1, Math.min(4, hw - 1));
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
export const isImageName = (n: string) => IMAGE_RE.test(n);

// ---- runtime ----
export const batch = signal<BatchState>(initialBatch);
export type BatchFormat = 'svg' | 'pdf' | 'eps' | 'dxf';
export const batchFormat = signal<BatchFormat>('svg');

const files = new Map<number, Uint8Array>();
const results = new Map<number, TraceResult>();
const jobOpts = new Map<number, TraceOptions>();
let workers: Worker[] = [];
const busyWorkers = new Map<Worker, number>();
let seq = 1;

function dispatch(a: BatchAction): void {
  batch.value = batchReducer(batch.value, a);
}

function newWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const itemId = busyWorkers.get(w);
    if (itemId === undefined) return;
    busyWorkers.delete(w);
    const m = e.data;
    if (m.kind === 'trace') {
      results.set(itemId, m.result);
      const svg = toSvg(m.result, { precision: 2 });
      dispatch({ type: 'done', id: itemId, paths: m.result.stats.paths, svgBytes: new TextEncoder().encode(svg).length, ms: Math.round(m.result.stats.ms) });
    } else if (m.kind === 'error') {
      dispatch({ type: 'fail', id: itemId, error: m.message });
    }
    pump();
  };
  w.onerror = (e) => {
    const itemId = busyWorkers.get(w);
    busyWorkers.delete(w);
    if (itemId !== undefined) dispatch({ type: 'fail', id: itemId, error: e.message || 'Worker failed' });
    workers = workers.filter((x) => x !== w);
    w.terminate();
    pump();
  };
  workers.push(w);
  return w;
}

function pump(): void {
  for (;;) {
    const next = batch.value.items.find((i) => i.status === 'queued');
    if (!next) return;
    let w = workers.find((x) => !busyWorkers.has(x));
    if (!w && workers.length < concurrency()) w = newWorker();
    if (!w) return;
    const bytes = files.get(next.id);
    if (!bytes) { dispatch({ type: 'start', id: next.id }); dispatch({ type: 'fail', id: next.id, error: 'File no longer available' }); continue; }
    dispatch({ type: 'start', id: next.id });
    busyWorkers.set(w, next.id);
    const o = jobOpts.get(next.id) ?? opts.value;
    const req: WorkerRequest = { kind: 'trace', id: seq++, bytes: bytes.slice(), opts: o };
    w.postMessage(req);
  }
}

export async function addFiles(list: File[]): Promise<void> {
  const imgs = list.filter((f) => isImageName(f.name) || f.type.startsWith('image/'));
  if (imgs.length === 0) return;
  const startId = batch.value.nextId;
  dispatch({ type: 'add', names: imgs.map((f) => f.name) });
  const snapshot = { ...opts.value };
  await Promise.all(imgs.map(async (f, i) => {
    const id = startId + i;
    files.set(id, new Uint8Array(await f.arrayBuffer()));
    jobOpts.set(id, snapshot);
  }));
  pump();
}

export function retry(id: number): void {
  jobOpts.set(id, { ...opts.value });
  dispatch({ type: 'retry', id });
  pump();
}

export function cancelAll(): void {
  dispatch({ type: 'cancel' });
  for (const w of workers) w.terminate(); // in-flight traces cannot be aborted otherwise
  workers = [];
  busyWorkers.clear();
}

export function removeItem(id: number): void {
  files.delete(id); results.delete(id); jobOpts.delete(id);
  dispatch({ type: 'remove', id });
}

export function clearBatch(): void {
  cancelAll();
  files.clear(); results.clear(); jobOpts.clear();
  dispatch({ type: 'clear' });
}

function encode(r: TraceResult, format: BatchFormat): Uint8Array {
  switch (format) {
    case 'svg': return strToU8(toSvg(r, { precision: 2 }));
    case 'pdf': return toPdf(r, { precision: 2 });
    case 'eps': return strToU8(toEps(r, { precision: 2 }));
    case 'dxf': return strToU8(toDxf(r));
  }
}

/** Zip of every finished item in the chosen format. */
export function buildZip(format: BatchFormat): Uint8Array | null {
  const done = batch.value.items.filter((i) => i.status === 'done' && results.has(i.id));
  if (done.length === 0) return null;
  const names = uniqueNames(done.map((i) => i.name), format);
  const entries: Record<string, Uint8Array> = {};
  done.forEach((it, i) => { entries[names[i] as string] = encode(results.get(it.id) as TraceResult, format); });
  return zipSync(entries, { level: 6 });
}

export function downloadZip(format: BatchFormat): boolean {
  const zip = buildZip(format);
  if (!zip) return false;
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `trace-batch-${format}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Recursively collect files from a drop (files and folders). */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() ?? null : null));
  if (entries.every((e) => e === null)) return [...dt.files];
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batchEntries = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batchEntries.length === 0) break;
        for (const c of batchEntries) await walk(c);
      }
    }
  };
  for (const e of entries) if (e) await walk(e);
  return out;
}
