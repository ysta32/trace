import wbgInit, * as bindings from '../wasm/trace_wasm.js';
import type { InitInput } from '../wasm/trace_wasm.js';

export type WasmInput = InitInput | Promise<InitInput>;

let ready: Promise<typeof bindings> | undefined;

/** Load the wasm module once. Idempotent; later calls return the same promise. */
export function init(input?: WasmInput): Promise<typeof bindings> {
  if (!ready) {
    ready = load(input).catch((e) => {
      ready = undefined;
      throw e;
    });
  }
  return ready;
}

async function load(input?: WasmInput): Promise<typeof bindings> {
  if (input !== undefined) {
    await wbgInit({ module_or_path: input });
  } else if (typeof window === 'undefined') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import('node:fs/promises'),
      import('node:url'),
    ]);
    const bytes = await readFile(fileURLToPath(new URL('../wasm/trace_wasm_bg.wasm', import.meta.url)));
    await wbgInit({ module_or_path: bytes });
  } else {
    await wbgInit();
  }
  return bindings;
}
