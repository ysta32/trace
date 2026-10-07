export interface View { x: number; y: number; scale: number; }

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 64;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Split position as a fraction 0..1 from a pointer x relative to the container. */
export function splitFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0.5;
  return clamp((clientX - left) / width, 0, 1);
}

/** Keyboard adjustment of the split fraction. */
export function splitFromKey(pos: number, key: string, shift: boolean): number {
  const step = shift ? 0.1 : 0.02;
  switch (key) {
    case 'ArrowLeft': case 'ArrowDown': return clamp(pos - step, 0, 1);
    case 'ArrowRight': case 'ArrowUp': return clamp(pos + step, 0, 1);
    case 'Home': return 0;
    case 'End': return 1;
    default: return pos;
  }
}

/** Zoom by `factor` keeping the point (cx, cy) (container coords) fixed. */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / view.scale;
  return { scale, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k };
}

/** View that fits and centers an image inside a container with padding. */
export function fitView(cw: number, ch: number, iw: number, ih: number, pad = 16): View {
  if (iw <= 0 || ih <= 0 || cw <= 0 || ch <= 0) return { x: 0, y: 0, scale: 1 };
  const scale = clamp(Math.min((cw - pad * 2) / iw, (ch - pad * 2) / ih), MIN_SCALE, MAX_SCALE);
  return { scale, x: (cw - iw * scale) / 2, y: (ch - ih * scale) / 2 };
}
