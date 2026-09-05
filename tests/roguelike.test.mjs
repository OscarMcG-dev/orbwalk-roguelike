import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { UPGRADES, computeStats, baseStats } from '../src/game/upgrades.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', attackSpeed: 1.5, windup: 22, moveSpeed: 325, range: 550, quick: false, showRange: true, sound: false, shake: true };
const setup = (patch = {}) => { const s = new Simulation({ ...settings, ...patch }); s.start(); return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
/** Advance until the predicate holds or the time budget runs out. */
const until = (s, pred, max = 60) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const killAll = s => { for (const e of s.enemies) if (!e.dead) s.kill(e); s.spawnQueue = []; };

test('A run opens with a wave banner, then spawns enemies from the edges', () => {
  const s = setup();
  assert.equal(s.wave, 1); assert.equal(s.waveState, 'banner'); assert.equal(s.enemies.length, 0);
  tick(s, 1.5);
  assert.ok(s.enemies.length > 0); assert.ok(s.enemies.every(e => e.kind === 'drone'));
  assert.ok(s.enemies.every(e => Math.hypot(e.x - 650, e.y - 520) > 300));
});

test('Spawning enemies are inert and untargetable until the portal finishes', () => {
  const s = setup(); tick(s, 1.5);
  assert.equal(s.targetable().length, 0);
  s.attack(s.enemies[0]); assert.equal(s.target, null);
  tick(s, 0.8);
  assert.ok(s.targetable().length > 0);
});

test('Bolts damage enemies, kills award gold orbs that the player collects', () => {
  const s = setup(); tick(s, 2.4);
  const e = s.targetable()[0]; const hp = e.hp;
  s.attack(e); until(s, () => s.fired >= 1, 5); until(s, () => e.hp < hp || e.dead, 2);
  assert.ok(e.hp < hp || e.dead); assert.ok(s.damageDealt > 0);
  s.kill(e);
  assert.ok(s.orbs.length > 0);
  s.player = { ...s.orbs[0] }; s.previous = { ...s.player }; s.stop(); tick(s, 0.05);
  assert.ok(s.gold > 0); assert.ok(s.pickupEvent >= 1);
});

test('Clearing a wave pays a bonus, opens the upgrade shop, and choosing starts the next wave', () => {
  const s = setup(); tick(s, 1.5); killAll(s); tick(s, 0.05);
  assert.equal(s.waveState, 'clear'); assert.equal(s.gold, 4);
  tick(s, 1.6);
  assert.equal(s.status, 'choosing'); assert.equal(s.offers.length, 3);
  assert.equal(new Set(s.offers.map(o => o.id)).size, 3);
  const name = s.offers[0].name; s.choose(0);
  assert.equal(s.status, 'choosing', 'claiming does not depart'); assert.equal(s.draftClaimed, true);
  s.continueWave();
  assert.equal(s.status, 'running'); assert.equal(s.wave, 2); assert.equal(s.relics[0].name, name); assert.equal(s.relics[0].stacks, 1);
});

test('Upgrades change derived stats and respect stack caps', () => {
  const base = baseStats(settings);
  const rapid = computeStats(settings, [{ id: 'rapid', name: 'Rapid Fire', stacks: 2, rarity: 'silver', icon: '', tags: [] }]);
  assert.ok(Math.abs(rapid.attackSpeed - base.attackSpeed * 1.12 * 1.12) < 1e-9);
  const iron = computeStats(settings, [{ id: 'iron', name: 'Iron Skin', stacks: 1, rarity: 'silver', icon: '', tags: [] }]);
  assert.equal(iron.maxHp, 125); assert.equal(iron.armor, 2);
  const s = setup(); s.status = 'choosing';
  s.relics = [{ id: 'frost', name: 'Frost Tips', stacks: 1, rarity: 'gold', icon: '', tags: [] }];
  assert.ok(s.rollOffers().every(o => o.id !== 'frost'), 'capped upgrades are never offered again');
  for (const u of UPGRADES) assert.ok(u.max >= 1 && typeof u.apply === 'function');
});

test('Choosing Iron Skin raises current HP alongside max HP', () => {
  const s = setup(); s.hp = 60; s.status = 'choosing';
  s.offers = [{ id: 'iron', name: 'Iron Skin', blurb: '', rarity: 'silver', icon: '', stacks: 0, max: 4, synergy: false }];
  s.choose(0);
  assert.equal(s.stats.maxHp, 125); assert.equal(s.hp, 85);
});

test('Heal costs gold and refuses when unaffordable or at full health', () => {
  const s = setup(); s.status = 'choosing'; s.offers = s.rollOffers(); s.gold = 20;
  s.hp = 50; s.buyHeal(); assert.equal(s.gold, 9); assert.equal(s.hp, 85);
  s.healedThisShop = false; s.buyHeal(); assert.equal(s.gold, 9, 'cannot afford a second heal'); assert.equal(s.hp, 85);
  s.gold = 50; s.hp = 100; s.buyHeal(); assert.equal(s.gold, 50, 'full health: no heal');
});

test('Hazards deal scaled damage, armour reduces it, and death ends the run', () => {
  const s = setup();
  s.dangers.push({ x: 650, y: 520, vx: 0, vy: 0, age: 0, delay: 0, life: .3, radius: 60, kind: 'circle', hit: false, resolved: false, damage: 20, trail: [] });
  tick(s, 1 / 120);
  assert.equal(s.hp, 100 - Math.round(20 * 1.03)); assert.equal(s.hits, 1);
  s.relics = [{ id: 'iron', name: 'Iron Skin', stacks: 4, rarity: 'silver', icon: '', tags: [] }]; s.recomputeStats(); const before = s.hp;
  s.dangers.push({ x: 650, y: 520, vx: 0, vy: 0, age: 0, delay: 0, life: .3, radius: 60, kind: 'circle', hit: false, resolved: false, damage: 20, trail: [] });
  tick(s, 1 / 120);
  assert.equal(before - s.hp, Math.round(20 * 1.03 - 8));
  s.hp = 5;
  s.dangers.push({ x: 650, y: 520, vx: 0, vy: 0, age: 0, delay: 0, life: .3, radius: 60, kind: 'circle', hit: false, resolved: false, damage: 20, trail: [] });
  tick(s, 1 / 120);
  assert.equal(s.status, 'ended'); assert.equal(s.dead, true); assert.equal(s.hp, 0);
});

test('Dashing through a projectile counts as a dodge, not a hit', () => {
  const s = setup();
  s.dangers.push({ x: 700, y: 520, vx: -600, vy: 0, age: 0, delay: 0, life: 1, radius: 13, kind: 'line', hit: false, resolved: false, damage: 10, trail: [] });
  s.dash({ x: 1200, y: 520 }); tick(s, 0.1);
  assert.equal(s.hits, 0); assert.equal(s.hp, 100);
  tick(s, 1.2); assert.equal(s.dodged, 1);
});

test('Drones deal contact damage and are knocked back', () => {
  const s = setup(); tick(s, 1.5);
  const e = s.enemies[0]; e.spawn = 1; e.x = s.player.x + 20; e.y = s.player.y;
  tick(s, 1 / 120);
  assert.equal(s.hits, 1); assert.ok(s.hp < 100); assert.ok(e.x > s.player.x + 20);
  const hp = s.hp; tick(s, 0.2); assert.equal(s.hp, hp, 'contact cooldown prevents a second hit immediately');
});

test('Archers keep their distance and telegraph line shots at the player', () => {
  const s = setup(); s.wave = 2; s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  s.spawnEnemy('archer'); const a = s.enemies[0]; a.spawn = 1; a.cooldown = 0.1; a.x = s.player.x + 400; a.y = s.player.y;
  tick(s, 0.2);
  assert.ok(s.dangers.some(d => d.kind === 'line')); assert.ok(a.cooldown > 1);
  a.x = s.player.x + 100; tick(s, 0.5); assert.ok(a.x > s.player.x + 100, 'archer backs away when the player is close');
});

test('Bombers arm near the player, telegraph a burst, and spend themselves', () => {
  const s = setup(); s.wave = 3; s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  s.spawnEnemy('bomber'); const b = s.enemies[0]; b.spawn = 1; b.x = s.player.x + 100; b.y = s.player.y;
  tick(s, 1 / 120);
  assert.ok(b.arming > 0); assert.equal(s.dangers.filter(d => d.kind === 'circle').length, 1);
  s.move({ x: 300, y: 520 }); tick(s, 0.8);
  assert.equal(b.dead, true); assert.equal(s.hp, 100, 'player walked out of the burst');
});

test('Wardens lead every third wave and rotate through attack patterns', () => {
  const s = setup(); s.beginWave(3);
  assert.equal(s.spawnQueue[0], 'warden'); tick(s, 1.5);
  const w = s.enemies.find(e => e.kind === 'warden'); assert.ok(w && w.elite); w.spawn = 1; w.cooldown = 0.01;
  tick(s, 0.1); assert.ok(s.dangers.length >= 5, 'spread volley');
  s.dangers = []; w.cooldown = 0.01; tick(s, 0.1); assert.ok(s.dangers.length >= 10, 'ring burst');
  s.dangers = []; w.cooldown = 0.01; tick(s, 0.1); assert.ok(s.dangers.some(d => d.kind === 'circle'), 'ground bursts');
  assert.equal(s.snapshot().eliteHp, 1);
});

test('Split Shot and Ricochet fire extra bolts, Blast Quiver splashes', () => {
  const s = setup(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  for (let i = 0; i < 3; i++) { s.spawnEnemy('drone'); const e = s.enemies[i]; e.spawn = 1; e.x = 900 + i * 40; e.y = 520; e.speed = 0; }
  s.relics = [{ id: 'split', name: 'Split Shot', stacks: 1, rarity: 'prismatic', icon: '', tags: [] }, { id: 'ricochet', name: 'Ricochet', stacks: 1, rarity: 'prismatic', icon: '', tags: [] }, { id: 'blast', name: 'Blast Quiver', stacks: 1, rarity: 'prismatic', icon: '', tags: [] }];
  s.recomputeStats();
  s.attack(s.enemies[0]); until(s, () => s.fired === 1, 3);
  assert.equal(s.bolts.length, 2, 'primary plus one split bolt');
  tick(s, 0.4);
  assert.ok(s.enemies.filter(e => e.hp < e.maxHp || e.dead).length >= 2, 'splash and ricochet spread damage');
});

test('Adrenaline stacks raise effective attack speed and expire', () => {
  const s = setup(); s.relics = [{ id: 'adren', name: 'Adrenaline', stacks: 1, rarity: 'prismatic', icon: '', tags: [] }]; s.recomputeStats();
  s.adrenaline = [3, 3, 3];
  assert.ok(Math.abs(s.effectiveAttackSpeed() - Math.min(3, 1.5 * 1.6)) < 1e-9);
  tick(s, 3.1); assert.equal(s.adrenaline.length, 0);
});

test('Attack-move with no target walks to the point and engages whatever enters range', () => {
  const s = setup(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  s.attack({ x: 1100, y: 520 });
  assert.equal(s.attackOrder, true); assert.equal(s.target, null); assert.deepEqual(s.destination, { x: 1100, y: 520 });
  tick(s, 0.3); const x = s.player.x; assert.ok(x > 650);
  s.spawnEnemy('drone'); const e = s.enemies[0]; e.spawn = 1; e.speed = 0; e.x = s.player.x + 300; e.y = 520;
  tick(s, 0.05); assert.equal(s.target, e); assert.equal(s.destination, null);
  until(s, () => s.fired > 0, 2); assert.ok(s.fired > 0);
});

test('Difficulty scales enemy health and wave budgets', () => {
  const easy = setup({ difficulty: 'easy' }), hard = setup({ difficulty: 'hard' });
  assert.ok(hard.budget(4) > easy.budget(4));
  easy.spawnEnemy('drone'); hard.spawnEnemy('drone');
  assert.ok(hard.enemies[0].maxHp > easy.enemies[0].maxHp);
});

test('Full autopilot run survives several waves with finite, consistent state', () => {
  const s = setup({ difficulty: 'easy' });
  let elapsed = 0;
  while (s.wave < 4 && elapsed < 240) {
    s.hp = 1e9; // godmode: we are testing the loop, not skill
    if (s.status === 'choosing') { s.choose(0); s.continueWave(); }
    else if (s.status === 'running') {
      const t = s.targetable()[0];
      if (t && !s.target) s.attack(t);
      s.update(1 / 120); elapsed += 1 / 120;
    } else break;
  }
  assert.ok(s.wave >= 4, `reached wave ${s.wave}`);
  assert.ok(s.kills > 5); assert.equal(s.relics.reduce((n, r) => n + r.stacks, 0), 3, 'three drafts taken'); assert.ok(Number.isFinite(s.player.x)); assert.ok(s.gold >= 0);
  assert.ok(s.particles.length <= 720);
});

test('Snapshot reports run fields for the UI', () => {
  const s = setup(); tick(s, 2.5);
  const snap = s.snapshot();
  assert.equal(snap.mode, 'run'); assert.equal(snap.wave, 1); assert.equal(snap.hp, 100); assert.equal(snap.maxHp, 100);
  assert.ok(snap.enemiesLeft > 0); assert.equal(snap.offers, null); assert.equal(snap.dead, false); assert.equal(snap.dashMax, 5);
});

test('Aim angle tracks the target independently of body facing, and release recoils', () => {
  const s = setup(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  s.spawnEnemy('drone'); const e = s.enemies[0]; e.spawn = 1; e.speed = 0; e.x = 650; e.y = 200;
  s.attack(e); until(s, () => s.fired === 1, 3);
  assert.ok(Math.abs(s.aimAngle - (-Math.PI / 2)) < 0.01, 'aims straight up at the target');
  assert.ok(s.recoil > 0);
  s.move({ x: 1200, y: 520 }); tick(s, 0.2);
  assert.ok(Math.abs(s.angle) < 0.01, 'body faces the run direction');
  assert.equal(s.target, null);
});

test('Running kicks up footstep dust; taking a hit starts the hurt flash', () => {
  const s = setup({ range: 450 }); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  s.move({ x: 1200, y: 520 }); tick(s, 0.5);
  assert.ok(s.particles.filter(q => q.color === '#9fb8b4').length >= 3);
  assert.equal(s.stats.range, 450);
  s.dangers.push({ x: s.player.x, y: s.player.y, vx: 0, vy: 0, age: 0, delay: 0, life: .3, radius: 60, kind: 'circle', hit: false, resolved: false, damage: 5, trail: [] });
  tick(s, 1 / 120); assert.ok(s.hurtFlash > 0);
  tick(s, 0.3); assert.equal(s.hurtFlash, 0);
});
