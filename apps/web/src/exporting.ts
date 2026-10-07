import { signal, computed } from '@preact/signals';
import { toSvg, toPdf, toEps, toDxf } from 'trace-vectorizer';
import type { SvgOptions } from 'trace-vectorizer';
import { image, opts, result, hidden, overrides } from './store';
import { deriveFilename, toCliCommand, toPresetJson, baseName } from './cliCommand';

export type ExportFormat = 'svg' | 'pdf' | 'eps' | 'dxf' | 'png';
export const FORMATS: ExportFormat[] = ['svg', 'pdf', 'eps', 'dxf', 'png'];
export const exportFormat = signal<ExportFormat>('svg');
export const pngScale = signal<1 | 2 | 4>(1);
export const pngTransparent = signal(true);
export const precision = signal(2);
/** User-typed base name; null follows the image name. */
export const filenameOverride = signal<string | null>(null);

export const filename = computed(() => {
  const custom = filenameOverride.value;
  const base = custom !== null && custom.trim() !== '' ? baseName(custom) : baseName(image.value?.name ?? 'trace');
  return deriveFilename(base, exportFormat.value);
});

export const MIME: Record<ExportFormat, string> = {
  svg: 'image/svg+xml', pdf: 'application/pdf', eps: 'application/postscript', dxf: 'image/vnd.dxf', png: 'image/png',
};

function svgOpts(): SvgOptions {
  return { precision: precision.value, hidden: [...hidden.value], overrides: overrides.value };
}

export const svgText = computed(() => {
  const r = result.value;
  return r ? toSvg(r, svgOpts()) : '';
});

/** Bytes of the vector formats; PNG size is only known after rasterizing. */
export const sizeBytes = computed<number | null>(() => {
  const r = result.value;
  if (!r) return null;
  const f = exportFormat.value;
  const enc = new TextEncoder();
  switch (f) {
    case 'svg': return enc.encode(svgText.value).length;
    case 'pdf': return toPdf(r, svgOpts()).length;
    case 'eps': return enc.encode(toEps(r, svgOpts())).length;
    case 'dxf': return enc.encode(toDxf(r, svgOpts())).length;
    case 'png': return null;
  }
});

export const pngDimensions = computed(() => {
  const r = result.value;
  return r ? { w: Math.round(r.width * pngScale.value), h: Math.round(r.height * pngScale.value) } : null;
});

export function formatKb(bytes: number | null): string {
  return bytes === null ? '-' : `${(bytes / 1000).toFixed(1)} kb`;
}

export async function rasterize(svg: string, w: number, h: number, background: string | null): Promise<Blob> {
  const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: MIME.svg }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not rasterize the SVG')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildExport(format: ExportFormat = exportFormat.value): Promise<Blob | null> {
  const r = result.value;
  if (!r) return null;
  const o = svgOpts();
  switch (format) {
    case 'svg': return new Blob([toSvg(r, o)], { type: MIME.svg });
    case 'pdf': return new Blob([toPdf(r, o) as BlobPart], { type: MIME.pdf });
    case 'eps': return new Blob([toEps(r, o)], { type: MIME.eps });
    case 'dxf': return new Blob([toDxf(r, svgOpts())], { type: MIME.dxf });
    case 'png': {
      const s = pngScale.value;
      return rasterize(toSvg(r, o), Math.round(r.width * s), Math.round(r.height * s), pngTransparent.value ? null : (r.background ?? '#ffffff'));
    }
  }
}

export const exportStatus = signal<'idle' | 'working' | 'done' | 'error'>('idle');
export const exportMessage = signal('');

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the current result in the chosen format. Bound to Cmd/Ctrl+E by the app frame. */
export async function exportCurrent(): Promise<boolean> {
  if (!result.value) { exportStatus.value = 'error'; exportMessage.value = 'Nothing to export yet. Drop an image first.'; return false; }
  exportStatus.value = 'working';
  try {
    const blob = await buildExport();
    if (!blob) return false;
    download(blob, filename.value);
    exportStatus.value = 'done';
    exportMessage.value = `Saved ${filename.value} · ${formatKb(blob.size)}`;
    return true;
  } catch (e) {
    exportStatus.value = 'error';
    exportMessage.value = e instanceof Error ? e.message : String(e);
    return false;
  }
}

async function copy(text: string, ok: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    exportStatus.value = 'done'; exportMessage.value = ok;
    return true;
  } catch {
    exportStatus.value = 'error'; exportMessage.value = 'Clipboard blocked by the browser. Use the download instead.';
    return false;
  }
}

export const copySvg = () => (result.value ? copy(svgText.value, 'SVG copied') : Promise.resolve(false));
export const cliText = computed(() => toCliCommand(opts.value, filename.value, exportFormat.value, image.value?.name ?? 'image.png', precision.value));
export const copyCli = () => copy(cliText.value, 'CLI command copied');
export const copyPresetJson = () => copy(toPresetJson(opts.value, precision.value), 'Preset JSON copied');
