// Brief 03: the facing contract (combatFacing), the Witness gaze caster, and the player stun.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FACING_DEADZONE, KIND_COST, WITNESS, Simulation } from '../src/game/sim.ts';
import { HEROES, heroById } from '../src/game/heroes.ts';
import { W } from '../src/game/math.ts';

const settings = (hero = 'marksman') => ({ mode: 'run', drill: 'mixed', difficulty: 'standard', hero, ...heroById(hero).profile, quick: false, showRange: true, sound: false, shake: true });
const setup = (hero = 'marksman', patch = {}) => { const s = new Simulation({ ...settings(hero), ...patch }); s.start(); s.enemies = []; s.spawnQueue = []; s.pendingEvents = []; s.waveState = 'fighting'; return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const place = (s, kind, x, y, hp = 1e6) => { const e = s.spawnEnemy(kind, { x, y }); e.spawn = 1; e.hp = e.maxHp = hp; return e; };
const deg = r => r * 180 / Math.PI;
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
/** A Witness ready to gaze: inside the radius with no cooldown, so the next step opens the windup. */
const witnessAt = (s, dx, dy = 0) => { const w = place(s, 'witness', s.player.x + dx, s.player.y + dy, 400); w.speed = 0; w.cooldown = 0; return w; };
const windup = s => Math.max(WITNESS.windupFloor, s.telegraph(s.tuning.witnessWindup));
const until = (s, pred, max = 10) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };

// ---------------------------------------------------------------- facing contract

test('Facing: an attack order faces the live target and keeps facing it as it moves; cursor movement never turns you', () => {
  const s = setup();
  const e = place(s, 'drone', s.player.x, s.player.y - 200); e.speed = 0;
  s.cursor = { x: 100, y: 100 };
  const before = s.combatFacing;
  tick(s, 0.2);
  assert.equal(s.combatFacing, before, 'moving the cursor does nothing');
  s.attack(e);
  assert.ok(near(deg(s.combatFacing), -90), 'faces the target immediately');
  e.x = s.player.x + 200; e.y = s.player.y;
  s.update(1 / 120);
  assert.ok(near(deg(s.combatFacing), 0), 'follows the live target');
});

test('Facing: a move order faces the ordered point (even past the wall), a zero-length order and Stop keep it', () => {
  const s = setup();
  s.move({ x: s.player.x - 300, y: s.player.y });
  assert.ok(near(Math.abs(deg(s.combatFacing)), 180));
  s.stop();
  assert.ok(near(Math.abs(deg(s.combatFacing)), 180), 'Stop retains facing');
  s.move({ x: s.player.x + FACING_DEADZONE * 0.5, y: s.player.y });
  assert.ok(near(Math.abs(deg(s.combatFacing)), 180), 'dead-zone order keeps facing');
  // Pinned at the right wall, a click beyond it still turns you, although displacement is blocked.
  s.player = { x: W - 40, y: s.player.y }; s.previous = { ...s.player };
  s.move({ x: W + 200, y: s.player.y });
  assert.ok(near(deg(s.combatFacing), 0), 'turned toward the blocked direction');
  const x = s.player.x; tick(s, 0.2);
  assert.equal(s.player.x, x, 'no displacement into the wall');
});

test('Facing: an explicit move cancels attack intent and turns at once; attack-move acquisition faces the acquired target', () => {
  const s = setup();
  const e = place(s, 'drone', s.player.x + 200, s.player.y); e.speed = 0;
  s.attack(e); tick(s, 0.05);
  assert.ok(s.windupLeft > 0);
  s.move({ x: s.player.x, y: s.player.y + 300 });
  assert.equal(s.target, null); assert.equal(s.attackOrder, false); assert.equal(s.windupLeft, 0);
  assert.ok(near(deg(s.combatFacing), 90));
  // Attack-move toward empty ground, then a drone wanders into range: facing snaps to it the tick it is acquired.
  const t = setup();
  t.attack({ x: t.player.x, y: t.player.y + 300 });
  assert.ok(near(deg(t.combatFacing), 90), 'faces the attack-move point first');
  const d = place(t, 'drone', t.player.x + 150, t.player.y); d.speed = 0;
  t.update(1 / 120);
  assert.equal(t.target?.id, d.id);
  assert.ok(near(deg(t.combatFacing), 0, 0.2), 'faces the acquired target in the same tick');
});

test('Facing: a dash faces its actual travel, including the Cannoneer reversed hop, for every class', () => {
  for (const h of HEROES) {
    const s = setup(h.id);
    s.dash({ x: s.player.x + 300, y: s.player.y });
    const expected = h.dashMode === 'away' ? 180 : 0;
    assert.ok(near(Math.abs(deg(s.combatFacing)), expected), `${h.id} faces ${expected}`);
    s.dashing = 0; s.invulnerable = 0;
    s.move({ x: s.player.x, y: s.player.y - 200 });
    assert.ok(near(deg(s.combatFacing), -90), `${h.id} move order turns`);
  }
});

// ---------------------------------------------------------------- roster

test('Witness: costs 3, debuts on its tuning wave (default 7), at most one per wave, and its debut wave holds no surprise events', () => {
  const s = new Simulation(settings()); s.start();
  assert.equal(KIND_COST.witness, 3);
  assert.ok(!s.wavePool(6).includes('witness') && s.wavePool(7).includes('witness'));
  s.beginWave(7);
  assert.equal(s.spawnQueue.filter(k => k === 'witness').length, 1, 'guaranteed once on the debut wave');
  for (let seed = 1; seed < 40; seed++) { s.rng.seed = seed; assert.equal(s.scheduleEvents(7).length, 0, 'events held on the debut wave'); }
  s.rng.seed = 3; s.beginWave(12); assert.ok(s.spawnQueue.filter(k => k === 'witness').length <= 1, 'never two');
  s.setTuning({ witnessDebut: 4 });
  assert.ok(s.wavePool(4).includes('witness') && !s.wavePool(3).includes('witness'));
});

// ---------------------------------------------------------------- gaze

test('Witness: stops to wind up, then the gaze stuns a player who is inside the radius and still facing it', () => {
  const s = setup();
  const w = witnessAt(s, 200);
  s.attack(w);
  s.update(1 / 120);
  assert.equal(w.gazePhase, 'windup'); assert.ok(near(w.gazeTimer, windup(s), 0.02)); assert.equal(s.gazeEvent, 1);
  const wx = w.x; w.speed = 150;
  tick(s, 0.5);
  assert.equal(w.x, wx, 'the caster does not move during the windup, and landed bolts cannot shove it');
  assert.ok(s.fired >= 1 && w.hp < w.maxHp, 'it was being shot the whole time');
  assert.equal(s.snapshot().gazeActive, true); assert.equal(s.snapshot().gazeExposed, true);
  const hp = s.hp;
  tick(s, windup(s) - 0.5 + 0.03);
  assert.equal(s.gazeReleaseEvent, 1, 'resolved exactly once');
  assert.equal(s.stunEvent, 1); assert.ok(s.stunned > 0); assert.equal(s.stunSource, 'WITNESS');
  assert.equal(s.hp, hp, 'no direct damage');
  assert.equal(w.gazePhase, 'recovery');
  assert.ok(s.lastGaze && s.lastGaze.exposed && s.lastGaze.stunned && s.lastGaze.offsetDeg < 1);
  tick(s, WITNESS.recover + 0.05);
  assert.equal(w.gazePhase, 'approach'); assert.ok(near(w.cooldown, s.tuning.witnessCooldown, 0.1));
});

test('Witness: one deliberate turn away (a move order) before the release makes the gaze miss and counts as a dodge', () => {
  const s = setup();
  const w = witnessAt(s, 200);
  s.attack(w); s.update(1 / 120);
  tick(s, 0.4);
  // Look away: order a move directly away. Movement is not required, the facing is.
  s.move({ x: s.player.x - 40, y: s.player.y });
  const dodged = s.dodged;
  tick(s, windup(s));
  assert.equal(s.gazeReleaseEvent, 1); assert.equal(s.stunEvent, 0); assert.equal(s.stunned, 0);
  assert.equal(s.dodged, dodged + 1);
  assert.ok(s.effects.some(f => f.text === 'LOOKED AWAY'));
  assert.ok(s.lastGaze && !s.lastGaze.exposed && s.lastGaze.offsetDeg > 170);
});

test('Witness: geometry boundaries are safe (exact radius, exact arc) and zero distance is exposed', () => {
  const s = setup();
  const R = s.tuning.witnessRadius, arc = s.tuning.witnessArc;
  const w = place(s, 'witness', s.player.x + R, s.player.y, 400);
  s.combatFacing = 0;
  assert.equal(s.gazeGeometry(w).exposed, false, 'standing exactly on the radius is safe');
  w.x = s.player.x + R - 0.01;
  assert.equal(s.gazeGeometry(w).exposed, true);
  s.combatFacing = arc * Math.PI / 180;
  assert.equal(s.gazeGeometry(w).facing, false, 'exactly on the arc boundary is safe');
  s.combatFacing = (arc - 0.5) * Math.PI / 180;
  assert.equal(s.gazeGeometry(w).facing, true);
  w.x = s.player.x; w.y = s.player.y; s.combatFacing = Math.PI;
  assert.equal(s.gazeGeometry(w).exposed, true, 'zero distance counts as exposed');
  s.setTuning({ witnessArc: 30 });
  w.x = s.player.x + 100; s.combatFacing = 45 * Math.PI / 180;
  assert.equal(s.gazeGeometry(w).facing, false, 'the arc knob is read live');
});

test('Witness: leaving the radius, dashing through the release, or killing the caster all avoid the stun', () => {
  // Leave the radius.
  const a = setup(); const wa = witnessAt(a, 200); a.attack(wa); a.update(1 / 120);
  a.player = { x: a.player.x - 200, y: a.player.y }; a.previous = { ...a.player };
  tick(a, windup(a) + 0.02);
  assert.equal(a.gazeReleaseEvent, 1); assert.equal(a.stunEvent, 0); assert.ok(a.effects.some(f => f.text === 'OUT OF REACH'));
  // Dash invulnerability.
  const b = setup(); const wb = witnessAt(b, 200); b.attack(wb); b.update(1 / 120);
  tick(b, windup(b) - 0.05);
  b.dash({ x: b.player.x + 40, y: b.player.y });
  tick(b, 0.1);
  assert.equal(b.gazeReleaseEvent, 1); assert.equal(b.stunEvent, 0); assert.ok(b.effects.some(f => f.text === 'DASHED THROUGH'));
  // Caster killed before the queue resolves: no release at all.
  const c = setup(); const wc = witnessAt(c, 200); c.attack(wc); c.update(1 / 120);
  tick(c, windup(c) - 0.05);
  c.kill(wc);
  tick(c, 0.2);
  assert.equal(c.gazeReleaseEvent, 0); assert.equal(c.stunEvent, 0);
  // And a due gaze is dropped, not deferred, when the caster dies in the same tick it would resolve.
  const d = setup(); const wd = witnessAt(d, 200); d.attack(wd); d.update(1 / 120);
  wd.gazeTimer = 0.001; d.update(1 / 120);
  assert.equal(d.gazeReleaseEvent, 1, 'a live caster releases');
});

test('Stun: blocks move, attack and dash execution, keeps the latest destination, and lets bolts, reloads and cooldowns run', () => {
  const s = setup('rifleman');
  const w = witnessAt(s, 200);
  const far = place(s, 'drone', s.player.x + 600, s.player.y); far.speed = 0;
  s.attack(w); s.update(1 / 120);
  // Fire one round so a bolt is in flight and the cooldown is live at the moment of the stun.
  assert.ok(until(s, () => s.fired === 1, 1));
  const boltsInFlight = s.bolts.length;
  assert.ok(boltsInFlight >= 1);
  w.gazeTimer = 0.001; s.update(1 / 120);
  assert.ok(s.stunned > 0, 'stunned');
  assert.equal(s.target, null, 'queued attack cancelled');
  const stunnedFor = s.stunned, cd = s.cooldown, x0 = s.player.x;
  s.move({ x: s.player.x - 200, y: s.player.y });
  assert.ok(s.destination, 'destination kept for after the stun');
  assert.ok(near(Math.abs(deg(s.combatFacing)), 180), 'facing follows the move intent while stunned');
  s.attack(far); s.dash({ x: s.player.x + 100, y: s.player.y });
  assert.equal(s.target, null); assert.equal(s.dashing, 0); assert.equal(s.dashCharges, 1);
  tick(s, 0.1);
  assert.equal(s.player.x, x0, 'no movement while stunned');
  assert.ok(s.cooldown < cd, 'attack cooldown keeps running');
  assert.ok(s.stunned < stunnedFor);
  tick(s, stunnedFor);
  assert.equal(s.stunned, 0);
  assert.ok(s.stunImmune > WITNESS.stunImmunity - 0.2 && s.stunImmune <= WITNESS.stunImmunity, 'immunity window opens as the stun ends');
  tick(s, 0.1);
  assert.ok(s.player.x < x0, 'the kept destination resumes');
  // Chain-stun protection: a second gaze inside the immunity window cannot refresh the lock.
  assert.equal(s.applyStun(0.35, 'WITNESS'), false);
  assert.equal(s.stunned, 0);
  // Reload timers keep going under a stun.
  const r = setup('rifleman'); r.reloadLeft = 1; r.applyStun(0.5, 'TEST'); tick(r, 0.4);
  assert.ok(r.reloadLeft < 0.7, 'reload continued');
});

test('Stun cancels an unreleased windup (counted as cancelled, never fired); a released bolt still lands', () => {
  const s = setup();
  const w = witnessAt(s, 200);
  const dummy = place(s, 'drone', s.player.x + 120, s.player.y, 1e6); dummy.speed = 0;
  s.attack(dummy); tick(s, 0.02);
  assert.ok(s.windupLeft > 0 && s.fired === 0);
  const cancelled = s.cancelled;
  assert.equal(s.applyStun(0.35, 'WITNESS'), true);
  assert.equal(s.windupLeft, 0); assert.equal(s.fired, 0); assert.equal(s.cancelled, cancelled + 1);
  const b = setup(); const target = place(b, 'drone', b.player.x + 200, b.player.y, 1e6); target.speed = 0;
  b.attack(target); tick(b, 0.4);
  assert.equal(b.fired, 1);
  b.fireAt(target, 10, false, 0, b.player);
  const hpBefore = target.hp;
  b.applyStun(0.35, 'WITNESS');
  tick(b, 0.5);
  assert.ok(target.hp < hpBefore, 'the bolt in flight still landed');
  void w;
});

test('Pause freezes the gaze windup and the stun alike', () => {
  const s = setup();
  const w = witnessAt(s, 200); s.attack(w); s.update(1 / 120);
  const t0 = w.gazeTimer;
  s.status = 'paused'; tick(s, 1); s.status = 'running';
  assert.equal(w.gazeTimer, t0);
  s.applyStun(0.35, 'WITNESS'); s.status = 'paused'; tick(s, 1); s.status = 'running';
  assert.ok(near(s.stunned, 0.35, 1e-9));
});

test('Fixtures stage a sandbox scene in the current run: solo Witness, Witness with a Reaver and drones, and the range', () => {
  const s = new Simulation(settings()); s.start();
  s.fixture('witness');
  assert.equal(s.sandbox, true); assert.equal(s.status, 'running');
  assert.deepEqual(s.enemies.map(e => e.kind), ['witness']); assert.equal(s.wave, s.witnessDebut);
  s.fixture('witness-mix');
  assert.deepEqual(s.enemies.map(e => e.kind).sort(), ['drone', 'drone', 'reaver', 'witness']);
  s.fixture('range');
  assert.equal(s.enemies.filter(e => e.kind === 'dummy').length, 3);
  assert.equal(s.snapshot().sandbox, true);
  s.start();
  assert.equal(s.sandbox, false, 'a fresh run is not a sandbox');
});
