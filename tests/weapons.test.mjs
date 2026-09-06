// New weapon classes: Arbalest (heavy crossbow: pierce, walk-to-crank), Rifleman (M1 Garand: eight-round
// clip, ping, reload while moving, R ejects early) and Gunslinger (twin pistols: off-hand shot, thirty-round
// reload). Plus the Easy pressure slider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { HEROES, heroById, isUnlocked } from '../src/game/heroes.ts';
import { EASY_DEFAULT_LEVEL, EASY_MAX_LEVEL, easyBlend, matchPreset, presetById, sameTuning } from '../src/game/tuning.ts';
import { grantLegacyUnlocks, newAccount } from '../src/game/arsenal.ts';

const settings = hero => ({ mode: 'run', drill: 'mixed', difficulty: 'standard', hero, ...heroById(hero).profile, quick: false, showRange: true, sound: false, shake: true });
const setup = hero => { const s = new Simulation(settings(hero)); s.start(); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting'; return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const until = (s, pred, max = 10) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const place = (s, kind, x, y, hp = 1e6) => { const e = s.spawnEnemy(kind, { x, y }); e.spawn = 1; e.speed = 0; e.hp = e.maxHp = hp; return e; };

test('Six classes with distinct weapons; weapons are owned through the account, and old progress unlocks migrate once', () => {
  assert.equal(HEROES.length, 6);
  assert.deepEqual(new Set(HEROES.map(h => h.weapon)), new Set(['bow', 'cannon', 'blade', 'crossbow', 'garand', 'pistols']));
  const fresh = newAccount('save-1', 1);
  assert.ok(isUnlocked('marksman', fresh) && !isUnlocked('arbalest', fresh) && !isUnlocked('rifleman', fresh) && !isUnlocked('gunslinger', fresh));
  const migrated = grantLegacyUnlocks(fresh, { bestWave: 3, totalKills: 150 });
  assert.ok(isUnlocked('arbalest', migrated) && isUnlocked('rifleman', migrated) && isUnlocked('gunslinger', migrated));
  assert.ok(!isUnlocked('cannoneer', migrated) && !isUnlocked('skirmisher', migrated), 'wave 4 and 200 kills were not reached');
  assert.equal(grantLegacyUnlocks(migrated, { bestWave: 3, totalKills: 150 }), migrated, 'idempotent');
  assert.equal(fresh.owned.length, 0, 'pure: the original account is untouched');
});

test('Rifleman: eight shots, then the clip pings out and 1.6 s of reload during which you may move but not fire', () => {
  const s = setup('rifleman');
  const e = place(s, 'drone', s.player.x + 300, s.player.y);
  assert.equal(s.ammo, 8);
  s.attack(e);
  assert.ok(until(s, () => s.fired === 8, 12), 'eight rounds fired');
  assert.equal(s.ammo, 0);
  assert.equal(s.pingEvent, 1, 'the eighth round pings');
  assert.ok(s.reloadLeft > 1.5, 'reload started immediately');
  assert.ok(s.effects.some(f => f.text === 'PING'));
  // Still targeting: no shot lands during the reload, movement is free.
  const fired = s.fired;
  const x0 = s.player.x;
  s.move({ x: s.player.x - 120, y: s.player.y });
  tick(s, 0.8);
  assert.equal(s.fired, fired, 'no shots while reloading');
  assert.ok(s.player.x < x0 - 100, 'walked during the reload');
  s.attack(e);
  tick(s, 0.9);
  assert.equal(s.ammo > 0 || s.fired > fired, true, 'the clip refilled and firing resumed');
  assert.equal(s.loadedEvent, 1);
});

test('Rifleman: R ejects a partial clip early (with a ping) and refills to eight', () => {
  const s = setup('rifleman');
  const e = place(s, 'drone', s.player.x + 300, s.player.y);
  s.attack(e);
  until(s, () => s.fired === 3, 6);
  s.stop();
  assert.equal(s.ammo, 5);
  s.reload();
  assert.equal(s.pingEvent, 1);
  assert.ok(s.reloadLeft > 0);
  s.reload();
  assert.equal(s.pingEvent, 1, 'no double reload');
  tick(s, 1.7);
  assert.equal(s.ammo, 8);
  const full = setup('rifleman');
  full.reload();
  assert.equal(full.pingEvent, 0, 'a full clip does not eject');
});

test('Gunslinger: every attack also fires the off hand at a second enemy for 60%, and thirty rounds rack a 1.1 s reload without a ping', () => {
  const s = setup('gunslinger');
  const a = place(s, 'drone', s.player.x + 200, s.player.y), b = place(s, 'drone', s.player.x + 200, s.player.y + 80);
  s.stats.critChance = 0;
  s.attack(a);
  until(s, () => s.fired === 1, 3);
  assert.equal(s.bolts.length, 2, 'main shot and off-hand shot');
  const main = s.bolts.find(x => x.target.id === a.id), off = s.bolts.find(x => x.target.id === b.id);
  assert.ok(main && off);
  assert.equal(off.damage, Math.round(main.damage * 0.6));
  assert.equal(s.ammo, 29, 'one round per attack even with the off hand');
  until(s, () => s.ammo === 0, 20);
  assert.equal(s.pingEvent, 0);
  assert.equal(s.rackEvent, 1);
  assert.ok(Math.abs(s.reloadLeft - 1.1) < 0.05);
  // Alone, the off hand stays holstered.
  const solo = setup('gunslinger');
  const only = place(solo, 'drone', solo.player.x + 200, solo.player.y);
  solo.attack(only);
  until(solo, () => solo.fired === 1, 3);
  assert.equal(solo.bolts.length, 1);
});

test('Arbalest: the quarrel flies straight through up to four enemies (15% less each), and only walking rewinds the crank', () => {
  const s = setup('arbalest');
  s.stats.critChance = 0;
  const line = [0, 1, 2, 3, 4].map(i => place(s, 'drone', s.player.x + 220 + i * 60, s.player.y));
  const side = place(s, 'drone', s.player.x + 300, s.player.y + 200);
  assert.equal(s.crank, 1);
  s.attack(line[0]);
  assert.ok(until(s, () => s.fired === 1, 4));
  assert.equal(s.crank, 0, 'firing spends the crank');
  const bolt = s.bolts[0];
  assert.ok(bolt.dir && bolt.pierce === 4);
  tick(s, 0.6);
  const hit = line.map(e => e.maxHp - e.hp);
  assert.ok(hit[0] > 0 && hit[1] > 0 && hit[2] > 0 && hit[3] > 0, `first four struck: ${hit}`);
  assert.equal(hit[4], 0, 'the fifth body is spared');
  assert.equal(side.hp, side.maxHp, 'nothing off the line is touched');
  assert.ok(Math.abs(hit[1] / hit[0] - 0.85) < 0.03 && Math.abs(hit[3] / hit[0] - Math.pow(0.85, 3)) < 0.03, 'damage falls 15% per body');
  // Standing still never reloads; the attack order waits.
  tick(s, 2);
  assert.equal(s.crank, 0);
  assert.equal(s.fired, 1);
  // Walking 90 units rewinds it and the queued attack fires.
  s.move({ x: s.player.x - 100, y: s.player.y });
  tick(s, 0.5);
  assert.equal(s.crank, 1, 'cranked after 90 units of walking');
  assert.equal(s.loadedEvent, 1);
  s.attack(line[0]);
  assert.ok(until(s, () => s.fired === 2, 4), 'fires again once cranked');
});

test('Easy pressure slider: 0 is the gentle floor, values climb monotonically toward Iron, and the slider stops short of Iron', () => {
  const easy = presetById('easy').tuning, iron = presetById('iron').tuning, ledger = presetById('ledger').tuning;
  assert.ok(easy.enemyDamage < ledger.enemyDamage && easy.enemyHp < ledger.enemyHp && easy.telegraph > ledger.telegraph && easy.enemySpeed < ledger.enemySpeed, 'Easy is easier than the authored scale');
  assert.ok(sameTuning(easyBlend(0), easy));
  assert.equal(matchPreset(easyBlend(0))?.id, 'easy');
  let prev = easyBlend(0);
  for (let t = 0.1; t <= EASY_MAX_LEVEL + 1e-9; t += 0.1) {
    const cur = easyBlend(t);
    assert.ok(cur.enemyDamage >= prev.enemyDamage && cur.playerRange <= prev.playerRange && cur.telegraph <= prev.telegraph, `monotonic at ${t}`);
    prev = cur;
  }
  assert.ok(!sameTuning(easyBlend(1), iron), 'the slider never reaches Iron exactly');
  assert.equal(easyBlend(0.5).shopEvery, 1); assert.equal(easyBlend(0.7).shopEvery, 2);
  assert.ok(EASY_DEFAULT_LEVEL > 0 && EASY_DEFAULT_LEVEL < EASY_MAX_LEVEL);
  const mid = easyBlend(EASY_DEFAULT_LEVEL);
  assert.ok(mid.playerRange > iron.playerRange && mid.playerRange < easy.playerRange);
});
