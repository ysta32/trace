import type { Analysis, TraceOptions, TraceResult } from './types.js';
import { init } from './wasm.js';

export * from './types.js';
export { toSvg } from './svg.js';
export { toPdf } from './pdf.js';
export { toEps } from './eps.js';
export { toDxf } from './dxf.js';
export { init };

export interface RawImage { data: Uint8ClampedArray; width: number; height: number; }

function isRawImage(x: unknown): x is RawImage {
  const r = x as Partial<RawImage>;
  return typeof x === 'object' && x !== null && r.data instanceof Uint8ClampedArray
    && typeof r.width === 'number' && typeof r.height === 'number';
}

export async function analyze(bytes: Uint8Array): Promise<Analysis> {
  const w = await init();
  return w.analyze(bytes) as Analysis;
}

export async function trace(
  input: Uint8Array | ImageData | RawImage,
  opts: TraceOptions = {},
): Promise<TraceResult> {
  const w = await init();
  if (input instanceof Uint8Array) return w.trace(input, opts) as TraceResult;
  if (isRawImage(input)) {
    const { data, width, height } = input;
    return w.trace_rgba(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height, opts) as TraceResult;
  }
  throw new TypeError('trace(): input must be Uint8Array, ImageData or {data, width, height}');
}

/** Trace raw RGBA pixels (e.g. from canvas getImageData). */
export function traceImageData(input: ImageData | RawImage, opts?: TraceOptions): Promise<TraceResult> {
  return trace(input, opts);
}
