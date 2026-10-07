// Editor state owned by Palette Lab / Diff Lens / shape picking. store.ts stays the source of
// truth for result/selection/hidden/overrides; this module only adds what those surfaces need.
import { signal, effect } from '@preact/signals';
import {
  image, result, overrides, opts, setOpts, setPaletteColor, setOverride,
} from './store';
import type { DiffRect } from './diff';
import {
  effectiveHex, forcedPalette, normalizeHex, planMerge, resolveMerge, type MergeMap,
} from './palette';

// ---- Diff Lens ----
/** Diff Lens visibility. The frame's `D` toggle / view switch should write this signal. */
export const diffLensOn = signal(false);
export const diffLensMode = signal<'full' | 'loupe'>('full');
/** Latest finished diff for the current result + edits (status bar can show `ssim`). */
export const diffStats = signal<{ ssim: number; meanDeltaE: number; worst: DiffRect } | null>(null);

// ---- Picking ----
export const hoverShape = signal<number | null>(null);
/** Shapes shown at full strength while isolating (double-click); null = not isolating. */
export const isolated = signal<ReadonlySet<number> | null>(null);

// ---- Palette Lab ----
/** Locked colors by hex, so locks survive re-trace (the forced palette keeps the hex). */
export const lockedColors = signal<ReadonlySet<string>>(new Set());
/** Recolors per palette index of the current result. */
export const paletteEdits = signal<Readonly<Record<number, string>>>({});
/** Merges per palette index of the current result: from → into. */
export const mergedColors = signal<MergeMap>({});

interface PaletteSnapshot {
  label: string;
  overrides: Record<number, string>;
  edits: Readonly<Record<number, string>>;
  merged: MergeMap;
}
const UNDO_LIMIT = 50;
export const paletteUndo = signal<readonly PaletteSnapshot[]>([]);

function snapshot(label: string): PaletteSnapshot {
  return { label, overrides: overrides.value, edits: paletteEdits.value, merged: mergedColors.value };
}

function pushUndo(snap: PaletteSnapshot): void {
  paletteUndo.value = [...paletteUndo.value, snap].slice(-UNDO_LIMIT);
}

/** Restore the last palette edit (recolor / merge / reset). Returns its label, or null. */
export function undoPaletteEdit(): string | null {
  const stack = paletteUndo.value;
  const snap = stack[stack.length - 1];
  if (!snap) return null;
  paletteUndo.value = stack.slice(0, -1);
  overrides.value = snap.overrides;
  paletteEdits.value = snap.edits;
  mergedColors.value = snap.merged;
  return snap.label;
}

// Palette indices and shape ids are only meaningful within one result: reset on every new result.
let lastResult = result.peek();
effect(() => {
  const r = result.value;
  if (r === lastResult) return;
  lastResult = r;
  paletteEdits.value = {};
  mergedColors.value = {};
  paletteUndo.value = [];
  isolated.value = null;
  hoverShape.value = null;
  diffStats.value = null;
});

// Locks belong to one image: a new image starts unpinned (auto palette) again.
let lastImageUrl = image.peek()?.url ?? null;
effect(() => {
  const url = image.value?.url ?? null;
  if (url === lastImageUrl) return;
  lastImageUrl = url;
  if (lockedColors.peek().size) applyLocks(new Set());
});

function applyLocks(locked: ReadonlySet<string>): void {
  const r = result.peek();
  lockedColors.value = locked;
  const palette = r ? forcedPalette(r.palette, locked, paletteEdits.peek(), mergedColors.peek()) : undefined;
  if (palette) {
    setOpts({ palette });
  } else if (opts.peek().palette !== undefined) {
    const { palette: _drop, ...rest } = opts.peek();
    opts.value = rest;
  }
}

/** Indices currently rendered as `index` (itself + everything merged into it). */
function group(index: number): number[] {
  const r = result.peek();
  if (!r) return [];
  const merged = mergedColors.peek();
  const out: number[] = [];
  for (let i = 0; i < r.palette.length; i++) if (resolveMerge(merged, i) === index) out.push(i);
  return out;
}

/** Start an edit session (popover open). The snapshot is pushed on the first real change. */
export function beginRecolor(index: number): { touched: boolean; snap: PaletteSnapshot } {
  return { touched: false, snap: snapshot(`Recolor ${index + 1}`) };
}

/**
 * Recolor a palette color (and its merged-in colors) via per-shape overrides. `commit` also
 * re-pins the forced palette when the color is locked, which re-traces with the new hex.
 */
export function recolor(index: number, hex: string, session: { touched: boolean; snap: PaletteSnapshot }, commit: boolean): boolean {
  const r = result.peek();
  const h = normalizeHex(hex);
  if (!r || !h || index < 0 || index >= r.palette.length) return false;
  const before = effectiveHex(r.palette, paletteEdits.peek(), index);
  if (h !== before) {
    if (!session.touched) { pushUndo(session.snap); session.touched = true; }
    paletteEdits.value = { ...paletteEdits.peek(), [index]: h };
    for (const i of group(index)) setPaletteColor(i, h);
  }
  if (commit) {
    const locked = lockedColors.peek();
    const original = normalizeHex(session.snap.edits[index] ?? r.palette[index] ?? '');
    if (original && original !== h && locked.has(original)) {
      const next = new Set(locked);
      next.delete(original);
      next.add(h);
      applyLocks(next);
    }
  }
  return true;
}

/** Merge palette color `from` into `to`. Returns the number of shapes recolored, or null for no-op. */
export function mergeColors(from: number, to: number): { ids: number; from: string; to: string } | null {
  const r = result.peek();
  if (!r) return null;
  const plan = planMerge(r, mergedColors.peek(), from, to);
  if (!plan) return null;
  const fromHex = effectiveHex(r.palette, paletteEdits.peek(), from);
  const toHex = effectiveHex(r.palette, paletteEdits.peek(), plan.target);
  pushUndo(snapshot(`Merge ${fromHex} into ${toHex}`));
  mergedColors.value = plan.merged;
  const edits = { ...paletteEdits.peek() };
  for (const i of plan.recolor) delete edits[i];
  paletteEdits.value = edits;
  for (const i of plan.recolor) setPaletteColor(i, toHex);
  const locked = lockedColors.peek();
  if (locked.has(fromHex)) {
    const next = new Set(locked);
    next.delete(fromHex);
    applyLocks(next);
  } else if (locked.size) {
    applyLocks(locked); // keep the forced palette in sync: the merged-away color drops out
  }
  return { ids: plan.ids.length, from: fromHex, to: toHex };
}

/** Toggle the lock on a palette color. Locking pins the forced palette and re-traces. */
export function toggleLock(index: number): boolean {
  const r = result.peek();
  if (!r || index < 0 || index >= r.palette.length) return false;
  const hex = normalizeHex(effectiveHex(r.palette, paletteEdits.peek(), index));
  if (!hex) return false;
  const next = new Set(lockedColors.peek());
  const nowLocked = !next.has(hex);
  if (nowLocked) next.add(hex);
  else next.delete(hex);
  applyLocks(next);
  return nowLocked;
}

/** Drop recolors, merges and locks. Clears overrides of palette shapes; re-traces if a palette was pinned. */
export function resetPalette(): void {
  const r = result.peek();
  if (r) {
    pushUndo(snapshot('Reset palette'));
    for (const s of r.shapes) if (s.colorIndex >= 0 && overrides.peek()[s.id] !== undefined) setOverride(s.id, null);
  }
  paletteEdits.value = {};
  mergedColors.value = {};
  applyLocks(new Set());
}
