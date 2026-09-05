// Reaver (melee swinger with a signposted windup), hit-stun knockback on landed bolts, and the slower
// player projectile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_COST, REAVER, Simulation } from '../src/game/sim.ts';
import { PLAYER_R } from '../src/game/math.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', attackSpeed: 1.3, windup: 22, moveSpeed: 325, range: 450, quick: false, showRange: true, sound: false, shake: true };
const setup = (patch = {}) => { const s = new Simulation({ ...settings, ...patch }); s.start(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting'; return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const place = (s, kind, x, y) => { const e = s.spawnEnemy(kind, { x, y }); e.spawn = 1; return e; };

test('Reaver joins the pool on wave 3, costs 2, and debuts on schedule', () => {
  const s = new Simulation(settings); s.start();
  assert.ok(!s.wavePool(2).includes('reaver') && s.wavePool(3).includes('reaver'));
  assert.equal(KIND_COST.reaver, 2);
  s.beginWave(3);
  assert.ok(s.spawnQueue.includes('reaver') && s.spawnQueue.includes('bomber'));
});

test('Reaver: chases, locks its facing and winds up in reach, then the swing lands on a player who stayed put', () => {
  const s = setup();
  s.wave = 3;
  const e = place(s, 'reaver', s.player.x + 260, s.player.y);
  const hp = s.hp;
  // Chase until the windup begins.
  let t = 0;
  while (e.pattern !== 1 && t < 5) { s.update(1 / 120); t += 1 / 120; }
  assert.equal(e.pattern, 1, 'entered the windup');
  assert.ok(Math.abs(e.arming - s.telegraph(REAVER.windup)) < 0.02, 'windup length follows the telegraph knob');
  assert.ok(Math.abs(e.facing - Math.PI) < 0.05, 'facing locked toward the player');
  const x = e.x;
  tick(s, 0.3);
  assert.equal(e.x, x, 'stands still during the windup');
  assert.equal(s.hp, hp, 'no damage before the swing');
  const swings = s.swingEvent;
  tick(s, 0.4);
  assert.equal(s.swingEvent, swings + 1, 'swung once');
  assert.ok(s.hp < hp, 'the swing landed');
  assert.equal(e.pattern, 2, 'recovering');
  tick(s, REAVER.recover + 0.05);
  assert.equal(e.pattern, 0, 'back to the chase after recovery');
});

test('Reaver: stepping out of the painted arc during the windup makes the swing whiff and counts as a dodge', () => {
  const s = setup();
  s.wave = 3;
  const e = place(s, 'reaver', s.player.x + 260, s.player.y);
  let t = 0;
  while (e.pattern !== 1 && t < 5) { s.update(1 / 120); t += 1 / 120; }
  assert.equal(e.pattern, 1);
  // Sidestep straight down: well outside the half-arc but still close by.
  s.player = { x: s.player.x, y: s.player.y + REAVER.reach + e.radius + PLAYER_R + 30 };
  s.previous = { ...s.player };
  const hp = s.hp, dodged = s.dodged, swings = s.swingEvent;
  tick(s, s.telegraph(REAVER.windup) + 0.05);
  assert.equal(s.swingEvent, swings + 1, 'still swings along the locked facing');
  assert.equal(s.hp, hp, 'whiffed');
  assert.equal(s.dodged, dodged + 1, 'the sidestep is a dodge');
  assert.equal(e.pattern, 2);
});

test('Hit-stun: a landed bolt shoves an ordinary enemy a few units away and freezes it briefly; elites do not budge', () => {
  const s = setup();
  const d = place(s, 'drone', s.player.x + 200, s.player.y);
  const w = place(s, 'warden', s.player.x + 400, s.player.y + 200);
  d.speed = 0; w.speed = 0;
  const dx = d.x, wx = w.x;
  s.damageEnemy(d, 5, false);
  s.damageEnemy(w, 5, false);
  assert.ok(d.kx > 0 && d.stagger > 0, 'knockback velocity away from the player and a stagger timer');
  assert.equal(w.kx, 0, 'wardens are immune');
  for (let i = 0; i < 120; i++) { s.updateEnemy(d, 1 / 120); s.updateEnemy(w, 1 / 120); }
  const shove = d.x - dx;
  assert.ok(shove > 5 && shove < 16, `shove of ${shove.toFixed(1)} units is minor`);
  assert.equal(w.x, wx);
  assert.equal(d.kx, 0, 'the shove decays fully');
  // The stagger freezes the AI: a chasing drone loses a few frames of approach.
  const a = place(s, 'drone', s.player.x + 300, s.player.y), b = place(s, 'drone', s.player.x + 300, s.player.y + 600);
  b.wobble = a.wobble;
  s.knock(a);
  a.kx = a.ky = 0; // isolate the stagger from the shove
  for (let i = 0; i < 24; i++) { s.updateEnemy(a, 1 / 120); s.updateEnemy(b, 1 / 120); }
  const ranA = 300 - (a.x - s.player.x), ranB = Math.hypot(b.x - s.player.x, b.y - s.player.y);
  assert.ok(ranA < (300 - Math.hypot(0, 0)) && ranA < 600 - ranB + 1, 'staggered drone covered less ground');
});

test('Hit-stun spares a planted Bulwark and a latched Leech; a heavy cannon shell shoves harder', () => {
  const s = setup();
  const bw = place(s, 'bulwark', s.player.x + 200, s.player.y); bw.pattern = 1;
  const le = place(s, 'leech', s.player.x + 10, s.player.y); le.latched = true;
  s.knock(bw); s.knock(le);
  assert.equal(bw.kx, 0); assert.equal(le.kx, 0);
  const bow = setup(), cannon = setup({ hero: 'cannoneer', attackSpeed: 0.8, windup: 30, moveSpeed: 305, range: 560 });
  const d1 = place(bow, 'drone', bow.player.x + 200, bow.player.y), d2 = place(cannon, 'drone', cannon.player.x + 200, cannon.player.y);
  bow.knock(d1); cannon.knock(d2);
  assert.ok(d2.kx > d1.kx * 1.5);
});

test('Player bolts leave the bow slower and carry a longer trail', () => {
  const s = setup();
  const e = place(s, 'drone', s.player.x + 300, s.player.y);
  e.speed = 0;
  s.fireAt(e, 10, false, 0, s.player);
  assert.equal(s.bolts[0].speed, 1000);
  const c = setup({ hero: 'cannoneer', attackSpeed: 0.8, windup: 30, moveSpeed: 305, range: 560 });
  const e2 = place(c, 'drone', c.player.x + 300, c.player.y);
  c.fireAt(e2, 10, false, 0, c.player);
  assert.equal(c.bolts[0].speed, 820);
  tick(s, 0.2);
  assert.ok(s.bolts.length === 0 || s.bolts[0].trail.length <= 12);
});
