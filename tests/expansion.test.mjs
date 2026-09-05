// Enemy pool expansion (Leech, Splitter, Bulwark, Miner, Hexer, champion affixes) and the
// deepened augment ecosystem (combo prerequisites, class augments, trade-off prismatics, quest kinds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_COST, Simulation } from '../src/game/sim.ts';
import { UPGRADES, activeQuest, computeStats, eligible } from '../src/game/upgrades.ts';
import { heroById } from '../src/game/heroes.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', attackSpeed: 1.5, windup: 22, moveSpeed: 325, range: 450, quick: false, showRange: true, sound: false, shake: true };
const setup = (patch = {}) => { const s = new Simulation({ ...settings, ...patch }); s.start(); return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const until = (s, pred, max = 60) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const relic = (id, stacks = 1) => { const u = UPGRADES.find(x => x.id === id); return { id, name: u.name, stacks, rarity: u.rarity, icon: u.icon, tags: u.tags }; };
const equip = (s, ...ids) => { s.relics = ids.map(id => relic(id)); s.recomputeStats(); };
/** Enemies parked in a row to the right of the player, frozen in place, fully spawned. */
const arenaWith = (kinds, patch = {}) => {
  const s = setup(patch); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  kinds.forEach((k, i) => { s.spawnEnemy(k); const e = s.enemies[i]; e.spawn = 1; e.speed = 0; e.x = 900 + i * 60; e.y = 520; });
  return s;
};
const teleport = (s, p) => { s.player = { ...p }; s.previous = { ...p }; };

// ---------------------------------------------------------------- wave composition

test('New kinds enter the pool by wave and the budget respects per-kind costs', () => {
  const s = setup();
  assert.deepEqual(new Set(s.wavePool(1)), new Set(['drone']));
  assert.ok(s.wavePool(4).includes('leech') && s.wavePool(4).includes('splitter'));
  assert.ok(!s.wavePool(5).includes('bulwark') && s.wavePool(6).includes('bulwark'));
  assert.ok(s.wavePool(7).includes('miner') && !s.wavePool(7).includes('hexer') && s.wavePool(8).includes('hexer'));
  for (const n of [4, 7, 9, 12]) {
    s.beginWave(n);
    const spent = s.spawnQueue.reduce((sum, k) => sum + KIND_COST[k], 0);
    assert.ok(spent <= s.budget(n), `wave ${n} spent ${spent} of ${s.budget(n)}`);
    assert.ok(spent >= s.budget(n) - 2, 'budget is spent, not hoarded');
  }
  assert.equal(s.affixChance(3), 0); assert.ok(s.affixChance(4) > 0); assert.ok(s.affixChance(30) <= 0.3);
  // Debut rule: the introducing wave always carries the new kind.
  s.beginWave(4); assert.ok(s.spawnQueue.includes('leech') && s.spawnQueue.includes('splitter'));
  s.beginWave(6); assert.ok(s.spawnQueue.includes('bulwark') && s.spawnQueue[0] === 'warden');
  s.beginWave(7); assert.ok(s.spawnQueue.includes('miner'));
  s.beginWave(8); assert.ok(s.spawnQueue.includes('hexer'));
});

// ---------------------------------------------------------------- new enemies

test('Leech latches on contact, drains HP, drags move speed, and a dash shakes it off', () => {
  const s = arenaWith(['leech']); const e = s.enemies[0]; e.x = s.player.x + 20;
  tick(s, 1 / 120);
  assert.equal(e.latched, true); assert.ok(s.effects.some(f => f.text === 'LATCHED'));
  assert.equal(s.hits, 0, 'a drain is not a skill-shot hit');
  tick(s, 1);
  assert.ok(s.hp < 100 && s.hp > 90, `drained to ${s.hp}`);
  assert.equal(s.latched, 1); assert.ok(s.effectiveMoveSpeed() < s.stats.moveSpeed);
  assert.ok(Math.hypot(e.x - s.player.x, e.y - s.player.y) < 20, 'rides on the player');
  assert.ok(s.effects.some(f => f.text?.startsWith('-')), 'drain prints a number');
  s.dash({ x: 1400, y: 520 }); tick(s, 1 / 120);
  assert.equal(e.latched, false); assert.ok(e.cooldown > 0, 'stunned'); assert.ok(s.effects.some(f => f.text === 'SHAKEN OFF'));
  tick(s, 0.3); assert.equal(s.latched, 0); assert.equal(s.effectiveMoveSpeed(), s.stats.moveSpeed);
});

test('Bulwark blocks bolts inside its planted shield arc; flank shots and advancing beats are open', () => {
  const s = arenaWith(['bulwark']); const e = s.enemies[0];
  e.pattern = 1; e.arming = 30; e.facing = Math.atan2(s.player.y - e.y, s.player.x - e.x);
  assert.equal(s.blocks(e, { origin: { x: 650, y: 520 } }), true, 'head-on is blocked');
  assert.equal(s.blocks(e, { origin: { x: 900, y: 200 } }), false, 'ninety degrees off is open');
  s.attack(e); until(s, () => s.fired === 1, 3); tick(s, 0.4);
  assert.equal(e.hp, e.maxHp); assert.equal(s.blockEvent, 1); assert.ok(s.effects.some(f => f.text === 'BLOCKED'));
  teleport(s, { x: 900, y: 200 }); s.attack(e); until(s, () => s.fired === 2, 3); tick(s, 0.4);
  assert.ok(e.hp < e.maxHp, 'flank shot lands');
  const hp = e.hp; e.pattern = 0; teleport(s, { x: 650, y: 520 }); s.attack(e); until(s, () => s.fired === 3, 3); tick(s, 0.4);
  assert.ok(e.hp < hp, 'advancing Bulwark is open from the front');
  s.damageEnemy(e, 10, false); assert.ok(e.hp < hp - 10 - 5, 'area damage (splash, Tempest) ignores the shield');
});

test('Bulwark alternates planting and advancing, re-freezing its facing each plant', () => {
  const s = arenaWith(['bulwark']); const e = s.enemies[0]; e.speed = 150;
  assert.equal(e.pattern, 0);
  until(s, () => e.pattern === 1, 3); assert.ok(Math.abs(e.facing - Math.PI) < 0.05, 'faces the player on planting');
  const x = e.x; tick(s, 1); assert.equal(e.x, x, 'planted Bulwarks do not move');
  until(s, () => e.pattern === 0, 3); tick(s, 0.5); assert.ok(e.x < x, 'then it advances');
});

test('Splitter divides twice on death and the wave does not clear until every fragment is down', () => {
  const s = arenaWith(['splitter']); const e = s.enemies[0];
  s.kill(e); tick(s, 0.05);
  const kids = s.enemies.filter(x => x.kind === 'splitter' && !x.dead);
  assert.equal(kids.length, 2); assert.ok(kids.every(k => k.generation === 1 && k.radius < e.radius && k.maxHp < e.maxHp));
  assert.equal(s.waveState, 'fighting', 'children keep the wave alive');
  for (const k of kids) s.kill(k);
  const grand = s.enemies.filter(x => x.kind === 'splitter' && !x.dead);
  assert.equal(grand.length, 4); assert.ok(grand.every(k => k.generation === 2));
  for (const k of grand) s.kill(k);
  assert.equal(s.enemies.filter(x => !x.dead).length, 0, 'generation 2 does not split');
  tick(s, 0.05); assert.equal(s.waveState, 'clear');
});

test('Miner lays mines that arm, then detonate when stepped on; the arena caps live mines', () => {
  const s = arenaWith(['miner']); const m = s.enemies[0]; m.cooldown = 0.01;
  tick(s, 0.1);
  const mine = s.dangers.find(d => d.kind === 'mine'); assert.ok(mine);
  teleport(s, { x: mine.x, y: mine.y }); tick(s, 0.2);
  assert.equal(s.hits, 0, 'harmless while arming');
  teleport(s, { x: 300, y: 520 }); tick(s, 1);
  teleport(s, { x: mine.x, y: mine.y }); tick(s, 1 / 120);
  assert.equal(s.hits, 1); assert.equal(mine.resolved, true); assert.ok(s.hp < 100);
  tick(s, 0.5); assert.ok(!s.dangers.includes(mine), 'spent mine is removed');
  for (let i = 0; i < 7; i++) s.mineDanger({ x: 100 + i * 50, y: 100 });
  assert.equal(s.mines, 7); m.cooldown = 0.01; tick(s, 0.1); assert.equal(s.mines, 7, 'cap holds');
  s.dangers.push({ x: 200, y: 200, vx: 0, vy: 0, delay: 0, age: 0, life: 0.01, radius: 46, kind: 'mine', hit: false, resolved: false, damage: 1, trail: [] });
  const dodged = s.dodged; tick(s, 0.05); assert.equal(s.dodged, dodged, 'an expired mine is not a dodge');
});

test('Hexer casts a miasma that drifts after the player and drains inside; killing the Hexer dispels it', () => {
  const s = arenaWith(['hexer']); const h = s.enemies[0]; h.cooldown = 0.01;
  tick(s, 0.1);
  const cloud = s.dangers.find(d => d.kind === 'cloud'); assert.ok(cloud); assert.equal(cloud.owner, h.id);
  tick(s, 1);
  const before = Math.hypot(cloud.x - s.player.x, cloud.y - s.player.y); tick(s, 0.5);
  assert.ok(Math.hypot(cloud.x - s.player.x, cloud.y - s.player.y) < before, 'homes on the player');
  teleport(s, { x: cloud.x, y: cloud.y }); tick(s, 0.5);
  assert.ok(s.hp < 100 && s.hp > 88, `miasma drained to ${s.hp}`); assert.equal(s.hits, 0);
  h.cooldown = 0.01; tick(s, 0.1); h.cooldown = 0.01; tick(s, 0.1); h.cooldown = 0.01; tick(s, 0.1);
  assert.equal(s.clouds, 3, 'cloud cap');
  s.kill(h); assert.equal(s.clouds, 0, 'dispelled');
});

// ---------------------------------------------------------------- champion affixes

test('Affixes: Swift is faster, Volatile detonates, Warded pulses immunity, Gilded flees and escapes', () => {
  const s = arenaWith(['drone', 'drone', 'drone', 'drone']);
  const [swift, volatile, warded, gilded] = s.enemies;
  for (const e of s.enemies) e.speed = 100;
  s.applyAffix(swift, 'swift'); assert.ok(Math.abs(swift.speed - 140) < 1e-9); assert.equal(swift.gold, 2);
  assert.equal(s.championEvent, 1); assert.ok(s.eliteFlash > 0);
  s.applyAffix(volatile, 'volatile'); s.kill(volatile);
  assert.ok(s.dangers.some(d => d.kind === 'circle' && Math.abs(d.x - volatile.x) < 1), 'death burst');
  s.applyAffix(warded, 'warded'); warded.speed = 0; tick(s, 2.6);
  assert.equal(warded.invulnerable, true);
  const hp = warded.hp; s.damageEnemy(warded, 50, false);
  assert.equal(warded.hp, hp); assert.ok(s.effects.some(f => f.text === 'WARDED'));
  tick(s, 1.4); assert.equal(warded.invulnerable, false);
  s.applyAffix(gilded, 'gilded'); assert.equal(gilded.gold, 3); assert.equal(gilded.life, 14);
  const x = gilded.x; tick(s, 1); assert.ok(gilded.x > x + 50, 'runs away from the player');
  gilded.life = 0.05; const kills = s.kills; tick(s, 0.1);
  assert.equal(gilded.dead, true); assert.equal(s.kills, kills, 'an escape is not a kill'); assert.ok(s.effects.some(f => f.text === 'ESCAPED'));
  assert.equal(s.orbs.filter(o => o.value >= 3).length, 0, 'no bounty paid');
});

test('Killing a Gilded champion pays the bounty as several orbs, never more than its value', () => {
  const s = arenaWith(['drone']); const e = s.enemies[0]; s.applyAffix(e, 'gilded');
  s.kill(e); assert.equal(s.orbs.length, 3); assert.equal(s.orbs.reduce((n, o) => n + o.value, 0), 3);
  const t = arenaWith(['bulwark']); const b = t.enemies[0]; t.applyAffix(b, 'gilded');
  t.kill(b); assert.equal(t.orbs.length, 4); assert.equal(t.orbs.reduce((n, o) => n + o.value, 0), 12);
});

// ---------------------------------------------------------------- draft ecosystem

test('Combo augments are gated on prerequisites, class augments on the hero, and quests to one per run', () => {
  const none = [], frost = [relic('frost')], vow = [relic('vow')];
  const u = id => UPGRADES.find(x => x.id === id);
  assert.equal(eligible(u('frostbite'), none, 'marksman'), false);
  assert.equal(eligible(u('frostbite'), frost, 'marksman'), true);
  assert.equal(eligible(u('overflow'), [relic('wind')], 'marksman'), true, 'any one prerequisite suffices');
  assert.equal(eligible(u('overclock'), none, 'marksman'), false); assert.equal(eligible(u('overclock'), none, 'cannoneer'), true);
  assert.equal(eligible(u('quickdraw'), none, 'cannoneer'), false);
  assert.equal(eligible(u('oath'), vow, 'marksman'), false); assert.equal(eligible(u('oath'), none, 'marksman'), true);
  assert.equal(activeQuest(vow).id, 'vow'); assert.equal(activeQuest(none), null);
  const s = setup(); s.wave = 1;
  const gated = new Set(UPGRADES.filter(x => x.requires || x.heroOnly === 'cannoneer').map(x => x.id));
  for (let i = 0; i < 40; i++) { s.rng.seed = 500 + i; for (const o of s.rollOffers()) assert.ok(!gated.has(o.id), `${o.id} leaked into a bare draft`); }
  s.relics = frost; let seen = 0;
  for (let i = 0; i < 40; i++) { s.rng.seed = 900 + i; const o = s.rollOffers().find(x => x.id === 'frostbite'); if (o) { seen++; assert.equal(o.unlockedBy, 'Frost Tips'); } }
  assert.ok(seen > 0, 'Frostbite shows up once Frost Tips is owned');
  const c = setup({ hero: 'cannoneer', ...heroById('cannoneer').profile }); c.wave = 3; let oc = 0;
  for (let i = 0; i < 40; i++) { c.rng.seed = 42 + i; const off = c.rollOffers(); assert.ok(off.every(o => o.id !== 'quickdraw')); if (off.some(o => o.id === 'overclock')) oc++; }
  assert.ok(oc > 0, 'Cannoneer sees Overclock in a Gold draft');
});

test('Drafts favour tag diversity: three offers rarely share one lane', () => {
  const s = setup(); s.wave = 1; let mono = 0;
  for (let i = 0; i < 60; i++) {
    s.rng.seed = 2000 + i;
    const off = s.rollOffers().map(o => UPGRADES.find(u => u.id === o.id).tags);
    const shared = off[0].some(t => off[1].includes(t) && off[2].includes(t));
    if (shared) mono++;
  }
  assert.ok(mono <= 6, `${mono} of 60 drafts were single-lane`);
});

test('Every augment applies cleanly and all stats stay finite', () => {
  const st = computeStats(settings, UPGRADES.map(u => relic(u.id, u.max)), {}, true);
  for (const [k, v] of Object.entries(st)) assert.ok(Number.isFinite(v), `${k} is ${v}`);
  assert.ok(st.attackSpeed <= 3);
  const fleet = computeStats(settings, [relic('fleet', 2)]);
  assert.ok(Math.abs(fleet.moveSpeed - 325 * 1.04 * 1.04) < 1e-9);
});

// ---------------------------------------------------------------- combat augments

test('Shatter Point marks crit targets to take 20% more; Frostbite punishes slowed enemies and doubles crit odds', () => {
  const s = arenaWith(['drone']); const e = s.enemies[0]; e.hp = e.maxHp = 1000;
  equip(s, 'brittle');
  s.damageEnemy(e, 10, true); assert.equal(e.shred, 3);
  const hp = e.hp; s.damageEnemy(e, 10, false); assert.equal(hp - e.hp, 12);
  tick(s, 3.1); assert.equal(e.shred, 0);
  equip(s, 'frost', 'frostbite'); e.slow = 0;
  const h2 = e.hp; s.damageEnemy(e, 10, false); assert.equal(h2 - e.hp, 10, 'first hit applies the slow, no bonus yet'); assert.ok(e.slow > 0);
  const h3 = e.hp; s.damageEnemy(e, 10, false); assert.equal(h3 - e.hp, 13);
  s.stats.critChance = 0.5;
  for (let i = 0; i < 12; i++) assert.equal(s.rollDamage(e).crit, true, 'doubled to certainty against a slowed target');
});

test('Wildfire spreads a burning corpse to neighbours; Thunderhead doubles Tempest cadence and lengthens the chain', () => {
  const s = arenaWith(['drone', 'drone', 'drone']); equip(s, 'cooker', 'wildfire');
  const [a, b, c] = s.enemies; c.x = 1400; a.burn = 2; a.burnTime = 1;
  s.kill(a);
  assert.equal(b.burn, 2); assert.equal(b.burnTime, 3); assert.equal(c.burn, 0, 'out of range');
  const t = arenaWith(['drone', 'drone', 'drone', 'drone', 'drone']); equip(t, 'tempest', 'thunderhead');
  for (const e of t.enemies) e.hp = e.maxHp = 1e6;
  t.attack(t.enemies[0]); until(t, () => t.fired === 2, 6);
  assert.equal(t.beams.length, 1, 'strikes on the second attack'); assert.equal(t.beams[0].points.length, 6, 'player plus five enemies');
});

test('Kinetic Rounds, Last Stand and Hunter’s Focus feed the damage multiplier', () => {
  const s = setup(); equip(s, 'momentum', 'kinetic'); s.momentum = 20;
  assert.ok(Math.abs(s.damageMultiplier() - 1.3) < 1e-9);
  equip(s, 'berserk'); s.hp = 25;
  assert.ok(Math.abs(s.damageMultiplier() - 1.3) < 1e-9); s.hp = 60; assert.equal(s.damageMultiplier(), 1);
  const f = arenaWith(['drone', 'drone']); equip(f, 'focus');
  for (const e of f.enemies) e.hp = e.maxHp = 1e6;
  f.attack(f.enemies[0]); until(f, () => f.fired === 3, 6);
  assert.equal(f.focusStacks, 2); assert.ok(Math.abs(f.damageMultiplier() - 1.16) < 1e-9);
  f.attack(f.enemies[1]); until(f, () => f.fired === 4, 6);
  assert.equal(f.focusStacks, 0, 'switching targets resets');
  assert.equal(f.snapshot().focus, 0);
});

test('Overflow turns overheal into a shield that soaks hazards first', () => {
  const s = arenaWith(['drone']); const e = s.enemies[0]; e.hp = e.maxHp = 1e6;
  equip(s, 'vamp', 'overflow'); s.hp = s.stats.maxHp;
  s.damageEnemy(e, 1, false); assert.equal(s.shield, 2);
  for (let i = 0; i < 30; i++) s.damageEnemy(e, 1, false);
  assert.equal(s.shield, 40, 'capped');
  s.dangers.push({ x: s.player.x, y: s.player.y, vx: 0, vy: 0, age: 0, delay: 0, life: .3, radius: 60, kind: 'circle', hit: false, resolved: false, damage: 20, trail: [] });
  tick(s, 1 / 120);
  assert.equal(s.hp, s.stats.maxHp); assert.equal(s.shield, 40 - Math.round(20 * 1.03)); assert.ok(s.effects.some(f => f.text === 'ABSORBED'));
  assert.equal(s.snapshot().shield, s.shield);
});

test('Quickdraw skips the windup on a fresh target only', () => {
  const s = arenaWith(['drone', 'drone']); equip(s, 'quickdraw');
  for (const e of s.enemies) e.hp = e.maxHp = 1e6;
  s.attack(s.enemies[0]); tick(s, 2 / 120);
  assert.equal(s.fired, 1, 'fired within two ticks'); assert.ok(s.effects.some(f => f.text === 'QUICKDRAW'));
  until(s, () => s.windupLeft > 0, 2);
  assert.ok(s.windupTotal > 0.1, 'second bolt at the same target winds up normally');
});

test('Overclock: the Cannoneer’s max-heat shell loses the windup drag, hits for +75% and vents', () => {
  const c = heroById('cannoneer');
  const s = arenaWith(['drone'], { hero: 'cannoneer', ...c.profile }); const e = s.enemies[0]; e.hp = e.maxHp = 1e6;
  equip(s, 'overclock'); s.stats.critChance = 0;
  s.attack(e); until(s, () => s.fired === 5, 15);
  assert.equal(s.heat, 4); assert.equal(s.effectiveWindup(), s.stats.windup, 'no drag at max heat'); assert.ok(s.effects.some(f => f.text === 'PRIMED'));
  until(s, () => s.fired === 6, 4);
  assert.equal(s.heat, 0); assert.ok(s.effects.some(f => f.text === 'OVERCLOCK'));
  const shell = s.bolts[s.bolts.length - 1];
  assert.equal(shell.damage, Math.round(Math.round(s.stats.damage) * 1.75));
});

// ---------------------------------------------------------------- quests and gold

test('Dodger’s Oath counts dodges and Marksman’s Wager counts crits; each pays its reward', () => {
  const s = setup(); equip(s, 'oath');
  assert.equal(s.snapshot().questNeed, 40);
  for (let i = 0; i < 40; i++) {
    s.dangers.push({ x: 100, y: 100, vx: -9000, vy: 0, age: 0, delay: 0, life: 1, radius: 5, kind: 'line', hit: false, resolved: false, damage: 1, trail: [] });
    tick(s, 0.05);
  }
  assert.equal(s.questDone, true); assert.equal(s.stats.dashCharges, 2); assert.equal(s.dashCharges, 2); assert.equal(s.stats.armor, 4);
  const w = arenaWith(['drone']); equip(w, 'wager'); const e = w.enemies[0]; e.hp = e.maxHp = 1e6;
  for (let i = 0; i < 29; i++) w.damageEnemy(e, 1, true);
  assert.equal(w.questProgress, 29); assert.equal(w.questDone, false);
  w.damageEnemy(e, 1, false); assert.equal(w.questProgress, 29, 'non-crits do not count');
  w.damageEnemy(e, 1, true); assert.equal(w.questDone, true); assert.equal(w.stats.critMult, 2.5);
  w.kill(e); assert.equal(w.questProgress, 30, 'kills never advance a crit quest');
});

test('Coin Pouch adds flat gold per kill', () => {
  const s = arenaWith(['drone']); equip(s, 'pouch');
  s.kill(s.enemies[0]); assert.equal(s.orbs.reduce((n, o) => n + o.value, 0), 2);
});

// ---------------------------------------------------------------- integration

test('Godmode autopilot survives to wave 10 with every new enemy type in play', () => {
  const s = setup({ difficulty: 'easy' });
  const seen = new Set(); let elapsed = 0, planted = false;
  while (s.wave < 10 && elapsed < 900) {
    s.hp = 1e9; s.shield = 0;
    if (s.status === 'choosing') s.choose(0);
    else if (s.status === 'running') {
      for (const e of s.enemies) if (!e.dead) { seen.add(e.kind); if (e.kind === 'bulwark' && e.pattern === 1) planted = true; }
      // Prefer whatever is shootable right now: not a planted Bulwark facing us.
      const t = s.targetable().sort((a, b) => (s.blocks(a, { origin: s.player }) ? 1 : 0) - (s.blocks(b, { origin: s.player }) ? 1 : 0))[0];
      if (t && (!s.target || s.target.id !== t.id)) s.attack(t);
      if (s.latched && s.dashCharges > 0) s.dash({ x: s.player.x + 200, y: s.player.y });
      s.update(1 / 120); elapsed += 1 / 120;
    } else break;
  }
  assert.ok(s.wave >= 10, `reached wave ${s.wave}`);
  for (const k of ['leech', 'splitter', 'bulwark', 'miner', 'hexer']) assert.ok(seen.has(k), `never met a ${k}`);
  assert.ok(planted, 'a Bulwark planted its shield during the run');
  assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.hp) && s.gold >= 0);
  assert.ok(s.enemies.every(e => Number.isFinite(e.x) && Number.isFinite(e.hp)));
  assert.ok(s.dangers.length <= 60 && s.particles.length <= 720);
});
