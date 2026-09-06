import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Expand, Lock, NotebookPen, Package, Pause, Play, RotateCcw, Shield, Skull, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react';
import { Arena } from './game/arena.ts';
import { creditConfig, loadoutFor, loadoutIds, settleRun, uuid } from './game/arsenal.ts';
import { EMPTY_PROGRESS, HEROES, heroById, isUnlocked, type Progress } from './game/heroes.ts';
import { registerTrainerTools } from './game/webmcp.ts';
import { UPGRADES, baseStats } from './game/upgrades.ts';
import { DEFAULT_PRESET, EASY_DEFAULT_LEVEL, EASY_MAX_LEVEL, easyBlend, matchPreset, normaliseTuning, presetById, sameTuning, type Tuning } from './game/tuning.ts';
import type { HeroId, Settings, Snapshot } from './game/types.ts';
import { Armoury } from './ui/Arsenal.tsx';
import { Bar, Metric, Range, Segmented, Toggle } from './ui/controls.tsx';
import { NoteDialog, snapshotLine } from './ui/Notes.tsx';
import { TuningPanel } from './ui/tuning.tsx';
import { ShopOverlay } from './ui/ShopOverlay.tsx';
import { useAccount } from './ui/useAccount.ts';

const initial: Settings = {
  mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman',
  ...heroById('marksman').profile,
  quick: false, showRange: true, sound: true, shake: true,
};

const empty: Snapshot = {
  status: 'idle', mode: 'run', hero: 'marksman', time: 60, runTime: 0, fired: 0, cancelled: 0, hits: 0, dodged: 0, moved: 0,
  phase: 'READY', progress: 1, streak: 0, best: 0, hp: 100, maxHp: 100, gold: 0, wave: 0, waveState: 'none',
  kills: 0, damageDealt: 0, enemiesLeft: 0, dashCd: 0, dashMax: 5, dashCharges: 1, dashMaxCharges: 1, offers: null, offerTier: 'mixed',
  rerollsLeft: 1, rerollCost: 0, healCost: 8, healUsed: false, anvil: [], anvilCost: 6, anvilLeft: 2, fourthCost: 10, fourthBought: false,
  banishCost: 6, banishMode: false, ascendCost: 30, ascended: false, draftClaimed: false, claimedOffer: null, nextWave: 1, nextShopWave: 1, nextRefitWave: 1, healAmount: 0, anvilPreview: [], shards: {}, relics: [], questProgress: 0, questNeed: 0, questDone: false,
  stats: baseStats(initial), heat: 0, momentum: 0, focus: 0, latched: 0, shield: 0, tempoReady: false, tempoShots: 0, ammo: 0, ammoMax: 0, reload: 0, crank: 1, event: null,
  enrageIn: 35, enrage: 0, cull: 0, dead: false, eliteHp: null,
  stunned: 0, stunSource: '', combatFacing: 0, gazeActive: false, gazeExposed: false, lastGaze: null,
  contractOffer: null, selectedContract: null, activeContract: null, contractReceipt: null,
  wavesCleared: 0, wardenWavesCleared: 0, sandbox: false, loadout: [],
};

type BestRun = { wave: number; kills: number; time: number; gold: number; date: string; hero?: HeroId };
const BEST_KEY = 'orbwalk-rogue-best';
const PROGRESS_KEY = 'orbwalk-rogue-progress';
const TUNING_KEY = 'orbwalk-rogue-tuning';
const EASY_KEY = 'orbwalk-rogue-easy-level';
const DEV_KEY = 'orbwalk-rogue-dev';
const pressureWord = (level: number) => level <= 0.2 ? 'gentle' : level <= 0.5 ? 'steady' : level <= 0.75 ? 'firm' : 'nearly Iron';
/** `?tuning=iron` opens the tuning panel on that preset; `?dev` switches dev mode on. Both persist through the Dev mode toggle. */
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw === null) return fallback;
    return fallback && typeof fallback === 'object' ? { ...fallback, ...raw } : raw;
  } catch { return fallback; }
}
function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Per-weapon coaching copy for the guide strip and the note under the stat sheet. */
function coach(hero: ReturnType<typeof heroById>): { tip: string; title: string; body: string } {
  switch (hero.weapon) {
    case 'cannon': return { tip: 'Move between shells or overheat.', title: 'Shoot, step, shoot.', body: 'Every shell fired without moving adds heat and drags out the next windup. Forty units of movement vents it all. E hops you away from the cursor.' };
    case 'blade': return { tip: 'Step, then throw. Dash through the pack.', title: 'Step, throw, step.', body: 'A blade released within half a second of moving is a Tempo shot for +40% damage and +15% crit. Stand and spam and you lose it. E is a blade dash that cuts everything it passes through once.' };
    case 'crossbow': return { tip: 'Line them up. Walk to crank.', title: 'One quarrel, one line.', body: 'The quarrel flies straight and punches through up to four enemies, losing 15% per body. Firing spends the crank and only walking rewinds it: 90 units, then a click. Aim down the line of the pack, fire, run.' };
    case 'garand': return { tip: 'Eight rounds, then move. R ejects early.', title: 'Eight, ping, reposition.', body: 'Semi-automatic and hard-hitting. The eighth round ejects the clip with a ping and starts 1.6 seconds of reload you spend walking. Press R to eject a partial clip when the moment is right rather than when the rifle decides.' };
    case 'pistols': return { tip: 'Two targets at once. Stay close, stay moving.', title: 'Alternate, then rack.', body: 'Short reach and fast hands. Every attack fires the off-hand pistol at the nearest other enemy in reach for 60% damage. Thirty rounds between reloads of 1.1 seconds; R reloads early. The hit-stun on all those small shots is your breathing room.' };
    default: return { tip: 'Dashes pass through everything.', title: 'Dash is your panic button.', body: 'E dashes toward the cursor and makes you untouchable for the duration. It cancels a windup, so use it after the release.' };
  }
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null), arena = useRef<Arena | null>(null);
  const [settings, setSettings] = useState(initial), [stats, setStats] = useState(empty);
  const [best, setBest] = useState<BestRun | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadJson(PROGRESS_KEY, EMPTY_PROGRESS));
  const [isNewBest, setNewBest] = useState(false);
  const [settled, setSettled] = useState<{ credits: number; mastery: number } | null>(null);
  const [tuning, setTuning] = useState<Tuning>(() => {
    const fromUrl = params.get('tuning');
    if (fromUrl) return { ...presetById(fromUrl).tuning };
    const stored = loadJson<unknown>(TUNING_KEY, null);
    return stored ? normaliseTuning(stored) : { ...presetById(DEFAULT_PRESET).tuning };
  });
  const [easyLevel, setEasyLevel] = useState<number>(() => {
    const v = loadJson<unknown>(EASY_KEY, null);
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(EASY_MAX_LEVEL, Math.max(0, v)) : EASY_DEFAULT_LEVEL;
  });
  const [devMode, setDevMode] = useState<boolean>(() => {
    if (params.has('dev')) return params.get('dev') !== '0';
    const stored = loadJson<unknown>(DEV_KEY, null);
    return typeof stored === 'boolean' ? stored : import.meta.env.DEV;
  });
  const [armoury, setArmoury] = useState<{ tab: 'workbench' | 'cases' } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const store = useAccount(progress);
  const pickEasy = (level: number) => { setEasyLevel(level); saveJson(EASY_KEY, level); setTuning(easyBlend(level)); };
  const recorded = useRef(false);
  const runToken = useRef<string | null>(null);
  const config = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }));
  const pickHero = (hero: HeroId) => config({ hero, ...heroById(hero).profile });
  const showTuning = devMode || params.has('tuning');

  const openNote = useCallback(() => {
    const g = arena.current;
    if (g?.status === 'running') g.pause();
    setNoteOpen(true);
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    const game = new Arena(canvas.current, initial, setStats);
    arena.current = game;
    // Dev-only handle for driving the sim from the console or a browser test (window.__orbwalk.openShop()).
    if (import.meta.env.DEV) (window as Window & { __orbwalk?: Arena }).__orbwalk = game;
    const cleanup = registerTrainerTools(game);
    setBest(loadJson<BestRun | null>(BEST_KEY, null));
    return () => { cleanup(); game.destroy(); };
  }, []);
  useEffect(() => { arena.current?.configure(settings); }, [settings]);
  useEffect(() => { arena.current?.setTuning(tuning); saveJson(TUNING_KEY, tuning); }, [tuning]);
  useEffect(() => { saveJson(DEV_KEY, devMode); if (arena.current) arena.current.onNote = devMode ? openNote : null; }, [devMode, openNote]);
  // The equipped loadout follows the account and the chosen class; the sim freezes it at start().
  useEffect(() => { arena.current?.setLoadout(loadoutFor(store.account, settings.hero), loadoutIds(store.account, settings.hero)); }, [store.account, settings.hero]);

  const tuningPreset = matchPreset(tuning);
  const onEasy = sameTuning(tuning, easyBlend(easyLevel));
  const feel = onEasy ? 'easy' : tuningPreset?.id ?? 'custom';
  /** Fixtures and off-preset feel settings play as a sandbox: the account economy pays nothing for them. */
  const sandbox = stats.sandbox || feel === 'custom' || feel === 'ledger';

  // Record best run, career progress and the account settlement on death.
  useEffect(() => {
    if (stats.status === 'running' && !runToken.current) runToken.current = uuid();
    if (stats.status === 'ended' && stats.mode === 'run' && !recorded.current) {
      recorded.current = true;
      const prev = loadJson<BestRun | null>(BEST_KEY, null);
      const better = !sandbox && (!prev || stats.wave > prev.wave || (stats.wave === prev.wave && stats.kills > prev.kills));
      if (better) {
        const run: BestRun = { wave: stats.wave, kills: stats.kills, time: stats.runTime, gold: stats.gold, date: new Date().toISOString().slice(0, 10), hero: stats.hero };
        saveJson(BEST_KEY, run);
        setBest(run);
      }
      setNewBest(better);
      const before = loadJson(PROGRESS_KEY, EMPTY_PROGRESS);
      const after: Progress = { bestWave: Math.max(before.bestWave, sandbox ? 0 : stats.wave), totalKills: before.totalKills + stats.kills, runs: before.runs + 1 };
      saveJson(PROGRESS_KEY, after);
      setProgress(after);
      // One settlement per run, idempotent on the run token; sandbox runs settle for nothing.
      const token = runToken.current ?? uuid();
      const result = settleRun(store.account, { settlementId: token, hero: stats.hero, wavesCleared: stats.wavesCleared, wardenWavesCleared: stats.wardenWavesCleared, sandbox }, creditConfig(tuning));
      if (result.account !== store.account) store.commit(result.account);
      setSettled({ credits: result.credits, mastery: result.mastery });
      runToken.current = null;
    }
    if (stats.status === 'running') recorded.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.status, stats.mode, stats.wave, stats.kills, stats.runTime, stats.gold, stats.hero, stats.wavesCleared, stats.wardenWavesCleared]);

  const run = settings.mode === 'run';
  const hero = heroById(settings.hero);
  const active = stats.status === 'running', locked = active || stats.status === 'paused' || stats.status === 'choosing';
  const g = arena.current;
  const hpFrac = stats.hp / stats.maxHp;
  const dashReady = stats.dashCharges > 0;
  const tuningTag = feel === DEFAULT_PRESET ? '' : feel === 'easy' ? ` · EASY ${Math.round(easyLevel * 100)}%` : tuningPreset ? ` · ${tuningPreset.name.toUpperCase()}` : ' · CUSTOM TUNING';
  const noteLine = useMemo(() => noteOpen ? snapshotLine({ snap: stats, settings, tuning, feel, easyLevel, account: store.account, sim: g }) : '', [noteOpen, stats, settings, tuning, feel, easyLevel, store.account, g]);
  const closeNote = () => { setNoteOpen(false); g?.canvas.focus({ preventScroll: true }); };
  const tryRange = (h: HeroId) => { pickHero(h); setArmoury(null); setTimeout(() => { g?.setLoadout(loadoutFor(store.account, h), loadoutIds(store.account, h)); g?.fixture('range'); }, 0); };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}><Crosshair size={25} /> ORBWALK<span className="brand-divider" /><span className="brand-sub">{run ? 'ROGUE' : 'MECHANICS LAB'}</span></a>
        <div className="top-note"><i className={active ? 'live-dot' : 'idle-dot'} />{run ? 'PERMADEATH KITING RUN' : 'ADC TRAINING GROUND'} <span className="version">06 / {feel === 'easy' ? `EASY ${Math.round(easyLevel * 100)}%` : feel.toUpperCase()}{devMode ? ' / DEV' : ''}</span></div>
      </header>

      <div className="workspace">
        <section className="play-column">
          <div className="section-top">
            <div>
              <div className="eyebrow">{run ? 'KITE. KILL. DRAFT. REPEAT.' : 'MOVE WITH INTENT.'}</div>
              <h1>{run ? 'The kiting gauntlet' : 'The kiting lab'}<span>.</span></h1>
            </div>
            <div className="mode-switch">
              <Segmented value={settings.mode} disabled={locked} onChange={v => config({ mode: v })} options={[{ value: 'run', label: 'Roguelike run' }, { value: 'drill', label: 'Training drill' }]} />
            </div>
          </div>

          <div className="arena-shell" id="arena-shell">
            <div className="arena-top">
              <span>◇ &nbsp;{run ? (stats.wave ? `WAVE ${stats.wave} · ${stats.enemiesLeft} LEFT · ${stats.nextRefitWave === stats.wave ? 'REFIT AFTER THIS WAVE' : `REFIT AFTER WAVE ${stats.nextRefitWave}`}` : 'ROGUELIKE RUN') : settings.drill === 'mixed' ? 'KITING + DODGING' : settings.drill === 'rhythm' ? 'ATTACK RHYTHM' : 'DODGE PRACTICE'} · {hero.name.toUpperCase()}{tuningTag}{run && sandbox && locked ? ' · SANDBOX (NO CREDITS)' : ''}</span>
              <div className="arena-actions">
                {devMode && <button aria-label="Playtest note (N)" title="Playtest note (N)" onClick={openNote}><NotebookPen size={17} /></button>}
                <button aria-label={settings.sound ? 'Mute sound' : 'Enable sound'} onClick={() => config({ sound: !settings.sound })}>{settings.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
                <button aria-label="Fullscreen arena" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.getElementById('arena-shell')?.requestFullscreen().catch(() => {}); }}><Expand size={17} /></button>
              </div>
            </div>
            <canvas ref={canvas} tabIndex={0} aria-label="Arena. Right click to move. A then left click to attack move. E to dash. Space to pause. S to stop." />

            {(stats.status === 'idle' || (stats.status === 'ended' && !run)) && !armoury && (
              <div className="start-overlay"><div className="start-card">
                <div className="overlay-icon"><Crosshair size={28} /></div>
                <div className="eyebrow">{stats.status === 'ended' ? 'SESSION COMPLETE' : run ? 'ENTER THE GAUNTLET' : 'FIND YOUR RHYTHM'}</div>
                <h2>{stats.status === 'ended' ? `${stats.fired} attacks. Keep moving.` : run ? `${hero.name}. Survive the waves.` : 'Attack. Move. Repeat.'}</h2>
                <p>{stats.status === 'ended' ? `${stats.cancelled} cancelled attacks · ${stats.hits} skill-shot hits · ${Math.round(stats.moved)}% moving uptime`
                  : run ? hero.blurb
                  : 'Release your shot, move through recovery, and stay clear of the red.'}</p>
                <button className="primary-button" onClick={() => g?.start()}><Play size={16} fill="currentColor" />{stats.status === 'ended' ? 'Run it back' : run ? 'Start run' : 'Start training'}<span>↵</span></button>
                <div className="desktop-hint">{run ? (best ? `Best run · wave ${best.wave} · ${best.kills} kills · ${fmtTime(best.time)}` : 'Mouse + keyboard · E to dash · No best run yet') : 'Mouse + keyboard · 60 seconds · No death penalty'}</div>
              </div></div>
            )}

            {stats.status === 'ended' && run && !armoury && (
              <div className="start-overlay"><div className="start-card death-card">
                <div className="overlay-icon danger"><Skull size={28} /></div>
                <div className="eyebrow">{isNewBest ? 'NEW BEST RUN' : 'RUN OVER'}</div>
                <h2>Fell on wave {stats.wave}</h2>
                {settled && (settled.credits > 0
                  ? <div className="unlock-banner"><Sparkles size={15} />Settled <b>+{settled.credits} credits</b> for {stats.wavesCleared} cleared wave{stats.wavesCleared === 1 ? '' : 's'}{stats.wardenWavesCleared ? ` (${stats.wardenWavesCleared} Warden)` : ''} · {hero.name} mastery +{settled.mastery}</div>
                  : <div className="desktop-hint">{sandbox ? 'Sandbox run: no credits settled.' : 'No waves cleared: nothing to settle.'}</div>)}
                <div className="summary-grid">
                  <div><span>Kills</span><b>{stats.kills}</b></div>
                  <div><span>Survived</span><b>{fmtTime(stats.runTime)}</b></div>
                  <div><span>Damage dealt</span><b>{Math.round(stats.damageDealt).toLocaleString()}</b></div>
                  <div><span>Gold</span><b>{stats.gold}</b></div>
                  <div><span>Attacks</span><b>{stats.fired}</b></div>
                  <div><span>Cancelled</span><b>{stats.cancelled}</b></div>
                  <div><span>Hits taken</span><b>{stats.hits}</b></div>
                  <div><span>{heroById(stats.hero).tempo ? 'Tempo shots' : 'Best dodge streak'}</span><b>{heroById(stats.hero).tempo ? stats.tempoShots : stats.best}</b></div>
                </div>
                {stats.relics.length > 0 && <div className="relic-row">{stats.relics.map(r => <span key={r.id} className={`relic ${r.rarity}`} title={r.name}>{r.icon}{r.stacks > 1 && <small>×{r.stacks}</small>}</span>)}</div>}
                <button className="primary-button" onClick={() => g?.start()}><RotateCcw size={16} />Run it back<span>↵</span></button>
                <button className="ghost-button" onClick={() => setArmoury({ tab: 'workbench' })}><Package size={15} />Armoury · {store.account.credits} credits</button>
                {best && !isNewBest && <div className="desktop-hint">Best · wave {best.wave} · {best.kills} kills</div>}
              </div></div>
            )}

            {stats.status === 'paused' && !noteOpen && (
              <div className="start-overlay"><div className="start-card">
                <div className="eyebrow">TAKE A BREATH</div>
                <h2>Session paused</h2>
                <p>Your session pauses when this window loses focus.</p>
                <button className="primary-button" onClick={() => g?.togglePause()}><Play size={16} />Resume<span>SPACE</span></button>
              </div></div>
            )}

            {stats.status === 'choosing' && <ShopOverlay snap={stats} game={g} />}

            {armoury && (
              <Armoury store={store} hero={settings.hero} settings={settings} tuning={tuning} game={g} locked={locked} onPickHero={pickHero} onTryRange={tryRange} onClose={() => { setArmoury(null); g?.canvas.focus({ preventScroll: true }); }} initialTab={armoury.tab} />
            )}

            <NoteDialog open={noteOpen} line={noteLine} onClose={closeNote} />

            <div className="arena-bottom">
              <span><i className="legend cyan" />YOU<i className="legend amber" />{run ? 'GOLD' : 'TARGET'}<i className="legend red" />DANGER{run && <><i className="legend violet" />ENEMY</>}</span>
              <span>{Math.round(stats.stats.range)} UNITS <i className="scale-line" /></span>
            </div>
          </div>

          <div className="timing-strip">
            <div className="phase-label"><Zap size={17} />{stats.phase}</div>
            <div className="timing-track"><div style={{ width: `${Math.max(0, Math.min(1, stats.progress)) * 100}%` }} className={stats.phase === 'WINDUP' ? 'windup' : ''} /></div>
            <span className="timing-hint">{stats.phase === 'AIMING' ? 'Click to attack' : stats.phase === 'WINDUP' ? 'Hold for release' : stats.phase === 'RECOVERY' ? 'Move now' : stats.phase === 'DASH' ? 'Untouchable' : stats.phase === 'RELOAD' ? 'Reloading. Keep moving' : stats.phase === 'CRANK' ? 'Walk to crank' : stats.phase === 'STUNNED' ? `Control locked · ${stats.stunSource}` : 'Ready to attack'}</span>
            {hero.magazine && <span className={`ammo-counter ${stats.ammo === 0 ? 'empty' : ''}`} title="Rounds in the clip">{stats.ammo}<small>/{stats.ammoMax}</small></span>}
            {run && (
              <div className={`dash-meter ${dashReady && active ? 'ready' : ''}`} title="Dash">
                <span>E</span>
                {stats.dashMaxCharges > 1 && <b className="charges">{stats.dashCharges}/{stats.dashMaxCharges}</b>}
                <Bar value={stats.dashCd > 0 ? stats.dashMax - stats.dashCd : stats.dashMax} max={stats.dashMax} color={dashReady ? '#9ff5ff' : '#5aa7b0'} />
              </div>
            )}
            <button className="icon-button" disabled={!locked || stats.status === 'choosing'} aria-label={active ? 'Pause session' : 'Resume session'} onClick={() => g?.togglePause()}>{active ? <Pause size={17} /> : <Play size={17} />}</button>
            <button className="icon-button" aria-label="Restart session" onClick={() => g?.start()}><RotateCcw size={17} /></button>
          </div>

          {run ? (
            <div className="metrics">
              <div className="metric hp-metric" key={`hp-${stats.hits}`}>
                <span>HEALTH</span>
                <div className={`${hpFrac < 0.35 ? 'warn' : ''} ${stats.hits ? 'flash-hit' : ''}`}>{stats.hp}<small>/ {stats.maxHp}{stats.shield > 0 && <em className="shield-tag"> +{stats.shield}</em>}</small></div>
                <Bar value={stats.hp} max={stats.maxHp} color={hpFrac < 0.35 ? '#ff677d' : '#79f1cd'} />
              </div>
              <div className={`metric ${stats.enrage > 0 ? 'enraged' : ''}`}>
                <span>WAVE</span>
                <div>{stats.wave}<small>{stats.enrage > 0 ? ` ENRAGED ×${stats.enrage}` : stats.enemiesLeft ? ` ${stats.enemiesLeft} left` : ''}</small></div>
                {stats.cull > 0 && <em className="cull-tag">CULL · +20% damage taken · {stats.cull} quarry</em>}
                {stats.activeContract && stats.activeContract.wave === stats.wave && <em className="cull-tag contract-tag">OVERDRAW · ×{stats.activeContract.mult.toFixed(2)} damage taken · +{stats.activeContract.reward} on clear</em>}
              </div>
              <div className="metric" key={`gold-${stats.gold}`}><span>GOLD</span><div className={stats.gold ? 'pop' : ''}>{stats.gold}<small>◆</small></div></div>
              <Metric label="KILLS" value={`${stats.kills}`} unit={fmtTime(stats.runTime)} />
            </div>
          ) : (
            <div className="metrics">
              <Metric label="TIME LEFT" value={`${Math.ceil(stats.time)}`} unit="s" />
              <Metric label="ATTACKS FIRED" value={`${stats.fired}`} unit="shots" />
              <Metric label="CANCELLED" value={`${stats.cancelled}`} unit="attacks" warn={stats.cancelled > 0} />
              <Metric label="DODGE RATE" value={stats.dodged + stats.hits ? `${Math.round(stats.dodged / (stats.dodged + stats.hits) * 100)}` : '—'} unit="%" />
            </div>
          )}

          <div className="control-guide">
            <div><kbd>RMB</kbd>Move</div>
            <div><kbd>A</kbd>{!settings.quick && <>then <kbd>LMB</kbd></>}Attack move</div>
            <div><kbd>E</kbd>{hero.dashMode === 'away' ? 'Recoil hop' : hero.dashStrike ? 'Blade dash' : 'Dash'}</div>
            {hero.magazine && <div><kbd>R</kbd>Reload</div>}
            <div><kbd>S</kbd>Stop</div>
            <div><kbd>SPACE</kbd>Pause</div>
            {run && <div><kbd>1-4</kbd>Augment <kbd>7-9</kbd>Anvil <kbd>F</kbd><kbd>B</kbd><kbd>A</kbd><kbd>C</kbd>Sinks · contract</div>}
            {devMode && <div><kbd>N</kbd>Note</div>}
            <span className="guide-tip">{run ? coach(hero).tip : 'Move after the cyan flash.'}</span>
          </div>
        </section>

        <aside className="settings-panel">
          <div className="panel-heading"><h2>{run ? 'Run setup' : 'Training setup'}</h2><span>{run ? '03' : '01'}</span></div>
          <p className="panel-description">{run ? 'Pick a class and a threat level. Everything else is drafted in the arena.' : 'Build the rhythm. Turn up the pressure.'}</p>

          <div className="setting-section">
            <div className="eyebrow">CLASS</div>
            <div className="hero-picker">
              {HEROES.map(h => {
                const open = isUnlocked(h.id, store.account);
                return (
                  <button key={h.id} disabled={locked} className={`hero-card ${settings.hero === h.id ? 'active' : ''} ${open ? '' : 'locked'}`} style={{ ['--hero' as string]: h.colors.skin }} onClick={() => open ? pickHero(h.id) : (pickHero(h.id), setArmoury({ tab: 'workbench' }))} title={open ? h.blurb : `${h.unlock.desc}. Opens the Armoury.`}>
                    <i className="hero-swatch" />
                    <span className="hero-name">{h.name}{!open && <Lock size={12} />}</span>
                    <small>{open ? h.title : h.unlock.desc}</small>
                  </button>
                );
              })}
            </div>
            <p className="setting-note">{hero.blurb}</p>
            <button className="armoury-button" disabled={locked} onClick={() => setArmoury({ tab: 'workbench' })} title="Weapons, attachments, finishes and cases">
              <Package size={15} />Armoury<em>⬢ {store.account.credits} cr</em>{stats.loadout.length > 0 && <small>{stats.loadout.length} part{stats.loadout.length === 1 ? '' : 's'} equipped</small>}
            </button>
          </div>

          {!run && (
            <div className="setting-section">
              <label className="eyebrow">DRILL</label>
              <Segmented value={settings.drill} disabled={locked} onChange={v => config({ drill: v })} options={[{ value: 'mixed', label: 'Kite + dodge' }, { value: 'rhythm', label: 'Rhythm' }, { value: 'dodge', label: 'Dodge' }]} />
              <p className="setting-note">{settings.drill === 'mixed' ? 'Moving targets. Incoming skill shots. Stay in motion.' : settings.drill === 'rhythm' ? 'No incoming damage. Focus on clean attack releases.' : 'No attack targets. Read the telegraphs and sidestep.'}</p>
            </div>
          )}

          <div className="setting-section">
            <div className="eyebrow">{run ? 'THREAT LEVEL' : 'SKILL-SHOT PRESSURE'}</div>
            <Segmented value={settings.difficulty} disabled={locked} onChange={v => config({ difficulty: v })} options={[{ value: 'easy', label: run ? 'Scout' : 'Low' }, { value: 'standard', label: run ? 'Soldier' : 'Standard' }, { value: 'hard', label: run ? 'Warlord' : 'High' }]} />
            <p className="setting-note">{run ? 'Scales enemy health, damage and wave size. Wardens arrive every third wave; champion affixes appear from wave 4; mid-wave ambushes, barrages and bounties from wave 3.' : 'Line shots, spread volleys, and delayed ground bursts.'}</p>
          </div>

          <div className="setting-section">
            <div className="eyebrow">FEEL</div>
            <Segmented value={feel} disabled={locked} onChange={v => { if (v === 'easy') pickEasy(easyLevel); else setTuning({ ...presetById(v).tuning }); }} options={[{ value: 'iron', label: 'Iron' }, { value: 'easy', label: 'Easy' }, { value: 'iron3', label: 'Refit 3 · experiment' }]} />
            {feel === 'easy' && (
              <Range label="Pressure" value={Math.round(easyLevel * 100)} display={`${Math.round(easyLevel * 100)}% · ${pressureWord(easyLevel)}`} min={0} max={Math.round(EASY_MAX_LEVEL * 100)} step={5} disabled={locked} change={v => pickEasy(v / 100)} />
            )}
            <p className="setting-note">{feel === 'easy' ? 'Easy slides from a gentle floor (0%) toward Iron (100%): reach, enemy speed, damage, warnings, drafts and Prismatic odds all move together. Find the point where you still die sometimes.' : feel === 'ledger' ? 'Dev reference scale (Ledger). Pick Iron or Easy to play the tuned game.' : tuningPreset ? tuningPreset.blurb : 'Custom numbers from the tuning panel. Custom runs are a sandbox: they settle no credits.'}</p>
          </div>

          <div className="setting-section">
            <div className="eyebrow">MARKSMAN PROFILE{run && <em> · BASE</em>}</div>
            <Range label="Attack speed" value={settings.attackSpeed} display={`${settings.attackSpeed.toFixed(2)} /s`} min={0.5} max={2.5} step={0.05} disabled={locked} change={v => config({ attackSpeed: v })} />
            <Range label="Windup" value={settings.windup} display={`${settings.windup}%`} min={15} max={40} step={1} disabled={locked} change={v => config({ windup: v })} />
            <Range label="Move speed" value={settings.moveSpeed} display={`${settings.moveSpeed}`} min={250} max={450} step={5} disabled={locked} change={v => config({ moveSpeed: v })} />
            <Range label="Attack range" value={settings.range} display={`${settings.range}`} min={350} max={700} step={10} disabled={locked} change={v => config({ range: v })} />
            <div className="profile-foot">{Math.round(stats.stats.range)} range <span>•</span> {Math.round(1000 / stats.stats.attackSpeed * stats.stats.windup / 100)} ms windup{run && <> <span>•</span> {Math.round(stats.stats.damage)} dmg</>}</div>
          </div>

          <div className="setting-section toggle-section">
            <Toggle checked={settings.quick} onChange={v => config({ quick: v })} label="One-key attack move">One-key attack move<small>Press A to attack at cursor</small></Toggle>
            <Toggle checked={settings.showRange} onChange={v => config({ showRange: v })} label="Show attack range">Show attack range</Toggle>
            <Toggle checked={settings.shake} onChange={v => config({ shake: v })} label="Screen shake">Screen shake</Toggle>
            <Toggle checked={devMode} onChange={setDevMode} label="Dev mode">Dev mode<small>Tuning sliders, fixtures and the playtest note (N)</small></Toggle>
          </div>

          {showTuning && <TuningPanel tuning={tuning} onChange={setTuning} sheet={stats.stats} baseMove={settings.moveSpeed} wave={stats.wave} game={g} lastGaze={stats.lastGaze} onNote={openNote} />}

          {run && stats.relics.length > 0 && (
            <div className="setting-section relics">
              <div className="eyebrow">AUGMENTS</div>
              <ul>{stats.relics.map(r => {
                const quest = !!UPGRADES.find(u => u.id === r.id)?.quest;
                return <li key={r.id} className={r.rarity}><span className="relic-icon">{r.icon}</span><span>{r.name}{quest && <small className="quest-progress">{stats.questDone ? ' · complete' : ` · ${stats.questProgress}/${stats.questNeed}`}</small>}</span>{r.stacks > 1 && <b>×{r.stacks}</b>}</li>;
              })}</ul>
            </div>
          )}

          {run && Object.keys(stats.shards).length > 0 && (
            <div className="setting-section shards-owned">
              <div className="eyebrow">ANVIL SHARDS</div>
              <div>{Object.entries(stats.shards).map(([k, n]) => <span key={k} className="shard-chip">{k} ×{n}</span>)}</div>
            </div>
          )}

          {run && stats.status !== 'idle' && (
            <div className="setting-section stat-sheet">
              <div className="eyebrow">CURRENT STATS</div>
              <div><span>Attack speed</span><b>{stats.stats.attackSpeed.toFixed(2)}{stats.momentum > 0 && <em> +{stats.momentum * 2}%</em>}</b></div>
              <div><span>Damage</span><b>{Math.round(stats.stats.damage)}</b></div>
              <div><span>Crit</span><b>{Math.round(stats.stats.critChance * 100)}%</b></div>
              <div><span>Range</span><b>{Math.round(stats.stats.range)}</b></div>
              <div><span>Move speed</span><b>{Math.round(stats.stats.moveSpeed)}</b></div>
              <div><span>Dash cooldown</span><b>{stats.stats.dashCd.toFixed(1)}s{stats.dashMaxCharges > 1 && ` ×${stats.dashMaxCharges}`}</b></div>
              {hero.heat && <div><span>Heat</span><b className={stats.heat >= 4 ? 'hot' : ''}>{stats.heat}/4{stats.stats.overclock > 0 && stats.heat >= 4 && <em> primed</em>}</b></div>}
              {hero.magazine && <div><span>Clip</span><b className={stats.ammo === 0 ? 'hot' : ''}>{stats.ammo}/{stats.ammoMax}{stats.reload > 0 && <em> reloading</em>}</b></div>}
              {hero.crank && <div><span>Crank</span><b className={stats.crank < 1 ? 'hot' : ''}>{Math.round(stats.crank * 100)}%</b></div>}
              {stats.stats.focus > 0 && <div><span>Focus</span><b>+{stats.focus * 8}%</b></div>}
              {stats.stats.shieldMax > 0 && <div><span>Shield</span><b>{stats.shield}/{stats.stats.shieldMax}</b></div>}
              {stats.latched > 0 && <div><span>Leeches</span><b className="hot">{stats.latched} attached · dash</b></div>}
              {hero.tempo && <div><span>Tempo</span><b className={stats.tempoReady ? 'ready' : ''}>{stats.tempoReady ? 'ready' : 'move first'}<em> {stats.tempoShots} shots</em></b></div>}
              {stats.loadout.length > 0 && <div><span>Loadout</span><b>{stats.loadout.map(id => id.split('.').pop()).join(', ')}</b></div>}
            </div>
          )}

          <div className="coach-note"><Shield size={20} /><div><strong>{run ? coach(hero).title : 'Clean release, then move.'}</strong><p>{run ? coach(hero).body : 'A move command during windup cancels your attack. The cyan flash is your cue to reposition.'}</p></div></div>
          <div className="secondary-metrics">
            <div><span>{run ? 'Hits taken' : 'Skill shots taken'}</span><b>{stats.hits}</b></div>
            <div><span>Moving uptime</span><b>{Math.round(stats.moved)}%</b></div>
            <div><span>Best dodge streak</span><b>{stats.best}</b></div>
            {run && <div><span>Cancelled attacks</span><b>{stats.cancelled}</b></div>}
            {run && <div><span>Career</span><b>{progress.runs} runs · best wave {progress.bestWave}</b></div>}
            {run && <div><span>Credits</span><b>⬢ {store.account.credits}{store.readOnly && <em> · read-only tab</em>}</b></div>}
          </div>
        </aside>
      </div>
      <footer><span>↗ &nbsp; PRECISION OVER PANIC</span><span>Independent practice game · Tunable timing, not a League client simulation</span></footer>
    </main>
  );
}
