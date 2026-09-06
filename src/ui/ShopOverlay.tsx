import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, Ban, Eye, FileSignature, Heart, Sparkles, Stamp, Wrench } from 'lucide-react';
import type { Arena } from '../game/arena.ts';
import { heroById } from '../game/heroes.ts';
import { RARITY_LABEL } from '../game/upgrades.ts';
import type { ShardKey, Snapshot } from '../game/types.ts';

/**
 * The refit (intermission). Presentation only: every price, eligibility and reward comes from the Snapshot, every
 * action is a Simulation command. One screen with progressive detail (brief 01, slice B): a fixed frame (wallet and
 * health, the next-refit label, the claim status and the departure) around two tabs. Augment holds the free draft and
 * collapses to its receipt once claimed; Workshop holds the anvil, the repair row and a collapsed "Plan next refit"
 * section for the reserve (Ascend) and the next-wave contract. Disclosures only: no new currency, no unlocks.
 */
type Props = { snap: Snapshot; game: Arena | null };
type Tab = 'augment' | 'workshop';

/** Human units for the one stat a shard moves. */
function fmtStat(key: ShardKey, v: number) {
  switch (key) {
    case 'critChance': return `${Math.round(v * 100)}%`;
    case 'goldMult': return `×${v.toFixed(2)}`;
    case 'attackSpeed': return `${v.toFixed(2)}/s`;
    case 'armor': return v.toFixed(1);
    default: return `${Math.round(v)}`;
  }
}

/** What the contract's payout would make affordable at today's prices (no promise about future offers). */
function affordable(snap: Snapshot, reward: number) {
  const total = snap.gold + reward;
  const items: string[] = [];
  if (snap.gold < snap.healCost && total >= snap.healCost) items.push('a field repair');
  if (snap.gold < snap.anvilCost && total >= snap.anvilCost) items.push('an anvil shard');
  if (snap.gold < snap.fourthCost && total >= snap.fourthCost) items.push('a fourth offer');
  if (snap.gold < snap.ascendCost && total >= snap.ascendCost) items.push('Ascend');
  return items.length ? items.join(', ') : 'nothing new at current prices';
}

/** Which tab (and disclosure) a shop shortcut lives on, so a key to a hidden service reveals it alongside the action. */
function revealFor(e: KeyboardEvent): { tab: Tab; more?: boolean; plan?: boolean } | null {
  const k = e.key?.toLowerCase();
  const is = (code: string, key: string) => e.code === code || k === key;
  if (is('Digit1', '1') || is('Digit2', '2') || is('Digit3', '3') || is('Digit4', '4') || is('KeyR', 'r')) return { tab: 'augment' };
  if (is('KeyF', 'f') || is('KeyB', 'b')) return { tab: 'augment', more: true };
  if (is('Digit7', '7') || is('Digit8', '8') || is('Digit9', '9') || is('KeyH', 'h')) return { tab: 'workshop' };
  if (is('KeyA', 'a') || is('KeyC', 'c')) return { tab: 'workshop', plan: true };
  return null;
}

export function ShopOverlay({ snap, game }: Props) {
  const g = game;
  const claimed = snap.draftClaimed;
  const offers = snap.offers ?? [];
  const hpFrac = snap.maxHp > 0 ? snap.hp / snap.maxHp : 0;

  // Progressive detail. The overlay mounts per intermission, so this state starts fresh every refit.
  const [tab, setTab] = useState<Tab>('augment');
  const [moreDraft, setMoreDraft] = useState(false);
  const [plan, setPlan] = useState(false);
  const tabRefs = { augment: useRef<HTMLButtonElement>(null), workshop: useRef<HTMLButtonElement>(null) };

  // Debit beside the wallet: show what just left, then fade.
  const lastGold = useRef(snap.gold);
  const [debit, setDebit] = useState<number | null>(null);
  useEffect(() => {
    const diff = snap.gold - lastGold.current;
    lastGold.current = snap.gold;
    if (diff < 0) {
      setDebit(diff);
      const t = setTimeout(() => setDebit(null), 900);
      return () => clearTimeout(t);
    }
  }, [snap.gold]);

  // After the claim the draft collapses to a receipt and Workshop opens; focus goes to departure, never into a purchase.
  const departRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (claimed) { setTab('workshop'); departRef.current?.focus(); } }, [claimed]);
  // Banish mode always shows the draft and its controls (the cancel lives there).
  useEffect(() => { if (snap.banishMode) { setTab('augment'); setMoreDraft(true); } }, [snap.banishMode]);
  // A shortcut to a hidden service reveals its tab and section, valid or not. Nothing here charges: the sim does that.
  // The arena's listener runs first and React may flush between listeners, so read the live snapshot: once the draft
  // is claimed the draft keys are inert and must not pull the screen back off Workshop.
  const snapRef = useRef(snap);
  snapRef.current = snap;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const r = revealFor(e);
      if (!r) return;
      if (r.tab === 'augment' && snapRef.current.draftClaimed && !snapRef.current.banishMode) return;
      setTab(r.tab);
      if (r.more) setMoreDraft(true);
      if (r.plan) setPlan(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const pickTab = (t: Tab, focus = false) => { setTab(t); if (focus) tabRefs[t].current?.focus(); };
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const order: Tab[] = ['augment', 'workshop'];
    const i = order.indexOf(tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pickTab(order[(i + 1) % order.length], true); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pickTab(order[(i + order.length - 1) % order.length], true); }
    else if (e.key === 'Home') { e.preventDefault(); pickTab(order[0], true); }
    else if (e.key === 'End') { e.preventDefault(); pickTab(order[order.length - 1], true); }
  };

  const tierLabel = snap.offerTier === 'mixed' ? 'Augment draft' : `${RARITY_LABEL[snap.offerTier]} draft`;
  const healReason = snap.healUsed ? 'Repaired this refit' : snap.hp >= snap.maxHp ? 'Already at full health' : snap.gold < snap.healCost ? `Need ${snap.healCost} gold` : null;
  const anvilReason = snap.anvil.length === 0 ? 'Anvil spent for this run' : snap.anvilLeft === 0 ? 'Two shards a refit' : snap.gold < snap.anvilCost ? `Need ${snap.anvilCost} gold` : null;
  const planOpen = plan || !!snap.selectedContract;
  const contractWord = snap.contractOffer ? (snap.selectedContract ? 'Overdraw selected' : 'Standard') : null;

  return (
    <div className="start-overlay shop-overlay">
      <div className={`shop si tier-${snap.offerTier} ${claimed ? 'claimed' : ''}`} role="dialog" aria-label="Refit">
        <header className="si-head">
          <div>
            <div className="eyebrow">WAVE {snap.wave} CLEARED · REFIT</div>
            <h2>{snap.banishMode ? 'Banish which augment?' : claimed ? 'Refit, then fight' : 'Claim your free augment'}</h2>
          </div>
          <div className="si-wallet">
            <span className="si-gold">◆ {snap.gold}{debit !== null && <em className="si-debit">{debit}</em>}</span>
            <span className={`si-hp ${hpFrac < 0.35 ? 'low' : ''}`}>♥ {snap.hp}<small>/{snap.maxHp}</small></span>
          </div>
        </header>

        <div className="si-tabs" role="tablist" aria-label="Refit sections" onKeyDown={onTabKey}>
          <button ref={tabRefs.augment} role="tab" id="si-tab-augment" aria-selected={tab === 'augment'} aria-controls="si-panel-augment" tabIndex={tab === 'augment' ? 0 : -1} className={`si-tab ${claimed ? 'done' : ''}`} onClick={() => pickTab('augment')}>
            <Sparkles size={14} />Augment<i>{claimed ? 'claimed ✓' : 'choose 1 · free'}</i>
          </button>
          <button ref={tabRefs.workshop} role="tab" id="si-tab-workshop" aria-selected={tab === 'workshop'} aria-controls="si-panel-workshop" tabIndex={tab === 'workshop' ? 0 : -1} className="si-tab" onClick={() => pickTab('workshop')}>
            <Wrench size={14} />Workshop<i>anvil · repair · plan</i>
          </button>
          <span className="si-next">Next refit after wave {snap.nextShopWave}</span>
        </div>

        {snap.contractReceipt && snap.contractReceipt.wave === snap.wave && (
          <div className="si-contract-receipt" aria-label="Contract settled">
            <FileSignature size={14} />
            <span>Overdraw held through wave {snap.contractReceipt.wave}: <strong>+{snap.contractReceipt.reward} gold</strong><small> · wave clear paid +{snap.contractReceipt.clearBonus} separately</small></span>
            <span className="si-stamp">PAID</span>
          </div>
        )}

        <div className="si-body">
          {tab === 'augment' && (
            <section className="si-panel si-draft" role="tabpanel" id="si-panel-augment" aria-labelledby="si-tab-augment">
              <div className="si-zone-head">
                <h3><Sparkles size={15} />{tierLabel}</h3>
                {snap.banishMode
                  ? <button className="si-chip" onClick={() => g?.toggleBanish()}>Cancel banish<kbd>Esc</kbd></button>
                  : <span className="si-rule">{claimed ? 'Claimed · Lasts this run' : 'Choose 1 · Free · Lasts this run'}</span>}
              </div>
              {!claimed && (
                <>
                  <div className={`offers ${snap.banishMode ? 'banishing' : ''} ${offers.length > 3 ? 'four' : ''}`}>
                    {offers.map((o, i) => (
                      <button key={o.id} className={`offer ${o.rarity}`} style={{ animationDelay: `${i * 70}ms` }} onClick={() => g?.choose(i)}>
                        <span className="offer-key">{i + 1}</span>
                        {snap.banishMode && <span className="offer-banish">BANISH · {snap.banishCost} gold</span>}
                        <span className="offer-icon">{o.icon}</span>
                        <span className="offer-rarity">{RARITY_LABEL[o.rarity]}{o.stacks > 0 && ` · ${o.stacks}/${o.max}`}{o.quest && ' · quest'}{o.synergy && <em className="synergy">synergy</em>}</span>
                        <strong>{o.name}</strong>
                        {o.unlockedBy && <span className="offer-unlock">Unlocked by {o.unlockedBy}</span>}
                        {o.heroOnly && <span className="offer-unlock">{heroById(o.heroOnly).name} only</span>}
                        <p>{o.blurb}</p>
                        <span className="offer-cta">{snap.banishMode ? 'Banish' : 'Claim · free'}</span>
                      </button>
                    ))}
                  </div>
                  <div className="si-draft-tools">
                    <button disabled={snap.rerollCost > 0 && snap.gold < snap.rerollCost} onClick={() => g?.reroll()} title="Redraw the three offers">
                      <Sparkles size={14} />Reroll<kbd>R</kbd><em>{snap.rerollCost === 0 ? `${snap.rerollsLeft} free` : `${snap.rerollCost} gold`}</em>
                    </button>
                    <details className="si-more" open={moreDraft} onToggle={e => setMoreDraft(e.currentTarget.open)}>
                      <summary>More draft controls<i>reveal a fourth · banish</i></summary>
                      <div>
                        <button disabled={snap.fourthBought || snap.gold < snap.fourthCost} onClick={() => g?.buyFourth()} title="Reveal a fourth augment, Gold or better">
                          <Eye size={14} />Reveal a fourth<kbd>F</kbd><em>{snap.fourthBought ? 'revealed' : `${snap.fourthCost} gold`}</em><small>Gold or better · once a refit</small>
                        </button>
                        <button className={snap.banishMode ? 'armed' : ''} disabled={!snap.banishMode && snap.gold < snap.banishCost} onClick={() => g?.toggleBanish()} title="Remove an augment from this run's pool for good and redraw the slot">
                          <Ban size={14} />{snap.banishMode ? 'Cancel banish' : 'Banish'}<kbd>{snap.banishMode ? 'Esc' : 'B'}</kbd><em>{snap.banishMode ? 'pick 1-4' : `${snap.banishCost} gold`}</em><small>Removes it from this run and redraws the slot</small>
                        </button>
                      </div>
                    </details>
                  </div>
                </>
              )}
              {claimed && snap.claimedOffer && (
                <div className={`si-receipt si-claimed ${snap.claimedOffer.rarity}`}>
                  <span className="offer-icon">{snap.claimedOffer.icon}</span>
                  <div>
                    <span className="offer-rarity">{RARITY_LABEL[snap.claimedOffer.rarity]}{snap.claimedOffer.stacks > 1 && ` · ${snap.claimedOffer.stacks}/${snap.claimedOffer.max}`}</span>
                    <strong>{snap.claimedOffer.name}</strong>
                    <p>{snap.claimedOffer.blurb}</p>
                  </div>
                  <span className="si-stamp">CLAIMED</span>
                </div>
              )}
            </section>
          )}

          {tab === 'workshop' && (
            <section className="si-panel" role="tabpanel" id="si-panel-workshop" aria-labelledby="si-tab-workshop">
              <div className="si-workshop">
                <section className="si-anvil" aria-label="Stat anvil">
                  <div className="si-zone-head">
                    <h3><Wrench size={15} />Stat anvil</h3>
                    <span className="si-rule">{snap.anvilLeft} of 2 this refit · Lasts the run</span>
                  </div>
                  <div className="si-rack">
                    {snap.anvil.map((s, i) => {
                      const p = snap.anvilPreview[i];
                      return (
                        <button key={s.key} disabled={snap.gold < snap.anvilCost || snap.anvilLeft === 0} onClick={() => g?.buyShard(i)}>
                          <span className="offer-key">{i + 7}</span>
                          <i>{s.icon}</i>
                          <b>{s.name}</b>
                          {p && <span className="si-delta">{fmtStat(s.key, p.before)} <ArrowRight size={11} /> <strong>{fmtStat(s.key, p.after)}</strong></span>}
                          <em>{snap.anvilCost} gold</em>
                        </button>
                      );
                    })}
                    {anvilReason && <span className="si-reason">{anvilReason}</span>}
                  </div>
                </section>

                <section className="si-repair" aria-label="Field repair">
                  <div className="si-zone-head">
                    <h3><Heart size={15} />Field repair</h3>
                    <span className="si-rule">Once a refit</span>
                  </div>
                  <div className="si-meter" role="img" aria-label={`Health ${snap.hp} of ${snap.maxHp}`}>
                    <div className={hpFrac < 0.35 ? 'low' : ''} style={{ width: `${Math.max(0, Math.min(1, hpFrac)) * 100}%` }} />
                    {snap.healAmount > 0 && !snap.healUsed && <div className="si-meter-gain" style={{ left: `${hpFrac * 100}%`, width: `${Math.min(1 - hpFrac, snap.healAmount / snap.maxHp) * 100}%` }} />}
                  </div>
                  <button className="si-buy" disabled={healReason !== null} onClick={() => g?.buyHeal()}>
                    <Heart size={14} />Restore {snap.healAmount} HP<kbd>H</kbd><em>{snap.healCost} gold</em>
                    <small>{snap.healAmount > 0 && !snap.healUsed ? `${snap.hp} → ${Math.min(snap.maxHp, snap.hp + snap.healAmount)} of ${snap.maxHp}` : `${snap.hp} of ${snap.maxHp}`}</small>
                  </button>
                  {healReason && <span className="si-reason">{healReason}</span>}
                </section>
              </div>

              {snap.ascended && (
                <div className="si-receipt si-promise" aria-label="Reserve paid">
                  <Stamp size={16} />
                  <span>Paid · <strong>Prismatic draft</strong> after wave {snap.nextShopWave}</span>
                  <span className="si-stamp">PAID</span>
                </div>
              )}
              <details className="si-plan" open={planOpen} onToggle={e => setPlan(e.currentTarget.open)}>
                <summary>
                  <Stamp size={14} />Plan next refit
                  <i>{[snap.ascended ? 'reserve paid' : `Ascend · ${snap.ascendCost} gold`, contractWord].filter(Boolean).join(' · ')}</i>
                </summary>
                <div>
                  {!snap.ascended && (
                    <button className="si-buy si-ascend" disabled={snap.gold < snap.ascendCost} onClick={() => g?.ascend()} title="Buy a Prismatic draft for the next refit">
                      <Stamp size={14} />Ascend<kbd>A</kbd><em>{snap.ascendCost} gold</em>
                      <small>Pay now · Prismatic draft after wave {snap.nextShopWave}.</small>
                    </button>
                  )}
                  {snap.gold < snap.ascendCost && !snap.ascended && <span className="si-reason">Need {snap.ascendCost} gold</span>}
                  {snap.contractOffer && (
                    <section className="si-contract" aria-label="Next-wave contract" role="radiogroup">
                      <div className="si-zone-head">
                        <h3><FileSignature size={15} />Next-wave contract</h3>
                        <span className="si-rule">Wave {snap.contractOffer.wave} · Locked when you depart · <kbd>C</kbd> toggles</span>
                      </div>
                      <div className="si-contract-cards">
                        <button role="radio" aria-checked={snap.selectedContract === null} className={`si-contract-card ${snap.selectedContract === null ? 'selected' : ''}`} onClick={() => g?.selectContract(null)}>
                          <i />
                          <strong>Standard</strong>
                          <span>No added risk</span>
                        </button>
                        <button role="radio" aria-checked={snap.selectedContract === 'overdraw'} className={`si-contract-card overdraw ${snap.selectedContract === 'overdraw' ? 'selected' : ''}`} onClick={() => g?.selectContract('overdraw')}>
                          <i />
                          <strong>Overdraw</strong>
                          <span>Take {Math.round((snap.contractOffer.mult - 1) * 100)}% more damage for the whole wave · Clear it for <b>{snap.contractOffer.reward} gold</b></span>
                          <small>Pays once at wave clear. Dying pays nothing and costs nothing afterwards. Right now {snap.contractOffer.reward} gold covers {affordable(snap, snap.contractOffer.reward)}.</small>
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              </details>
            </section>
          )}
        </div>

        <footer className="si-depart">
          <span className="si-reason si-claim-status" role="status" aria-live="polite">{claimed ? `Claimed: ${snap.claimedOffer?.name ?? 'augment'}.` : 'Choose one free augment to depart.'}</span>
          <button ref={departRef} className={`si-continue ${snap.selectedContract ? 'contracted' : ''}`} data-depart disabled={!claimed} onClick={() => g?.continueWave()}>
            {snap.selectedContract ? `Start wave ${snap.nextWave} · Overdraw` : `Continue to wave ${snap.nextWave}`}<ArrowRight size={17} /><kbd>Enter</kbd>
          </button>
        </footer>
      </div>
    </div>
  );
}
