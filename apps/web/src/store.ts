import { signal, computed } from '@preact/signals';
import type { Analysis, Mode, Preset, TraceOptions, TraceResult } from 'trace-vectorizer';

export interface ImageState {
  name: string;
  bytes: Uint8Array;
  url: string;
  width: number;
  height: number;
}

export type ViewMode = 'split' | 'original' | 'vector' | 'outlines';

export const DEFAULT_OPTS: TraceOptions = {
  preset: 'auto',
  colors: 'auto',
  denoise: 0.2,
  simplify: 0.5,
  mode: 'stacked',
  gradients: false,
};

export const image = signal<ImageState | null>(null);
export const opts = signal<TraceOptions>({ ...DEFAULT_OPTS });
export const analysis = signal<Analysis | null>(null);
export const result = signal<TraceResult | null>(null);
export const busy = signal(false);
export const error = signal<string | null>(null);
export const selection = signal<Set<number>>(new Set());
export const hidden = signal<Set<number>>(new Set());
export const overrides = signal<Record<number, string>>({});
export const viewMode = signal<ViewMode>('split');
export const suggestedPreset = computed<Preset | null>(() => analysis.value?.preset ?? null);

export function setImage(img: ImageState | null): void {
  const prev = image.value;
  if (prev && prev.url !== img?.url) URL.revokeObjectURL(prev.url);
  image.value = img;
  analysis.value = null;
  resetEdits();
  result.value = null;
  error.value = null;
}

export function setOpts(patch: Partial<TraceOptions>): void {
  opts.value = { ...opts.value, ...patch };
}

export function setPreset(preset: Preset): void {
  setOpts({ preset });
}

export function setMode(mode: Mode): void {
  setOpts({ mode });
}

export function resetOpts(): void {
  opts.value = { ...DEFAULT_OPTS };
}

export function setResult(r: TraceResult | null): void {
  result.value = r;
  // shape ids are only meaningful within one result
  resetEdits();
}

export function setAnalysis(a: Analysis | null): void {
  analysis.value = a;
}

export function resetEdits(): void {
  selection.value = new Set();
  hidden.value = new Set();
  overrides.value = {};
}

export function select(id: number, additive = false): void {
  const next = additive ? new Set(selection.value) : new Set<number>();
  if (additive && next.has(id)) next.delete(id);
  else next.add(id);
  selection.value = next;
}

export function clearSelection(): void {
  selection.value = new Set();
}

export function setHidden(ids: Iterable<number>, hide: boolean): void {
  const next = new Set(hidden.value);
  for (const id of ids) {
    if (hide) next.add(id);
    else next.delete(id);
  }
  hidden.value = next;
}

export function setOverride(color: number | string, hex: string | null): void {
  const next = { ...overrides.value };
  const key = Number(color);
  if (hex === null) delete next[key];
  else next[key] = hex;
  overrides.value = next;
}

/** Recolor all shapes of a palette index; returns affected shape ids. */
export function setPaletteColor(colorIndex: number, hex: string): number[] {
  const r = result.value;
  if (!r) return [];
  const ids = r.shapes.filter((s) => s.colorIndex === colorIndex).map((s) => s.id);
  const next = { ...overrides.value };
  for (const id of ids) next[id] = hex;
  overrides.value = next;
  return ids;
}

export function setViewMode(m: ViewMode): void {
  viewMode.value = m;
}
