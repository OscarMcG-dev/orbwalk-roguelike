// Seeded headless autopilot for economy and pacing tests. Not a test file itself (node --test only picks
// up *.test.mjs). The pilot is deliberately simple and godmoded: it measures what the SYSTEMS hand out
// (gold, drafts, anvil, events), not player skill.
import { Simulation } from '../src/game/sim.ts';
import { heroById } from '../src/game/heroes.ts';

export const baseSettings = (hero = 'marksman', difficulty = 'standard') => ({
  mode: 'run', drill: 'mixed', difficulty, hero, ...heroById(hero).profile, quick: false, showRange: true, sound: false, shake: true,
});

/**
 * Run one seeded godmode run to `target` wave.
 * `shop(s)` decides the draft; default picks the highest rarity on offer. `spend(s)` decides anvil/heal spending;
 * default buys shards greedily while keeping a heal in reserve.
 */
export function autopilotRun({ seed = 1, hero = 'marksman', difficulty = 'standard', target = 12, maxTime = 1500, shop, spend, tuning } = {}) {
  const s = new Simulation(baseSettings(hero, difficulty));
  if (tuning) s.setTuning(tuning);
  s.rng.seed = seed >>> 0 || 1;
  s.start();
  const out = {
    seed, wave: 1, time: 0, shops: 0, dryShops: 0, prismatics: 0, golds: 0, silvers: 0, firstPrismaticWave: null,
    offered: { silver: 0, gold: 0, prismatic: 0 }, prismaticsOfferedByWave: {}, anvilBuys: 0, heals: 0, goldEarned: 0, goldAtShop: [], events: 0, champions: 0,
    eventsByKind: {}, kills: 0, hitsTaken: 0, sim: s,
    /** Damage the godmoded pilot would have taken, per wave: a crude threat curve. */
    damageByWave: {}, hitsByWave: {}, waveSeconds: {},
  };
  const order = { prismatic: 0, gold: 1, silver: 2 };
  let lastGold = 0;
  // Record incoming damage at the source so godmode healing cannot distort it.
  const hurt = s.hurt.bind(s), drain = s.drain.bind(s);
  s.hurt = base => { out.damageByWave[s.wave] = (out.damageByWave[s.wave] ?? 0) + Math.max(1, Math.round(s.hazardDamage(base) - s.stats.armor)); hurt(base); };
  s.drain = (base, dt) => { out.damageByWave[s.wave] = (out.damageByWave[s.wave] ?? 0) + s.hazardDamage(base) * dt; drain(base, dt); };
  while (s.wave < target && out.time < maxTime) {
    // Godmode: raise max HP as well so the pilot's own healing cannot clamp HP and corrupt the damage tally.
    s.hp = 1e9; s.stats.maxHp = 1e9; s.shield = 0;
    if (s.status === 'choosing') {
      out.shops++;
      out.goldAtShop.push(s.gold);
      const offers = s.offers;
      for (const o of offers) out.offered[o.rarity]++;
      out.prismaticsOfferedByWave[s.wave] = offers.filter(o => o.rarity === 'prismatic').length;
      if (offers.every(o => o.rarity === 'silver')) out.dryShops++;
      const goldBefore = s.gold, ascendBefore = s.ascendNext, fourthBefore = s.offers.length;
      if (spend) spend(s, out);
      else {
        while (s.anvil.length && s.gold - s.anvilCost >= s.healCost) { const g = s.gold; s.buyShard(0); if (s.gold < g) out.anvilBuys++; else break; }
      }
      out.goldSpent = (out.goldSpent ?? 0) + (goldBefore - s.gold);
      if (s.ascendNext && !ascendBefore) out.ascends = (out.ascends ?? 0) + 1;
      if (s.offers.length > fourthBefore) out.fourths = (out.fourths ?? 0) + 1;
      const idx = shop ? shop(s) : offers.map((o, i) => [o, i]).sort((a, b) => order[a[0].rarity] - order[b[0].rarity])[0][1];
      const pick = offers[idx];
      if (pick.rarity === 'prismatic') { out.prismatics++; out.firstPrismaticWave ??= s.wave; }
      else if (pick.rarity === 'gold') out.golds++;
      else out.silvers++;
      s.choose(idx);
      s.continueWave();
    } else if (s.status === 'running') {
      if (!s.target || s.target.dead) {
        const t = s.targetable().sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
        if (t) s.attack(t);
      }
      if (s.latched && s.dashCharges > 0) s.dash({ x: s.player.x + 200, y: s.player.y });
      const ev = s.eventEvent, ch = s.championEvent, hits = s.hits, w = s.wave;
      s.update(1 / 120);
      out.time += 1 / 120;
      out.waveSeconds[w] = (out.waveSeconds[w] ?? 0) + 1 / 120;
      if (s.hits > hits) out.hitsByWave[w] = (out.hitsByWave[w] ?? 0) + (s.hits - hits);
      if (s.gold > lastGold) out.goldEarned += s.gold - lastGold;
      lastGold = s.gold;
      if (s.eventEvent > ev) { out.events++; const k = s.eventBanner?.text ?? '?'; out.eventsByKind[k] = (out.eventsByKind[k] ?? 0) + 1; }
      if (s.championEvent > ch) out.champions++;
    } else break;
  }
  out.wave = s.wave;
  out.kills = s.kills;
  out.hitsTaken = s.hits;
  out.goldLeft = s.gold;
  return out;
}

export function manyRuns(n, opts = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(autopilotRun({ ...opts, seed: (opts.seed ?? 12345) + i * 7919 }));
  return runs;
}

export const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
export const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
