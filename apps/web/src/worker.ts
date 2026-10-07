import { init, analyze, trace } from 'trace-vectorizer';
import type { Analysis, TraceOptions, TraceResult } from 'trace-vectorizer';

export type WorkerRequest =
  | { kind: 'trace'; id: number; bytes: Uint8Array; opts: TraceOptions }
  | { kind: 'analyze'; id: number; bytes: Uint8Array };

export type WorkerResponse =
  | { kind: 'trace'; id: number; result: TraceResult }
  | { kind: 'analyze'; id: number; analysis: Analysis }
  | { kind: 'error'; id: number; message: string };

const ready = init();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(m: WorkerResponse): void;
};

scope.onmessage = async (e) => {
  const req = e.data;
  try {
    await ready;
    if (req.kind === 'trace') {
      const result = await trace(req.bytes, req.opts);
      scope.postMessage({ kind: 'trace', id: req.id, result });
    } else {
      const analysis = await analyze(req.bytes);
      scope.postMessage({ kind: 'analyze', id: req.id, analysis });
    }
  } catch (err) {
    scope.postMessage({ kind: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
