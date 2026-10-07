import { useRef, useState } from 'preact/hooks';
import {
  batch, batchFormat, batchProgress, addFiles, retry, cancelAll, clearBatch, removeItem, downloadZip, filesFromDataTransfer,
  type BatchFormat, type BatchItem,
} from '../batch';
import { batchOpen } from '../batchState';
import { Icon } from '../design/icons';
import '../export-extras.css';

const FORMATS: BatchFormat[] = ['svg', 'pdf', 'eps', 'dxf'];
const kb = (b: number) => (b ? `${(b / 1000).toFixed(1)} kb` : '-');

function Row({ it }: { it: BatchItem }) {
  const active = it.status === 'running' || it.status === 'queued';
  return (
    <tr>
      <td class="name" title={it.name}>{it.name}</td>
      <td><span class="bp-st" data-s={it.status} title={it.error}>{it.status === 'error' ? 'failed' : it.status}</span></td>
      <td class="num">{it.status === 'done' ? it.paths : it.status === 'running' ? <span class="skeleton bp-skel" style={{ width: '32px' }} /> : '-'}</td>
      <td class="num">{it.status === 'done' ? kb(it.svgBytes) : it.status === 'running' ? <span class="skeleton bp-skel" style={{ width: '48px' }} /> : '-'}</td>
      <td class="num">{it.status === 'done' ? `${it.ms} ms` : '-'}</td>
      <td class="num">
        {(it.status === 'error' || it.status === 'cancelled') && (
          <button type="button" class="xp-btn ghost" onClick={() => retry(it.id)} aria-label={`Retry ${it.name}`}>Retry</button>
        )}
        {!active && (
          <button type="button" class="xp-btn ghost" onClick={() => removeItem(it.id)} aria-label={`Remove ${it.name}`}><Icon name="x" size={16} /></button>
        )}
      </td>
    </tr>
  );
}

export function BatchPanel() {
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const items = batch.value.items;
  const p = batchProgress(items);
  const working = p.running > 0 || items.some((i) => i.status === 'queued');

  return (
    <div class="bp" role="group" aria-label="Batch">
      <div class="bp-head">
        <h2>Batch</h2>
        <button type="button" class="xp-btn ghost" aria-label="Close batch" onClick={() => { batchOpen.value = false; }}><Icon name="x" /></button>
      </div>

      <div class="bp-drop" data-over={over}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          if (e.dataTransfer) void filesFromDataTransfer(e.dataTransfer).then(addFiles);
        }}>
        <h3>{items.length === 0 ? 'Trace a whole folder' : 'Add more'}</h3>
        <p>
          Drop images or a folder here. Every file is traced with your current settings, in parallel, and nothing leaves this device.
          Then download the lot as one ZIP.
        </p>
        <div class="xp-actions">
          <button type="button" class="xp-btn" onClick={() => fileInput.current?.click()}><Icon name="upload" size={16} /> Choose files</button>
          <button type="button" class="xp-btn" onClick={() => dirInput.current?.click()}><Icon name="batch" size={16} /> Choose folder</button>
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden
          onChange={(e) => { const t = e.target as HTMLInputElement; void addFiles([...(t.files ?? [])]); t.value = ''; }} />
        <input ref={dirInput} type="file" hidden {...({ webkitdirectory: '' } as object)}
          onChange={(e) => { const t = e.target as HTMLInputElement; void addFiles([...(t.files ?? [])]); t.value = ''; }} />
      </div>

      {items.length > 0 && (
        <>
          <div class="bp-pen" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)} aria-label="Batch progress">
            <i style={{ width: `${p.fraction * 100}%` }} />
          </div>
          <div class="bp-table-wrap">
            <table class="bp-table">
              <thead>
                <tr><th>Name</th><th>Status</th><th class="num">Paths</th><th class="num">Size</th><th class="num">Time</th><th /></tr>
              </thead>
              <tbody>{items.map((it) => <Row key={it.id} it={it} />)}</tbody>
            </table>
          </div>
          <div class="bp-foot">
            <span class="xp-readout">{p.done} / {p.total} done{p.failed ? ` · ${p.failed} failed` : ''}</span>
            <div class="xp-seg" role="group" aria-label="ZIP format">
              {FORMATS.map((f) => (
                <button type="button" key={f} aria-pressed={batchFormat.value === f} onClick={() => { batchFormat.value = f; }}>{f}</button>
              ))}
            </div>
            {working
              ? <button type="button" class="xp-btn" onClick={cancelAll}>Cancel</button>
              : <button type="button" class="xp-btn ghost" onClick={clearBatch}>Clear</button>}
            <button type="button" class="xp-btn primary" disabled={p.done === 0} onClick={() => downloadZip(batchFormat.value)}>
              <Icon name="download" size={16} /> Download ZIP
            </button>
          </div>
        </>
      )}
    </div>
  );
}
