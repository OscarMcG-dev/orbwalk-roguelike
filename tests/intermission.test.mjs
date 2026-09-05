import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { heroById } from '../src/game/heroes.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', ...heroById('marksman').profile, quick: false, showRange: true, sound: false, shake: true };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
/** A run parked in the intermission after clearing `wave`, with gold to spend. */
const intermission = ({ wave = 2, gold = 200, seed = 5, shopEvery } = {}) => {
  const s = new Simulation(settings);
  if (shopEvery) s.setTuning({ shopEvery });
  s.rng.seed = seed;
  s.start();
  s.wave = wave; s.gold = gold; s.enemies = []; s.spawnQueue = [];
  s.openShop();
  return s;
};
/** Clear the current wave and let the wave flow decide what comes next. */
const clearWave = s => { s.enemies = []; s.spawnQueue = []; s.omens = []; s.waveState = 'fighting'; tick(s, 1.6); };

test('Claiming the free augment applies exactly one reward and leaves the intermission open', () => {
  const s = intermission();
  assert.equal(s.status, 'choosing'); assert.equal(s.draftClaimed, false); assert.equal(s.claimedOffer, null);
  const picked = s.offers[1];
  s.choose(1);
  assert.equal(s.status, 'choosing', 'claim does not depart');
  assert.equal(s.wave, 2);
  assert.equal(s.draftClaimed, true);
  assert.equal(s.claimedOffer.id, picked.id);
  assert.equal(s.relics.length, 1); assert.equal(s.relics[0].id, picked.id);
  // A second click, or a held key, cannot grant a second augment.
  s.choose(0); s.choose(1); s.choose(2);
  assert.equal(s.relics.length, 1); assert.equal(s.relics[0].stacks, 1);
});

test('Departure needs a claim, begins exactly one wave, and repeated continue is inert', () => {
  const s = intermission();
  s.continueWave();
  assert.equal(s.status, 'choosing', 'no departure before the claim');
  s.choose(0);
  s.continueWave();
  assert.equal(s.status, 'running'); assert.equal(s.wave, 3); assert.equal(s.offers, null);
  s.continueWave(); s.continueWave();
  assert.equal(s.wave, 3, 'continue after departure does nothing');
  assert.equal(s.draftClaimed, true);
  // The next shop starts fresh.
  s.gold = 50; s.openShop();
  assert.equal(s.draftClaimed, false); assert.equal(s.claimedOffer, null); assert.equal(s.offers.length, 3);
});

test('Before the claim every service is open; after it, draft edits lock while anvil, repair and Ascend stay available', () => {
  const s = intermission({ gold: 200 });
  const before = s.offers.map(o => o.id).join(), free = s.rerollsLeft;
  s.reroll();
  assert.equal(s.rerollsLeft, free - 1, 'free reroll spent');
  assert.notEqual(s.offers.map(o => o.id).join(), before);
  s.buyFourth();
  assert.equal(s.offers.length, 4); assert.equal(s.fourthBought, true);
  let gold = s.gold;
  s.choose(0);
  // Locked after the claim: reroll, fourth offer, banish.
  const claimedOffers = s.offers.map(o => o.id).join();
  s.reroll(); s.buyFourth(); s.toggleBanish();
  assert.equal(s.gold, gold, 'no gold leaves for locked services');
  assert.equal(s.banishMode, false);
  assert.equal(s.offers.map(o => o.id).join(), claimedOffers);
  // Still open: anvil, repair, Ascend.
  s.hp = 30;
  const shard = s.anvil[0].key;
  let cost = s.anvilCost; s.buyShard(0); assert.equal(s.shards[shard], 1); assert.equal(s.gold, gold - cost); gold = s.gold;
  cost = s.healCost; s.buyHeal(); assert.equal(s.hp, 30 + Math.round(s.stats.maxHp * 0.35)); assert.equal(s.gold, gold - cost); gold = s.gold;
  cost = s.ascendCost; s.ascend(); assert.equal(s.ascendNext, true); assert.equal(s.gold, gold - cost);
  assert.ok(s.gold >= 0);
});

test('Gold never goes negative: every purchase is refused when it cannot be paid for', () => {
  const s = intermission({ gold: 0 });
  s.hp = 10;
  s.buyFourth(); s.buyShard(0); s.buyHeal(); s.ascend(); s.toggleBanish(); s.banish(0);
  assert.equal(s.gold, 0); assert.equal(s.banishMode, false); assert.equal(s.hp, 10); assert.equal(s.offers.length, 3);
  s.rerollsLeft = 0; s.reroll();
  assert.equal(s.gold, 0);
});

test('Banish mode arms only with gold and an unclaimed draft, but always cancels', () => {
  const s = intermission({ gold: 100 });
  s.toggleBanish(); assert.equal(s.banishMode, true);
  s.gold = 0;
  s.toggleBanish(); assert.equal(s.banishMode, false, 'cancel works without gold');
  s.toggleBanish(); assert.equal(s.banishMode, false, 'cannot arm without gold');
  s.gold = 100; s.choose(0);
  s.toggleBanish(); assert.equal(s.banishMode, false, 'cannot arm after the claim');
});

test('Ascend bought after the claim under Iron cadence crosses the non-shop wave and lands on the next real draft', () => {
  const s = intermission({ wave: 2, gold: 200, shopEvery: 2 });
  s.choose(0);
  s.ascend();
  assert.equal(s.ascendNext, true);
  assert.equal(s.nextShopWave, 4);
  s.continueWave();
  assert.equal(s.wave, 3);
  clearWave(s);
  assert.equal(s.status, 'running', 'wave 3 rolls straight on under shopEvery 2');
  assert.equal(s.wave, 4);
  assert.equal(s.ascendNext, true, 'the promise survives the intervening wave');
  clearWave(s);
  assert.equal(s.status, 'choosing'); assert.equal(s.wave, 4);
  assert.equal(s.offerTier, 'prismatic');
  assert.ok(s.offers.every(o => o.rarity === 'prismatic'));
  assert.equal(s.ascendNext, false);
});

test('Snapshot exposes the intermission: claim state, departure target, cadence, repair amount and anvil before/after', () => {
  const s = intermission({ wave: 2, shopEvery: 2 });
  let snap = s.snapshot();
  assert.equal(snap.draftClaimed, false); assert.equal(snap.claimedOffer, null);
  assert.equal(snap.nextWave, 3); assert.equal(snap.nextShopWave, 4);
  assert.equal(snap.anvilPreview.length, snap.anvil.length);
  for (let i = 0; i < snap.anvil.length; i++) {
    assert.equal(snap.anvilPreview[i].key, snap.anvil[i].key);
    assert.ok(snap.anvilPreview[i].after > snap.anvilPreview[i].before, `${snap.anvil[i].key} improves`);
  }
  s.hp = s.stats.maxHp - 10;
  assert.equal(s.healAmount, 10, 'repair is capped at the missing health');
  s.hp = 20;
  assert.equal(s.healAmount, Math.round(s.stats.maxHp * 0.35));
  s.choose(2);
  snap = s.snapshot();
  assert.equal(snap.draftClaimed, true); assert.equal(snap.claimedOffer.id, s.relics[0].id);
  s.setTuning({ shopEvery: 1 });
  assert.equal(s.nextShopWave, 3);
});
