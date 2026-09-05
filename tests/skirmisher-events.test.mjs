// Third class (Skirmisher: Tempo shots and the blade dash) and mid-wave events (ambush, barrage, bounty, champion).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_LABEL, Simulation } from '../src/game/sim.ts';
import { UPGRADES, computeStats, eligible } from '../src/game/upgrades.ts';
import { HEROES, heroById, isUnlocked } from '../src/game/heroes.ts';

const settings = { mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', attackSpeed: 1.5, windup: 22, moveSpeed: 325, range: 450, quick: false, showRange: true, sound: false, shake: true };
const skirmisher = { hero: 'skirmisher', ...heroById('skirmisher').profile };
const setup = (patch = {}) => { const s = new Simulation({ ...settings, ...patch }); s.start(); return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const until = (s, pred, max = 60) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const relic = (id, stacks = 1) => { const u = UPGRADES.find(x => x.id === id); return { id, name: u.name, stacks, rarity: u.rarity, icon: u.icon, tags: u.tags }; };
const equip = (s, ...ids) => { s.relics = ids.map(id => relic(id)); s.recomputeStats(); };
const arenaWith = (kinds, patch = {}) => {
  const s = setup(patch); s.enemies = []; s.spawnQueue = []; s.waveState = 'fighting';
  kinds.forEach((k, i) => { s.spawnEnemy(k); const e = s.enemies[i]; e.spawn = 1; e.speed = 0; e.x = 850 + i * 60; e.y = 520; e.hp = e.maxHp = 1e6; });
  return s;
};

// ---------------------------------------------------------------- skirmisher

test('Skirmisher unlocks at 200 career kills and layers a close-range, fast, fragile sheet', () => {
  assert.equal(HEROES.length, 6);
  assert.equal(isUnlocked('skirmisher', { bestWave: 12, totalKills: 199, runs: 9 }), false);
  assert.equal(isUnlocked('skirmisher', { bestWave: 1, totalKills: 200, runs: 1 }), true);
  const h = heroById('skirmisher');
  assert.equal(h.weapon, 'blade'); assert.equal(h.tempo, true); assert.equal(h.dashStrike, true); assert.equal(h.dashMode, 'toward');
  const st = computeStats({ ...settings, ...skirmisher }, []);
  assert.equal(st.damage, 13); assert.equal(st.maxHp, 90); assert.equal(st.range, 260); assert.equal(st.attackSpeed, 2); assert.ok(Math.abs(st.dashCd - 3.2) < 1e-9);
});

test('Tempo: a blade released within half a second of moving deals +40%; standing and spamming does not', () => {
  const s = arenaWith(['drone'], skirmisher); const e = s.enemies[0]; s.stats.critChance = 0;
  tick(s, 1); // stand still long enough to close the window
  assert.equal(s.tempoReady, false);
  s.attack(e); until(s, () => s.fired === 1, 3);
  assert.equal(s.bolts[0].damage, 13); assert.equal(s.tempoShots, 0); assert.ok(!s.effects.some(f => f.text === 'TEMPO'));
  s.move({ x: s.player.x - 30, y: 520 }); tick(s, 0.1);
  assert.equal(s.tempoReady, true);
  s.attack(e); until(s, () => s.fired === 2, 3);
  assert.equal(s.bolts[s.bolts.length - 1].damage, Math.round(13 * 1.4)); assert.equal(s.tempoShots, 1);
  assert.ok(s.effects.some(f => f.text === 'TEMPO')); assert.ok(s.tempoFlash > 0);
  const snap = s.snapshot(); assert.equal(snap.tempoShots, 1); assert.equal(typeof snap.tempoReady, 'boolean');
  // Tempo also raises crit chance: with 90% base it becomes a certainty.
  s.stats.critChance = 0.9; s.stillTime = 0;
  for (let i = 0; i < 10; i++) assert.equal(s.rollDamage(e, 0.15).crit, true);
});

test('Tempo is a Skirmisher mechanic only', () => {
  const s = arenaWith(['drone']); s.move({ x: 600, y: 520 }); tick(s, 0.1);
  assert.equal(s.tempoReady, false);
  s.attack(s.enemies[0]); until(s, () => s.fired === 1, 3);
  assert.equal(s.tempoShots, 0);
});

test('Blade dash cuts each enemy it passes through once; Riposte refunds cooldown per cut', () => {
  const s = arenaWith(['drone', 'drone'], skirmisher); s.stats.critChance = 0;
  const [a, b] = s.enemies; a.x = 720; b.x = 780; // both inside the 195-unit dash path from x=650
  s.dash({ x: 1200, y: 520 }); tick(s, 0.3);
  assert.equal(a.maxHp - a.hp, Math.round(13 * 1.2)); assert.equal(b.maxHp - b.hp, Math.round(13 * 1.2));
  assert.equal(s.cutEvent, 2); assert.deepEqual([...s.dashStruck].sort(), [a.id, b.id].sort());
  assert.ok(Math.abs(s.dashCd - (3.2 - 0.3)) < 0.02, 'no refund without Riposte');
  const r = arenaWith(['drone', 'drone', 'drone', 'drone'], skirmisher); equip(r, 'riposte');
  r.enemies.forEach((e, i) => { e.x = 700 + i * 30; });
  r.dash({ x: 1200, y: 520 }); tick(r, 0.2);
  assert.equal(r.cutEvent, 4);
  assert.ok(r.dashCd < 3.2 - 0.2 - 1.8 + 0.05 && r.dashCd > 3.2 - 0.2 - 1.8 - 0.05, `refund capped at three cuts (cd ${r.dashCd.toFixed(2)})`);
  assert.ok(r.effects.filter(f => f.text === 'RIPOSTE').length === 3);
});

test('Marksman and Cannoneer dashes do not cut; Riposte is Skirmisher-only in the draft', () => {
  const s = arenaWith(['drone']); s.enemies[0].x = 720;
  s.dash({ x: 1200, y: 520 }); tick(s, 0.3);
  assert.equal(s.enemies[0].hp, s.enemies[0].maxHp); assert.equal(s.cutEvent, 0);
  const u = UPGRADES.find(x => x.id === 'riposte');
  assert.equal(eligible(u, [], 'marksman'), false); assert.equal(eligible(u, [], 'cannoneer'), false); assert.equal(eligible(u, [], 'skirmisher'), true);
});

// ---------------------------------------------------------------- mid-wave events

test('Events are never scheduled before wave 3, and later ones land in the fighting window', () => {
  const s = setup();
  for (let i = 0; i < 60; i++) { s.rng.seed = 100 + i; assert.equal(s.scheduleEvent(2), null); }
  let hits = 0; const kinds = new Set();
  for (let i = 0; i < 200; i++) {
    s.rng.seed = 700 + i;
    const ev = s.scheduleEvent(6);
    if (ev) { hits++; kinds.add(ev.kind); assert.ok(ev.at >= 2.5 && ev.at <= 7); }
  }
  assert.ok(hits > 40 && hits < 160, `${hits} of 200 waves carried an event`);
  assert.ok(kinds.has('ambush') && kinds.has('barrage') && kinds.has('bounty') && kinds.has('champion'));
  for (let i = 0; i < 100; i++) { s.rng.seed = 3000 + i; const ev = s.scheduleEvent(3); if (ev) assert.ok(ev.kind === 'ambush' || ev.kind === 'bounty', 'wave 3 only knows ambush and bounty'); }
});

test('Ambush: omens ring the player, then portals open there and the wave counts the newcomers', () => {
  const s = arenaWith(['drone']); s.wave = 6; s.spawnQueue = [];
  s.fireEvent('ambush');
  assert.equal(s.omens.length, 4); assert.equal(s.eventEvent, 1); assert.equal(s.eventBanner.text, EVENT_LABEL.ambush);
  assert.ok(s.omens.every(o => o.kind === 'ambush' && Math.hypot(o.x - s.player.x, o.y - s.player.y) < 300));
  assert.equal(s.snapshot().enemiesLeft, 5, 'omens count as inbound');
  tick(s, 1.2);
  assert.equal(s.omens.length, 0);
  const newcomers = s.enemies.slice(1);
  assert.equal(newcomers.length, 4); assert.ok(newcomers.every(e => e.spawn < 1 && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 300));
  assert.ok(newcomers.every(e => e.kind === 'drone' || e.kind === 'leech'));
  tick(s, 2.5); assert.equal(s.eventBanner, null, 'banner fades');
});

test('Barrage rains seven staggered ground bursts, three of them on the player', () => {
  const s = arenaWith(['drone']); s.wave = 5;
  s.fireEvent('barrage');
  const circles = s.dangers.filter(d => d.kind === 'circle');
  assert.equal(circles.length, 7);
  assert.ok(circles.filter(d => Math.hypot(d.x - s.player.x, d.y - s.player.y) < 200).length >= 3);
  const delays = circles.map(d => d.delay); assert.ok(Math.max(...delays) - Math.min(...delays) > 1, 'staggered');
  s.move({ x: 150, y: 150 }); tick(s, 3);
  assert.ok(s.hits <= 1, 'walking off early dodges most of it');
});

test('Bounty drops a large cache far from the player that expires unless collected', () => {
  const s = arenaWith(['drone']); s.wave = 4;
  s.fireEvent('bounty');
  const omen = s.omens.find(o => o.kind === 'bounty'); assert.ok(omen); assert.ok(Math.hypot(omen.x - s.player.x, omen.y - s.player.y) > 380);
  tick(s, 0.8);
  const cache = s.orbs.find(o => o.bounty); assert.ok(cache); assert.equal(cache.value, 10); assert.ok(cache.life > 8);
  tick(s, 1); assert.equal(s.gold, 0, 'not magnetised from across the arena');
  s.player = { x: cache.x, y: cache.y }; s.previous = { ...s.player }; tick(s, 0.05);
  assert.equal(s.gold, 10);
  const t = arenaWith(['drone']); t.wave = 4; t.fireEvent('bounty'); tick(t, 11);
  assert.equal(t.orbs.filter(o => o.bounty).length, 0, 'expired');
});

test('Champion event spawns an affixed non-drone from the wave pool', () => {
  const s = arenaWith(['drone']); s.wave = 6;
  s.fireEvent('champion');
  const champ = s.enemies[1];
  assert.ok(champ && champ.affix, 'always affixed'); assert.notEqual(champ.kind, 'drone'); assert.ok(s.eliteFlash > 0);
  assert.ok(s.eventBanner.sub.includes(champ.kind.toUpperCase()));
});

test('A pending event fires during the fight, not after the wave has cleared, and omens hold the wave open', () => {
  const s = arenaWith(['drone']); s.wave = 5; s.pendingEvents = [{ kind: 'barrage', at: 0.5 }];
  tick(s, 0.4); assert.equal(s.dangers.length, 0);
  tick(s, 0.2); assert.equal(s.pendingEvents.length, 0); assert.equal(s.dangers.length, 7);
  const t = arenaWith(['drone']); t.wave = 5; t.pendingEvents = [{ kind: 'ambush', at: 0.5 }];
  t.kill(t.enemies[0]); tick(t, 0.1);
  assert.equal(t.waveState, 'clear'); assert.equal(t.pendingEvents.length, 0); assert.equal(t.eventEvent, 0, 'no ambush on an empty arena');
  const u = arenaWith(['drone']); u.wave = 5; u.fireEvent('ambush'); u.kill(u.enemies[0]); tick(u, 0.1);
  assert.equal(u.waveState, 'fighting', 'open omens keep the wave alive'); tick(u, 1.2);
  assert.ok(u.alive.length > 0);
});

test('Fairness clause: threat events wait 1.5s after the player drops below a quarter health; choice events do not', () => {
  const s = arenaWith(['drone']); s.wave = 6; s.pendingEvents = [{ kind: 'ambush', at: 0.1 }];
  s.hp = 20; tick(s, 1);
  assert.equal(s.eventEvent, 0, 'held while freshly low'); assert.equal(s.pendingEvents.length, 1);
  tick(s, 0.7); assert.equal(s.eventEvent, 1, 'fires once the grace period passes');
  const t = arenaWith(['drone']); t.wave = 6; t.pendingEvents = [{ kind: 'tithe', at: 0.1 }]; t.hp = 20; tick(t, 0.3);
  assert.equal(t.eventEvent, 1, 'a tithe is a choice, not a threat');
});

test('Tithe: touching the shrine pays out and calls three tougher reinforcements; ignoring it costs nothing', () => {
  const s = arenaWith(['drone']); s.wave = 6; s.fireEvent('tithe');
  const shrine = s.omens.find(o => o.kind === 'shrine'); assert.ok(shrine); assert.equal(shrine.value, 22);
  assert.ok(Math.hypot(shrine.x - s.player.x, shrine.y - s.player.y) > 340);
  tick(s, 1); assert.equal(s.gold, 0);
  s.player = { x: shrine.x, y: shrine.y }; s.previous = { ...s.player }; tick(s, 1 / 120);
  assert.equal(s.gold, 22); assert.equal(s.omens.filter(o => o.kind === 'shrine').length, 0);
  assert.equal(s.omens.filter(o => o.kind === 'ambush').length, 3);
  tick(s, 1.2);
  const called = s.enemies.slice(1); assert.equal(called.length, 3);
  const plain = arenaWith(['drone']); plain.wave = 6; plain.spawnEnemy('drone');
  assert.ok(called.find(e => e.kind === 'drone').maxHp > plain.enemies[1].maxHp * 1.2, 'reinforcements carry +25% HP');
  const u = arenaWith(['drone']); u.wave = 6; u.fireEvent('tithe'); tick(u, 8.2);
  assert.equal(u.omens.length, 0, 'shrine expires'); assert.equal(u.enemies.length, 1, 'nothing called');
});

test('Cull: three fleeing quarry make the player vulnerable until they are dead or gone', () => {
  const s = arenaWith(['drone']); s.wave = 7; s.fireEvent('cull');
  const quarry = s.enemies.filter(e => s.cullIds.includes(e.id));
  assert.equal(quarry.length, 3); assert.ok(quarry.every(e => e.affix === 'gilded' && e.gold === 8 && e.life === 12));
  assert.equal(s.vulnerable, true); assert.equal(s.snapshot().cull, 3);
  const base = 10 * 1 * (1 + s.wave * 0.03);
  assert.ok(Math.abs(s.hazardDamage(10) - base * 1.2) < 1e-9, '+20% damage taken');
  for (const q of quarry) { q.spawn = 1; q.life = 0.01; } tick(s, 0.1);
  assert.equal(s.vulnerable, false); assert.ok(Math.abs(s.hazardDamage(10) - base) < 1e-9);
});

test('Enrage clock: waves that drag on speed up and hit harder, visibly and in steps', () => {
  const s = arenaWith(['drone']); s.wave = 5; const e = s.enemies[0]; e.speed = 100;
  assert.equal(s.enrageLimit, 52.5); assert.equal(s.enrage, 0);
  s.fightTime = 52.4; tick(s, 0.2); assert.equal(s.enrage, 1);
  assert.ok(Math.abs(s.hazardDamage(10) - 10 * 1.15 * 1.1) < 1e-9);
  s.fightTime = 52.5 + 5 * 3 + 0.1; assert.equal(s.enrage, 4);
  assert.ok(s.snapshot().enrageIn < 0);
  s.waveState = 'clear'; assert.equal(s.enrage, 0, 'only during the fight');
});

test('Ramp: budget is super-linear past wave 8, late HP climbs, Wardens come every wave from 10 and in pairs on sixths', () => {
  const s = setup();
  assert.ok(s.budget(20) / s.budget(10) >= 2.6); assert.ok(s.budget(15) > s.budget(10) * 1.7);
  assert.equal(s.lateHp(8), 1); assert.ok(Math.abs(s.lateHp(20) - 1.72) < 1e-9);
  assert.equal(s.wardenCount(3), 1); assert.equal(s.wardenCount(4), 0); assert.equal(s.wardenCount(6), 2); assert.equal(s.wardenCount(10), 1); assert.equal(s.wardenCount(11), 1); assert.equal(s.wardenCount(12), 2);
  s.beginWave(12); assert.equal(s.spawnQueue.filter(k => k === 'warden').length, 2);
  const soft = computeStats({ ...settings, attackSpeed: 2.4 }, [relic('rapid', 6)]);
  assert.ok(soft.attackSpeed < 2.4 * Math.pow(1.12, 6) && soft.attackSpeed > 2.4, 'attack speed past 2.4 is compressed');
});

test('Wave clear income flattens late and champion gold is modest', () => {
  const s = arenaWith(['drone']); s.wave = 12; s.kill(s.enemies[0]); tick(s, 0.05);
  assert.equal(s.gold, 4 + Math.floor(12 * 0.6));
  const t = arenaWith(['archer']); t.applyAffix(t.enemies[0], 'warded'); assert.equal(t.enemies[0].gold, 3);
});

test('Godmode Skirmisher autopilot reaches wave 9 with events firing along the way', () => {
  const s = setup({ difficulty: 'easy', ...skirmisher });
  let elapsed = 0;
  while (s.wave < 9 && elapsed < 900) {
    s.hp = 1e9;
    if (s.status === 'choosing') { s.choose(0); s.continueWave(); }
    else if (s.status === 'running') {
      const t = s.targetable().sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
      // Orbwalk: step, then throw, so Tempo actually fires.
      if (t && !s.target && s.cooldown <= 0.05) s.attack(t);
      else if (t && s.windupLeft <= 0 && s.cooldown > 0.15 && !s.destination) s.move({ x: s.player.x + (s.player.x < 750 ? 30 : -30), y: s.player.y + (s.player.y < 460 ? 20 : -20) });
      if (t && s.dashCharges > 0 && Math.hypot(t.x - s.player.x, t.y - s.player.y) < 150) s.dash(t);
      s.update(1 / 120); elapsed += 1 / 120;
    } else break;
  }
  assert.ok(s.wave >= 9, `reached wave ${s.wave}`);
  assert.ok(s.tempoShots > 20, `${s.tempoShots} tempo shots`); assert.ok(s.cutEvent > 0, 'blade dash cut something');
  assert.ok(s.eventEvent >= 1, `${s.eventEvent} mid-wave events fired`);
  assert.ok(Number.isFinite(s.player.x) && s.enemies.every(e => Number.isFinite(e.x)));
});
