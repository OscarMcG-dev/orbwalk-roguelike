// Attack feel (brief "make the release visible", slice A) and the style proof (brief "visual identity", slice A).
// Pins the mechanical invariants presentation must never own, the shared presentation table, the shot record, and
// that drawing never writes to the simulation. Nothing here asserts polygon coordinates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { HEROES, WEAPON_PRESENTATION, heroById } from '../src/game/heroes.ts';
import { draw } from '../src/game/render.ts';

const settings = (hero, patch = {}) => ({ mode: 'run', drill: 'mixed', difficulty: 'standard', hero, ...heroById(hero).profile, quick: false, showRange: true, sound: false, shake: true, ...patch });
const setup = (hero = 'marksman', patch = {}) => { const s = new Simulation(settings(hero, patch)); s.start(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting'; return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const until = (s, pred, max = 10) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const place = (s, kind, x, y, hp = 1e6) => { const e = s.spawnEnemy(kind, { x, y }); e.spawn = 1; e.speed = 0; e.hp = e.maxHp = hp; return e; };
/** Semantic state a cosmetic pass may never touch. */
const semantic = s => JSON.stringify({
  player: s.player, hp: s.hp, gold: s.gold, wave: s.wave, status: s.status, windupLeft: s.windupLeft, cooldown: s.cooldown, recoil: s.recoil,
  flash: s.flash, lastShot: s.lastShot, shotEvent: s.shotEvent, cancelEvent: s.cancelEvent, fired: s.fired, cancelled: s.cancelled,
  enemies: s.enemies.map(e => [e.kind, e.x, e.y, e.hp, e.pattern, e.arming, e.facing, e.dead]),
  bolts: s.bolts.map(b => [b.x, b.y, b.damage]), dangers: s.dangers.map(d => [d.x, d.y, d.age, d.hit]), orbs: s.orbs.length,
  rng: s.rng.seed, fx: s.fx.seed, particles: s.particles.length, effects: s.effects.length,
});

test('One presentation table: every weapon has an entry, the durations are the pre-table values, and release() sets recoil to exactly that number for every class', () => {
  const shipped = { bow: 0.12, blade: 0.12, crossbow: 0.2, garand: 0.14, pistols: 0.08, cannon: 0.18 };
  for (const h of HEROES) {
    const p = WEAPON_PRESENTATION[h.weapon];
    assert.ok(p, `${h.weapon} has presentation`);
    assert.equal(p.recoil, shipped[h.weapon], `${h.weapon} recoil duration preserved`);
    assert.ok(p.hold > 0 && p.hold < p.recoil, `${h.weapon} launch hold sits inside the recoil`);
    const s = setup(h.id);
    const e = place(s, 'drone', s.player.x + 120, s.player.y);
    s.attack(e);
    assert.ok(until(s, () => s.fired === 1, 5), `${h.id} fires`);
    assert.equal(s.recoil, p.recoil, `${h.id} recoil comes from the table`);
  }
});

test('Release captures a shot record: monotonic id, launch origin, the exact direction to the target, weapon and simulation time; the bolt leaves from that origin; one shot cue per release', () => {
  const s = setup();
  const e = place(s, 'drone', s.player.x + 120, s.player.y - 90);
  assert.equal(s.lastShot, null);
  s.attack(e);
  assert.ok(until(s, () => s.fired === 1, 5));
  const shot = s.lastShot;
  assert.equal(shot.id, 1);
  assert.equal(shot.weapon, 'bow');
  assert.deepEqual({ x: shot.x, y: shot.y }, s.player);
  assert.ok(Math.abs(shot.angle - Math.atan2(e.y - s.player.y, e.x - s.player.x)) < 1e-9, 'launch angle is the angle to the target at release');
  assert.equal(shot.time, s.runTime);
  assert.deepEqual(s.bolts[0].origin, { x: shot.x, y: shot.y }, 'projectile origin and presentation origin agree');
  assert.ok(until(s, () => s.fired === 2, 5));
  assert.equal(s.lastShot.id, 2);
  assert.equal(s.shotEvent, 2);
});

test('Breaking the windup (move, dash) counts a cancel cue and leaves no release: no bolt, flash, recoil, shot record or shot cue', () => {
  const s = setup();
  const e = place(s, 'drone', s.player.x + 120, s.player.y);
  s.attack(e);
  tick(s, 0.05);
  assert.ok(s.windupLeft > 0);
  s.move({ x: s.player.x - 40, y: s.player.y });
  assert.equal(s.cancelled, 1);
  assert.equal(s.cancelEvent, 1);
  tick(s, 0.5);
  assert.equal(s.fired, 0); assert.equal(s.shotEvent, 0); assert.equal(s.bolts.length, 0);
  assert.equal(s.flash, 0); assert.equal(s.recoil, 0); assert.equal(s.lastShot, null);
  s.stop();
  s.attack(e);
  tick(s, 0.05);
  assert.ok(s.windupLeft > 0);
  s.dash({ x: s.player.x - 100, y: s.player.y });
  assert.equal(s.cancelled, 2, 'dash cancels the windup');
  assert.equal(s.cancelEvent, 2);
  assert.equal(s.windupLeft, 0);
  // The order itself survives the dash (that is existing behaviour); the cancelled windup does not release.
  tick(s, 0.1);
  assert.equal(s.fired, 0); assert.equal(s.shotEvent, 0); assert.equal(s.lastShot, null);
});

test('Target death during the windup produces no orphan release: no shot cue, flash, bolt, recoil or shot record, and no cancel; the next order fires cleanly', () => {
  const s = setup();
  place(s, 'drone', s.player.x + 700, s.player.y); // keeps the wave alive
  const e = place(s, 'drone', s.player.x + 120, s.player.y, 10);
  s.attack(e);
  tick(s, 0.05);
  assert.ok(s.windupLeft > 0);
  s.kill(e);
  tick(s, 1);
  assert.equal(s.fired, 0); assert.equal(s.shotEvent, 0); assert.equal(s.bolts.length, 0);
  assert.equal(s.flash, 0); assert.equal(s.recoil, 0); assert.equal(s.lastShot, null);
  assert.equal(s.cancelled, 0); assert.equal(s.cancelEvent, 0);
  const f = place(s, 'drone', s.player.x + 120, s.player.y + 40);
  s.attack(f);
  assert.ok(until(s, () => s.fired === 1, 5));
  assert.equal(s.shotEvent, 1);
  assert.equal(s.lastShot.id, 1);
});

test('Presentation follows simulation time: pause freezes the shot clock and the recoil; at low and high attack speed there is one shot cue per release and the recoil never exceeds its table duration', () => {
  for (const attackSpeed of [0.5, 3.0]) {
    const s = setup('marksman', { attackSpeed });
    const e = place(s, 'drone', s.player.x + 120, s.player.y);
    s.attack(e);
    let peak = 0;
    for (let i = 0; i < 120 * 6; i++) { s.update(1 / 120); peak = Math.max(peak, s.recoil); }
    assert.ok(s.fired >= 2, `fires at ${attackSpeed}/s`);
    assert.equal(s.shotEvent, s.fired, 'one cue per release');
    assert.ok(peak <= WEAPON_PRESENTATION.bow.recoil + 1e-9);
    assert.ok(Math.abs(s.fired - 6 * s.effectiveAttackSpeed()) <= 1.5, `cadence unchanged at ${attackSpeed}/s: ${s.fired} shots`);
  }
  const s = setup();
  const e = place(s, 'drone', s.player.x + 120, s.player.y);
  s.attack(e);
  assert.ok(until(s, () => s.fired === 1, 5));
  const recoil = s.recoil, time = s.runTime, shot = { ...s.lastShot };
  s.status = 'paused';
  tick(s, 1);
  assert.equal(s.recoil, recoil);
  assert.equal(s.runTime, time);
  assert.deepEqual(s.lastShot, shot);
});

/** A 2D context that accepts every call and property and returns itself (0 as a number), so draw() can run headless. */
function fakeContext() {
  const handler = { get: (_, prop) => prop === Symbol.toPrimitive ? () => 0 : proxy, set: () => true, apply: () => proxy };
  const proxy = new Proxy(function () {}, handler);
  return proxy;
}

test('Style proof fixture stages every material in a sandbox, and drawing it (insets included) never writes to the simulation', () => {
  const s = setup();
  s.fixture('style');
  assert.equal(s.sandbox, true);
  assert.equal(s.proof, true);
  assert.deepEqual(s.enemies.map(e => e.kind).sort(), ['archer', 'drone', 'reaver']);
  assert.equal(s.orbs.length, 1, 'a pickup waits on the floor');
  assert.ok(s.target && s.target.kind === 'drone', 'the player is ordered onto the drone so a shot is always coming');
  assert.ok(until(s, () => s.fired === 1 && s.dangers.length > 0, 6), 'a player shot and a hostile telegraph both appear');
  const rs = { visAngle: 0, visAim: 0.3, stride: 0, time: 1234, inside: true, shakeEnabled: true, reducedMotion: false, draw: 0.4, cursorPulse: 0, cursorKind: 'move' };
  const canvas = { width: 1500, height: 920 };
  const before = semantic(s);
  for (const t of [0, 16, 33]) draw(s, canvas, fakeContext(), 0.5, { ...rs, time: 1234 + t });
  assert.equal(semantic(s), before, 'draw() is read-only');
  s.start();
  assert.equal(s.proof, false, 'a new run leaves the proof');
  assert.equal(s.lastShot, null);
});
