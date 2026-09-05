// Tuning knobs (src/game/tuning.ts): defaults must be a no-op, every knob must move what it says it moves,
// and the A/B presets must mean what design/PILLARS.md says they mean.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { DEFAULT_PRESET, DEFAULT_TUNING, TUNING_PRESETS, kiteMargins, matchPreset, normaliseTuning, presetById, rarityBag, scaleAugments } from '../src/game/tuning.ts';
import { RARITY_BAG, baseStats, computeStats } from '../src/game/upgrades.ts';
import { autopilotRun, baseSettings, manyRuns, median } from './harness.mjs';

const relic = (id, stacks = 1, rarity = 'silver') => ({ id, name: id, stacks, rarity, icon: '', tags: [] });

test('Default tuning is a no-op: same sheet, same bag, and it matches preset A', () => {
  const s = baseSettings();
  const relics = [relic('heavy', 2), relic('split', 1, 'gold'), relic('tempest', 1, 'prismatic')];
  assert.deepEqual(computeStats(s, relics, { damage: 1 }), computeStats(s, relics, { damage: 1 }, false, DEFAULT_TUNING));
  assert.deepEqual(rarityBag(DEFAULT_TUNING), RARITY_BAG);
  assert.equal(matchPreset(DEFAULT_TUNING)?.id, 'ledger');
  const sim = new Simulation(s);
  assert.deepEqual(sim.tuning, DEFAULT_TUNING);
});

test('Player tempo knobs scale the class profile for every class', () => {
  for (const hero of ['marksman', 'cannoneer', 'skirmisher']) {
    const s = baseSettings(hero);
    const sim = new Simulation(s);
    const before = { ...sim.stats };
    sim.setTuning({ playerMove: 0.85, playerAttackSpeed: 0.8, playerWindup: 1.25, playerRange: 0.85 });
    assert.ok(Math.abs(sim.stats.moveSpeed - before.moveSpeed * 0.85) < 1e-9, hero);
    assert.ok(Math.abs(sim.stats.attackSpeed - before.attackSpeed * 0.8) < 1e-9, hero);
    assert.ok(Math.abs(sim.stats.windup - before.windup * 1.25) < 1e-9, hero);
    assert.ok(Math.abs(sim.stats.range - before.range * 0.85) < 1e-9, hero);
    assert.equal(sim.stats.damage, before.damage, 'damage is not a tempo knob');
  }
});

test('Augment power scales what augments add, keeps mechanic flags on, rounds counts, and leaves shards alone', () => {
  const s = baseSettings();
  const relics = [relic('heavy', 2), relic('split', 1, 'gold'), relic('phase', 1, 'gold'), relic('tempest', 1, 'prismatic')];
  const full = computeStats(s, relics);
  assert.equal(full.damage, 34); assert.equal(full.projectiles, 2); assert.equal(full.dashCd, 3.8); assert.equal(full.tempest, 1);
  const half = computeStats(s, relics, {}, false, { ...DEFAULT_TUNING, augmentPower: 0.5 });
  assert.equal(half.damage, 27, 'half of +14');
  assert.equal(half.projectiles, 2, 'a +1 at half power is still +1');
  assert.ok(Math.abs(half.dashCd - 4.4) < 1e-9, 'half of -1.2');
  assert.equal(half.tempest, 1, 'flags are never scaled');
  const none = computeStats(s, relics, { damage: 2 }, false, { ...DEFAULT_TUNING, augmentPower: 0 });
  assert.equal(none.damage, 28, 'zero augment power, but two anvil shards still add 8');
  assert.equal(none.projectiles, 1);
  assert.deepEqual(scaleAugments(baseStats(s), full, 1), full);
});

test('Enemy knobs: speed, health, damage, shot speed and telegraph each move their own number', () => {
  const make = tuning => { const sim = new Simulation(baseSettings()); sim.setTuning(tuning); sim.status = 'running'; sim.settings.mode = 'run'; return sim; };
  const travelled = tuning => {
    const sim = make(tuning);
    const e = sim.spawnEnemy('drone', { x: 100, y: 520 });
    const x0 = e.x;
    for (let i = 0; i < 240; i++) sim.updateEnemy(e, 1 / 120);
    return e.x - x0;
  };
  const base = travelled(DEFAULT_TUNING), fast = travelled({ ...DEFAULT_TUNING, enemySpeed: 1.5 });
  assert.ok(fast / base > 1.45 && fast / base < 1.55, `speed ratio ${fast / base}`);

  const hp = tuning => { const sim = make(tuning); sim.wave = 5; return sim.spawnEnemy('drone', { x: 100, y: 100 }).maxHp; };
  assert.ok(Math.abs(hp({ ...DEFAULT_TUNING, enemyHp: 2 }) / hp(DEFAULT_TUNING) - 2) < 1e-9);

  const dmg = tuning => { const sim = make(tuning); sim.hurt(10); return sim.stats.maxHp - sim.hp; };
  assert.equal(dmg(DEFAULT_TUNING), 10);
  assert.equal(dmg({ ...DEFAULT_TUNING, enemyDamage: 1.3 }), 13);

  const shot = tuning => { const sim = make(tuning); sim.lineDanger({ x: 0, y: 0 }, 0, 500, 0.45, 9); sim.circleDanger({ x: 0, y: 0 }, 100, 0.7, 16); return sim.dangers; };
  const [l0, c0] = shot(DEFAULT_TUNING), [l1, c1] = shot({ ...DEFAULT_TUNING, projectileSpeed: 1.2, telegraph: 0.5 });
  assert.equal(l0.vx, 500); assert.ok(Math.abs(l1.vx - 600) < 1e-9);
  assert.equal(l0.delay, 0.45); assert.ok(Math.abs(l1.delay - 0.225) < 1e-9); assert.ok(Math.abs(l1.life - (0.225 + 3.8)) < 1e-9);
  assert.equal(c0.delay, 0.7); assert.ok(Math.abs(c1.delay - 0.35) < 1e-9);
});

test('Draft cadence: drafts every second wave halve the shops, and the hidden first Prismatic still lands', () => {
  const every = manyRuns(8, { target: 11, seed: 4242 });
  const sparse = manyRuns(8, { target: 11, seed: 4242, tuning: { shopEvery: 2 } });
  for (const r of every) assert.equal(r.shops, 10);
  for (const r of sparse) { assert.equal(r.shops, 5, `seed ${r.seed}: ${r.shops} shops`); assert.equal(r.wave, 11); }
  assert.ok(sparse.every(r => r.prismatics >= 1), 'the guarantee is pinned to the first shop on or after its wave');
  assert.ok(sparse.every(r => r.firstPrismaticWave % 2 === 0));
  // A Prismatic-free bag still yields exactly the guaranteed one.
  const dry = autopilotRun({ target: 11, seed: 99, tuning: { bagPrismatic: 0 } });
  assert.equal(dry.prismatics, 1);
  assert.equal(dry.offered.prismatic, 1);
});

test('Feel and pace knobs: bolt speed, text size, shove, freeze, particles, dash distance, spawn gap and wave size', () => {
  const make = tuning => { const sim = new Simulation(baseSettings()); sim.setTuning(tuning); sim.status = 'running'; return sim; };
  const target = sim => { const e = sim.spawnEnemy('drone', { x: sim.player.x + 200, y: sim.player.y }); e.spawn = 1; e.speed = 0; return e; };
  const a = make(DEFAULT_TUNING), b = make({ ...DEFAULT_TUNING, boltSpeed: 0.5, textSize: 1.5, knockback: 2, stagger: 3, particles: 0, dashDistance: 0.5, spawnPace: 2, waveBudget: 1.5 });
  const ea = target(a), eb = target(b);
  a.fireAt(ea, 10, false, 0, a.player); b.fireAt(eb, 10, false, 0, b.player);
  assert.equal(a.bolts[0].speed, 1000); assert.equal(b.bolts[0].speed, 500);
  a.effect(a.player, '#fff', '12', 18); b.effect(b.player, '#fff', '12', 18); b.effect(b.player, '#fff', undefined, 18);
  assert.equal(a.effects[0].size, 18); assert.equal(b.effects[0].size, 27); assert.equal(b.effects[1].size, 18, 'only text scales');
  a.knock(ea); b.knock(eb);
  assert.ok(Math.abs(eb.kx / ea.kx - 2) < 1e-9); assert.ok(Math.abs(eb.stagger / ea.stagger - 3) < 1e-9);
  const pa = a.particles.length; a.burst(a.player, '#fff', 10); assert.equal(a.particles.length, pa + 10);
  const pb = b.particles.length; b.burst(b.player, '#fff', 10); assert.equal(b.particles.length, pb, 'zero particles');
  assert.equal(a.budget(5), Math.round((3 + 5 * 2.2))); assert.equal(b.budget(5), Math.round((3 + 5 * 2.2) * 1.5));
  a.wave = 3; b.wave = 3;
  assert.ok(Math.abs(b.spawnGap() / a.spawnGap() - 2) < 1e-9);
  // Dash distance: same duration, half the ground.
  const run = sim => { sim.start(); sim.enemies = []; sim.spawnQueue = []; sim.waveState = 'fighting'; const x0 = sim.player.x; sim.dash({ x: sim.player.x + 500, y: sim.player.y }); for (let i = 0; i < 30; i++) sim.update(1 / 120); return sim.player.x - x0; };
  const da = run(make(DEFAULT_TUNING)), db = run(make({ ...DEFAULT_TUNING, dashDistance: 0.5 }));
  assert.ok(da > 150 && Math.abs(db / da - 0.5) < 0.05, `dash ${da.toFixed(0)} vs ${db.toFixed(0)}`);
});

test('Rarity bag composition follows the knobs and never comes back empty', () => {
  assert.deepEqual(rarityBag({ ...DEFAULT_TUNING, bagSilver: 2, bagGold: 1, bagPrismatic: 0 }), ['silver', 'silver', 'gold']);
  assert.deepEqual(rarityBag({ ...DEFAULT_TUNING, bagSilver: 0, bagGold: 0, bagPrismatic: 0 }), ['silver']);
  const sim = new Simulation(baseSettings()); sim.setTuning({ bagSilver: 1, bagGold: 1, bagPrismatic: 0 }); sim.start();
  const draws = new Set(); for (let i = 0; i < 40; i++) draws.add(sim.drawRarity());
  assert.deepEqual([...draws].sort(), ['gold', 'silver']);
});

test('Presets: Iron is exactly the feel Oscar chose after AB-001, and it is the shipped default', () => {
  assert.deepEqual(presetById('iron').tuning, {
    ...DEFAULT_TUNING,
    playerMove: 0.8, playerAttackSpeed: 0.65, playerWindup: 0.95, playerRange: 0.6,
    enemySpeed: 0.95, enemyHp: 1.2, enemyDamage: 1.3, projectileSpeed: 1.4, telegraph: 0.65,
    augmentPower: 0.75, shopEvery: 2, bagSilver: 22, bagGold: 7, bagPrismatic: 2,
  });
  assert.equal(DEFAULT_PRESET, 'iron');
  const b = presetById('iron').tuning;
  // Under Iron a walking Marksman still outpaces drones and bombers all game; only leeches close in, from wave 6.
  assert.ok(kiteMargins(b, 325, 12).drone > 0 && kiteMargins(b, 325, 12).bomber > 0);
  assert.ok(kiteMargins(b, 325, 4).leech > 0 && kiteMargins(b, 325, 6).leech < 0);
  assert.equal(matchPreset(b)?.id, 'iron');
  assert.equal(matchPreset({ ...b, enemySpeed: 1.21 }), null);
  assert.equal(TUNING_PRESETS.length, 3);
  // Easy sits between Ledger (all 1) and Iron on every continuous knob, drafts every wave, and keeps the 1-Prismatic bag.
  const a = presetById('ledger').tuning, c = presetById('easy').tuning;
  for (const k of ['playerMove', 'playerAttackSpeed', 'playerRange', 'enemyHp', 'enemyDamage', 'projectileSpeed', 'telegraph', 'augmentPower']) {
    const lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]);
    assert.ok(c[k] >= lo - 1e-9 && c[k] <= hi + 1e-9, `${k}: easy ${c[k]} outside [${lo}, ${hi}]`);
  }
  assert.equal(c.shopEvery, 1); assert.equal(c.bagPrismatic, 1);
  assert.equal(matchPreset(c)?.id, 'easy');
  // normalise: fills gaps, clamps to the slider ranges, ignores junk.
  const n = normaliseTuning({ enemySpeed: 9, playerMove: 'fast', shopEvery: 3 });
  assert.equal(n.enemySpeed, 1.8); assert.equal(n.playerMove, 1); assert.equal(n.shopEvery, 3); assert.equal(n.bagSilver, 13);
});

test('Presets: Iron is measurably deadlier to the stationary pilot than Ledger over waves 3 to 8, and a run still completes', () => {
  const dps = runs => median(runs.map(r => {
    let dmg = 0, secs = 0;
    for (let w = 3; w <= 8; w++) { dmg += r.damageByWave[w] ?? 0; secs += r.waveSeconds[w] ?? 0; }
    return dmg / Math.max(1, secs);
  }));
  const ra = manyRuns(10, { target: 9, seed: 31337 }), rb = manyRuns(10, { target: 9, seed: 31337, tuning: presetById('iron').tuning });
  const a = dps(ra), b = dps(rb);
  assert.ok(b > a * 1.2, `Iron ${b.toFixed(1)}/s vs Ledger ${a.toFixed(1)}/s`);
  for (const r of rb) { assert.equal(r.wave, 9); assert.equal(r.shops, 4, 'a draft every second wave'); }
});
