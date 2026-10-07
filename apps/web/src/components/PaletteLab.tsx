// Palette Lab: swatches with coverage, recolor popover (native picker + hex + eyedropper),
// lock (pins the forced palette and re-traces), drag-to-merge, keyboard path for all of it.
//
// Keyboard on a swatch: ←/→/↑/↓ Home End move · Enter/Space edit · L lock ·
// M marks the focused color as merge source, M on another swatch merges the source into it · Esc cancels.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { result, hidden, busy, image } from '../store';
import {
  lockedColors, paletteEdits, mergedColors, paletteUndo,
  beginRecolor, recolor, mergeColors, toggleLock, resetPalette, undoPaletteEdit,
} from '../editorState';
import {
  coverageSteps, foldCoverage, formatShare, normalizeHex, type ColorCoverage, type RawCoverage,
} from '../palette';
import type { TraceResult } from 'trace-vectorizer';
import { Icon } from '../design/icons';
import '../editor-extras.css';

interface EyeDropperCtor { new (): { open(opts?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }> } }
function eyeDropper(): EyeDropperCtor | null {
  return typeof window !== 'undefined' && 'EyeDropper' in window
    ? (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper
    : null;
}

/** Eyedropper result → '#rrggbb' (Chrome returns hex; some builds return 'rgb(…)'). */
function pickedHex(value: string): string | null {
  const hex = normalizeHex(value);
  if (hex) return hex;
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value.trim());
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('')}`;
}

// Coverage depends only on the result geometry + hidden set, never on recolors or merges
// (those are folded in cheaply), so cache it per result and compute it in idle slices.
const COVERAGE_SLICE_MS = 8;
const coverageCache = new WeakMap<TraceResult, { hidden: ReadonlySet<number>; raw: RawCoverage }>();

function useRawCoverage(r: TraceResult | null, hid: ReadonlySet<number>): RawCoverage | null {
  const cached = r ? coverageCache.get(r) : undefined;
  const hit = cached && cached.hidden === hid ? cached.raw : null;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!r || hit) return;
    const it = coverageSteps(r, hid);
    let handle = 0;
    let cancelled = false;
    const schedule = (fn: () => void) =>
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(fn, { timeout: 200 })
        : (setTimeout(fn, 0) as unknown as number);
    const step = () => {
      if (cancelled) return;
      const t0 = performance.now();
      while (performance.now() - t0 < COVERAGE_SLICE_MS) {
        const res = it.next();
        if (res.done) {
          coverageCache.set(r, { hidden: hid, raw: res.value });
          bump((n) => n + 1);
          return;
        }
      }
      handle = schedule(step);
    };
    handle = schedule(step);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, [r, hid, hit]);
  return hit;
}

const EMPTY_RAW: RawCoverage = {
  area: new Float64Array(0), shapes: new Uint32Array(0), total: 0, unmeasured: 0, grid: { width: 0, height: 0 },
};

export function PaletteLab() {
  const r = result.value;
  const hid = hidden.value;
  const merged = mergedColors.value;
  const edits = paletteEdits.value;
  const locked = lockedColors.value;
  const canUndo = paletteUndo.value.length > 0;

  const raw = useRawCoverage(r, hid);
  const measuring = !!r && !raw;
  const report = useMemo(
    () => (r ? foldCoverage(r, raw ?? EMPTY_RAW, merged, edits) : null),
    [r, raw, merged, edits],
  );
  const colors = report?.colors ?? [];

  const [focusIdx, setFocusIdx] = useState(0);          // position in `colors` (roving tabindex)
  const [editing, setEditing] = useState<number | null>(null); // palette index
  const [mergeFrom, setMergeFrom] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string; undo: boolean; err?: boolean } | null>(null);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = useRef<HTMLElement>(null);

  // New result: palette indices changed meaning.
  useEffect(() => {
    setEditing(null); setMergeFrom(null); setDragFrom(null); setDropOn(null); setStatus(null);
    setFocusIdx(0);
  }, [r]);

  const focusPos = Math.min(focusIdx, Math.max(0, colors.length - 1));
  const focused = colors[focusPos] ?? null;
  const posOf = (index: number) => colors.findIndex((c) => c.index === index);

  const moveFocus = (pos: number) => {
    if (!colors.length) return;
    const p = (pos + colors.length) % colors.length;
    setFocusIdx(p);
    swatchRefs.current[p]?.focus();
  };

  const doMerge = (from: number, to: number) => {
    const res = mergeColors(from, to);
    if (!res) {
      setStatus({ text: 'Those colors are already one swatch.', undo: false });
      return;
    }
    setStatus({ text: `Merged ${res.from} into ${res.to}. ${res.ids} shapes recolored.`, undo: true });
    const p = posOf(to);
    if (p >= 0) setFocusIdx(p);
  };

  const onSwatchKey = (e: KeyboardEvent, c: ColorCoverage, pos: number) => {
    const tiles = rootRef.current?.querySelectorAll<HTMLElement>('.tx-pl-tile') ?? [];
    let cols = 0;
    for (const t of tiles) { if (t.offsetTop !== tiles[0]?.offsetTop) break; cols++; }
    cols = Math.max(1, cols);
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); moveFocus(pos + 1); break;
      case 'ArrowLeft': e.preventDefault(); moveFocus(pos - 1); break;
      case 'ArrowDown': e.preventDefault(); moveFocus(Math.min(colors.length - 1, pos + cols)); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(Math.max(0, pos - cols)); break;
      case 'Home': e.preventDefault(); moveFocus(0); break;
      case 'End': e.preventDefault(); moveFocus(colors.length - 1); break;
      case 'l': case 'L':
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault(); e.stopPropagation(); // swatch-local shortcut, not the global one
        toggleLock(c.index);
        break;
      case 'm': case 'M':
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault(); e.stopPropagation();
        if (mergeFrom === null || mergeFrom === c.index) {
          setMergeFrom(mergeFrom === c.index ? null : c.index);
          setStatus(mergeFrom === c.index ? null : { text: `Merging ${c.hex}. Focus a target color and press M.`, undo: false });
        } else {
          doMerge(mergeFrom, c.index);
          setMergeFrom(null);
        }
        break;
      case 'Escape':
        if (mergeFrom !== null) { e.preventDefault(); setMergeFrom(null); setStatus(null); }
        break;
    }
  };

  if (!image.value) {
    return (
      <section class="tx-pl" aria-label="Palette">
        <Header count={null} />
        <p class="tx-pl-empty">Drop an image to extract its palette. Colors, coverage and locks show up here.</p>
      </section>
    );
  }
  if (!r) {
    return (
      <section class="tx-pl" aria-label="Palette" aria-busy={busy.value}>
        <Header count={null} />
        <div class="tx-pl-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div class="tx-pl-tile" key={i}><span class="tx-pl-swatch skeleton" /><span class="tx-pl-cov skeleton tx-pl-skel-text" /></div>
          ))}
        </div>
        <p class="tx-pl-empty">{busy.value ? 'Extracting colors.' : 'Trace the image to extract its palette.'}</p>
      </section>
    );
  }
  if (!colors.length) {
    return (
      <section class="tx-pl" aria-label="Palette">
        <Header count={0} />
        <p class="tx-pl-empty">No flat colors. This trace uses gradients only.</p>
      </section>
    );
  }

  const isLocked = (c: ColorCoverage) => locked.has(c.hex);

  return (
    <section class="tx-pl" aria-label="Palette" ref={rootRef}>
      <Header count={colors.length} onReset={() => { resetPalette(); setStatus({ text: 'Palette reset.', undo: true }); }} />
      <div class="tx-pl-grid" role="group" aria-label="Palette colors. Arrow keys move, Enter edits, L locks, M merges.">
        {colors.map((c, pos) => (
          <div
            key={c.index}
            class="tx-pl-tile"
            data-drop={dropOn === c.index && dragFrom !== null && dragFrom !== c.index ? '' : undefined}
            onDragOver={(e) => {
              if (dragFrom === null || dragFrom === c.index) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              if (dropOn !== c.index) setDropOn(c.index);
            }}
            onDragLeave={(e) => {
              const to = e.relatedTarget as Node | null;
              if (!to || !(e.currentTarget as HTMLElement).contains(to)) setDropOn((d) => (d === c.index ? null : d));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom;
              setDragFrom(null); setDropOn(null);
              if (from !== null && from !== c.index) doMerge(from, c.index);
            }}
          >
            <button
              type="button"
              ref={(el) => { swatchRefs.current[pos] = el; }}
              class="tx-pl-swatch"
              style={{ '--tx-swatch': c.hex }}
              tabIndex={pos === focusPos ? 0 : -1}
              draggable
              aria-label={`Color ${c.hex}, ${measuring ? 'measuring coverage' : `${formatShare(c.share)} coverage, ${c.shapes} shapes`}${isLocked(c) ? ', locked' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={editing === c.index}
              aria-pressed={mergeFrom === c.index ? true : undefined}
              data-selected={editing === c.index || mergeFrom === c.index ? '' : undefined}
              data-locked={isLocked(c) ? '' : undefined}
              title={c.hex}
              onFocus={() => setFocusIdx(pos)}
              onClick={() => { setFocusIdx(pos); setEditing(editing === c.index ? null : c.index); }}
              onKeyDown={(e) => onSwatchKey(e, c, pos)}
              onDragStart={(e) => {
                setDragFrom(c.index);
                setEditing(null);
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', c.hex);
                }
              }}
              onDragEnd={() => { setDragFrom(null); setDropOn(null); }}
            />
            {measuring
              ? <span class="tx-pl-cov skeleton tx-pl-skel-text" aria-hidden="true" />
              : <span class="tx-pl-cov t-num">{formatShare(c.share)}</span>}
          </div>
        ))}
      </div>

      {focused && (
        <div class="tx-pl-detail">
          <span class="tx-pl-chip" style={{ '--tx-swatch': focused.hex }} aria-hidden="true" />
          <span class="tx-pl-hex t-num">{focused.hex}</span>
          <span class="tx-pl-meta t-num">
            {measuring ? 'Measuring coverage' : `${formatShare(focused.share)} · ${focused.shapes} shapes`}
            {focused.mergedFrom.length > 0 && ` · ${focused.mergedFrom.length} merged`}
          </span>
          <button
            type="button"
            class="tx-icon-btn"
            aria-pressed={isLocked(focused)}
            aria-label={isLocked(focused) ? `Unlock ${focused.hex}` : `Lock ${focused.hex}`}
            title={isLocked(focused) ? 'Unlock color (L)' : 'Lock color: keeps this hex on re-trace (L)'}
            onClick={() => toggleLock(focused.index)}
          >
            <Icon name={isLocked(focused) ? 'lock' : 'unlock'} size={16} />
          </button>
        </div>
      )}

      {editing !== null && posOf(editing) >= 0 && (
        <ColorPopover
          key={editing}
          index={editing}
          colors={colors}
          measuring={measuring}
          anchor={swatchRefs.current[posOf(editing)] ?? null}
          container={rootRef.current}
          locked={locked.has(colors[posOf(editing)]!.hex)}
          onClose={(refocus, recolored) => {
            const p = posOf(editing);
            setEditing(null);
            if (recolored) setStatus({ text: `Recolored to ${recolored}.`, undo: true });
            if (refocus && p >= 0) swatchRefs.current[p]?.focus();
          }}
          onMerge={(to) => { const from = editing; setEditing(null); doMerge(from, to); }}
          onError={(text) => setStatus({ text, undo: false, err: true })}
        />
      )}

      {report && report.unmeasured > 0 && (
        <p class="tx-pl-note">{report.unmeasured} shapes could not be measured; their area counts as 0 %.</p>
      )}
      {locked.size > 0 && (
        <p class="tx-pl-note">{locked.size} locked. The palette is pinned for re-trace; unlock all to return to auto colors.</p>
      )}
      <p class="tx-pl-status" role="status" data-err={status?.err ? '' : undefined}>
        {status?.err && <Icon name="alert" size={16} />}
        {status?.text}
        {status?.undo && canUndo && (
          <button
            type="button"
            class="tx-text-btn"
            onClick={() => { const label = undoPaletteEdit(); setStatus(label ? { text: `Undid: ${label}.`, undo: false } : null); }}
          >
            Undo
          </button>
        )}
      </p>
    </section>
  );
}

function Header({ count, onReset }: { count: number | null; onReset?: () => void }) {
  return (
    <div class="tx-pl-head">
      <span class="t-label">Palette</span>
      {count !== null && <span class="tx-pl-count t-num">{count} colors</span>}
      {onReset && (
        <button type="button" class="tx-text-btn" onClick={onReset}>Reset palette</button>
      )}
    </div>
  );
}

function ColorPopover(props: {
  index: number;
  colors: ColorCoverage[];
  measuring: boolean;
  anchor: HTMLElement | null;
  container: HTMLElement | null;
  locked: boolean;
  onClose: (refocus: boolean, recolored: string | null) => void;
  onMerge: (to: number) => void;
  onError: (text: string) => void;
}) {
  const { index, colors, measuring, anchor, container, locked, onClose, onMerge, onError } = props;
  const current = colors.find((c) => c.index === index);
  const [initialSession] = useState(() => beginRecolor(index)); // snapshot once, not per render
  const session = useRef(initialSession);
  // Native picker fires `input` per pointer move: coalesce to one recolor per frame.
  const frame = useRef<{ raf: number; hex: string | null }>({ raf: 0, hex: null });
  useEffect(() => () => {
    const f = frame.current;
    if (f.raf) cancelAnimationFrame(f.raf);
    if (f.hex) recolor(index, f.hex, session.current, false); // flush the last pending frame on close
  }, []);
  const [draft, setDraftState] = useState(current?.hex ?? '');
  const draftRef = useRef(draft);
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v); };
  const [invalid, setInvalid] = useState(false);
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const ED = eyeDropper();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !container || !el) return;
    const a = anchor.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const maxLeft = Math.max(0, container.clientWidth - el.offsetWidth);
    setPos({ left: Math.min(maxLeft, Math.max(0, a.left - c.left)), top: a.bottom - c.top + 8 });
  }, [anchor, container]);

  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>('.tx-pl-hexin')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  if (!current) return null;

  function close(refocus: boolean) {
    onClose(refocus, session.current.touched ? (normalizeHex(draftRef.current) ?? null) : null);
  }

  const apply = (hex: string, commit: boolean) => {
    const h = normalizeHex(hex);
    if (!h) { setInvalid(true); return; }
    setInvalid(false);
    setDraft(h);
    const f = frame.current;
    if (commit) {
      if (f.raf) cancelAnimationFrame(f.raf);
      f.raf = 0; f.hex = null;
      recolor(index, h, session.current, true);
      return;
    }
    f.hex = h;
    if (!f.raf) {
      f.raf = requestAnimationFrame(() => {
        f.raf = 0;
        const next = f.hex;
        f.hex = null;
        if (next) recolor(index, next, session.current, false);
      });
    }
  };

  const sample = async () => {
    if (!ED || picking) return;
    setPicking(true);
    try {
      const res = await new ED().open();
      const h = pickedHex(res.sRGBHex);
      if (h) apply(h, true);
      else onError(`The eyedropper returned "${res.sRGBHex}", which is not a color. Type the hex instead.`);
    } catch (err) {
      // AbortError = user pressed Esc in the eyedropper; anything else is a real failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        onError(`Eyedropper failed: ${err instanceof Error ? err.message : String(err)}. Type the hex instead.`);
      }
    } finally {
      setPicking(false);
    }
  };

  const others = colors.filter((c) => c.index !== index);

  return (
    <div
      ref={ref}
      class="tx-pop tx-pl-pop"
      role="dialog"
      aria-label={`Edit color ${current.hex}`}
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      }}
    >
      <div class="tx-pl-pop-row">
        <input
          type="color"
          class="tx-pl-native"
          value={normalizeHex(draft) ?? current.hex}
          aria-label="Color picker"
          onInput={(e) => apply((e.currentTarget as HTMLInputElement).value, false)}
          onChange={(e) => apply((e.currentTarget as HTMLInputElement).value, true)}
        />
        <input
          type="text"
          class="tx-input tx-pl-hexin t-num"
          value={draft}
          spellcheck={false}
          maxLength={7}
          aria-label="Hex"
          aria-invalid={invalid}
          onInput={(e) => { setDraft((e.currentTarget as HTMLInputElement).value); setInvalid(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(draft, true); } }}
          onBlur={() => { if (normalizeHex(draft) !== current.hex) apply(draft, true); }}
        />
        <button
          type="button"
          class="tx-icon-btn"
          disabled={!ED || picking}
          aria-label="Sample a color from the screen"
          title={ED ? 'Sample from screen' : 'Eyedropper is not available in this browser'}
          onClick={sample}
        >
          <Icon name="pen" size={16} />
        </button>
      </div>
      {invalid && <p class="tx-pl-invalid" role="alert"><Icon name="alert" size={16} />Use 6 hex digits, like #ff5a1f.</p>}
      {others.length > 0 && (
        <label class="tx-pl-pop-row">
          <span class="t-label">Merge into</span>
          <select
            class="tx-input tx-pl-select"
            value=""
            onChange={(e) => {
              const v = Number((e.currentTarget as HTMLSelectElement).value);
              if (Number.isInteger(v)) onMerge(v);
            }}
          >
            <option value="" disabled>Choose color</option>
            {others.map((c) => <option key={c.index} value={String(c.index)}>{measuring ? c.hex : `${c.hex} · ${formatShare(c.share)}`}</option>)}
          </select>
        </label>
      )}
      <div class="tx-pl-pop-row tx-pl-pop-actions">
        <button type="button" class="tx-text-btn" aria-pressed={locked} onClick={() => toggleLock(index)}>
          <Icon name={locked ? 'lock' : 'unlock'} size={16} />{locked ? 'Unlock' : 'Lock'}
        </button>
        <button type="button" class="tx-btn" onClick={() => close(true)}>Done</button>
      </div>
    </div>
  );
}
