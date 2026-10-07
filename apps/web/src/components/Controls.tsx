import type { Preset } from 'trace-vectorizer';
import { svgBytes } from '../svgView';
import { opts, setOpts, setPreset, setMode, resetOpts, result, analysis, busy } from '../store';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'logo', label: 'Logo' },
  { id: 'lineart', label: 'Line art' },
  { id: 'pixelart', label: 'Pixel art' },
  { id: 'photo', label: 'Photo poster' },
  { id: 'icon', label: 'Icon' },
];

export function Controls() {
  const o = opts.value;
  const suggested = analysis.value?.preset ?? null;
  const colors = o.colors ?? 'auto';
  const r = result.value;

  return (
    <section class="controls" aria-label="Trace settings">
      <h3>Preset</h3>
      <div class="presets" role="group" aria-label="Preset">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            class={`chip${o.preset === p.id ? ' active' : ''}${suggested === p.id && p.id !== 'auto' ? ' suggested' : ''}`}
            aria-pressed={o.preset === p.id}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
            {suggested === p.id && p.id !== 'auto' && <span class="badge">suggested</span>}
          </button>
        ))}
      </div>

      <h3>Colors</h3>
      <div class="row">
        <label class="toggle">
          <input
            type="checkbox"
            checked={colors === 'auto'}
            onChange={(e) => setOpts({ colors: (e.currentTarget as HTMLInputElement).checked ? 'auto' : (analysis.value?.colors ?? 8) })}
          />
          Auto
        </label>
        <input
          type="range" min={2} max={64} step={1}
          aria-label="Number of colors"
          disabled={colors === 'auto'}
          value={colors === 'auto' ? analysis.value?.colors ?? 8 : colors}
          onInput={(e) => setOpts({ colors: Number((e.currentTarget as HTMLInputElement).value) })}
        />
        <output>{colors === 'auto' ? 'auto' : colors}</output>
      </div>

      <label class="slider">
        <span>Detail ↔ Simplify <output>{(o.simplify ?? 0.5).toFixed(2)}</output></span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={o.simplify ?? 0.5}
          onInput={(e) => setOpts({ simplify: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>

      <label class="slider">
        <span>Denoise <output>{(o.denoise ?? 0).toFixed(2)}</output></span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={o.denoise ?? 0}
          onInput={(e) => setOpts({ denoise: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>

      <h3>Layering</h3>
      <div class="seg" role="group" aria-label="Layer mode">
        {(['stacked', 'cutout'] as const).map((m) => (
          <button type="button" key={m} class={(o.mode ?? 'stacked') === m ? 'active' : ''} aria-pressed={(o.mode ?? 'stacked') === m} onClick={() => setMode(m)}>
            {m === 'stacked' ? 'Stacked' : 'Cutout'}
          </button>
        ))}
      </div>
      <label class="toggle">
        <input
          type="checkbox"
          checked={!!o.gradients}
          onChange={(e) => setOpts({ gradients: (e.currentTarget as HTMLInputElement).checked })}
        />
        Detect gradients
      </label>

      <button type="button" class="btn small" onClick={resetOpts}>Reset settings</button>

      <dl class="stats" aria-live="polite" aria-busy={busy.value}>
        <div><dt>Paths</dt><dd>{r ? r.stats.paths : '–'}</dd></div>
        <div><dt>Nodes</dt><dd>{r ? r.stats.nodes : '–'}</dd></div>
        <div><dt>Colors</dt><dd>{r ? r.stats.colors : '–'}</dd></div>
        <div><dt>SVG</dt><dd>{r ? `${(svgBytes.value / 1024).toFixed(1)} KB` : '–'}</dd></div>
        <div><dt>Time</dt><dd>{r ? `${Math.round(r.stats.ms)} ms` : '–'}</dd></div>
      </dl>
    </section>
  );
}
