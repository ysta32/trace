import { useEffect, useRef, useState } from 'preact/hooks';
import { image, viewMode, setViewMode, busy, selection, type ViewMode } from '../store';
import { svgMarkup } from '../svgView';
import {
  splitFromPointer, splitFromKey, zoomAt, fitView, type View,
} from '../splitMath';

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'split', label: 'Split' },
  { id: 'original', label: 'Original' },
  { id: 'vector', label: 'Vector' },
  { id: 'outlines', label: 'Outlines' },
];

export function SplitView() {
  const img = image.value;
  const mode = viewMode.value;
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [split, setSplit] = useState(0.5);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number } | null>(null);

  const fit = () => {
    const el = stage.current;
    if (!el || !img) return;
    const b = el.getBoundingClientRect();
    setView(fitView(b.width, b.height, img.width, img.height));
  };

  useEffect(() => {
    fit();
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line
  }, [img?.url]);

  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const el = stage.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    setView((v) => zoomAt(v, factor, cx ?? b.width / 2, cy ?? b.height / 2));
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      // ctrlKey is set for trackpad pinch
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomAt(v, k, e.clientX - b.left, e.clientY - b.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [!!img]);

  const onStageDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.split-handle')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };
  const onStageMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const el = stage.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && gesture.current) {
      const [p, q] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      const k = dist / (gesture.current.dist || dist);
      gesture.current.dist = dist;
      setView((v) => zoomAt(v, k, (p.x + q.x) / 2 - b.left, (p.y + q.y) / 2 - b.top));
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onStageUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  const onHandleDown = (e: PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const b = stage.current?.getBoundingClientRect();
    if (b) setSplit(splitFromPointer(e.clientX, b.left, b.width));
  };
  const onHandleKey = (e: KeyboardEvent) => {
    const next = splitFromKey(split, e.key, e.shiftKey);
    if (next !== split || ['Home', 'End'].includes(e.key)) {
      e.preventDefault();
      setSplit(next);
    }
  };

  const showOrig = mode === 'split' || mode === 'original';
  const showVec = mode !== 'original';
  const clip = mode === 'split' ? `inset(0 0 0 ${(split * 100).toFixed(3)}%)` : 'none';
  const layerStyle = img
    ? {
        width: `${img.width}px`, height: `${img.height}px`,
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
      }
    : undefined;
  const pixelated = view.scale > 4 ? ' pixelated' : '';

  return (
    <div class="splitview">
      <div class="toolbar">
        <div class="seg" role="group" aria-label="View mode">
          {MODES.map((m) => (
            <button type="button" key={m.id} class={mode === m.id ? 'active' : ''} aria-pressed={mode === m.id} onClick={() => setViewMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div class="zoom" role="group" aria-label="Zoom">
          <button type="button" class="btn small" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
          <span class="zoom-val">{Math.round(view.scale * 100)}%</span>
          <button type="button" class="btn small" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
          <button type="button" class="btn small" onClick={fit}>Fit</button>
          <button type="button" class="btn small" onClick={() => zoomBy(1 / view.scale)}>1:1</button>
        </div>
      </div>
      <div
        class="stage checker"
        ref={stage}
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={onStageUp}
      >
        {img && showOrig && (
          <div class="layer orig" style={{ clipPath: mode === 'split' ? `inset(0 ${((1 - split) * 100).toFixed(3)}% 0 0)` : 'none' }}>
            <img class={`raster${pixelated}`} src={img.url} alt="Original" draggable={false} style={layerStyle} />
          </div>
        )}
        {img && showVec && (
          <div class="layer vec" style={{ clipPath: clip }}>
            <div
              class={`svgwrap${mode === 'outlines' ? ' outlines' : ''}${selection.value.size ? ' has-selection' : ''}`}
              style={layerStyle}
              // markup is produced locally by trace-vectorizer from numeric path data
              dangerouslySetInnerHTML={{ __html: svgMarkup.value }}
            />
          </div>
        )}
        {img && mode === 'split' && (
          <div
            class="split-handle"
            style={{ left: `${split * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Comparison divider"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split * 100)}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onKeyDown={onHandleKey}
          >
            <span class="grip" aria-hidden="true">⇆</span>
          </div>
        )}
        {mode === 'split' && img && (
          <>
            <span class="tag left">Original</span>
            <span class="tag right">SVG</span>
          </>
        )}
        {busy.value && <div class="busy" role="status">Tracing…</div>}
      </div>
    </div>
  );
}
