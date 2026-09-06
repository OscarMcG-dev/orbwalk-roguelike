import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { UPGRADES, computeStats, offerTier, SHARD_POOL } from '../src/game/upgrades.ts';
import { HEROES, isUnlocked, heroById } from '../src/game/heroes.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', attackSpeed: 1.5, windup: 22, moveSpeed: 325, range: 450, quick: false, showRange: true, sound: false, shake: true };
const setup = (patch = {}) => { const s = new Simulation({ ...settings, ...patch }); s.start(); return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const until = (s, pred, max = 60) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const relic = (id, stacks = 1) => { const u = UPGRADES.find(x => x.id === id); return { id, name: u.name, stacks, rarity: u.rarity, icon: u.icon, tags: u.tags }; };
const arenaWith = (kinds, patch = {}) => {
  const s = setup(patch); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  kinds.forEach((k, i) => { s.spawnEnemy(k); const e = s.enemies[i]; e.spawn = 1; e.speed = 0; e.x = 900 + i * 60; e.y = 520; });
  return s;
};

// ---------------------------------------------------------------- state cues

test('Dash coming off cooldown fires a ready pulse and event', () => {
  const s = setup(); s.dash({ x: 1200, y: 520 });
  assert.equal(s.dashCharges, 0); assert.equal(s.dashReadyEvent, 0);
  tick(s, 5.1);
  assert.equal(s.dashCharges, 1); assert.equal(s.dashReadyEvent, 1); assert.ok(s.dashReadyPulse > 0);
  tick(s, 0.8); assert.equal(s.dashReadyPulse, 0);
});

test('Attack-ready pulse fires once when the cooldown ends with no target queued', () => {
  const s = arenaWith(['drone']); const e = s.enemies[0]; e.hp = e.maxHp = 1e6;
  s.attack(e); until(s, () => s.fired === 1, 3); s.stop();
  assert.equal(s.attackReadyPulse, 0);
  until(s, () => s.cooldown === 0, 2);
  assert.ok(s.attackReadyPulse > 0);
});

test('Landing a hit bumps the impact timer; overkill kills are flagged', () => {
  const s = arenaWith(['drone']); const e = s.enemies[0]; e.hp = 1;
  s.damageEnemy(e, 200, false);
  assert.ok(s.impact > 0); assert.equal(e.dead, true);
  assert.ok(s.effects.some(f => f.text === 'OVERKILL'));
});

test('Warden spawns flash the arena edge and dodge streaks announce every fifth', () => {
  const s = setup(); s.wave = 3; s.enemies = []; s.spawnEnemy('warden');
  assert.ok(s.eliteFlash > 0);
  s.streak = 4;
  s.dangers.push({ x: 100, y: 100, vx: -9000, vy: 0, age: 0, delay: 0, life: 1, radius: 5, kind: 'line', hit: false, resolved: false, damage: 1, trail: [] });
  tick(s, 0.05);
  assert.equal(s.streak, 5); assert.ok(s.effects.some(f => f.text === 'STREAK 5'));
});

// ---------------------------------------------------------------- classes

test('Cannoneer is locked until its weapon is owned in the Armoury; Marksman is always open', () => {
  assert.equal(isUnlocked('marksman', { owned: [] }), true);
  assert.equal(isUnlocked('cannoneer', { owned: ['weapon.arbalest'] }), false);
  assert.equal(isUnlocked('cannoneer', { owned: ['weapon.cannoneer'] }), true);
  assert.equal(HEROES.length, 6);
});

test('Cannoneer stats layer over the base sheet and recoil-hops away from the cursor', () => {
  const c = heroById('cannoneer');
  const st = computeStats({ ...settings, hero: 'cannoneer', ...c.profile }, []);
  assert.equal(st.damage, 44); assert.equal(st.maxHp, 120); assert.equal(st.splash, 55); assert.equal(st.range, 560);
  const s = setup({ hero: 'cannoneer', ...c.profile }); const x = s.player.x;
  s.dash({ x: 1400, y: 520 }); tick(s, 0.2);
  assert.ok(s.player.x < x - 150, 'hopped away from a cursor to the right');
});

test('Cannoneer heat builds when firing without moving, lengthens windup, and vents after 40 units', () => {
  const c = heroById('cannoneer');
  const s = arenaWith(['drone'], { hero: 'cannoneer', ...c.profile }); const e = s.enemies[0]; e.hp = e.maxHp = 1e6; e.x = 900;
  s.attack(e);
  until(s, () => s.fired === 3, 12);
  assert.equal(s.heat, 2, 'first shot is cool, the next two add heat');
  const hot = s.effectiveWindup(); assert.ok(hot > s.stats.windup);
  s.move({ x: s.player.x - 60, y: 520 }); tick(s, 0.4);
  assert.equal(s.heat, 0); assert.equal(s.effectiveWindup(), s.stats.windup);
  assert.ok(s.effects.some(f => f.text === 'VENT'));
});

test('Cannon shells are heavy and always splash', () => {
  const c = heroById('cannoneer');
  const s = arenaWith(['drone', 'drone'], { hero: 'cannoneer', ...c.profile });
  s.enemies[1].x = s.enemies[0].x + 40;
  s.attack(s.enemies[0]); until(s, () => s.fired === 1, 3);
  assert.equal(s.bolts[0].heavy, true); assert.equal(s.bolts[0].splash, 55);
  tick(s, 0.6);
  assert.ok(s.enemies.every(e => e.hp < e.maxHp || e.dead), 'splash reached the neighbour');
});

// ---------------------------------------------------------------- arena-style upgrades

test('Draft tier follows the wave: prismatic only on 12 and 24, gold every 4th, mixed otherwise', () => {
  assert.equal(offerTier(1), 'mixed'); assert.equal(offerTier(3), 'mixed'); assert.equal(offerTier(4), 'gold'); assert.equal(offerTier(5), 'mixed');
  assert.equal(offerTier(10), 'mixed'); assert.equal(offerTier(12), 'prismatic'); assert.equal(offerTier(24), 'prismatic'); assert.equal(offerTier(8), 'gold');
  const s = setup(); s.wave = 12; s.openShop();
  assert.ok(s.offers.every(o => o.rarity === 'prismatic'));
  s.wave = 8; s.offers = s.rollOffers(); assert.ok(s.offers.every(o => o.rarity !== 'silver'));
});

test('Synergy weighting flags offers sharing a tag with owned augments', () => {
  const s = setup(); s.relics = [relic('keen')]; s.wave = 1;
  let flagged = 0;
  for (let i = 0; i < 20; i++) flagged += s.rollOffers().filter(o => o.synergy).length;
  assert.ok(flagged > 0);
  const off = s.rollOffers();
  for (const o of off) assert.equal(o.synergy, UPGRADES.find(u => u.id === o.id).tags.includes('crit'));
});

test('Pity: only after two dry shops in a row does the next draft guarantee a Gold-or-better', () => {
  const s = setup(); s.wave = 1; s.dryShops = 2;
  for (let i = 0; i < 30; i++) {
    s.rng.seed = 1000 + i;
    assert.ok(s.rollOffers().some(o => o.rarity !== 'silver'));
  }
  s.dryShops = 1; let allSilver = 0;
  for (let i = 0; i < 200; i++) { s.rng.seed = 5000 + i; s.rarityBag = []; if (s.rollOffers().every(o => o.rarity === 'silver')) allSilver++; }
  assert.ok(allSilver > 0, 'a single dry shop is not protected');
});

test('Rerolls: one free per run, then 4, 8, 16 gold within a shop; Warden waves grant nothing', () => {
  const s = setup(); s.status = 'choosing'; s.offers = s.rollOffers(); s.gold = 30;
  assert.equal(s.rerollsLeft, 1); assert.equal(s.rerollCost, 0);
  s.reroll(); assert.equal(s.rerollsLeft, 0); assert.equal(s.gold, 30); assert.equal(s.rerollCost, 4);
  s.reroll(); assert.equal(s.gold, 26); assert.equal(s.rerollCost, 8);
  s.reroll(); assert.equal(s.gold, 18); assert.equal(s.rerollCost, 16);
  s.reroll(); assert.equal(s.gold, 2); assert.equal(s.rerollCost, 32);
  s.reroll(); assert.equal(s.gold, 2, 'unaffordable reroll is a no-op');
  s.status = 'running'; s.wave = 3; s.waveState = 'fighting'; s.enemies = []; s.spawnQueue = []; tick(s, 0.05);
  assert.equal(s.rerollsLeft, 0, 'no Warden grant');
  s.wave = 4; s.openShop(); assert.equal(s.rerollCost, 4, 'price resets per shop but stays paid');
});

test('Stat Anvil: price climbs for the whole run, two shards a shop, applied permanently', () => {
  const s = setup(); s.wave = 1; s.openShop(); s.gold = 60;
  assert.equal(s.anvil.length, 3); assert.equal(s.anvilCost, 6); assert.equal(s.anvilLeft, 2);
  const first = s.anvil[0];
  s.buyShard(0);
  assert.equal(s.gold, 54); assert.equal(s.anvil.length, 2); assert.equal(s.anvilCost, 10); assert.equal(s.shards[first.key], 1);
  const before = computeStats(settings, []), after = computeStats(settings, [], s.shards);
  const def = SHARD_POOL.find(p => p.key === first.key);
  if (first.key === 'attackSpeed') assert.ok(Math.abs(after.attackSpeed - before.attackSpeed * 1.06) < 1e-9);
  else assert.ok(Math.abs(after[first.key] - before[first.key] - def.amount) < 1e-9);
  s.buyShard(0); assert.equal(s.anvilLeft, 0); assert.equal(s.gold, 44);
  s.buyShard(0); assert.equal(s.anvil.length, 1, 'third shard in one shop refused');
  s.wave = 2; s.openShop(); assert.equal(s.anvilCost, 14, 'no reset between shops'); assert.equal(s.anvilLeft, 2);
  s.gold = 1; s.buyShard(0); assert.equal(s.anvil.length, 3, 'cannot afford');
});

test('Heal is priced by wave, restores 35%, and is capped at one per shop', () => {
  const s = setup(); s.wave = 1; s.openShop(); s.gold = 40; s.hp = 40;
  assert.equal(s.healCost, 11);
  s.buyHeal(); assert.equal(s.gold, 29); assert.equal(s.hp, 75); assert.equal(s.healedThisShop, true);
  s.buyHeal(); assert.equal(s.gold, 29); assert.equal(s.hp, 75, 'second heal in the same shop refused');
  s.wave = 15; assert.ok(s.healCost >= 3 * 11);
});

test('Shop sinks: Fourth Offer draws a tier up, Banish removes an augment for the run, Ascend forces a Prismatic draft', () => {
  const s = setup(); s.wave = 2; s.openShop(); s.gold = 100;
  assert.equal(s.offers.length, 3); assert.equal(s.fourthCost, 14);
  s.buyFourth();
  assert.equal(s.offers.length, 4); assert.equal(s.gold, 86); assert.notEqual(s.offers[3].rarity, 'silver', 'fourth is Gold or better');
  let prismaticFourths = 0;
  for (let i = 0; i < 60; i++) { const t = setup(); t.wave = 4; t.openShop(); t.gold = 99; t.rng.seed = 900 + i; t.rarityBag = []; t.buyFourth(); if (t.offers[3]?.rarity === 'prismatic') prismaticFourths++; }
  assert.ok(prismaticFourths <= 12, `fourth offer on a Gold wave is not a cheap Prismatic (${prismaticFourths}/60)`);
  s.buyFourth(); assert.equal(s.gold, 86, 'only one fourth per shop');
  const victim = s.offers[0].id;
  s.toggleBanish(); assert.equal(s.banishMode, true);
  s.choose(0);
  assert.equal(s.status, 'choosing', 'banishing does not pick'); assert.equal(s.gold, 80); assert.ok(s.banished.has(victim)); assert.equal(s.banishMode, false);
  assert.ok(s.offers.every(o => o.id !== victim), 'slot redrawn');
  for (let i = 0; i < 20; i++) { s.rng.seed = 77 + i; assert.ok(s.rollOffers().every(o => o.id !== victim), 'banished for the run'); }
  assert.equal(s.ascendCost, 38);
  s.ascend(); assert.equal(s.gold, 42); assert.equal(s.ascendNext, true);
  s.ascend(); assert.equal(s.gold, 42, 'once per shop');
  s.choose(0); s.continueWave(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting'; tick(s, 1.6);
  assert.equal(s.status, 'choosing'); assert.equal(s.offerTier, 'prismatic'); assert.ok(s.offers.every(o => o.rarity === 'prismatic'));
  assert.equal(s.ascendNext, false);
});

test('Prismatics are capped at four per run and the first one is predetermined on a hidden wave', () => {
  const s = setup();
  assert.ok(s.firstPrismaticWave >= 4 && s.firstPrismaticWave <= 9);
  s.wave = s.firstPrismaticWave;
  for (let i = 0; i < 20; i++) { s.rng.seed = 300 + i; s.rarityBag = []; assert.equal(s.rollOffers().filter(o => o.rarity === 'prismatic').length >= 1, true); }
  s.relics = ['tempest', 'momentum', 'exec', 'twin'].map(id => relic(id));
  s.wave = 12; s.openShop();
  assert.ok(s.offers.every(o => o.rarity === 'gold'), 'a Prismatic draft resolves as Gold once four are held');
});

test('Tempest chains lightning through nearby enemies on every third attack', () => {
  const s = arenaWith(['drone', 'drone', 'drone']); s.relics = [relic('tempest')]; s.recomputeStats();
  for (const e of s.enemies) e.hp = e.maxHp = 1e6;
  s.attack(s.enemies[0]); until(s, () => s.fired === 3, 6);
  assert.equal(s.beams.length, 1); assert.equal(s.beams[0].points.length, 4);
  assert.ok(s.enemies.every(e => e.hp < e.maxHp));
});

test('Momentum stacks build with movement and bleed when standing still', () => {
  const s = setup(); s.relics = [relic('momentum')]; s.recomputeStats();
  s.move({ x: 1300, y: 520 }); tick(s, 1.5);
  assert.ok(s.momentum >= 10); const as = s.effectiveAttackSpeed(); assert.ok(as > s.stats.attackSpeed);
  s.stop(); tick(s, 2.5);
  assert.ok(s.momentum < 10);
});

test('Executioner finishes low non-elite enemies; Slow Cooker burns over time', () => {
  const s = arenaWith(['drone', 'warden']); s.relics = [relic('exec'), relic('cooker')]; s.recomputeStats();
  const d = s.enemies[0], w = s.enemies[1];
  d.hp = d.maxHp * 0.1; s.damageEnemy(d, 1, false);
  assert.equal(d.dead, true); assert.ok(s.effects.some(f => f.text === 'EXECUTED'));
  w.hp = w.maxHp * 0.1; const hp = w.hp; s.damageEnemy(w, 1, false);
  assert.equal(w.dead, false, 'elites are immune'); assert.equal(w.burn, 1);
  tick(s, 1); assert.ok(w.hp < hp - 1 - 3, 'burn ticked for roughly 4 per second');
});

test('Twin Step grants two charges with a slower recharge; Vow completes after 25 kills', () => {
  const s = setup(); s.status = 'choosing';
  s.offers = [{ id: 'twin', name: 'Twin Step', blurb: '', rarity: 'prismatic', icon: '', stacks: 0, max: 1, synergy: false }];
  s.choose(0); s.continueWave();
  assert.equal(s.stats.dashCharges, 2); assert.equal(s.dashCharges, 2); assert.equal(s.stats.dashCd, 6);
  s.dash({ x: 1200, y: 520 }); tick(s, 0.2); s.dash({ x: 1200, y: 520 });
  assert.equal(s.dashCharges, 0);
  s.relics.push(relic('vow')); s.recomputeStats(); const dmg = s.stats.damage;
  s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  for (let i = 0; i < 25; i++) { s.spawnEnemy('drone'); s.kill(s.enemies[s.enemies.length - 1]); }
  assert.equal(s.questDone, true); assert.equal(s.questEvent, 1);
  assert.ok(Math.abs(s.stats.damage - dmg * 1.3) < 1e-9); assert.equal(s.stats.projectiles, 2);
});

test('Enemy marble bag never streaks one kind when the pool is mixed', () => {
  const s = setup(); s.beginWave(4);
  const kinds = s.spawnQueue.filter(k => k !== 'warden');
  let longest = 1, run = 1;
  for (let i = 1; i < kinds.length; i++) { run = kinds[i] === kinds[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
  assert.ok(longest <= 4, `longest streak ${longest}`);
  assert.ok(new Set(kinds).size >= 2);
});
