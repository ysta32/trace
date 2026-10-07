// Diff Lens: OKLab ΔE heatmap of source raster vs. rendered vector, SSIM readout, worst-region
// jump, full-frame or loupe. Mount inside the (untransformed) canvas viewport; it fills its
// positioned parent and tracks the on-screen box of the vector <svg> so pan/zoom line up.
import { useEffect, useRef, useState } from 'preact/hooks';
import { toSvg, type TraceResult } from 'trace-vectorizer';
import { image, result, hidden, overrides } from '../store';
import { diffLensOn, diffLensMode, diffStats } from '../editorState';
import { diffSteps, parseCssColor, DEFAULT_DIFF_RAMP, type DiffResult, type RampStop } from '../diff';
import { Icon } from '../design/icons';
import '../editor-extras.css';

const MAX_SIDE = 2048;     // analysis resolution cap; worst rect is mapped back to source px
const CHUNK_MS = 8;        // per idle slice; well under the 50 ms long-task line
const DEBOUNCE_MS = 150;   // color-drag edits arrive per frame
const LOUPE = 160;         // loupe edge, px

type Phase = { kind: 'idle' } | { kind: 'running'; progress: number } | { kind: 'done' } | { kind: 'error'; message: string };

const idle: (cb: (d: { timeRemaining(): number }) => void) => number =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 100 })
    : (cb) => setTimeout(() => cb({ timeRemaining: () => CHUNK_MS }), 0) as unknown as number;
const cancelIdle: (h: number) => void =
  typeof cancelIdleCallback === 'function' ? (h) => cancelIdleCallback(h) : (h) => clearTimeout(h);

function readRamp(): RampStop[] {
  const cs = getComputedStyle(document.documentElement);
  return DEFAULT_DIFF_RAMP.map((fallback, i) => parseCssColor(cs.getPropertyValue(`--diff-${i}`)) ?? fallback);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

function pixels(img: CanvasImageSource, w: number, h: number): ImageData {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function rasterizeVector(r: TraceResult, w: number, h: number, hid: ReadonlySet<number>, ov: Record<number, string>): Promise<ImageData> {
  // Explicit width/height: Firefox will not draw an SVG without intrinsic size.
  const svg = toSvg(r, { hidden: [...hid], overrides: ov }).replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="none" `);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    return pixels(await loadImage(url), w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Content box of the vector svg (viewBox, preserveAspectRatio meet) relative to `root`. */
function contentBox(root: HTMLElement, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const rr = root.getBoundingClientRect();
  const parent = root.parentElement;
  const svg = parent?.querySelector('[data-shape-id]')?.closest('svg') ?? null;
  const box = svg ? svg.getBoundingClientRect() : rr;
  const s = Math.min(box.width / w, box.height / h);
  const cw = w * s, ch = h * s;
  return { x: box.left - rr.left + (box.width - cw) / 2, y: box.top - rr.top + (box.height - ch) / 2, w: cw, h: ch };
}

export function DiffLens() {
  const on = diffLensOn.value;
  const r = result.value;
  const img = image.value;
  const hid = hidden.value;
  const ov = overrides.value;
  const mode = diffLensMode.value;
  const stats = diffStats.value;

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [retry, setRetry] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  // Compute: rasterize both, then diff in idle slices of ≤ CHUNK_MS.
  useEffect(() => {
    if (!on || !r || !img) { setPhase({ kind: 'idle' }); return; }
    let cancelled = false;
    let handle = 0;
    const timer = setTimeout(async () => {
      const s = Math.min(1, MAX_SIDE / Math.max(r.width, r.height));
      const w = Math.max(1, Math.round(r.width * s)), h = Math.max(1, Math.round(r.height * s));
      scaleRef.current = s;
      setPhase({ kind: 'running', progress: 0 });
      let src: ImageData, vec: ImageData;
      try {
        [src, vec] = await Promise.all([loadImage(img.url).then((el) => pixels(el, w, h)), rasterizeVector(r, w, h, hid, ov)]);
      } catch (err) {
        if (!cancelled) setPhase({ kind: 'error', message: `Could not render the comparison: ${err instanceof Error ? err.message : String(err)}.` });
        return;
      }
      if (cancelled) return;
      const it = diffSteps(src, vec, { ramp: readRamp() });
      let lastShown = 0;
      const step = (deadline: { timeRemaining(): number }) => {
        if (cancelled) return;
        const budget = Math.min(CHUNK_MS, Math.max(2, deadline.timeRemaining()));
        const t0 = performance.now();
        let progress = lastShown;
        try {
          while (performance.now() - t0 < budget) {
            const res = it.next();
            if (res.done) { finish(res.value); return; }
            progress = res.value;
          }
        } catch (err) {
          setPhase({ kind: 'error', message: `Diff failed: ${err instanceof Error ? err.message : String(err)}.` });
          return;
        }
        if (progress - lastShown >= 0.02) { lastShown = progress; setPhase({ kind: 'running', progress }); }
        handle = idle(step);
      };
      const finish = (d: DiffResult) => {
        const c = canvasRef.current;
        if (c) {
          c.width = d.heat.width; c.height = d.heat.height;
          c.getContext('2d')?.putImageData(d.heat, 0, 0);
        }
        const inv = 1 / s;
        diffStats.value = {
          ssim: d.ssim,
          meanDeltaE: d.meanDeltaE,
          worst: { x: d.worst.x * inv, y: d.worst.y * inv, w: d.worst.w * inv, h: d.worst.h * inv },
        };
        setPhase({ kind: 'done' });
      };
      handle = idle(step);
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); if (handle) cancelIdle(handle); };
  }, [on, r, img, hid, ov, retry]);

  // Keep the heat canvas glued to the vector's on-screen box (pan/zoom/resize) while visible.
  useEffect(() => {
    if (!on || !r) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      const root = rootRef.current, c = canvasRef.current;
      if (root && c) {
        const b = contentBox(root, r.width, r.height);
        const key = `${b.x}|${b.y}|${b.w}|${b.h}`;
        if (key !== last) {
          last = key;
          Object.assign(c.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, r]);

  // Loupe: follow the pointer with CSS vars; no re-render per move.
  useEffect(() => {
    if (!on || mode !== 'loupe') return;
    const onMove = (e: PointerEvent) => {
      const c = canvasRef.current, ring = ringRef.current, root = rootRef.current;
      if (!c || !ring || !root) return;
      const cr = c.getBoundingClientRect(), rr = root.getBoundingClientRect();
      const inside = e.clientX >= rr.left && e.clientX <= rr.right && e.clientY >= rr.top && e.clientY <= rr.bottom;
      c.style.setProperty('--tx-lx', `${e.clientX - cr.left}px`);
      c.style.setProperty('--tx-ly', `${e.clientY - cr.top}px`);
      ring.style.transform = `translate(${e.clientX - rr.left - LOUPE / 2}px, ${e.clientY - rr.top - LOUPE / 2}px)`;
      root.toggleAttribute('data-loupe-active', inside);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      rootRef.current?.removeAttribute('data-loupe-active');
    };
  }, [on, mode]);

  if (!on || !r || !img) return null;

  const worst = stats?.worst;
  const canJump = phase.kind === 'done' && !!worst && worst.w > 0 && worst.h > 0;

  return (
    <div ref={rootRef} class="tx-dl" data-mode={mode} style={{ '--tx-loupe': `${LOUPE}px` }}>
      <canvas ref={canvasRef} class="tx-dl-heat" data-ready={phase.kind === 'done' || (phase.kind === 'running' && stats) ? '' : undefined} aria-hidden="true" />
      {mode === 'loupe' && <div ref={ringRef} class="tx-dl-ring" aria-hidden="true" />}
      <div class="tx-pop tx-dl-hud" role="group" aria-label="Diff lens">
        <Icon name="diff" size={16} />
        {phase.kind === 'running' && (
          <span class="tx-dl-progress t-num" role="status">
            <span class="tx-dl-bar" aria-hidden="true"><span style={{ width: `${Math.round(phase.progress * 100)}%` }} /></span>
            Comparing {Math.round(phase.progress * 100)}&thinsp;%
          </span>
        )}
        {phase.kind === 'error' && (
          <span class="tx-dl-err" role="alert">
            <Icon name="alert" size={16} />{phase.message}
            <button type="button" class="tx-text-btn" onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </span>
        )}
        {phase.kind === 'done' && stats && (
          <>
            <span class="tx-dl-metric t-num" title="Structural similarity on luma, 8x8 windows. 1 = identical.">
              {stats.ssim.toFixed(3)}&thinsp;<span class="tx-unit">ssim</span>
            </span>
            <span class="tx-dl-metric t-num" title="Mean OKLab color difference x100. About 2 is one just-noticeable step.">
              {(stats.meanDeltaE * 100).toFixed(1)}&thinsp;<span class="tx-unit">Δe</span>
            </span>
          </>
        )}
        <div class="tx-seg" role="group" aria-label="Lens mode">
          <button type="button" class="tx-seg-btn" aria-pressed={mode === 'full'} onClick={() => { diffLensMode.value = 'full'; }}>Full</button>
          <button type="button" class="tx-seg-btn" aria-pressed={mode === 'loupe'} onClick={() => { diffLensMode.value = 'loupe'; }}>Loupe</button>
        </div>
        <button
          type="button"
          class="tx-text-btn"
          disabled={!canJump}
          onClick={() => {
            if (worst) window.dispatchEvent(new CustomEvent('trace:focus-rect', { detail: { ...worst } }));
          }}
        >
          <Icon name="zoom-in" size={16} />Jump to worst
        </button>
      </div>
    </div>
  );
}
