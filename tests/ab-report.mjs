// A/B report: run the seeded godmode pilot under two tuning presets and print a markdown comparison.
// Not a test (node --test only picks up *.test.mjs). Usage:
//   node tests/ab-report.mjs [presetA] [presetB] [runs] [targetWave]
// Defaults: ledger iron 30 12. The pilot never dodges and never moves, so "damage / s" is pressure on a
// stationary target, not a survival prediction. Player-facing numbers (windup, margins) are exact.
import { HEROES } from '../src/game/heroes.ts';
import { kiteMargins, presetById } from '../src/game/tuning.ts';
import { manyRuns, mean, median } from './harness.mjs';

const [aId = 'ledger', bId = 'iron', runsArg = '30', targetArg = '12'] = process.argv.slice(2);
const A = presetById(aId), B = presetById(bId);
const RUNS = Number(runsArg), TARGET = Number(targetArg);

const fmt = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : '-';
const perWave = runs => {
  const rows = {};
  for (let w = 1; w < TARGET; w++) {
    const secs = runs.map(r => r.waveSeconds[w] ?? 0), dmg = runs.map(r => r.damageByWave[w] ?? 0), hits = runs.map(r => r.hitsByWave[w] ?? 0);
    rows[w] = { secs: mean(secs), dmg: mean(dmg), hits: mean(hits), dps: mean(dmg) / Math.max(1, mean(secs)) };
  }
  return rows;
};

console.log(`# A/B report: ${A.tag} ${A.name} vs ${B.tag} ${B.name}\n`);
console.log(`Seeded godmode pilot, ${RUNS} runs each to wave ${TARGET}, standard difficulty, Marksman. The pilot holds its target, never moves and never dodges.\n`);

console.log('## Player numbers per class\n');
console.log('| Class | Variant | Walk | Shots / s | Windup ms | Range |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const h of HEROES) {
  for (const p of [A, B]) {
    const t = p.tuning, as = h.profile.attackSpeed * t.playerAttackSpeed, wu = h.profile.windup * t.playerWindup;
    console.log(`| ${h.name} | ${p.tag} | ${Math.round(h.profile.moveSpeed * t.playerMove)} | ${fmt(as, 2)} | ${Math.round(1000 / as * wu / 100)} | ${Math.round(h.profile.range * t.playerRange)} |`);
  }
}

console.log('\n## Kite margin (Marksman walking speed minus enemy speed; negative means it catches you on foot)\n');
console.log('| Wave | Variant | Drone | Archer | Bomber | Leech |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const w of [1, 4, 6, 8, 10, 12]) {
  for (const p of [A, B]) {
    const m = kiteMargins(p.tuning, 325, w);
    console.log(`| ${w} | ${p.tag} | ${Math.round(m.drone)} | ${Math.round(m.archer)} | ${Math.round(m.bomber)} | ${Math.round(m.leech)} |`);
  }
}

const ra = manyRuns(RUNS, { target: TARGET, seed: 2026, tuning: A.tuning });
const rb = manyRuns(RUNS, { target: TARGET, seed: 2026, tuning: B.tuning });
const pa = perWave(ra), pb = perWave(rb);

console.log('\n## Threat curve (mean per wave)\n');
console.log('| Wave | Seconds A | Seconds B | Damage / s A | Damage / s B | Hits A | Hits B |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (let w = 1; w < TARGET; w++) console.log(`| ${w} | ${fmt(pa[w].secs)} | ${fmt(pb[w].secs)} | ${fmt(pa[w].dps)} | ${fmt(pb[w].dps)} | ${fmt(pa[w].hits)} | ${fmt(pb[w].hits)} |`);

const total = runs => median(runs.map(r => Object.values(r.damageByWave).reduce((x, y) => x + y, 0)));
console.log('\n## Run totals (median)\n');
console.log('| Metric | A | B |');
console.log('| --- | --- | --- |');
console.log(`| Damage to the stationary pilot to wave ${TARGET} | ${Math.round(total(ra))} | ${Math.round(total(rb))} |`);
console.log(`| Run seconds to wave ${TARGET} | ${Math.round(median(ra.map(r => r.time)))} | ${Math.round(median(rb.map(r => r.time)))} |`);
console.log(`| Shops | ${median(ra.map(r => r.shops))} | ${median(rb.map(r => r.shops))} |`);
console.log(`| Prismatics owned | ${median(ra.map(r => r.prismatics))} | ${median(rb.map(r => r.prismatics))} |`);
console.log(`| Gold earned | ${median(ra.map(r => r.goldEarned))} | ${median(rb.map(r => r.goldEarned))} |`);
console.log(`| Mid-wave events | ${fmt(mean(ra.map(r => r.events)))} | ${fmt(mean(rb.map(r => r.events)))} |`);
