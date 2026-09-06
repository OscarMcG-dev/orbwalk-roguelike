// Brief 05: the earned arsenal. Pure account transactions (cases, odds, guarantee, duplicates, settlement, equip,
// validation) and the loadout's effect on the simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASE_POOL, CATALOGUE, CHASE_MASTERY_WAVES, DEFAULT_CASE, DUPLICATE_REFUND, PITY_GUARANTEE, STANDARD_PRICE, CHASE_PRICE,
  acknowledgeReveal, buyDirect, caseTier, chanceWithin, compatible, equipItem, grantLegacyUnlocks, itemById, loadoutFor, loadoutReadout, newAccount,
  nextCaseOdds, nextRequestId, owns, purchaseCase, setWishlist, settleRun, validateAccount, weaponItemId,
} from '../src/game/arsenal.ts';
import { DELAYED_BURST, Simulation } from '../src/game/sim.ts';
import { heroById, isUnlocked } from '../src/game/heroes.ts';
import { autopilotRun } from './harness.mjs';

const acc = (credits = 1000, seed = 7) => ({ ...newAccount('save-test', seed), credits });
const settings = hero => ({ mode: 'run', drill: 'mixed', difficulty: 'standard', hero, ...heroById(hero).profile, quick: false, showRange: true, sound: false, shake: true });
const setup = (hero, mods = {}) => { const s = new Simulation(settings(hero)); s.setLoadout(mods); s.start(); s.enemies = []; s.spawnQueue = []; s.pendingEvents = []; s.waveState = 'fighting'; return s; };
const tick = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) s.update(1 / 120); };
const until = (s, pred, max = 10) => { let t = 0; while (!pred() && t < max) { s.update(1 / 120); t += 1 / 120; } return pred(); };
const place = (s, kind, x, y, hp = 1e6) => { const e = s.spawnEnemy(kind, { x, y }); e.spawn = 1; e.speed = 0; e.hp = e.maxHp = hp; return e; };

// ---------------------------------------------------------------- catalogue

test('The launch case holds exactly twelve items (6 Standard, 3 Signature finishes, 3 Chase) with stable ids; weapons sit outside the case', () => {
  assert.equal(CASE_POOL.length, 12);
  assert.equal(caseTier('standard').length, 6); assert.equal(caseTier('signature').length, 3); assert.equal(caseTier('chase').length, 3);
  assert.deepEqual(caseTier('signature').map(i => i.id), ['finish.matte-enamel', 'finish.copper-inlay', 'finish.signal-tape']);
  assert.ok(caseTier('standard').every(i => i.price === STANDARD_PRICE) && caseTier('signature').every(i => i.price === STANDARD_PRICE) && caseTier('chase').every(i => i.price === CHASE_PRICE));
  assert.equal(CATALOGUE.filter(i => i.slot === 'weapon').length, 5);
  assert.equal(new Set(CATALOGUE.map(i => i.id)).size, CATALOGUE.length, 'ids unique');
  // Two compatible standard parts per launch class, one Action and one Handling each.
  for (const h of ['rifleman', 'arbalest', 'cannoneer']) {
    const parts = caseTier('standard').filter(i => compatible(i, h));
    assert.deepEqual(parts.map(i => i.slot).sort(), ['action', 'handling'], h);
    assert.equal(caseTier('chase').filter(i => compatible(i, h)).length, 1);
  }
  assert.ok(caseTier('signature').every(i => compatible(i, 'marksman') && compatible(i, 'gunslinger')), 'finishes fit everything');
  assert.equal(compatible(itemById('part.rifleman.short-clip'), 'arbalest'), false);
});

// ---------------------------------------------------------------- cases

test('purchaseCase debits the price, grants the item, advances the sequence and RNG state, and refuses without funds', () => {
  const a = acc(100);
  const id = nextRequestId(a);
  assert.equal(id, 'save-test:1');
  const r = purchaseCase(a, id);
  assert.ok(r.ok);
  const b = r.account;
  assert.equal(b.credits, 0 + r.value.refund); assert.equal(b.purchaseSequence, 1); assert.notEqual(b.lootRngState, a.lootRngState);
  assert.ok(owns(b, r.value.itemId)); assert.equal(b.pendingReceipt.requestId, id); assert.equal(b.revision, a.revision + 1);
  assert.equal(a.credits, 100, 'pure: the input is untouched');
  const poor = purchaseCase(acc(99), nextRequestId(acc(99)));
  assert.equal(poor.ok, false); assert.match(poor.error, /Need 100/);
  const neg = purchaseCase({ ...acc(150), credits: 150.5 }, 'save-test:1');
  assert.equal(neg.ok, false, 'non-integer balances are refused');
});

test('Repeated requests are idempotent, stale ids are refused, and a pending reveal blocks a fresh purchase (double click)', () => {
  const a = acc(500);
  const id = nextRequestId(a);
  const first = purchaseCase(a, id); assert.ok(first.ok);
  const again = purchaseCase(first.account, id);
  assert.ok(again.ok); assert.deepEqual(again.value, first.value); assert.equal(again.account, first.account, 'no second debit, no second roll');
  const second = purchaseCase(first.account, nextRequestId(first.account));
  assert.equal(second.ok, false); assert.match(second.error, /pending/);
  const stale = purchaseCase(acknowledgeReveal(first.account), 'save-test:9');
  assert.equal(stale.ok, false); assert.match(stale.error, /Stale/);
  const ok = purchaseCase(acknowledgeReveal(first.account), nextRequestId(first.account));
  assert.ok(ok.ok); assert.equal(ok.account.purchaseSequence, 2);
});

test('Tier odds: 0% chase and 0% signature is always Standard; 100% signature is always Signature; 100% chase is always Chase', () => {
  const roll = (cfg, n = 40) => {
    let a = acc(1e6, 11); const tiers = new Set();
    for (let i = 0; i < n; i++) { const r = purchaseCase(a, nextRequestId(a), cfg); assert.ok(r.ok); tiers.add(r.value.tier); a = acknowledgeReveal(r.account); }
    return tiers;
  };
  assert.deepEqual([...roll({ caseCost: 1, chaseOdds: 0, signatureOdds: 0 })], ['standard']);
  assert.deepEqual([...roll({ caseCost: 1, chaseOdds: 0, signatureOdds: 1 })], ['signature']);
  assert.deepEqual([...roll({ caseCost: 1, chaseOdds: 1, signatureOdds: 0 })], ['chase']);
  // The default mix: over many cases every tier shows up and Chase stays rare.
  let a = acc(1e6, 3); const counts = { standard: 0, signature: 0, chase: 0 };
  for (let i = 0; i < 2000; i++) { const r = purchaseCase(a, nextRequestId(a), DEFAULT_CASE); counts[r.value.tier]++; a = acknowledgeReveal(r.account); }
  assert.ok(counts.standard > 1450 && counts.standard < 1750, `standard ${counts.standard}`);
  assert.ok(counts.signature > 280 && counts.signature < 480, `signature ${counts.signature}`);
  assert.ok(counts.chase >= 25 && counts.chase <= 70, `chase ${counts.chase} (includes guarantees)`);
});

test('Duplicates refund 20 for a net debit of 80 and never grant a second copy; the receipt says so', () => {
  let a = acc(1000, 5);
  const cfg = { caseCost: 100, chaseOdds: 0, signatureOdds: 1 }; // three finishes: duplicates arrive fast
  const seen = new Set(); let dup = null;
  for (let i = 0; i < 12 && !dup; i++) {
    const r = purchaseCase(a, nextRequestId(a), cfg);
    if (seen.has(r.value.itemId)) dup = { before: a, r };
    seen.add(r.value.itemId); a = acknowledgeReveal(r.account);
  }
  assert.ok(dup, 'a duplicate turned up');
  assert.equal(dup.r.value.duplicate, true); assert.equal(dup.r.value.refund, DUPLICATE_REFUND);
  assert.equal(dup.r.account.credits, dup.before.credits - 100 + DUPLICATE_REFUND);
  assert.equal(dup.r.account.owned.length, dup.before.owned.length);
});

test('Guarantee: the 60th consecutive non-Chase case is a Chase, honours the wishlist snapshot, and resets the counter; a rolled Chase resets it too', () => {
  const cfg = { caseCost: 1, chaseOdds: 0, signatureOdds: 0 };
  let a = acc(1e6, 9);
  a = setWishlist(a, 'chase.cannoneer.delayed-burst');
  assert.equal(a.wishlist, 'chase.cannoneer.delayed-burst');
  assert.equal(setWishlist(a, 'part.rifleman.short-clip').wishlist, a.wishlist, 'only Chase parts can be wished');
  for (let i = 1; i < PITY_GUARANTEE; i++) {
    const odds = nextCaseOdds(a, cfg);
    assert.equal(odds.guaranteed, false); assert.equal(odds.casesToGuarantee, PITY_GUARANTEE - i + 1);
    const r = purchaseCase(a, nextRequestId(a), cfg); assert.equal(r.value.tier, 'standard'); a = acknowledgeReveal(r.account);
  }
  assert.equal(a.pity, PITY_GUARANTEE - 1);
  const odds = nextCaseOdds(a, cfg);
  assert.equal(odds.guaranteed, true); assert.equal(odds.chase, 1); assert.equal(odds.standard, 0);
  const g = purchaseCase(a, nextRequestId(a), cfg);
  assert.equal(g.value.tier, 'chase'); assert.equal(g.value.guaranteed, true); assert.equal(g.value.itemId, 'chase.cannoneer.delayed-burst');
  assert.equal(g.account.pity, 0);
  // Natural chase resets pity as well.
  let b = acc(1e6, 2); for (let i = 0; i < 10; i++) { const r = purchaseCase(b, nextRequestId(b), cfg); b = acknowledgeReveal(r.account); }
  assert.equal(b.pity, 10);
  const nat = purchaseCase(b, nextRequestId(b), { caseCost: 1, chaseOdds: 1, signatureOdds: 0 });
  assert.equal(nat.value.tier, 'chase'); assert.equal(nat.value.guaranteed, false); assert.equal(nat.account.pity, 0);
  // Every Chase owned: the guaranteed opening still rolls a Chase and refunds the duplicate; no new tier is invented.
  let c = { ...acc(1e6, 4), owned: caseTier('chase').map(i => i.id), pity: PITY_GUARANTEE - 1 };
  const full = purchaseCase(c, nextRequestId(c), cfg);
  assert.equal(full.value.tier, 'chase'); assert.equal(full.value.duplicate, true); assert.equal(full.value.refund, DUPLICATE_REFUND);
  void c;
});

test('Honest arithmetic: at least one natural Chase in 50 cases is about 39.5%; a specific Chase is 1 in 300 per case', () => {
  assert.ok(Math.abs(chanceWithin(50, 0.01) - 0.395) < 0.001);
  assert.ok(Math.abs(0.01 / 3 - 1 / 300) < 1e-12);
});

// ---------------------------------------------------------------- direct route, settlement, equipping

test('Direct purchases: Standard and Signature parts and weapons at their price; Chase parts need twelve mastered waves', () => {
  let a = acc(400);
  const part = buyDirect(a, 'part.rifleman.short-clip'); assert.ok(part.ok); a = part.account;
  assert.equal(a.credits, 250); assert.ok(owns(a, 'part.rifleman.short-clip'));
  assert.equal(buyDirect(a, 'part.rifleman.short-clip').ok, false, 'already owned');
  assert.equal(buyDirect(a, 'nope').ok, false);
  const w = buyDirect(a, weaponItemId('arbalest')); assert.ok(w.ok); a = w.account;
  assert.equal(a.credits, 210); assert.ok(isUnlocked('arbalest', a));
  const chase = buyDirect({ ...a, credits: 5000 }, 'chase.rifleman.final-round');
  assert.equal(chase.ok, false); assert.match(chase.error, /12 more waves/);
  const mastered = buyDirect({ ...a, credits: 5000, mastery: { rifleman: 12 } }, 'chase.rifleman.final-round');
  assert.ok(mastered.ok); assert.equal(mastered.account.credits, 3000);
  const broke = buyDirect({ ...a, credits: 100, mastery: { rifleman: 12 } }, 'chase.rifleman.final-round');
  assert.equal(broke.ok, false); assert.match(broke.error, /Need 2000/);
});

test('Run settlement: 4 per cleared wave plus 8 per Warden wave, capped at 60, once per settlement id; sandbox runs pay nothing but still count', () => {
  const a = acc(0);
  const r1 = settleRun(a, { settlementId: 'run-1', hero: 'rifleman', wavesCleared: 5, wardenWavesCleared: 1, sandbox: false });
  assert.equal(r1.credits, 28); assert.equal(r1.account.credits, 28); assert.equal(r1.account.mastery.rifleman, 5);
  const again = settleRun(r1.account, { settlementId: 'run-1', hero: 'rifleman', wavesCleared: 5, wardenWavesCleared: 1, sandbox: false });
  assert.equal(again.credits, 0); assert.equal(again.account, r1.account, 'idempotent');
  const capped = settleRun(a, { settlementId: 'run-2', hero: 'marksman', wavesCleared: 20, wardenWavesCleared: 6, sandbox: false });
  assert.equal(capped.credits, 60);
  const sandbox = settleRun(a, { settlementId: 'run-3', hero: 'marksman', wavesCleared: 9, wardenWavesCleared: 3, sandbox: true });
  assert.equal(sandbox.credits, 0); assert.equal(sandbox.mastery, 0); assert.ok(sandbox.account.settlements.includes('run-3'));
  const tuned = settleRun(a, { settlementId: 'run-4', hero: 'marksman', wavesCleared: 3, wardenWavesCleared: 1, sandbox: false }, { creditsPerWave: 10, creditsPerWarden: 0, creditsCap: 25 });
  assert.equal(tuned.credits, 25);
});

test('Equipping: owned, compatible, right slot; one Action means at most one Chase; loadoutFor merges the equipped mods', () => {
  let a = { ...acc(0), owned: ['part.rifleman.short-clip', 'part.rifleman.steady-stock', 'chase.rifleman.final-round', 'finish.copper-inlay', 'part.arbalest.light-frame'] };
  assert.equal(equipItem(a, 'rifleman', 'action', 'part.rifleman.steady-stock').ok, false, 'wrong slot');
  assert.equal(equipItem(a, 'rifleman', 'handling', 'part.arbalest.light-frame').ok, false, 'wrong class');
  assert.equal(equipItem(a, 'rifleman', 'action', 'part.cannoneer.wide-choke').ok, false, 'not owned');
  a = equipItem(a, 'rifleman', 'action', 'part.rifleman.short-clip').account;
  a = equipItem(a, 'rifleman', 'handling', 'part.rifleman.steady-stock').account;
  a = equipItem(a, 'rifleman', 'finish', 'finish.copper-inlay').account;
  let m = loadoutFor(a, 'rifleman');
  assert.equal(m.magazine, 6); assert.equal(m.reloadMult, 0.8); assert.equal(m.steadyStock, true); assert.equal(m.finish, 'finish.copper-inlay'); assert.equal(m.finalRound, false);
  a = equipItem(a, 'rifleman', 'action', 'chase.rifleman.final-round').account;
  m = loadoutFor(a, 'rifleman');
  assert.equal(m.finalRound, true); assert.equal(m.reloadMult, 1, 'the short clip left the slot');
  assert.deepEqual(loadoutFor(a, 'marksman'), { ...loadoutFor(newAccount(), 'marksman') }, 'other classes untouched');
  const rows = loadoutReadout('rifleman', m, { range: 540, moveSpeed: 315, damage: 26, splash: 0 });
  assert.ok(rows.find(r => r.label === 'Rounds' && r.before === '8' && r.after === '6' && r.changed));
  assert.ok(rows.find(r => r.label === 'Final round' && r.changed));
});

// ---------------------------------------------------------------- save envelope

test('validateAccount: round-trips a good save, retires unknown ids without dropping them, clamps bounds, unequips bad slots, rejects garbage', () => {
  const a = { ...acc(50), owned: ['part.rifleman.short-clip', 'weapon.arbalest'], equipped: { rifleman: { action: 'part.rifleman.short-clip', handling: null, finish: null } } };
  const v = validateAccount(JSON.parse(JSON.stringify(a)));
  assert.ok(v.ok); assert.deepEqual(v.account, a); assert.deepEqual(v.issues, []);
  const legacy = validateAccount({ ...a, owned: [...a.owned, 'part.old.thing'], credits: -5, pity: 500, equipped: { rifleman: { action: 'weapon.arbalest' } } });
  assert.ok(legacy.ok);
  assert.deepEqual(legacy.account.retired, ['part.old.thing']); assert.equal(legacy.account.credits, 0); assert.equal(legacy.account.pity, PITY_GUARANTEE - 1);
  assert.equal(legacy.account.equipped.rifleman.action, null);
  assert.ok(legacy.issues.length >= 3);
  for (const bad of [null, 'x', 42, {}, { saveId: '' }, { saveId: 's', schemaVersion: 99 }]) assert.equal(validateAccount(bad).ok, false, JSON.stringify(bad));
  // Legacy progress unlocks migrate once.
  const migrated = grantLegacyUnlocks(newAccount('m', 1), { bestWave: 4, totalKills: 0 });
  assert.ok(owns(migrated, 'weapon.arbalest') && owns(migrated, 'weapon.rifleman') && owns(migrated, 'weapon.cannoneer') && !owns(migrated, 'weapon.gunslinger'));
});

// ---------------------------------------------------------------- loadout in the simulation

test('Short clip: six rounds and a 20% faster reload; the loadout is frozen at run start and never touches the hero definition', () => {
  const s = setup('rifleman', itemById('part.rifleman.short-clip').mods);
  assert.equal(s.ammo, 6); assert.equal(s.magazineSize, 6); assert.ok(Math.abs(s.reloadTime - 1.28) < 1e-9);
  assert.equal(heroById('rifleman').magazine.size, 8, 'hero definition untouched');
  const e = place(s, 'drone', s.player.x + 300, s.player.y);
  s.attack(e);
  assert.ok(until(s, () => s.fired === 6, 10));
  assert.equal(s.pingEvent, 1); assert.ok(Math.abs(s.reloadLeft - 1.28) < 0.02);
  assert.equal(s.snapshot().ammoMax, 6);
  // A new loadout mid-run waits for the next start().
  s.setLoadout({});
  assert.equal(s.magazineSize, 6);
  s.start();
  assert.equal(s.magazineSize, 8);
});

test('Quick spool and light frame: 70 units to crank, three bodies pierced, +3% move and −8% range', () => {
  const s = setup('arbalest', { ...itemById('part.arbalest.quick-spool').mods, ...itemById('part.arbalest.light-frame').mods });
  const plain = setup('arbalest');
  assert.equal(s.crankDistance, 70); assert.equal(s.pierceCount, 3);
  assert.ok(Math.abs(s.stats.moveSpeed / plain.stats.moveSpeed - 1.03) < 1e-9);
  assert.ok(Math.abs(s.stats.range / plain.stats.range - 0.92) < 1e-9);
  s.stats.critChance = 0;
  const line = [0, 1, 2, 3].map(i => place(s, 'drone', s.player.x + 200 + i * 50, s.player.y));
  s.attack(line[0]); assert.ok(until(s, () => s.fired === 1, 4)); tick(s, 0.5);
  assert.ok(line[0].hp < line[0].maxHp && line[2].hp < line[2].maxHp && line[3].hp === line[3].maxHp, 'three bodies, not four');
  s.move({ x: s.player.x - 75, y: s.player.y }); tick(s, 0.4);
  assert.equal(s.crank, 1, 'rewound after 70 units');
});

test('Wide choke and reinforced carriage: +20% splash for −10% damage; heat penalty −20% and a 15% shorter hop in the same direction', () => {
  const s = setup('cannoneer', { ...itemById('part.cannoneer.wide-choke').mods, ...itemById('part.cannoneer.reinforced-carriage').mods });
  const plain = setup('cannoneer');
  assert.ok(Math.abs(s.stats.splash - 55 * 1.2) < 1e-9);
  s.stats.critChance = 0; plain.stats.critChance = 0;
  assert.equal(s.rollDamage().damage, Math.round(plain.rollDamage().damage * 0.9));
  s.heat = 4; plain.heat = 4;
  assert.ok(Math.abs(s.effectiveWindup() / s.stats.windup - (1 + 4 * 0.12 * 0.8)) < 1e-9);
  assert.ok(Math.abs(plain.effectiveWindup() / plain.stats.windup - (1 + 4 * 0.12)) < 1e-9);
  const x1 = s.player.x, x2 = plain.player.x;
  s.dash({ x: s.player.x + 300, y: s.player.y }); plain.dash({ x: plain.player.x + 300, y: plain.player.y });
  tick(s, 0.2); tick(plain, 0.2);
  assert.ok(s.player.x < x1 && plain.player.x < x2, 'both hop away from the cursor');
  assert.ok(Math.abs((x1 - s.player.x) / (x2 - plain.player.x) - 0.85) < 0.02, 'travel is 15% shorter');
  const steady = setup('rifleman', itemById('part.rifleman.steady-stock').mods), base = setup('rifleman');
  assert.deepEqual(steady.stats, base.stats, 'steady stock changes no number');
});

test('Chase · Final round: the last round of a six-round clip punches into one extra body at full damage, once', () => {
  const s = setup('rifleman', itemById('chase.rifleman.final-round').mods);
  s.stats.critChance = 0;
  assert.equal(s.ammo, 6);
  const a = place(s, 'drone', s.player.x + 250, s.player.y), b = place(s, 'drone', s.player.x + 250, s.player.y + 120), c = place(s, 'drone', s.player.x + 250, s.player.y + 400);
  s.attack(a);
  assert.ok(until(s, () => s.fired === 5, 8));
  tick(s, 0.5);
  assert.equal(b.hp, b.maxHp, 'ordinary rounds do not punch');
  assert.equal(s.effects.filter(f => f.text === 'FINAL ROUND').length, 0);
  s.attack(a);
  assert.ok(until(s, () => s.fired === 6, 4));
  assert.ok(s.effects.some(f => f.text === 'FINAL ROUND'));
  tick(s, 0.6);
  const dmgA = a.maxHp - a.hp, dmgB = b.maxHp - b.hp;
  assert.ok(dmgB > 0, 'the nearest other body was punched');
  assert.equal(dmgB, dmgA / 6, 'full damage of one round');
  assert.equal(c.hp, c.maxHp, 'it does not chain again');
});

test('Chase · Spool return: a quarrel through three bodies hands back half the crank once; single-target damage is 15% lower', () => {
  const s = setup('arbalest', itemById('chase.arbalest.spool-return').mods);
  const plain = setup('arbalest');
  s.stats.critChance = 0; plain.stats.critChance = 0;
  assert.equal(s.rollDamage().damage, Math.round(plain.rollDamage().damage * 0.85));
  const line = [0, 1, 2, 3].map(i => place(s, 'drone', s.player.x + 200 + i * 50, s.player.y));
  s.attack(line[0]); assert.ok(until(s, () => s.fired === 1, 4));
  assert.equal(s.crank, 0);
  tick(s, 0.5);
  assert.equal(s.crank, 0.5); assert.equal(s.effects.filter(f => f.text === 'SPOOL RETURN').length, 1);
  const solo = setup('arbalest', itemById('chase.arbalest.spool-return').mods);
  place(solo, 'drone', solo.player.x + 200, solo.player.y);
  solo.attack(solo.enemies[0]); until(solo, () => solo.fired === 1, 4); tick(solo, 0.5);
  assert.equal(solo.crank, 0, 'one body refunds nothing');
});

test('Chase · Delayed burst: no immediate splash; a charge detonates 0.6 s after impact for 60% in a 90 unit ring and never splashes again', () => {
  const s = setup('cannoneer', itemById('chase.cannoneer.delayed-burst').mods);
  s.stats.critChance = 0;
  assert.equal(s.stats.splash, 0);
  const t = place(s, 'drone', s.player.x + 250, s.player.y), n = place(s, 'drone', s.player.x + 250, s.player.y + 60), far = place(s, 'drone', s.player.x + 250, s.player.y + 200);
  s.attack(t);
  assert.ok(until(s, () => s.charges.length === 1, 4), 'a charge was planted on impact');
  const direct = t.maxHp - t.hp;
  assert.ok(direct > 0); assert.equal(n.hp, n.maxHp, 'no immediate splash');
  assert.equal(s.charges[0].delay, DELAYED_BURST.delay); assert.equal(s.charges[0].radius, DELAYED_BURST.radius);
  s.stop();
  tick(s, DELAYED_BURST.delay + 0.02);
  assert.equal(s.charges.length, 0); assert.equal(s.chargeEvent, 1);
  assert.equal(n.maxHp - n.hp, Math.round(direct * DELAYED_BURST.share), 'burst damage on the neighbour');
  assert.equal(t.maxHp - t.hp, direct + Math.round(direct * DELAYED_BURST.share), 'and on the target');
  assert.equal(far.hp, far.maxHp, 'outside the ring');
});

// ---------------------------------------------------------------- economy simulation

test('Economy report: seeded credits per run under Iron and case policies to a targeted Chase (median and p90)', () => {
  const iron = { playerMove: 0.8, playerAttackSpeed: 0.65, playerWindup: 0.95, playerRange: 0.6, enemySpeed: 0.95, enemyHp: 1.2, enemyDamage: 1.3, projectileSpeed: 1.4, telegraph: 0.65, augmentPower: 0.75, shopEvery: 2, bagSilver: 22, bagGold: 7, bagPrismatic: 2 };
  // What a godmoded pilot would settle for clearing 8 waves: the economy hands out, skill decides how many waves.
  const runs = [1, 2, 3].map(seed => autopilotRun({ seed, target: 9, tuning: iron }));
  for (const r of runs) {
    const settled = settleRun(acc(0), { settlementId: `s${r.seed}`, hero: 'marksman', wavesCleared: r.sim.wavesCleared, wardenWavesCleared: r.sim.wardenWavesCleared, sandbox: false });
    assert.equal(r.sim.wavesCleared, 8); assert.equal(r.sim.wardenWavesCleared, 2, 'waves 3 and 6 carry Wardens');
    assert.equal(settled.credits, Math.min(60, 8 * 4 + 2 * 8));
  }
  // Case policy A: open cases until ANY Chase is owned. The guarantee bounds the worst case at 60.
  const anyChase = [];
  for (let p = 0; p < 300; p++) {
    let a = acc(1e9, 1000 + p * 17), n = 0;
    while (!caseTier('chase').some(i => owns(a, i.id)) && n < 200) { const r = purchaseCase(a, nextRequestId(a)); a = acknowledgeReveal(r.account); n++; }
    anyChase.push(n);
  }
  anyChase.sort((x, y) => x - y);
  assert.ok(anyChase[anyChase.length - 1] <= PITY_GUARANTEE, `guarantee bounds any-Chase at ${PITY_GUARANTEE} (${anyChase[anyChase.length - 1]})`);
  // Case policy B: a specific wishlisted Chase. A natural roll of a different Chase resets the counter, so this is
  // not bounded; the wishlist makes the guaranteed opening land it, so the median sits at the guarantee.
  const cases = [];
  for (let p = 0; p < 300; p++) {
    let a = setWishlist({ ...acc(1e9, 5000 + p * 17) }, 'chase.rifleman.final-round');
    let n = 0;
    while (!owns(a, 'chase.rifleman.final-round') && n < 400) { const r = purchaseCase(a, nextRequestId(a)); a = acknowledgeReveal(r.account); n++; }
    cases.push(n);
  }
  cases.sort((x, y) => x - y);
  const median = cases[Math.floor(cases.length / 2)], p90 = cases[Math.floor(cases.length * 0.9)], max = cases[cases.length - 1];
  assert.ok(median <= PITY_GUARANTEE, `median ${median} cases to a targeted Chase is at or under the guarantee`);
  assert.ok(p90 <= PITY_GUARANTEE * 2, `p90 ${p90} within two guarantee cycles`);
  // Saving instead: 2000 credits at a 60-credit cap is at least 34 runs; a Standard part is 3 runs of 8 waves.
  assert.equal(Math.ceil(CHASE_PRICE / 60), 34); assert.equal(Math.ceil(STANDARD_PRICE / 48), 4);
  console.log(`  economy: any Chase via cases median ${anyChase[150]}, max ${anyChase[299]}; targeted Chase median ${median}, p90 ${p90}, max ${max} (${median * 100} credits median); direct Standard part after ${Math.ceil(STANDARD_PRICE / 48)} eight-wave runs; direct Chase after ${Math.ceil(CHASE_PRICE / 60)} capped runs`);
});
