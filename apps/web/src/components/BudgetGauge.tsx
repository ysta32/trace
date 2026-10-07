import { useState, useEffect } from 'preact/hooks';
import { result } from '../store';
import { svgBytes } from '../svgView';
import { budget, fitStatus, fitTraces, fitToBudget, cancelFit, gaugeRatio, MAX_TRACES, type BudgetUnit } from '../budget';
import { Icon } from '../design/icons';
import '../export-extras.css';

function fmt(n: number, unit: BudgetUnit): string {
  return unit === 'kb' ? `${n.toFixed(1)} kb` : `${Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')} nodes`;
}

export function BudgetGauge() {
  const [open, setOpen] = useState(false);
  useEffect(() => cancelFit, []);
  const b = budget.value;
  const r = result.value;
  const unit = b?.unit ?? 'kb';
  const current = !r ? null : unit === 'kb' ? svgBytes.value / 1000 : r.stats.nodes;
  const ratio = b && current !== null ? gaugeRatio(current, b.target) : 0;
  const state = !b || current === null ? 'idle' : ratio > 1 ? 'over' : ratio > 0.85 ? 'near' : 'ok';
  const fitting = fitStatus.value === 'fitting';

  const setTarget = (raw: string) => {
    const n = Number(raw);
    if (!(Number.isFinite(n) && n > 0)) cancelFit();
    budget.value = Number.isFinite(n) && n > 0 ? { unit, target: n } : null;
  };

  return (
    <div class="bg" data-state={state}>
      <button type="button" class="bg-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}
        aria-label={b && current !== null ? `Budget ${fmt(current, unit)} of ${fmt(b.target, unit)}` : 'Set a size budget'}>
        <Icon name="budget" size={16} />
        {b && current !== null ? (
          <>
            <span class="bg-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
              <span class="bg-needle" style={{ left: `${Math.min(100, ratio * 100)}%` }} />
            </span>
            <span>{fmt(current, unit)} / {fmt(b.target, unit)}</span>
          </>
        ) : (
          <span>no budget</span>
        )}
      </button>
      {open && (
        <div class="bg-pop" role="dialog" aria-label="Size budget">
          <span class="t-label">Budget</span>
          <div class="xp-row">
            <input class="xp-input" type="number" min="1" step={unit === 'kb' ? 1 : 100} aria-label="Target"
              value={b?.target ?? ''} placeholder={unit === 'kb' ? '40' : '2000'}
              onInput={(e) => setTarget((e.target as HTMLInputElement).value)} />
            <div class="xp-seg" role="group" aria-label="Unit">
              {(['kb', 'nodes'] as const).map((u) => (
                <button type="button" key={u} aria-pressed={unit === u}
                  onClick={() => { budget.value = { unit: u, target: b?.target ?? (u === 'kb' ? 40 : 2000) }; }}>{u}</button>
              ))}
            </div>
          </div>
          <button type="button" class="xp-btn primary" disabled={!b || !r || fitting} onClick={() => void fitToBudget()}>
            {fitting ? `Fitting ${fitTraces.value}/${MAX_TRACES}` : 'Fit to budget'}
          </button>
          <p role="status">
            {fitStatus.value === 'fit' && 'Fitted. Simplify and colors were adjusted.'}
            {fitStatus.value === 'unreachable' && 'Target is out of reach even at the lowest palette. Try a higher target.'}
            {fitStatus.value === 'error' && 'Fit failed. Try again.'}
            {fitStatus.value === 'idle' && 'Trace tunes simplify, then colors, to land under the target.'}
          </p>
          {b && <button type="button" class="xp-btn ghost" onClick={() => { cancelFit(); budget.value = null; fitStatus.value = 'idle'; }}>Clear budget</button>}
        </div>
      )}
    </div>
  );
}
