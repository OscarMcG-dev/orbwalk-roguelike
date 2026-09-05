import assert from 'node:assert/strict';
import test from 'node:test';
import { FX_SEED_SALT, Simulation } from '../src/game/sim.ts';
import { autopilotRun } from './harness.mjs';

/** Semantic gameplay state only: no effects, particles or object identity. */
const semantic = s => ({
  wave: s.wave, gold: s.gold, kills: s.kills, hp: Math.round(s.hp), status: s.status,
  relics: s.relics.map(r => `${r.id}x${r.stacks}`), shards: { ...s.shards },
  offers: (s.offers ?? []).map(o => `${o.id}:${o.rarity}`), anvil: s.anvil.map(a => a.key),
  enemies: s.enemies.filter(e => !e.dead).map(e => `${e.kind}${e.affix ?? ''}${e.elite ? '!' : ''}`).sort(),
  rngSeed: s.rng.seed,
});

test('Particle density does not change gameplay: identical seed and commands give identical state with particles off and on', () => {
  for (const seed of [1, 2, 3, 11]) {
    const off = autopilotRun({ seed, target: 9, tuning: { particles: 0 } });
    const on = autopilotRun({ seed, target: 9, tuning: { particles: 1 } });
    const dense = autopilotRun({ seed, target: 9, tuning: { particles: 2.5 } });
    assert.deepEqual(semantic(on.sim), semantic(off.sim), `seed ${seed}: particles on vs off`);
    assert.deepEqual(semantic(dense.sim), semantic(off.sim), `seed ${seed}: dense vs off`);
    assert.deepEqual(on.goldAtShop, off.goldAtShop);
    assert.deepEqual(on.eventsByKind, off.eventsByKind);
  }
});

test('Cosmetic RNG is derived from the gameplay seed by the documented salt and never consumes a gameplay draw', () => {
  const s = new Simulation({ mode: 'run', drill: 'mixed', difficulty: 'standard', hero: 'marksman', quick: false, showRange: true, sound: false, shake: true });
  s.rng.seed = 42;
  s.start();
  assert.equal(s.fx.seed, (42 ^ FX_SEED_SALT) >>> 0);
  const before = s.rng.seed;
  for (let i = 0; i < 50; i++) { s.burst(s.player, '#fff', 6); s.puff(); }
  assert.equal(s.rng.seed, before, 'burst and puff must not touch the gameplay stream');
  assert.notEqual(s.fx.seed, (42 ^ FX_SEED_SALT) >>> 0, 'burst and puff draw from fx');
});
