// Editor state owned by Palette Lab / Diff Lens / shape picking. store.ts stays the source of
// truth for result/selection/hidden/overrides; this module only adds what those surfaces need.
import { signal, effect, batch } from '@preact/signals';
import type { TraceResult } from 'trace-vectorizer';
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

/** Palette state keyed by hex so it can be re-applied onto a re-traced result. */
export interface ColorState {
  edits: Readonly<Record<string, string>>;   // palette hex → new hex
  merges: Readonly<Record<string, string>>;  // palette hex → palette hex it merges into
}

/** One undo entry: everything a palette action can change, restored together. */
export interface PaletteSnapshot {
  label: string;
  result: TraceResult | null;                // result the shape-keyed overrides belong to
  overrides: Record<number, string>;
  edits: Readonly<Record<number, string>>;
  merged: MergeMap;
  colors: ColorState;
  locks: ReadonlySet<string>;
  palette: readonly string[] | undefined;    // opts.palette
}
const UNDO_LIMIT = 50;
export const paletteUndo = signal<readonly PaletteSnapshot[]>([]);

export function colorStateOf(r: TraceResult, edits: Readonly<Record<number, string>>, merged: MergeMap): ColorState {
  const e: Record<string, string> = {};
  const m: Record<string, string> = {};
  for (const [k, v] of Object.entries(edits)) { const h = r.palette[Number(k)]; if (h) e[h.toLowerCase()] = v; }
  for (const [k, v] of Object.entries(merged)) {
    const a = r.palette[Number(k)], b = r.palette[v];
    if (a && b) m[a.toLowerCase()] = b.toLowerCase();
  }
  return { edits: e, merges: m };
}

/** Map hex-keyed palette state onto result `r`: index edits/merges + the shape overrides they imply. */
export function applyColorState(r: TraceResult, cs: ColorState): { edits: Record<number, string>; merged: Record<number, number>; overrides: Record<number, string> } {
  const hexes = r.palette.map((h) => h.toLowerCase());
  const edits: Record<number, string> = {};
  const merged: Record<number, number> = {};
  hexes.forEach((h, i) => {
    const e = cs.edits[h];
    if (e) edits[i] = e;
    const t = cs.merges[h];
    const j = t === undefined ? -1 : hexes.indexOf(t);
    if (j >= 0 && j !== i) merged[i] = j;
  });
  const overrides: Record<number, string> = {};
  for (const s of r.shapes) {
    if (s.colorIndex < 0) continue;
    const root = resolveMerge(merged, s.colorIndex);
    const hex = edits[root] ?? (root !== s.colorIndex ? r.palette[root] : undefined);
    if (hex) overrides[s.id] = hex;
  }
  return { edits, merged, overrides };
}

function snapshot(label: string): PaletteSnapshot {
  const r = result.peek();
  const edits = paletteEdits.peek(), merged = mergedColors.peek();
  return {
    label, result: r, overrides: overrides.peek(), edits, merged,
    colors: r ? colorStateOf(r, edits, merged) : { edits: {}, merges: {} },
    locks: lockedColors.peek(), palette: opts.peek().palette,
  };
}

function pushUndo(snap: PaletteSnapshot): void {
  paletteUndo.value = [...paletteUndo.peek(), snap].slice(-UNDO_LIMIT);
}

function samePalette(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((h, i) => h === b[i]);
}

// A re-trace we caused (lock / unlock / undo) keeps the undo stack and re-applies `carry`.
// It is "ours" only if opts are still exactly the object we set when the result lands.
let expectOpts: object | null = null;
let carry: ColorState | null = null;

/** Set (or clear) the forced palette; re-traces when it changes. Returns true if a re-trace was requested. */
function setForcedPalette(palette: readonly string[] | undefined, keep: ColorState | null): boolean {
  if (samePalette(opts.peek().palette, palette)) return false;
  if (palette) {
    setOpts({ palette: [...palette] });
  } else {
    const { palette: _drop, ...rest } = opts.peek();
    opts.value = rest;
  }
  expectOpts = opts.peek();
  carry = keep;
  return true;
}

/** Restore the last palette action (recolor / merge / lock / reset) atomically. Returns its label, or null. */
export function undoPaletteEdit(): string | null {
  const stack = paletteUndo.peek();
  const snap = stack[stack.length - 1];
  if (!snap) return null;
  const r = result.peek();
  batch(() => {
    paletteUndo.value = stack.slice(0, -1);
    lockedColors.value = snap.locks;
    if (setForcedPalette(snap.palette, snap.colors)) return; // state is replayed onto the re-trace
    if (r && r === snap.result) {
      overrides.value = snap.overrides;
      paletteEdits.value = snap.edits;
      mergedColors.value = snap.merged;
    } else if (r) {
      const st = applyColorState(r, snap.colors);
      overrides.value = st.overrides;
      paletteEdits.value = st.edits;
      mergedColors.value = st.merged;
    }
  });
  return snap.label;
}

// Palette indices and shape ids are only meaningful within one result: reset on every new result,
// except that a re-trace we requested keeps the undo stack and re-applies the carried color state.
let lastResult = result.peek();
effect(() => {
  const r = result.value;
  if (r === lastResult) return;
  lastResult = r;
  const own = expectOpts !== null && opts.peek() === expectOpts;
  const keep = own ? carry : null;
  expectOpts = null;
  carry = null;
  paletteEdits.value = {};
  mergedColors.value = {};
  if (!own) paletteUndo.value = [];
  isolated.value = null;
  hoverShape.value = null;
  diffStats.value = null;
  if (r && keep) {
    // store.setResult clears overrides right after assigning result; apply once it is done.
    queueMicrotask(() => {
      if (result.peek() !== r) return;
      const st = applyColorState(r, keep);
      batch(() => {
        overrides.value = { ...overrides.peek(), ...st.overrides };
        paletteEdits.value = st.edits;
        mergedColors.value = st.merged;
      });
    });
  }
});

// Locks belong to one image: a new image starts unpinned (auto palette) again.
let lastImageUrl = image.peek()?.url ?? null;
effect(() => {
  const url = image.value?.url ?? null;
  if (url === lastImageUrl) return;
  lastImageUrl = url;
  const hadLocks = lockedColors.peek().size > 0;
  lockedColors.value = new Set();
  if (hadLocks) setForcedPalette(undefined, null); // the pinned palette came from our locks
  expectOpts = null; // the next result belongs to a new image: not a re-trace we own
  carry = null;
  paletteUndo.value = [];
});

function applyLocks(locked: ReadonlySet<string>): void {
  const r = result.peek();
  lockedColors.value = locked;
  const palette = r ? forcedPalette(r.palette, locked, paletteEdits.peek(), mergedColors.peek()) : undefined;
  // Carry edits by hex: a pinned palette bakes them in (no-op replay); unpinning restores them on auto colors.
  setForcedPalette(palette, r ? colorStateOf(r, paletteEdits.peek(), mergedColors.peek()) : null);
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
  pushUndo(snapshot(`${nowLocked ? 'Lock' : 'Unlock'} ${hex}`));
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
  lockedColors.value = new Set();
  setForcedPalette(undefined, null);
}
