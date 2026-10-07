import { result } from '../store';
import {
  FORMATS, exportFormat, pngScale, pngTransparent, precision, filename, filenameOverride, sizeBytes, pngDimensions,
  formatKb, exportCurrent, copySvg, copyCli, copyPresetJson, cliText, exportStatus, exportMessage,
} from '../exporting';
import { baseName } from '../cliCommand';
import { image } from '../store';
import { Icon } from '../design/icons';
import '../export-extras.css';

export function ExportPanel() {
  const fmt = exportFormat.value;
  const r = result.value;
  const dims = pngDimensions.value;
  const base = filenameOverride.value ?? baseName(image.value?.name ?? 'trace');

  return (
    <section class="xp" aria-label="Export">
      <div class="xp-row">
        <span class="t-label" id="xp-fmt">Format</span>
        <div class="xp-seg" role="group" aria-labelledby="xp-fmt">
          {FORMATS.map((f) => (
            <button type="button" key={f} aria-pressed={fmt === f} onClick={() => { exportFormat.value = f; }}>{f}</button>
          ))}
        </div>
      </div>

      {fmt === 'png' && (
        <>
          <div class="xp-row">
            <span class="t-label" id="xp-scale">Scale</span>
            <div class="xp-seg" role="group" aria-labelledby="xp-scale">
              {([1, 2, 4] as const).map((s) => (
                <button type="button" key={s} aria-pressed={pngScale.value === s} onClick={() => { pngScale.value = s; }}>{s}x</button>
              ))}
            </div>
          </div>
          <label class="xp-row xp-toggle">
            <span class="t-label">Transparent background</span>
            <input type="checkbox" checked={pngTransparent.value} onChange={(e) => { pngTransparent.value = (e.target as HTMLInputElement).checked; }} />
          </label>
        </>
      )}

      {fmt !== 'png' && fmt !== 'dxf' && (
        <label class="xp-row">
          <span class="t-label">Precision</span>
          <input class="xp-input" style={{ flex: '0 0 72px' }} type="number" min="0" max="6" step="1" value={precision.value}
            onInput={(e) => {
              const n = Math.round(Number((e.target as HTMLInputElement).value));
              if (Number.isFinite(n)) precision.value = Math.min(6, Math.max(0, n));
            }} />
        </label>
      )}

      <label class="xp-row">
        <span class="t-label">File</span>
        <input class="xp-input" type="text" value={base} spellcheck={false} aria-label="File name"
          onInput={(e) => { filenameOverride.value = (e.target as HTMLInputElement).value; }} />
        <span class="xp-ext">.{fmt}</span>
      </label>

      <div class="xp-row">
        <span class="t-label">Size</span>
        <span class="xp-readout">
          {!r ? '-' : fmt === 'png' && dims ? `${dims.w} x ${dims.h} px` : formatKb(sizeBytes.value)}
        </span>
      </div>

      <div class="xp-actions">
        <button type="button" class="xp-btn primary" disabled={!r} onClick={() => void exportCurrent()}>
          <Icon name="download" size={16} /> Download {filename.value} <kbd class="kbd">⌘E</kbd>
        </button>
        <button type="button" class="xp-btn" disabled={!r} onClick={() => void copySvg()}>Copy SVG</button>
        <button type="button" class="xp-btn" disabled={!r} onClick={() => void copyPresetJson()}>Copy preset JSON</button>
        <button type="button" class="xp-btn" style={{ gridColumn: '1 / -1' }} disabled={!r} onClick={() => void copyCli()}>
          <Icon name="terminal" size={16} /> Copy as CLI
        </button>
      </div>

      <pre class="xp-cli" aria-label="CLI command">{cliText.value}</pre>
      <div class="xp-status" role="status" data-kind={exportStatus.value}>{exportStatus.value === 'idle' ? '' : exportMessage.value}</div>
    </section>
  );
}
