import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, Download, Lock, Package, ShieldAlert, Star, Upload, Wrench, X } from 'lucide-react';
import {
  type ArsenalItem, type CaseReceipt, type ItemTier, CASE_POOL, CATALOGUE, CHASE_MASTERY_WAVES, DUPLICATE_REFUND, PITY_GUARANTEE, TIER_LABEL,
  acknowledgeReveal, buyDirect, caseConfig, caseTier, chanceWithin, compatible, equipItem, equippedFor, itemById, loadoutFor, loadoutReadout, nextCaseOdds,
  nextRequestId, owns, purchaseCase, setWishlist, weaponItemId, weaponOwned, BASE_MODS,
} from '../game/arsenal.ts';
import type { Arena } from '../game/arena.ts';
import { HEROES, heroById } from '../game/heroes.ts';
import { Rng } from '../game/math.ts';
import { drawWeapon } from '../game/render.ts';
import type { Tuning } from '../game/tuning.ts';
import type { HeroId, Settings } from '../game/types.ts';
import { computeStats } from '../game/upgrades.ts';
import type { AccountStore } from './useAccount.ts';

/**
 * The Armoury (brief 05): workbench (weapons, three attachment slots, before/after in familiar units, try in range)
 * and the case counter (every possible item with its odds, the pity counter, wishlist, purchase and reveal).
 * Presentation only: every rule is a pure function in arsenal.ts; every write goes through the account store.
 */
type Props = {
  store: AccountStore;
  hero: HeroId;
  settings: Settings;
  tuning: Tuning;
  game: Arena | null;
  locked: boolean;
  onPickHero: (h: HeroId) => void;
  onTryRange: (h: HeroId) => void;
  onClose: () => void;
  initialTab?: 'workbench' | 'cases';
  highlight?: string | null;
};

const tierClass = (t: ItemTier) => `tier-${t}`;

export function Armoury({ store, hero, settings, tuning, game, locked, onPickHero, onTryRange, onClose, initialTab = 'workbench', highlight = null }: Props) {
  const [tab, setTab] = useState<'workbench' | 'cases'>(initialTab);
  const [preview, setPreview] = useState<string | null>(highlight);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CaseReceipt | null>(store.account.pendingReceipt);
  const [io, setIo] = useState<'closed' | 'export' | 'import'>('closed');
  const [ioText, setIoText] = useState('');
  const a = store.account;
  const cfg = caseConfig(tuning);
  const flash = (msg: string) => { setError(msg); setTimeout(() => setError(null), 2600); };

  // Refresh recovery: a receipt that was committed but not acknowledged resumes here.
  useEffect(() => { if (a.pendingReceipt && !reveal) setReveal(a.pendingReceipt); }, [a.pendingReceipt, reveal]);

  const buyCase = () => {
    if (!store.canSpend) { flash(store.fault ?? 'Another tab holds the account.'); return; }
    const r = purchaseCase(a, nextRequestId(a), cfg);
    if (!r.ok) { flash(r.error); return; }
    // Commit (and verify) before any spectacle. A failed commit keeps the old state and shows nothing.
    if (!store.commit(r.account)) { flash(store.fault ?? 'Could not save the purchase. Nothing was spent.'); return; }
    setReveal(r.value);
  };
  const buy = (id: string) => {
    if (!store.canSpend) { flash(store.fault ?? 'Another tab holds the account.'); return; }
    const r = buyDirect(a, id);
    if (!r.ok) { flash(r.error); return; }
    if (!store.commit(r.account)) flash(store.fault ?? 'Could not save the purchase.');
  };
  const equip = (slot: 'action' | 'handling' | 'finish', id: string | null) => {
    if (locked) { flash('Equip between runs.'); return; }
    const r = equipItem(a, hero, slot, id);
    if (!r.ok) { flash(r.error); return; }
    if (!store.commit(r.account)) flash(store.fault ?? 'Could not save the loadout.');
  };
  const continueReveal = () => { store.commit(acknowledgeReveal(a)); setReveal(null); };
  const inspectReveal = () => { const id = reveal?.itemId ?? null; continueReveal(); setTab('workbench'); setPreview(id); const item = id ? itemById(id) : null; if (item?.hero && item.hero !== hero) onPickHero(item.hero); };

  return (
    <div className="start-overlay armoury-overlay">
      <div className="shop si armoury" role="dialog" aria-label="Armoury">
        <header className="si-head">
          <div>
            <div className="eyebrow">ARMOURY · BETWEEN RUNS</div>
            <h2>{tab === 'workbench' ? 'Workbench' : 'Case counter'}</h2>
          </div>
          <div className="armoury-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'workbench'} className={tab === 'workbench' ? 'active' : ''} onClick={() => setTab('workbench')}><Wrench size={14} />Workbench</button>
            <button role="tab" aria-selected={tab === 'cases'} className={tab === 'cases' ? 'active' : ''} onClick={() => setTab('cases')}><Package size={14} />Cases</button>
          </div>
          <div className="si-wallet">
            <span className="si-credits" title="Account credits: earned per cleared wave, settled when a run ends">⬢ {a.credits}<small> cr</small></span>
            <button className="icon-button" aria-label="Close the Armoury" onClick={onClose}><X size={18} /></button>
          </div>
        </header>

        {(store.fault || store.readOnly || store.issues.length > 0) && (
          <div className="armoury-banner" role="status">
            <ShieldAlert size={14} />
            <span>
              {store.fault ?? (store.readOnly ? (store.lockState === 'unsupported' ? 'This browser cannot lock the account store, so spending is disabled here.' : 'Another tab holds the account: this one is read-only.') : store.issues.join(' · '))}
            </span>
            {store.fault && <button type="button" onClick={store.retry}>Retry</button>}
          </div>
        )}
        {error && <div className="armoury-banner error" role="alert"><ShieldAlert size={14} /><span>{error}</span></div>}

        <div className="si-body armoury-body">
          {tab === 'workbench'
            ? <Workbench store={store} hero={hero} settings={settings} tuning={tuning} locked={locked} preview={preview} setPreview={setPreview} onPickHero={onPickHero} onEquip={equip} onBuy={buy} onTryRange={() => onTryRange(hero)} />
            : <Cases store={store} hero={hero} cfg={cfg} onBuyCase={buyCase} onBuy={buy} onWish={id => { store.commit(setWishlist(a, id)); }} />}
        </div>

        <footer className="si-depart armoury-foot">
          <div className="armoury-io">
            <button type="button" onClick={() => { setIo(io === 'export' ? 'closed' : 'export'); setIoText(store.exportJson()); }}><Download size={13} />Export save</button>
            <button type="button" onClick={() => { setIo(io === 'import' ? 'closed' : 'import'); setIoText(''); }}><Upload size={13} />Import</button>
            <small>Save {a.saveId.slice(0, 8)} · rev {a.revision} · {store.lockState === 'held' ? 'this tab writes' : store.lockState}</small>
          </div>
          <button className="si-continue" onClick={onClose}>Done<kbd>Esc</kbd></button>
        </footer>
        {io !== 'closed' && (
          <div className="armoury-iopane">
            <textarea value={ioText} onChange={e => setIoText(e.target.value)} readOnly={io === 'export'} rows={6} spellCheck={false} aria-label={io === 'export' ? 'Exported account JSON' : 'Paste an exported account JSON'} />
            {io === 'import' && <button type="button" onClick={() => { const err = store.importJson(ioText); flash(err ?? 'Imported.'); if (!err) setIo('closed'); }}>Import this save</button>}
            {io === 'export' && <button type="button" onClick={() => { navigator.clipboard?.writeText(ioText).catch(() => {}); flash('Copied.'); }}>Copy</button>}
          </div>
        )}

        {reveal && <CaseReveal receipt={reveal} game={game} onContinue={continueReveal} onInspect={inspectReveal} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- workbench

function Workbench({ store, hero, settings, tuning, locked, preview, setPreview, onPickHero, onEquip, onBuy, onTryRange }: {
  store: AccountStore; hero: HeroId; settings: Settings; tuning: Tuning; locked: boolean; preview: string | null; setPreview: (id: string | null) => void;
  onPickHero: (h: HeroId) => void; onEquip: (slot: 'action' | 'handling' | 'finish', id: string | null) => void; onBuy: (id: string) => void; onTryRange: () => void;
}) {
  const a = store.account;
  const h = heroById(hero);
  const eq = equippedFor(a, hero);
  const mods = loadoutFor(a, hero);
  const previewItem = preview ? itemById(preview) : null;
  const previewMods = useMemo(() => {
    if (!previewItem || previewItem.slot === 'weapon' || !compatible(previewItem, hero)) return mods;
    const eqPreview = { ...eq, [previewItem.slot]: previewItem.id };
    const m = { ...BASE_MODS };
    for (const id of [eqPreview.action, eqPreview.handling, eqPreview.finish]) { const it = id ? itemById(id) : null; if (it) Object.assign(m, it.mods); }
    return m;
  }, [previewItem, hero, eq, mods]);
  const base = useMemo(() => computeStats({ ...settings, hero, ...h.profile }, [], {}, false, tuning), [settings, hero, h, tuning]);
  const rows = loadoutReadout(hero, previewMods, base);
  const owned = weaponOwned(a, hero);
  const slots: { slot: 'action' | 'handling' | 'finish'; label: string; note: string }[] = [
    { slot: 'action', label: 'Action', note: 'Changes how the weapon cycles. One per weapon; Chase parts live here.' },
    { slot: 'handling', label: 'Handling', note: 'Changes how the weapon carries: reach, footwork, recoil.' },
    { slot: 'finish', label: 'Finish', note: 'Surface only. Never a telegraph, never a hitbox.' },
  ];
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current?.getContext('2d');
    if (!c || !canvas.current) return;
    const el = canvas.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = 360 * dpr; el.height = 150 * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b1418';
    c.fillRect(0, 0, 360, 150);
    c.save();
    c.translate(120, 78);
    c.scale(3.2, 3.2);
    // Torso stub so the weapon has a shoulder to sit on.
    c.fillStyle = h.colors.skin;
    c.beginPath(); c.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = h.colors.dark; c.lineWidth = 1.5; c.stroke();
    drawWeapon(c, h, {
      skin: h.colors.skin, dark: h.colors.dark, windupFrac: 0, flash: 0, crank: 1, reloadLeft: 0, heat: 0, attackCount: 0, recoil: 0, tempoReady: false, tempoFlash: 0,
      running: false, t: 0, finish: previewMods.finish, steady: previewMods.steadyStock,
    });
    c.restore();
  }, [h, previewMods.finish, previewMods.steadyStock]);

  return (
    <div className="wb">
      <div className="wb-heroes" role="tablist" aria-label="Weapon">
        {HEROES.map(x => {
          const o = weaponOwned(a, x.id);
          return (
            <button key={x.id} role="tab" aria-selected={x.id === hero} className={`wb-hero ${x.id === hero ? 'active' : ''} ${o ? '' : 'locked'}`} style={{ ['--hero' as string]: x.colors.skin }} onClick={() => { onPickHero(x.id); setPreview(null); }} disabled={locked && x.id !== hero}>
              <i className="hero-swatch" />
              <span>{x.name}{!o && <Lock size={11} />}</span>
              <small>{o ? x.title : `${x.unlock.price} cr`}</small>
            </button>
          );
        })}
      </div>

      <div className="wb-main">
        <div className="wb-weapon">
          <canvas ref={canvas} width={360} height={150} aria-label={`${h.name} weapon`} />
          <div className="wb-weapon-name"><strong>{h.name}</strong><span>{h.title}</span></div>
          {!owned && (
            <div className="wb-unlock">
              <Lock size={14} />
              <span>Not owned. {h.unlock.desc}. Inspect freely; parts cannot bypass the weapon.</span>
              <button type="button" disabled={a.credits < h.unlock.price} onClick={() => onBuy(weaponItemId(hero))}>Buy · {h.unlock.price} cr</button>
            </div>
          )}
          <button className="wb-range" type="button" disabled={!owned} onClick={onTryRange} title="Load a firing range with this loadout. No rewards, no credits."><Crosshair size={14} />Try in range</button>
        </div>

        <div className="wb-slots">
          {slots.map(({ slot, label, note }) => {
            const cur = eq[slot] ? itemById(eq[slot]!) : null;
            const options = CATALOGUE.filter(i => i.slot === slot && compatible(i, hero));
            return (
              <section key={slot} className={`wb-slot ${slot}`} aria-label={`${label} slot`}>
                <div className="si-zone-head"><h3>{label}</h3><span className="si-rule">{cur ? cur.name : 'Empty'}</span></div>
                <div className="wb-parts">
                  <button className={`wb-part empty ${!eq[slot] && !previewItem ? 'equipped' : ''}`} onClick={() => { setPreview(null); onEquip(slot, null); }} disabled={!eq[slot]} title="Clear the slot">—<small>none</small></button>
                  {options.map(i => {
                    const has = owns(a, i.id), isEq = eq[slot] === i.id, isPrev = preview === i.id;
                    return (
                      <button key={i.id} className={`wb-part ${tierClass(i.tier)} ${isEq ? 'equipped' : ''} ${isPrev ? 'preview' : ''} ${has ? '' : 'unowned'}`} onClick={() => setPreview(isPrev ? null : i.id)} onDoubleClick={() => has && onEquip(slot, i.id)} title={i.blurb}>
                        <i>{i.icon}</i>
                        <b>{i.name}</b>
                        <small>{TIER_LABEL[i.tier]}{isEq ? ' · equipped' : has ? ' · owned' : ''}</small>
                      </button>
                    );
                  })}
                </div>
                <p className="setting-note">{note}</p>
              </section>
            );
          })}
        </div>
      </div>

      <div className="wb-readout">
        <div className="si-zone-head">
          <h3>{previewItem ? `With ${previewItem.name}` : 'Assembled weapon'}</h3>
          <span className="si-rule">{previewItem ? `${previewItem.benefit}${previewItem.cost ? ` · ${previewItem.cost}` : ''}` : 'Current loadout, in play units'}</span>
        </div>
        <table>
          <tbody>
            {rows.map(r => <tr key={r.label} className={r.changed ? 'changed' : ''}><th>{r.label}</th><td>{r.before}</td><td>{r.changed ? '→' : ''}</td><td>{r.changed ? r.after : ''}</td></tr>)}
          </tbody>
        </table>
        {previewItem && previewItem.slot !== 'weapon' && (() => { const pslot = previewItem.slot as 'action' | 'handling' | 'finish'; return (
          <div className="wb-preview-actions">
            {owns(a, previewItem.id)
              ? <button className="si-buy" disabled={locked || eq[pslot] === previewItem.id} onClick={() => onEquip(pslot, previewItem.id)}><Check size={14} />{eq[pslot] === previewItem.id ? 'Equipped' : locked ? 'Equip between runs' : `Equip ${previewItem.name}`}</button>
              : previewItem.tier === 'chase' && (a.mastery[hero] ?? 0) < CHASE_MASTERY_WAVES
                ? <span className="si-reason"><Lock size={12} /> Chase part: {a.mastery[hero] ?? 0}/{CHASE_MASTERY_WAVES} waves cleared with the {h.name}. Buy outright for {previewItem.price} cr once mastered, or open cases.</span>
                : <button className="si-buy" disabled={a.credits < previewItem.price} onClick={() => onBuy(previewItem.id)}>Buy outright<em>{previewItem.price} cr</em></button>}
            <span className="si-reason">{previewItem.blurb}</span>
          </div>
        ); })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cases

function Cases({ store, hero, cfg, onBuyCase, onBuy, onWish }: {
  store: AccountStore; hero: HeroId; cfg: ReturnType<typeof caseConfig>; onBuyCase: () => void; onBuy: (id: string) => void; onWish: (id: string | null) => void;
}) {
  const a = store.account;
  const odds = nextCaseOdds(a, cfg);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const perItem = (t: ItemTier) => (t === 'chase' ? odds.chase : t === 'signature' ? odds.signature : odds.standard) / caseTier(t).length;
  const tiers: ItemTier[] = ['standard', 'signature', 'chase'];
  const canBuy = store.canSpend && a.credits >= cfg.caseCost && !a.pendingReceipt;

  return (
    <div className="cases">
      <div className="cases-top">
        <div className="case-box">
          <div className="case-art"><Package size={40} /></div>
          <div>
            <div className="eyebrow">LAUNCH CASE</div>
            <strong>One of twelve items</strong>
            <p>Six Standard parts, three Signature finishes, three Chase parts. Uniform inside a tier. A duplicate refunds {DUPLICATE_REFUND} credits.</p>
          </div>
          <button className="si-continue case-buy" disabled={!canBuy} onClick={onBuyCase}>Open a case<em>{cfg.caseCost} cr</em></button>
          {!canBuy && <span className="si-reason">{a.pendingReceipt ? 'Finish the pending reveal first' : !store.canSpend ? 'Spending is blocked in this tab' : `Need ${cfg.caseCost - a.credits} more credits`}</span>}
        </div>
        <div className="case-odds">
          <div className="si-zone-head"><h3>Odds for your next case</h3><span className="si-rule">{odds.guaranteed ? 'GUARANTEED CHASE' : `${a.pity} without a Chase · guarantee in ${odds.casesToGuarantee}`}</span></div>
          <div className="odds-bars">
            {tiers.map(t => {
              const p = t === 'chase' ? odds.chase : t === 'signature' ? odds.signature : odds.standard;
              return <div key={t} className={`odds-row ${tierClass(t)}`}><span>{TIER_LABEL[t]}</span><div className="bar"><div style={{ width: `${p * 100}%` }} /></div><b>{pct(p)}</b></div>;
            })}
          </div>
          <div className="pity">
            <div className="bar"><div style={{ width: `${(a.pity / (PITY_GUARANTEE - 1)) * 100}%` }} /></div>
            <small>The {PITY_GUARANTEE}th consecutive case without a Chase awards one: your wishlisted Chase if you have set one, else any you do not own. A rolled Chase resets the count.</small>
          </div>
          <p className="setting-note">
            Honest arithmetic: at {pct(cfg.chaseOdds)} a case, about {pct(chanceWithin(50, cfg.chaseOdds))} of players see a natural Chase within 50 cases, and a <em>specific</em> Chase is 1 in {Math.round(1 / Math.max(1e-9, cfg.chaseOdds / 3))} per case.
            That is why every part also has a fixed price and a mastery route.
          </p>
        </div>
      </div>

      {tiers.map(t => (
        <section key={t} className={`case-tier ${tierClass(t)}`} aria-label={`${TIER_LABEL[t]} items`}>
          <div className="si-zone-head"><h3>{TIER_LABEL[t]}</h3><span className="si-rule">{pct(perItem(t))} each · {t === 'chase' ? `${CHASE_MASTERY_WAVES} waves with the weapon, then ${caseTier(t)[0].price} cr outright` : `${caseTier(t)[0].price} cr outright`}</span></div>
          <div className="case-items">
            {caseTier(t).map(i => {
              const has = owns(a, i.id);
              const fits = compatible(i, hero);
              const mastered = i.tier !== 'chase' || (a.mastery[i.hero!] ?? 0) >= CHASE_MASTERY_WAVES;
              return (
                <div key={i.id} className={`case-item ${has ? 'owned' : ''} ${fits ? '' : 'foreign'}`}>
                  <i>{i.icon}</i>
                  <div>
                    <b>{i.name}</b>
                    <small>{i.hero ? heroById(i.hero).name : 'Every weapon'}{has ? ' · owned' : ''}</small>
                    <p>{i.benefit}{i.cost ? ` · ${i.cost}` : ''}</p>
                  </div>
                  <div className="case-item-actions">
                    {i.tier === 'chase' && !has && <button type="button" className={a.wishlist === i.id ? 'wished' : ''} onClick={() => onWish(a.wishlist === i.id ? null : i.id)} title="Wishlist: the guaranteed case awards this"><Star size={12} />{a.wishlist === i.id ? 'Wished' : 'Wish'}</button>}
                    {!has && <button type="button" disabled={!store.canSpend || a.credits < i.price || !mastered} onClick={() => onBuy(i.id)} title={mastered ? `Buy outright for ${i.price} credits` : `Clear ${CHASE_MASTERY_WAVES} waves with the ${heroById(i.hero!).name} first`}>{mastered ? `${i.price} cr` : `${a.mastery[i.hero!] ?? 0}/${CHASE_MASTERY_WAVES} waves`}</button>}
                    {has && <Check size={14} className="owned-check" />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {a.receipts.length > 0 && (
        <section className="case-history" aria-label="Recent cases">
          <div className="si-zone-head"><h3>Recent cases</h3><span className="si-rule">{a.purchaseSequence} opened</span></div>
          <ul>{[...a.receipts].reverse().slice(0, 8).map(r => <li key={r.requestId} className={tierClass(r.tier)}>#{r.sequence} · {itemById(r.itemId)?.name ?? r.itemId} · {TIER_LABEL[r.tier]}{r.duplicate ? ` · duplicate +${r.refund}` : ''}{r.guaranteed ? ' · guaranteed' : ''}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- reveal

const CARD = 92, GAP = 10, COUNT = 44, FINAL = 36;
type Stage = 'seat' | 'lock' | 'run' | 'stop' | 'result';

/**
 * Purchase-to-reveal-to-inventory. The receipt is already committed and owned when this mounts; the reel is theatre.
 * Native Web Animations drive the strip; ticks follow actual marker crossings read from the computed transform, not a
 * second timer. Skip finishes the same animation to the same result. Reduced motion: cassette open, then a fade.
 */
function CaseReveal({ receipt, game, onContinue, onInspect }: { receipt: CaseReceipt; game: Arena | null; onContinue: () => void; onInspect: () => void }) {
  const item = itemById(receipt.itemId)!;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState<Stage>(reduced ? 'seat' : 'seat');
  const strip = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const synth = game?.synth;
  // Filler from a cosmetic seed; the committed item sits at FINAL. Adjacent cards are whatever the seed says.
  const cards = useMemo(() => {
    const rng = new Rng(receipt.fillerSeed);
    const out: ArsenalItem[] = [];
    for (let i = 0; i < COUNT; i++) {
      if (i === FINAL) { out.push(item); continue; }
      const r = rng.next();
      const tier: ItemTier = r < 0.01 ? 'chase' : r < 0.2 ? 'signature' : 'standard';
      const pool = caseTier(tier);
      out.push(pool[Math.floor(rng.next() * pool.length)]);
    }
    return { out, jitter: (rng.next() - 0.5) * CARD * 0.5, duration: 3000 + rng.next() * 800 };
  }, [receipt.fillerSeed, item]);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(() => { if (alive) fn(); }, ms));
    if (reduced) {
      later(250, () => setStage('result'));
      later(300, () => synth?.rare(item.tier));
      return () => { alive = false; timers.forEach(clearTimeout); };
    }
    later(250, () => { setStage('lock'); synth?.latch(); });
    later(400, () => setStage('run'));
    return () => { alive = false; timers.forEach(clearTimeout); anim.current?.cancel(); };
  }, [reduced, synth, item.tier]);

  // Start the strip when the run stage begins; measure the frame so the final offset comes from real widths.
  useEffect(() => {
    if (stage !== 'run' || !strip.current || !frame.current) return;
    const el = strip.current, fr = frame.current;
    const width = fr.getBoundingClientRect().width;
    const marker = width / 2;
    const centre = (i: number) => i * (CARD + GAP) + CARD / 2;
    const from = marker - centre(0);
    const to = marker - centre(FINAL) + cards.jitter;
    el.style.transform = `translateX(${from}px)`;
    const a = el.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: cards.duration, easing: 'cubic-bezier(0.1, 0.75, 0.15, 1)', fill: 'forwards' });
    anim.current = a;
    let lastIndex = -1, lastTick = 0, raf = 0;
    const read = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const tx = m.m41;
      // Which card boundary is the marker inside now? Ticks fire when the index changes, rate-limited when fast.
      const idx = Math.floor((marker - tx + GAP / 2) / (CARD + GAP));
      if (idx !== lastIndex) {
        const now = performance.now();
        if (now - lastTick > 34) { synth?.tick(Math.min(3, (idx - lastIndex))); lastTick = now; }
        lastIndex = idx;
      }
      if (a.playState === 'running') raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    const finished = () => {
      cancelAnimationFrame(raf);
      // Pin the final transform, then the dry stop and the result.
      el.style.transform = `translateX(${to}px)`;
      setStage('stop');
      synth?.reelStop();
      setTimeout(() => { setStage('result'); setTimeout(() => synth?.rare(item.tier), 160); }, 120);
    };
    a.onfinish = finished;
    // Resize mid-reel: the offsets would be wrong, so resolve immediately to the committed result.
    const onResize = () => { if (a.playState === 'running') a.finish(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [stage, cards, synth, item.tier]);

  const skip = () => { if (anim.current && anim.current.playState === 'running') anim.current.finish(); else if (stage !== 'result') setStage('result'); };
  const running = stage === 'run' || stage === 'lock' || stage === 'seat';

  return (
    <div className="reveal" role="dialog" aria-label="Case reveal" onKeyDown={e => { if (e.key === 'Escape' && stage === 'result') onContinue(); }}>
      <div className={`cassette ${stage}`}>
        <div className="cassette-lid" />
        {!reduced && stage !== 'result' && (
          <div className="reel-frame" ref={frame}>
            <div className="reel-marker" />
            <div className="reel-strip" ref={strip} style={{ gap: GAP }}>
              {cards.out.map((c, i) => <div key={i} className={`reel-card ${tierClass(c.tier)}`} style={{ width: CARD }}><i>{c.icon}</i><b>{c.name}</b><small>{TIER_LABEL[c.tier]}</small></div>)}
            </div>
          </div>
        )}
        {stage === 'result' && (
          <div className={`reveal-result ${tierClass(item.tier)}`}>
            <div className="eyebrow">{TIER_LABEL[item.tier].toUpperCase()}{receipt.guaranteed ? ' · GUARANTEED' : ''}</div>
            <i className="reveal-icon">{item.icon}</i>
            <h3>{item.name}</h3>
            <p>{item.hero ? `${heroById(item.hero).name} · ` : 'Every weapon · '}{item.benefit}{item.cost ? ` · ${item.cost}` : ''}</p>
            {receipt.duplicate && <div className="reveal-dup">Owned → +{receipt.refund} Credits</div>}
            <div className="reveal-actions">
              {!receipt.duplicate && item.slot !== 'weapon' && <button type="button" onClick={onInspect}><Wrench size={14} />Inspect / Equip</button>}
              <button className="si-continue" onClick={onContinue}>Continue<kbd>Esc</kbd></button>
            </div>
          </div>
        )}
      </div>
      {running && <button className="reveal-skip" type="button" onClick={skip}>Skip</button>}
    </div>
  );
}

export { CASE_POOL };
