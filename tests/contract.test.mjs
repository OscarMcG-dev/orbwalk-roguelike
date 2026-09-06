// Brief 04: the Overdraw next-wave contract. Signed in the intermission, locked on departure, settled once at the
// wave-clear boundary; incoming damage is multiplied exactly once through the shared hazardDamage path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { heroById } from '../src/game/heroes.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', ...heroById('marksman').profile, quick: false, showRange: true, sound: false, shake: true };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
/** A run parked in the intermission after clearing `wave`. */
const intermission = ({ wave = 3, gold = 50, seed = 5, tuning } = {}) => {
  const s = new Simulation(settings);
  if (tuning) s.setTuning(tuning);
  s.rng.seed = seed;
  s.start();
  s.wave = wave; s.gold = gold; s.enemies = []; s.spawnQueue = [];
  s.openShop();
  return s;
};
/** Depart with the current selection and land in the next wave's fight with a clear floor. */
const depart = s => { s.choose(0); s.continueWave(); s.enemies = []; s.spawnQueue = []; s.omens = []; s.pendingEvents = []; s.waveState = 'fighting'; };
const clearWave = s => { s.enemies = []; s.spawnQueue = []; s.omens = []; s.waveState = 'fighting'; tick(s, 0.1); };

test('Standard is the default: no contract is active after departure unless one was selected', () => {
  const s = intermission({ wave: 3 });
  assert.ok(s.contractOffer, 'offered from wave 4');
  assert.equal(s.selectedContract, null);
  depart(s);
  assert.equal(s.activeContract, null);
  assert.equal(s.hazardDamage(10), 10 * (1 + 4 * 0.03));
});

test('The contract is only offered in actual intermissions from the configured wave, and never for the Witness debut wave', () => {
  assert.equal(intermission({ wave: 2 }).contractOffer, null, 'wave 3 is too early');
  assert.ok(intermission({ wave: 3 }).contractOffer);
  assert.equal(intermission({ wave: 4, tuning: { witnessDebut: 5 } }).contractOffer, null, 'no contract on the Witness tutorial wave');
  assert.ok(intermission({ wave: 5, tuning: { witnessDebut: 5 } }).contractOffer);
  assert.equal(intermission({ wave: 3, tuning: { overdrawFromWave: 6 } }).contractOffer, null);
  const s = intermission({ wave: 3 }); s.choose(0); s.continueWave();
  assert.equal(s.contractOffer, null, 'nothing on offer while fighting');
  s.selectContract('overdraw');
  assert.equal(s.selectedContract, null, 'cannot select outside the intermission');
});

test('Selecting is reversible until departure; departure snapshots the deal so live tuning cannot change it', () => {
  const s = intermission({ wave: 3 });
  s.selectContract('overdraw'); assert.equal(s.selectedContract, 'overdraw');
  s.selectContract(null); assert.equal(s.selectedContract, null);
  s.selectContract('overdraw');
  assert.equal(s.snapshot().selectedContract, 'overdraw');
  depart(s);
  assert.ok(s.activeContract);
  assert.equal(s.activeContract.id, 'overdraw'); assert.equal(s.activeContract.mult, 1.35); assert.equal(s.activeContract.reward, 18); assert.equal(s.activeContract.wave, 4);
  assert.equal(s.selectedContract, null, 'selection is consumed');
  s.setTuning({ overdrawMult: 2, overdrawGold: 40 });
  assert.equal(s.activeContract.mult, 1.35); assert.equal(s.activeContract.reward, 18);
  assert.equal(s.contractMult, 1.35);
});

test('Every incoming damage type is multiplied once, before armour, through the shared path; hurt and drain agree', () => {
  const s = intermission({ wave: 3 }); s.selectContract('overdraw'); depart(s);
  const plain = intermission({ wave: 3 }); depart(plain);
  const base = 10 * (1 + 4 * 0.03);
  assert.ok(Math.abs(s.hazardDamage(10) - base * 1.35) < 1e-9, 'exactly ×1.35, not squared');
  assert.ok(Math.abs(plain.hazardDamage(10) - base) < 1e-9);
  s.stats.armor = 3; plain.stats.armor = 3;
  const hp1 = s.hp, hp2 = plain.hp;
  s.hurt(10); plain.hurt(10);
  assert.equal(hp1 - s.hp, Math.max(1, Math.round(base * 1.35 - 3)));
  assert.equal(hp2 - plain.hp, Math.max(1, Math.round(base - 3)));
  const d1 = s.hp, d2 = plain.hp;
  s.drain(6, 0.5); plain.drain(6, 0.5);
  assert.ok(Math.abs((d1 - s.hp) / (d2 - plain.hp) - 1.35) < 1e-6, 'drain carries the same factor');
  // Contact and hazard hits also route through hurt().
  const hpBefore = s.hp;
  s.takeHit({ x: 0, y: 0, vx: 0, vy: 0, delay: 0, age: 0, life: 1, radius: 5, kind: 'circle', hit: false, resolved: false, damage: 10, trail: [] });
  assert.equal(hpBefore - s.hp, Math.max(1, Math.round(base * 1.35 - 3)));
});

test('The contract is active from the banner, settles once at wave clear with its own receipt, and is gone for the next wave', () => {
  const s = intermission({ wave: 3, gold: 0 });
  s.selectContract('overdraw'); s.choose(0); s.continueWave();
  assert.equal(s.waveState, 'banner'); assert.ok(s.activeContract);
  assert.equal(s.contractMult, 1.35, 'live at the first banner');
  s.enemies = []; s.spawnQueue = []; s.omens = []; s.pendingEvents = []; s.waveState = 'fighting';
  const gold = s.gold, events = s.contractEvent;
  clearWave(s);
  assert.equal(s.waveState, 'clear');
  const clearBonus = 4 + Math.floor(4 * 0.6);
  assert.equal(s.gold, gold + clearBonus + 18, 'wave-clear gold and the payout are both paid, once');
  assert.equal(s.contractEvent, events + 1);
  assert.deepEqual({ ...s.contractReceipt, settlementId: undefined }, { id: 'overdraw', wave: 4, reward: 18, clearBonus, settlementId: undefined });
  assert.ok(s.contractReceipt.settlementId);
  assert.equal(s.activeContract, null, 'expired on clear');
  assert.equal(s.contractMult, 1);
  tick(s, 1.6);
  // Under shopEvery 1 the intermission opens: the receipt is visible there for this wave only.
  assert.equal(s.status, 'choosing'); assert.equal(s.snapshot().contractReceipt.wave, 4);
  assert.equal(s.snapshot().selectedContract, null, 'the next contract defaults to Standard again');
});

test('A contract never expires mid-fight; dying voids it with no payout and no lasting penalty', () => {
  const s = intermission({ wave: 3 }); s.selectContract('overdraw'); depart(s);
  const e = s.spawnEnemy('drone', { x: 1400, y: 100 }); e.spawn = 1; e.speed = 0; e.hp = e.maxHp = 1e9;
  s.fightTime = 100; tick(s, 5);
  assert.ok(s.enrage > 0, 'the wave is dragging (enraged)');
  assert.ok(s.activeContract, 'still active however long the wave drags');
  const gold = s.gold;
  s.die();
  assert.equal(s.activeContract, null); assert.equal(s.gold, gold); assert.equal(s.contractReceipt, null);
  s.start();
  assert.equal(s.activeContract, null); assert.equal(s.selectedContract, null); assert.equal(s.contractReceipt, null);
  assert.equal(s.hazardDamage(10), 10 * 1.03);
});

test('Paused time does not advance a contracted wave; skipped-shop waves create no hidden contract menu', () => {
  const s = intermission({ wave: 3 }); s.selectContract('overdraw'); depart(s);
  s.status = 'paused'; tick(s, 3); s.status = 'running';
  assert.equal(s.fightTime, 0); assert.ok(s.activeContract);
  // Iron cadence: wave 6 rolls straight on from wave 5 without an intermission, so nothing can be signed for it.
  const t = intermission({ wave: 4, tuning: { shopEvery: 2 } }); t.selectContract('overdraw'); depart(t);
  assert.equal(t.wave, 5);
  clearWave(t); tick(t, 1.6);
  assert.equal(t.status, 'running'); assert.equal(t.wave, 6);
  assert.equal(t.contractOffer, null); assert.equal(t.selectedContract, null); assert.equal(t.activeContract, null);
  assert.equal(t.contractReceipt.wave, 5, 'the wave 5 receipt remains on record');
});

test('Snapshot exposes the offer with live numbers, the selection, the active deal and the receipt', () => {
  const s = intermission({ wave: 3, tuning: { overdrawMult: 1.5, overdrawGold: 25 } });
  let snap = s.snapshot();
  assert.deepEqual(snap.contractOffer, { id: 'overdraw', mult: 1.5, reward: 25, wave: 4 });
  assert.equal(snap.activeContract, null);
  s.selectContract('overdraw'); depart(s);
  snap = s.snapshot();
  assert.equal(snap.contractOffer, null); assert.equal(snap.activeContract.mult, 1.5); assert.equal(snap.activeContract.reward, 25);
});
