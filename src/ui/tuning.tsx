import { useState } from 'react';
import { DEFAULT_TUNING, TUNING_KNOBS, TUNING_PRESETS, kiteMargins, matchPreset, type Tuning, type TuningGroup } from '../game/tuning.ts';
import type { Stats } from '../game/types.ts';
import { Range, Segmented } from './controls.tsx';

const GROUPS: { id: TuningGroup; label: string; note: string }[] = [
  { id: 'player', label: 'PLAYER TEMPO', note: 'Multipliers on the class profile. Applied to every class.' },
  { id: 'enemy', label: 'ENEMY PRESSURE', note: 'Read live by the simulation. Changes land on the next step.' },
  { id: 'feel', label: 'FEEL', note: 'Moment-to-moment feedback. None of these change what happens, only how it lands.' },
  { id: 'pace', label: 'PACE', note: 'Wave density. Applies from the next wave.' },
  { id: 'draft', label: 'DRAFT', note: 'Cadence and rarity. Bag changes take effect when the bag next refills.' },
];

const sign = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;

/**
 * Dev tuning panel: live sliders for the knobs in tuning.ts plus A/B presets. Everything applies
 * immediately, mid-run included, so numbers can be found by feel and then baked into the source.
 */
export function TuningPanel({ tuning, onChange, sheet, baseMove, wave }: {
  tuning: Tuning; onChange: (t: Tuning) => void; sheet: Stats; baseMove: number; wave: number;
}) {
  const [copied, setCopied] = useState(false);
  const preset = matchPreset(tuning);
  const set = (patch: Partial<Tuning>) => onChange({ ...tuning, ...patch });
  const at = Math.max(1, wave || 6);
  const m = kiteMargins(tuning, baseMove, at);
  const windupMs = Math.round(1000 / sheet.attackSpeed * sheet.windup / 100);
  const copy = () => {
    const text = JSON.stringify(tuning, null, 2);
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };

  return (
    <details className="setting-section tuning-panel" open>
      <summary><span className="eyebrow">TUNING <em>· DEV</em></span><span className="tuning-state">{preset ? `${preset.tag} · ${preset.name}` : 'custom'}</span></summary>
      <p className="setting-note">Find the feel with the sliders, then tell me which numbers to bake in. Changes apply immediately, even mid-run.</p>

      <Segmented
        value={preset?.id ?? 'custom'}
        options={[...TUNING_PRESETS.map(p => ({ value: p.id, label: `${p.tag} · ${p.name}` })), { value: 'custom', label: 'Custom' }]}
        onChange={v => { const p = TUNING_PRESETS.find(x => x.id === v); if (p) onChange({ ...p.tuning }); }}
      />
      <p className="setting-note">{preset ? preset.blurb : 'Off the presets. Copy the numbers below to keep them.'}</p>

      <div className="tuning-readout">
        <div><span>Windup</span><b>{windupMs} ms</b></div>
        <div><span>Shots</span><b>{sheet.attackSpeed.toFixed(2)} /s</b></div>
        <div><span>Reach</span><b>{Math.round(sheet.range)}</b></div>
        <div><span>Walk</span><b>{Math.round(m.player)}</b></div>
      </div>
      <div className="tuning-margins">
        <span className="eyebrow">KITE MARGIN · WAVE {at}</span>
        <div>
          <i className={m.drone >= 0 ? 'ok' : 'bad'}>drone {sign(m.drone)}</i>
          <i className={m.archer >= 0 ? 'ok' : 'bad'}>archer {sign(m.archer)}</i>
          <i className={m.bomber >= 0 ? 'ok' : 'bad'}>bomber {sign(m.bomber)}</i>
          <i className={m.leech >= 0 ? 'ok' : 'bad'}>leech {sign(m.leech)}</i>
        </div>
        <small>Your walking speed minus theirs. Negative means it catches you on foot.</small>
      </div>

      {GROUPS.map(g => (
        <details key={g.id} className="tuning-group" open>
          <summary className="eyebrow">{g.label}<i>{TUNING_KNOBS.filter(k => k.group === g.id && Math.abs(tuning[k.key] - DEFAULT_TUNING[k.key]) > 1e-9).length || ''}</i></summary>
          {TUNING_KNOBS.filter(k => k.group === g.id).map(k => (
            <Range key={k.key} label={k.label} value={tuning[k.key]} display={k.format(tuning[k.key])} min={k.min} max={k.max} step={k.step} disabled={false} change={v => set({ [k.key]: v } as Partial<Tuning>)} />
          ))}
          <p className="setting-note">{g.note}</p>
        </details>
      ))}

      <div className="tuning-actions">
        <button type="button" onClick={() => onChange({ ...DEFAULT_TUNING })}>Reset to A</button>
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy JSON'}</button>
      </div>
    </details>
  );
}
