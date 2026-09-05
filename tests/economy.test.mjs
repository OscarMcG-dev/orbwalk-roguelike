// Meta-economy pins: seeded godmode autopilot runs measure what the systems hand out. These guard the
// tuning in research/candlesan/ECONOMY.md against drift: the draft must not be a straight shot to power,
// gold must run out, and randomness must have memory. Baselines before the pass live in research/BASELINE-v0.3.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/sim.ts';
import { RARITY_BAG } from '../src/game/upgrades.ts';
import { autopilotRun, baseSettings, manyRuns, median } from './harness.mjs';

/** Spend-everything policy: fourth offer, ascend, then shards. Heals are pointless under godmode. */
const spendAll = (s, out) => {
  if (!s.fourthBought && s.gold >= s.fourthCost) s.buyFourth();
  if (!s.ascended && s.gold >= s.ascendCost) s.ascend();
  while (s.anvil.length && s.anvilLeft > 0 && s.gold >= s.anvilCost) { const g = s.gold; s.buyShard(0); if (s.gold < g) out.anvilBuys++; else break; }
};

const RUNS = 24;
/** Default pilot: anvil only, keeps a heal in reserve. Spenders buy every sink they can reach. */
const runs = manyRuns(RUNS, { target: 10, seed: 777 });
const spenders = manyRuns(RUNS, { target: 10, seed: 777, spend: spendAll });

test('Every seeded run reaches wave 10 and stays finite', () => {
  for (const r of [...runs, ...spenders]) { assert.equal(r.wave, 10, `seed ${r.seed} stalled at wave ${r.wave}`); assert.ok(Number.isFinite(r.sim.player.x)); }
});

test('Prismatics are rationed: one guaranteed by wave 9, usually one or two by wave 10, never a triple shop before wave 12', () => {
  for (const set of [runs, spenders]) {
    const owned = set.map(r => r.prismatics);
    assert.ok(owned.every(n => n >= 1), 'the hidden first Prismatic always lands by wave 9');
    assert.ok(median(owned) <= 2, `median ${median(owned)}`);
    assert.ok(Math.max(...owned) <= 3, `max ${Math.max(...owned)}`);
    assert.ok(owned.filter(n => n === 1).length >= set.length * 0.2, 'a real share of runs hold exactly one');
    for (const r of set) for (const [wave, n] of Object.entries(r.prismaticsOfferedByWave)) if (Number(wave) < 12) assert.ok(n < 3, `triple Prismatic shop on wave ${wave}`);
  }
  const firsts = runs.map(r => r.firstPrismaticWave);
  assert.ok(new Set(firsts).size >= 3, 'no fixed Prismatic wave to farm towards');
  assert.ok(Math.max(...firsts) <= 9 && Math.min(...firsts) >= 1, `first Prismatic picked between waves ${Math.min(...firsts)} and ${Math.max(...firsts)}`);
});

test('Rarity comes from a marble bag with memory: 65 / 30 / 5 over a long draw, at most two Prismatics in any 20', () => {
  const s = new Simulation(baseSettings()); s.start();
  const draws = []; for (let i = 0; i < 400; i++) draws.push(s.drawRarity());
  const share = r => draws.filter(x => x === r).length / draws.length;
  assert.ok(share('silver') > 0.62 && share('silver') < 0.68); assert.ok(share('gold') > 0.27 && share('gold') < 0.33); assert.ok(share('prismatic') > 0.03 && share('prismatic') < 0.07);
  for (let i = 0; i + 20 <= draws.length; i++) assert.ok(draws.slice(i, i + 20).filter(x => x === 'prismatic').length <= 2);
  assert.equal(RARITY_BAG.length, 20);
});

test('Gold runs out: spenders end wave 10 nearly broke, Ascend is a stretch, and the anvil is no longer bought out', () => {
  const left = spenders.map(r => r.goldLeft);
  assert.ok(median(left) < 30, `median gold left ${median(left)}`);
  const ascends = spenders.reduce((n, r) => n + (r.ascends ?? 0), 0);
  assert.ok(ascends <= spenders.length * 0.5, `Ascend bought ${ascends} times across ${spenders.length} runs: too cheap`);
  assert.ok(median(spenders.map(r => r.anvilBuys)) <= 8, 'the anvil is no longer bought out every shop');
  assert.ok(median(runs.map(r => r.anvilBuys)) <= 10);
  const earned = median(spenders.map(r => r.goldEarned));
  assert.ok(earned >= 120 && earned <= 220, `median gold earned to wave 10 is ${earned}`);
  // What a wave-10 shop would like to buy costs several times what a run has: discretion is forced.
  const s = spenders[0].sim; s.wave = 10;
  const wants = s.ascendCost + s.fourthCost + s.healCost + s.anvilCost * 2 + 4 + 8;
  assert.ok(wants > 90, `a wave-10 shop wants ${wants} gold`);
});

test('Anvil price is monotonic across a run and the seventh shard costs at least 30', () => {
  const s = new Simulation(baseSettings()); s.start();
  const costs = [];
  for (let w = 1; w <= 7; w++) { s.wave = w; s.openShop(); s.gold = 999; costs.push(s.anvilCost); s.buyShard(0); }
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
  assert.ok(costs[6] >= 30);
});

test('At least a third of scheduled events from wave 6 are choices, and two events a wave only from wave 8', () => {
  const s = new Simulation(baseSettings()); s.start();
  let total = 0, choice = 0, doubles = 0;
  for (let n = 6; n <= 15; n++) for (let i = 0; i < 60; i++) {
    s.rng.seed = n * 1000 + i;
    const evs = s.scheduleEvents(n);
    if (evs.length === 2) { doubles++; assert.ok(evs[1].at - evs[0].at >= 6, 'second event never overlaps the first'); }
    for (const ev of evs) { total++; if (ev.kind === 'tithe' || ev.kind === 'cull') choice++; }
  }
  assert.ok(choice / total >= 0.3, `${Math.round(choice / total * 100)}% choice events`);
  assert.ok(doubles > 0);
  for (let i = 0; i < 100; i++) { s.rng.seed = 42 + i; assert.ok(s.scheduleEvents(7).length <= 1); }
});

test('A strong build still bleeds late: a scripted Tempest / Split / Rapid Fire / Heavy Bolts run takes real damage on wave 12', () => {
  const strong = autopilotRun({
    seed: 4242, target: 13, spend: () => {},
    shop: s => {
      const want = ['tempest', 'split', 'rapid', 'heavy', 'keen', 'ricochet'];
      const idx = s.offers.findIndex(o => want.includes(o.id));
      return idx >= 0 ? idx : 0;
    },
  });
  assert.equal(strong.wave, 13);
  const w12 = strong.damageByWave[12] ?? 0, secs = strong.waveSeconds[12] ?? 1;
  assert.ok(w12 / secs > 15, `wave 12 dealt ${(w12 / secs).toFixed(1)} damage per second to a stationary pilot`);
  assert.ok((strong.damageByWave[12] ?? 0) > (strong.damageByWave[6] ?? 0), 'late waves out-threaten mid waves');
});
