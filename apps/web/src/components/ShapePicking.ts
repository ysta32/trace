// Shape picking on the vector canvas: hover outline, click / shift-click, alt-click (same color),
// marquee on empty canvas, double-click isolate. Event delegation on `host`; hit-testing uses
// getScreenCTM so it follows whatever pan/zoom transform the frame applies.
import { useEffect } from 'preact/hooks';
import { effect } from '@preact/signals';
import { result, hidden, selection, select, clearSelection } from '../store';
import { hoverShape, isolated } from '../editorState';
import '../editor-extras.css';

export interface Rect { x: number; y: number; w: number; h: number }
/** 2D affine matrix (SVGMatrix / DOMMatrix compatible). */
export interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
export interface PickItem { id: number; bbox: Rect; ctm: Matrix }

export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Closed-interval overlap: touching edges count, so a zero-size rect hits what it lies on. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** Axis-aligned bounds of `r` after applying `m` (handles rotation/skew/flip). */
export function transformRect(r: Rect, m: Matrix): Rect {
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]] as const;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    const tx = m.a * x + m.c * y + m.e;
    const ty = m.b * x + m.d * y + m.f;
    x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Ids whose screen-space bounding box touches the marquee (client px). */
export function hitTestMarquee(marquee: Rect, items: readonly PickItem[]): number[] {
  const out: number[] = [];
  for (const it of items) if (rectsIntersect(marquee, transformRect(it.bbox, it.ctm))) out.push(it.id);
  return out;
}

const DRAG_THRESHOLD = 3; // px before a press becomes a marquee

function shapeEl(target: EventTarget | null, host: HTMLElement): SVGGraphicsElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-shape-id]');
  return el && host.contains(el) ? (el as SVGGraphicsElement) : null;
}

function idOf(el: Element | null): number | null {
  const raw = el?.getAttribute('data-shape-id');
  if (raw == null || raw === '') return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/** Attach picking to `host`; returns a disposer. Exposed for non-hook callers. */
export function attachPicking(host: HTMLElement): () => void {
  host.classList.add('tx-pick-host');
  let restorePosition: string | null = null;
  if (getComputedStyle(host).position === 'static') {
    restorePosition = host.style.position;
    host.style.position = 'relative';
  }

  let hoverEl: Element | null = null;
  const setHover = (el: Element | null): void => {
    if (el === hoverEl) return;
    hoverEl?.removeAttribute('data-hover');
    hoverEl = el;
    el?.setAttribute('data-hover', '');
    hoverShape.value = idOf(el);
  };

  interface Press {
    pointerId: number; x: number; y: number; id: number | null;
    shift: boolean; alt: boolean; moved: boolean;
    base: ReadonlySet<number>; items: PickItem[] | null; box: HTMLDivElement | null; raf: number;
    cx: number; cy: number;
  }
  let press: Press | null = null;

  const collect = (): PickItem[] => {
    const items: PickItem[] = [];
    for (const el of host.querySelectorAll<SVGGraphicsElement>('[data-shape-id]')) {
      const id = idOf(el);
      if (id == null || typeof el.getBBox !== 'function') continue;
      const ctm = el.getScreenCTM();
      if (!ctm) continue; // not rendered (display:none)
      const b = el.getBBox();
      items.push({ id, bbox: { x: b.x, y: b.y, w: b.width, h: b.height }, ctm });
    }
    return items;
  };

  const updateMarquee = (): void => {
    const p = press;
    if (!p || !p.box || !p.items) return;
    p.raf = 0;
    const rect = rectFromPoints(p.x, p.y, p.cx, p.cy);
    const hr = host.getBoundingClientRect();
    const s = p.box.style;
    s.left = `${rect.x - hr.left - host.clientLeft + host.scrollLeft}px`;
    s.top = `${rect.y - hr.top - host.clientTop + host.scrollTop}px`;
    s.width = `${rect.w}px`;
    s.height = `${rect.h}px`;
    const hits = hitTestMarquee(rect, p.items);
    const next = new Set(p.shift ? p.base : []);
    for (const id of hits) next.add(id);
    selection.value = next;
  };

  const endPress = (): void => {
    if (!press) return;
    if (press.raf) cancelAnimationFrame(press.raf);
    press.box?.remove();
    if (host.hasPointerCapture(press.pointerId)) host.releasePointerCapture(press.pointerId);
    host.removeAttribute('data-marquee');
    press = null;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (press) endPress(); // a press whose pointerup landed outside the host
    if (e.button !== 0 || e.defaultPrevented) return;
    const el = shapeEl(e.target, host);
    press = {
      pointerId: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY,
      id: idOf(el), shift: e.shiftKey, alt: e.altKey, moved: false,
      base: selection.peek(), items: null, box: null, raf: 0,
    };
    if (!el) host.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    const p = press;
    if (!p) {
      setHover(shapeEl(e.target, host));
      return;
    }
    if (e.pointerId !== p.pointerId) return;
    p.cx = e.clientX; p.cy = e.clientY;
    if (!p.moved && Math.hypot(p.cx - p.x, p.cy - p.y) >= DRAG_THRESHOLD) {
      p.moved = true;
      if (p.id == null) {
        setHover(null);
        p.items = collect();
        const box = document.createElement('div');
        box.className = 'tx-marquee';
        box.setAttribute('aria-hidden', 'true');
        host.appendChild(box);
        p.box = box;
        host.setAttribute('data-marquee', '');
      }
    }
    if (p.box && !p.raf) p.raf = requestAnimationFrame(updateMarquee);
  };

  const onPointerUp = (e: PointerEvent): void => {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    if (p.box) {
      if (p.raf) cancelAnimationFrame(p.raf);
      p.cx = e.clientX; p.cy = e.clientY;
      updateMarquee();
    } else if (!p.moved) {
      if (p.id != null) {
        if (p.alt) {
          const r = result.peek();
          const shape = r?.shapes.find((s) => s.id === p.id);
          const same = shape && shape.colorIndex >= 0
            ? r!.shapes.filter((s) => s.colorIndex === shape.colorIndex).map((s) => s.id)
            : [p.id];
          const off = hidden.peek();
          const next = new Set(p.shift ? selection.peek() : []);
          for (const id of same) if (!off.has(id)) next.add(id);
          selection.value = next;
        } else {
          select(p.id, p.shift);
        }
      } else if (!p.shift) {
        clearSelection();
      }
    }
    endPress();
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (press && e.pointerId === press.pointerId) {
      if (press.box) selection.value = new Set(press.base); // abandoned marquee restores the selection
      endPress();
    }
  };

  const onPointerLeave = (): void => { if (!press) setHover(null); };

  const onDblClick = (e: MouseEvent): void => {
    const id = idOf(shapeEl(e.target, host));
    if (id == null) { isolated.value = null; return; }
    const sel = selection.peek();
    isolated.value = sel.has(id) && sel.size > 1 ? new Set(sel) : new Set([id]);
    if (!sel.has(id)) select(id, false);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (press?.box) { selection.value = new Set(press.base); endPress(); e.preventDefault(); return; }
      if (isolated.peek()) { isolated.value = null; e.preventDefault(); }
    }
  };

  // Reflect isolation onto the DOM; re-applied when the paths re-render.
  const paintIsolation = (): void => {
    const iso = isolated.peek();
    if (iso) host.setAttribute('data-isolating', '');
    else host.removeAttribute('data-isolating');
    for (const el of host.querySelectorAll('[data-shape-id]')) {
      const id = idOf(el);
      if (iso && id != null && iso.has(id)) el.setAttribute('data-isolated', '');
      else el.removeAttribute('data-isolated');
    }
  };
  const stopIso = effect(() => { void isolated.value; paintIsolation(); });
  const mo = new MutationObserver((records) => {
    if (!isolated.peek()) return;
    if (records.some((r) => r.type === 'childList')) paintIsolation();
  });
  mo.observe(host, { childList: true, subtree: true });

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerCancel);
  host.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    endPress();
    setHover(null);
    stopIso();
    mo.disconnect();
    host.removeAttribute('data-isolating');
    for (const el of host.querySelectorAll('[data-isolated]')) el.removeAttribute('data-isolated');
    host.classList.remove('tx-pick-host');
    if (restorePosition !== null) host.style.position = restorePosition;
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerup', onPointerUp);
    host.removeEventListener('pointercancel', onPointerCancel);
    host.removeEventListener('pointerleave', onPointerLeave);
    host.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKeyDown);
  };
}

export function useShapePicking(host: HTMLElement | null): void {
  useEffect(() => (host ? attachPicking(host) : undefined), [host]);
}
