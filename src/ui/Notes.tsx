import { useEffect, useRef, useState } from 'react';
import { NotebookPen, X } from 'lucide-react';
import { type Account, describeAccount } from '../game/arsenal.ts';
import type { Simulation } from '../game/sim.ts';
import { type Tuning, presetById, tuningDiff } from '../game/tuning.ts';
import type { Settings, Snapshot } from '../game/types.ts';

/**
 * Dev-mode playtest notes. One terse machine-written state line, then Oscar's words, appended to
 * design/PLAYTEST-NOTES.md through the dev server (and mirrored in localStorage so nothing is lost offline).
 */
export const NOTES_KEY = 'orbwalk-rogue-notes';

const short = (id: string) => id.split('.').pop() ?? id;
const k = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;

/** Compact, token-efficient state line. Every field is `key=value`; lists are comma separated; ×n is a count. */
export function snapshotLine(ctx: { snap: Snapshot; settings: Settings; tuning: Tuning; feel: string; easyLevel: number; account: Account | null; sim: Simulation | null }): string {
  const { snap, settings, tuning, feel, easyLevel, account, sim } = ctx;
  const parts: string[] = [];
  parts.push(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  parts.push(`${snap.hero} ${settings.difficulty} ${feel === 'easy' ? `easy${Math.round(easyLevel * 100)}` : feel}${snap.sandbox ? ' SANDBOX' : ''}`);
  if (snap.mode !== 'run') parts.push(`drill=${settings.drill}`);
  parts.push(`w${snap.wave}:${snap.status === 'choosing' ? 'shop' : snap.waveState} t=${Math.round(snap.runTime)}s`);
  parts.push(`hp=${snap.hp}/${snap.maxHp}${snap.shield ? `+${snap.shield}` : ''} gold=${snap.gold} kills=${snap.kills} dmg=${k(snap.damageDealt)} hits=${snap.hits} dodged=${snap.dodged}`);
  if (snap.relics.length) parts.push(`relics=${snap.relics.map(r => `${r.id}${r.stacks > 1 ? `×${r.stacks}` : ''}`).join(',')}`);
  const shards = Object.entries(snap.shards).filter(([, n]) => n);
  if (shards.length) parts.push(`shards=${shards.map(([key, n]) => `${key}×${n}`).join(',')}`);
  if (snap.questNeed) parts.push(`quest=${snap.questDone ? 'done' : `${snap.questProgress}/${snap.questNeed}`}`);
  if (snap.activeContract) parts.push(`contract=${snap.activeContract.id}×${snap.activeContract.mult}+${snap.activeContract.reward}`);
  else if (snap.selectedContract) parts.push(`contract=${snap.selectedContract}(selected)`);
  if (snap.loadout.length) parts.push(`loadout=${snap.loadout.map(short).join(',')}`);
  if (sim) {
    const counts = new Map<string, number>();
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const key = e.kind === 'witness' ? `witness:${e.gazePhase}` : e.affix ? `${e.affix}-${e.kind}` : e.kind;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size) parts.push(`enemies=${[...counts].map(([key, n]) => n > 1 ? `${key}×${n}` : key).join(',')}`);
    if (sim.spawnQueue.length) parts.push(`queued=${sim.spawnQueue.length}`);
    if (snap.stunned > 0) parts.push(`stunned=${snap.stunned.toFixed(2)}s`);
    if (snap.gazeActive) parts.push(`gaze=${snap.gazeExposed ? 'EXPOSED' : 'safe'}`);
    if (snap.lastGaze) parts.push(`lastGaze=${snap.lastGaze.exposed ? (snap.lastGaze.stunned ? 'stunned' : 'exposed-immune') : 'clean'}@${Math.round(snap.lastGaze.offsetDeg)}°/${Math.round(snap.lastGaze.distance)}u`);
    if (sim.enrage) parts.push(`enrage=${sim.enrage}`);
  }
  const base = feel === 'easy' ? null : presetById(feel === 'custom' ? 'iron' : feel).tuning;
  const diff = tuningDiff(tuning, base ?? undefined);
  const diffKeys = Object.keys(diff) as (keyof Tuning)[];
  if (diffKeys.length) parts.push(`tuning≠${base ? (feel === 'custom' ? 'iron' : feel) : 'default'}{${diffKeys.map(key => `${key}:${diff[key]}`).join(',')}}`);
  if (account) parts.push(`account{${describeAccount(account)}}`);
  return parts.join(' ');
}

export type NoteResult = { where: 'file' | 'local'; entries: number };

/** Append a note: the dev server writes the file; otherwise (or as well) it lands in localStorage. */
export async function appendNote(entry: string): Promise<NoteResult> {
  let local: string[] = [];
  try { local = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { local = []; }
  local.push(entry);
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(local.slice(-400))); } catch { /* storage unavailable */ }
  try {
    const res = await fetch('/__playtest-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: entry }) });
    if (res.ok) return { where: 'file', entries: local.length };
  } catch { /* production build or server gone: local only */ }
  return { where: 'local', entries: local.length };
}

export function localNotes(): string[] {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; }
}

type Props = { open: boolean; line: string; onClose: () => void };

export function NoteDialog({ open, line, onClose }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) { setStatus(null); setTimeout(() => area.current?.focus(), 30); } }, [open]);
  if (!open) return null;

  const save = async () => {
    const body = text.trim();
    if (!body) { setStatus('Write something first.'); return; }
    const entry = `\n## ${line}\n\n${body}\n`;
    const r = await appendNote(entry);
    setStatus(r.where === 'file' ? `Saved to design/PLAYTEST-NOTES.md (and kept locally, ${r.entries} notes).` : `Dev server not reachable: kept locally (${r.entries} notes). Use Copy all to hand them over.`);
    setText('');
  };
  const copyAll = () => {
    const all = localNotes().join('\n');
    navigator.clipboard?.writeText(all).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };

  return (
    <div className="start-overlay note-overlay" role="dialog" aria-label="Playtest note" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }}>
      <div className="start-card note-card">
        <div className="note-head">
          <div className="eyebrow"><NotebookPen size={14} /> PLAYTEST NOTE · DEV</div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <pre className="note-state" title="Appended above your note. State, settings that differ from the preset, and the account.">{line}</pre>
        <textarea ref={area} value={text} onChange={e => setText(e.target.value)} placeholder="A moment, a ratio, a comparison, a death. Ctrl+Enter saves." rows={5} />
        <div className="note-actions">
          <button className="primary-button" onClick={() => void save()}>Save note<span>Ctrl ↵</span></button>
          <button type="button" onClick={copyAll}>{copied ? 'Copied' : `Copy all (${localNotes().length})`}</button>
          <button type="button" onClick={onClose}>Back<kbd>Esc</kbd></button>
        </div>
        {status && <p className="setting-note">{status}</p>}
      </div>
    </div>
  );
}
