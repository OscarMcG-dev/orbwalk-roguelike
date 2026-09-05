import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Ban, Eye, Heart, Sparkles, Stamp, Wrench } from 'lucide-react';
import type { Arena } from '../game/arena.ts';
import { heroById } from '../game/heroes.ts';
import { RARITY_LABEL } from '../game/upgrades.ts';
import type { ShardKey, Snapshot } from '../game/types.ts';

/**
 * The intermission. Presentation only: every price, eligibility and reward comes from the Snapshot, every action is a
 * Simulation command. Four zones with distinct visual grammar: the draft (illustrated cards), the anvil (a tool rack),
 * field repair (one meter, one purchase row), the reserve (a stamped receipt), and one anchored departure button.
 */
type Props = { snap: Snapshot; game: Arena | null };

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

export function ShopOverlay({ snap, game }: Props) {
  const g = game;
  const claimed = snap.draftClaimed;
  const offers = snap.offers ?? [];
  const hpFrac = snap.maxHp > 0 ? snap.hp / snap.maxHp : 0;

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

  // After the claim the cards collapse to a receipt; move focus to departure, never into a purchase.
  const departRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (claimed) departRef.current?.focus(); }, [claimed]);

  const tierLabel = snap.offerTier === 'mixed' ? 'Augment draft' : `${RARITY_LABEL[snap.offerTier]} draft`;
  const healReason = snap.healUsed ? 'Repaired this intermission' : snap.hp >= snap.maxHp ? 'Already at full health' : snap.gold < snap.healCost ? `Need ${snap.healCost} gold` : null;
  const anvilReason = snap.anvil.length === 0 ? 'Anvil spent for this run' : snap.anvilLeft === 0 ? 'Two shards an intermission' : snap.gold < snap.anvilCost ? `Need ${snap.anvilCost} gold` : null;

  return (
    <div className="start-overlay shop-overlay">
      <div className={`shop si tier-${snap.offerTier} ${claimed ? 'claimed' : ''}`} role="dialog" aria-label="Intermission">
        <header className="si-head">
          <div>
            <div className="eyebrow">WAVE {snap.wave} CLEARED · INTERMISSION</div>
            <h2>{snap.banishMode ? 'Banish which augment?' : claimed ? 'Shop, then fight' : 'Claim your free augment'}</h2>
          </div>
          <div className="si-wallet" aria-live="polite">
            <span className="si-gold">◆ {snap.gold}{debit !== null && <em className="si-debit">{debit}</em>}</span>
            <span className={`si-hp ${hpFrac < 0.35 ? 'low' : ''}`}>♥ {snap.hp}<small>/{snap.maxHp}</small></span>
          </div>
        </header>

        <div className="si-body">
          <section className="si-draft" aria-label="Free augment">
            <div className="si-zone-head">
              <h3><Sparkles size={15} />{tierLabel}</h3>
              <span className="si-rule">{claimed ? 'Claimed · Lasts this run' : 'Choose 1 · Free · Lasts this run'}</span>
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
                  <button disabled={snap.fourthBought || snap.gold < snap.fourthCost} onClick={() => g?.buyFourth()} title="Reveal a fourth augment, Gold or better">
                    <Eye size={14} />Reveal a fourth<kbd>F</kbd><em>{snap.fourthBought ? 'revealed' : `${snap.fourthCost} gold`}</em>
                  </button>
                  <button className={snap.banishMode ? 'armed' : ''} disabled={!snap.banishMode && snap.gold < snap.banishCost} onClick={() => g?.toggleBanish()} title="Remove an augment from this run's pool for good and redraw the slot">
                    <Ban size={14} />{snap.banishMode ? 'Cancel banish' : 'Banish'}<kbd>{snap.banishMode ? 'Esc' : 'B'}</kbd><em>{snap.banishMode ? 'pick 1-4' : `${snap.banishCost} gold`}</em>
                  </button>
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

          <div className="si-row">
            <section className="si-anvil" aria-label="Stat anvil">
              <div className="si-zone-head">
                <h3><Wrench size={15} />Stat anvil</h3>
                <span className="si-rule">Improve this run · {snap.anvilCost} gold each · {snap.anvilLeft} of 2 left</span>
              </div>
              <div className="si-rack">
                {snap.anvil.map((s, i) => {
                  const p = snap.anvilPreview[i];
                  return (
                    <button key={s.key} disabled={snap.gold < snap.anvilCost || snap.anvilLeft === 0} onClick={() => g?.buyShard(i)}>
                      <span className="offer-key">{i + 7}</span>
                      <i>{s.icon}</i>
                      <b>{s.name}</b>
                      <small>{s.display}</small>
                      {p && <span className="si-delta">{fmtStat(s.key, p.before)} <ArrowRight size={11} /> <strong>{fmtStat(s.key, p.after)}</strong></span>}
                    </button>
                  );
                })}
                {anvilReason && <span className="si-reason">{anvilReason}</span>}
              </div>
            </section>

            <section className="si-repair" aria-label="Field repair">
              <div className="si-zone-head">
                <h3><Heart size={15} />Field repair</h3>
                <span className="si-rule">Once an intermission</span>
              </div>
              <div className="si-meter" role="img" aria-label={`Health ${snap.hp} of ${snap.maxHp}`}>
                <div className={hpFrac < 0.35 ? 'low' : ''} style={{ width: `${Math.max(0, Math.min(1, hpFrac)) * 100}%` }} />
                {snap.healAmount > 0 && !snap.healUsed && <div className="si-meter-gain" style={{ left: `${hpFrac * 100}%`, width: `${Math.min(1 - hpFrac, snap.healAmount / snap.maxHp) * 100}%` }} />}
              </div>
              <button className="si-buy" disabled={healReason !== null} onClick={() => g?.buyHeal()}>
                <Heart size={14} />Restore {snap.healAmount} HP<kbd>H</kbd><em>{snap.healCost} gold</em>
              </button>
              {healReason && <span className="si-reason">{healReason}</span>}
            </section>

            <section className="si-reserve" aria-label="Reserve">
              <div className="si-zone-head">
                <h3><Stamp size={15} />Reserve</h3>
                <span className="si-rule">Next intermission</span>
              </div>
            {snap.ascended ? (
              <div className="si-receipt si-promise">
                <span>Next draft: <strong>Prismatic</strong><br /><small>after wave {snap.nextShopWave}</small></span>
                <span className="si-stamp">PAID</span>
              </div>
            ) : (
              <button className="si-buy si-ascend" disabled={snap.gold < snap.ascendCost} onClick={() => g?.ascend()} title="Buy a Prismatic draft for the next intermission">
                <Stamp size={14} />Ascend<kbd>A</kbd><em>{snap.ascendCost} gold</em>
                <small>After wave {snap.nextShopWave}, the draft offers only Prismatic augments.</small>
              </button>
            )}
            </section>
          </div>
        </div>

        <footer className="si-depart">
          {!claimed && <span className="si-reason">Choose your free augment first</span>}
          <button ref={departRef} className="si-continue" data-depart disabled={!claimed} onClick={() => g?.continueWave()}>
            Continue to wave {snap.nextWave}<ArrowRight size={17} /><kbd>Enter</kbd>
          </button>
        </footer>
      </div>
    </div>
  );
}
