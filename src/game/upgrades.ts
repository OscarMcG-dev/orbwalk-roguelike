import { heroById } from './heroes.ts';
import { DEFAULT_TUNING, scaleAugments, type Tuning } from './tuning.ts';
import type { HeroId, Rarity, Relic, Settings, Shard, ShardKey, Shards, Stats, Upgrade } from './types.ts';

/** The base sheet: the class profile (scaled by the player tempo knobs) plus the class stat overrides. */
export function baseStats(s: Settings, t: Tuning = DEFAULT_TUNING): Stats {
  const hero = heroById(s.hero);
  return {
    attackSpeed: s.attackSpeed * t.playerAttackSpeed,
    windup: s.windup * t.playerWindup,
    moveSpeed: s.moveSpeed * t.playerMove,
    range: s.range * t.playerRange,
    damage: 20,
    critChance: 0.05,
    critMult: 1.75,
    projectiles: 1,
    bounces: 0,
    lifesteal: 0,
    maxHp: 100,
    regen: 0,
    dashCd: 5,
    dashCharges: 1,
    armor: 0,
    splash: 0,
    slow: 0,
    adrenaline: 0,
    goldMult: 1,
    goldFlat: 0,
    magnet: 130,
    tempest: 0,
    momentum: 0,
    executioner: 0,
    burn: 0,
    shred: 0,
    frostbite: 0,
    wildfire: 0,
    thunderhead: 0,
    kinetic: 0,
    overclock: 0,
    quickdraw: 0,
    focus: 0,
    berserk: 0,
    shieldMax: 0,
    riposte: 0,
    ...hero.stats,
  };
}

/**
 * Augments. Silver = stat bumps, Gold = mechanics, Prismatic = build-defining, single stack.
 * Tags drive synergy weighting: offers sharing a tag with an owned augment are more likely.
 *
 * The pool is an ecosystem rather than a flat list:
 * - `requires` combo augments only enter the draft once a prerequisite is owned (Frostbite needs
 *   Frost Tips, Wildfire needs Slow Cooker, ...), so early picks open later branches.
 * - `heroOnly` augments are class-specific (Overclock for the Cannoneer, Quickdraw for the Marksman).
 * - Quest augments come in three flavours (kills, dodges, crits); a run holds at most one quest.
 * - Several prismatics carry real trade-offs: Hunter's Focus punishes target switching (and so
 *   fights with Split Shot and Ricochet), Last Stand pays out only while you are hurt.
 */
export const UPGRADES: Upgrade[] = [
  // ---- Silver
  { id: 'rapid', name: 'Rapid Fire', blurb: '+12% attack speed.', rarity: 'silver', tags: ['speed'], max: 6, icon: '⚡', apply: s => { s.attackSpeed *= 1.12; } },
  { id: 'longbow', name: 'Longbow', blurb: '+50 attack range.', rarity: 'silver', tags: ['range'], max: 4, icon: '⟶', apply: s => { s.range += 50; } },
  { id: 'boots', name: 'Swift Boots', blurb: '+25 move speed.', rarity: 'silver', tags: ['mobility'], max: 4, icon: '»', apply: s => { s.moveSpeed += 25; } },
  { id: 'heavy', name: 'Heavy Bolts', blurb: '+7 damage per bolt.', rarity: 'silver', tags: ['power'], max: 6, icon: '◆', apply: s => { s.damage += 7; } },
  { id: 'iron', name: 'Iron Skin', blurb: '+25 max HP and 2 armour.', rarity: 'silver', tags: ['sustain'], max: 4, icon: '▣', apply: s => { s.maxHp += 25; s.armor += 2; } },
  { id: 'snap', name: 'Snap Shot', blurb: 'Windup 15% shorter. Release sooner, move sooner.', rarity: 'silver', tags: ['speed'], max: 3, icon: '↯', apply: s => { s.windup *= 0.85; } },
  { id: 'fleet', name: 'Fleetfoot', blurb: '+4% move speed and +4% attack speed. Small, but it compounds.', rarity: 'silver', tags: ['mobility', 'speed'], max: 4, icon: '⇝', apply: s => { s.moveSpeed *= 1.04; s.attackSpeed *= 1.04; } },
  { id: 'pouch', name: 'Coin Pouch', blurb: '+1 gold on every kill, before multipliers.', rarity: 'silver', tags: ['greed'], max: 3, icon: '◉', apply: s => { s.goldFlat += 1; } },
  // ---- Gold
  { id: 'keen', name: 'Keen Eye', blurb: '+12% crit chance. Crits deal 175% damage.', rarity: 'gold', tags: ['crit'], max: 5, icon: '◎', apply: s => { s.critChance += 0.12; } },
  { id: 'vamp', name: 'Vampiric Fletching', blurb: 'Heal 2 HP on every bolt that lands.', rarity: 'gold', tags: ['sustain'], max: 3, icon: '♥', apply: s => { s.lifesteal += 2; } },
  { id: 'wind', name: 'Second Wind', blurb: 'Regenerate 1.5 HP per second.', rarity: 'gold', tags: ['sustain'], max: 3, icon: '∞', apply: s => { s.regen += 1.5; } },
  { id: 'phase', name: 'Phase Step', blurb: 'Dash cooldown reduced by 1.2s.', rarity: 'gold', tags: ['mobility'], max: 3, icon: '⇢', apply: s => { s.dashCd = Math.max(1.2, s.dashCd - 1.2); } },
  { id: 'frost', name: 'Frost Tips', blurb: 'Bolts slow enemies by 35% for a second.', rarity: 'gold', tags: ['aoe', 'crit'], max: 1, icon: '❄', apply: s => { s.slow = 0.35; } },
  { id: 'greed', name: 'Gold Sense', blurb: '+35% gold and a much wider pickup radius.', rarity: 'gold', tags: ['greed'], max: 2, icon: '¤', apply: s => { s.goldMult += 0.35; s.magnet += 110; } },
  { id: 'split', name: 'Split Shot', blurb: 'Each attack fires an extra bolt at another enemy.', rarity: 'gold', tags: ['aoe', 'power'], max: 2, icon: '⋔', apply: s => { s.projectiles += 1; } },
  { id: 'ricochet', name: 'Ricochet', blurb: 'Bolts bounce to one more enemy at 70% damage.', rarity: 'gold', tags: ['aoe'], max: 2, icon: '↺', apply: s => { s.bounces += 1; } },
  { id: 'blast', name: 'Blast Quiver', blurb: 'Bolts burst for 50% damage in a 70 unit radius.', rarity: 'gold', tags: ['aoe', 'power'], max: 1, icon: '✹', apply: s => { s.splash = Math.max(s.splash, 70); } },
  { id: 'adren', name: 'Adrenaline', blurb: 'Kills grant +20% attack speed for 3s. Stacks 3 times.', rarity: 'gold', tags: ['speed'], max: 1, icon: '▲', apply: s => { s.adrenaline = 0.2; } },
  { id: 'brittle', name: 'Shatter Point', blurb: 'Crits shred the target: it takes 20% more damage from everything for 3s.', rarity: 'gold', tags: ['crit', 'power'], max: 1, icon: '✧', apply: s => { s.shred = 0.2; } },
  // ---- Gold combo augments: unlocked by owning the prerequisite
  { id: 'frostbite', name: 'Frostbite', blurb: 'Slowed enemies take 25% more damage and your crit chance against them is doubled.', rarity: 'gold', tags: ['crit', 'aoe'], max: 1, icon: '❆', requires: ['frost'], apply: s => { s.frostbite = 1; } },
  { id: 'wildfire', name: 'Wildfire', blurb: 'When a burning enemy dies, its burn leaps to everything within 120 units.', rarity: 'gold', tags: ['aoe', 'sustain'], max: 1, icon: '🔥', requires: ['cooker'], apply: s => { s.wildfire = 1; } },
  { id: 'thunderhead', name: 'Thunderhead', blurb: 'Tempest strikes every second attack and chains through two more enemies.', rarity: 'gold', tags: ['aoe', 'power'], max: 1, icon: '☈', requires: ['tempest'], apply: s => { s.thunderhead = 1; } },
  { id: 'kinetic', name: 'Kinetic Rounds', blurb: 'Each Momentum stack also grants +1.5% damage. Twenty stacks, thirty percent.', rarity: 'gold', tags: ['speed', 'power'], max: 1, icon: '➶', requires: ['momentum'], apply: s => { s.kinetic = 1; } },
  // ---- Gold class augments
  { id: 'overclock', name: 'Overclock', blurb: 'CANNONEER. At max heat the windup no longer drags; instead the shell deals +75% damage and vents everything.', rarity: 'gold', tags: ['power'], max: 1, icon: '♨', heroOnly: 'cannoneer', apply: s => { s.overclock = 1; } },
  { id: 'quickdraw', name: 'Quickdraw', blurb: 'MARKSMAN. The first bolt at a new target has no windup. Switch targets, fire instantly.', rarity: 'gold', tags: ['speed'], max: 1, icon: '⚟', heroOnly: 'marksman', apply: s => { s.quickdraw = 1; } },
  { id: 'riposte', name: 'Riposte', blurb: 'SKIRMISHER. Each enemy cut by your blade dash refunds 0.6s of dash cooldown, up to three per dash. Dive through the pack, dash again.', rarity: 'gold', tags: ['mobility', 'power'], max: 1, icon: '⚔', heroOnly: 'skirmisher', apply: s => { s.riposte = 0.6; } },
  // ---- Prismatic (build-defining, one stack)
  { id: 'tempest', name: 'Tempest', blurb: 'Every third attack calls lightning that chains through up to 4 enemies for 60% damage each.', rarity: 'prismatic', tags: ['aoe', 'power'], max: 1, icon: '⚡', apply: s => { s.tempest = 1; } },
  { id: 'momentum', name: 'Momentum', blurb: 'Every 40 units you move grants a stack of +2% attack speed, up to 20. Standing still bleeds stacks. Kite or lose it.', rarity: 'prismatic', tags: ['speed', 'mobility'], max: 1, icon: '≫', apply: s => { s.momentum = 1; } },
  { id: 'exec', name: 'Executioner', blurb: 'Bolts instantly finish non-elite enemies below 15% health.', rarity: 'prismatic', tags: ['power', 'crit'], max: 1, icon: '☠', apply: s => { s.executioner = 1; } },
  { id: 'twin', name: 'Twin Step', blurb: 'Your dash holds two charges, each recharging 1s slower.', rarity: 'prismatic', tags: ['mobility'], max: 1, icon: '⇉', apply: s => { s.dashCharges = 2; s.dashCd += 1; } },
  { id: 'scopiest', name: 'Scopiest Weapons', blurb: '+150 attack range, but 10% less attack speed. See everything. Touch nothing.', rarity: 'prismatic', tags: ['range'], max: 1, icon: '⊙', apply: s => { s.range += 150; s.attackSpeed *= 0.9; } },
  { id: 'cooker', name: 'Slow Cooker', blurb: 'Bolts apply a burn: 4 damage per second for 3s, stacking three times.', rarity: 'prismatic', tags: ['aoe', 'sustain'], max: 1, icon: '♨', apply: s => { s.burn = 1; } },
  { id: 'focus', name: "Hunter's Focus", blurb: 'Consecutive bolts into the same target add +8% damage each, up to +80%. Switching targets resets it. Hates Split Shot.', rarity: 'prismatic', tags: ['power', 'crit'], max: 1, icon: '◈', apply: s => { s.focus = 1; } },
  { id: 'berserk', name: 'Last Stand', blurb: 'Below half health, deal up to +60% damage the lower you are. Courage or a death wish.', rarity: 'prismatic', tags: ['power', 'sustain'], max: 1, icon: '♜', apply: s => { s.berserk = 1; } },
  { id: 'overflow', name: 'Overflow', blurb: 'Healing past full health becomes a shield of up to 40 that absorbs damage first.', rarity: 'prismatic', tags: ['sustain'], max: 1, icon: '◍', requires: ['vamp', 'wind'], apply: s => { s.shieldMax = 40; } },
  // ---- Prismatic quests (one per run)
  { id: 'vow', name: 'Vow of the Hunt', blurb: 'QUEST: kill 25 enemies. Reward: +30% damage and an extra bolt per attack.', rarity: 'prismatic', tags: ['power', 'aoe'], max: 1, icon: '⚑', quest: { kind: 'kills', count: 25, reward: '+30% damage, +1 projectile' }, apply: () => {}, questApply: s => { s.damage *= 1.3; s.projectiles += 1; } },
  { id: 'oath', name: "Dodger's Oath", blurb: 'QUEST: dodge 40 attacks. Reward: an extra dash charge, dash cooldown -1.5s and +4 armour.', rarity: 'prismatic', tags: ['mobility', 'sustain'], max: 1, icon: '⛨', quest: { kind: 'dodges', count: 40, reward: '+1 dash charge, -1.5s dash cooldown, +4 armour' }, apply: () => {}, questApply: s => { s.dashCharges += 1; s.dashCd = Math.max(1.2, s.dashCd - 1.5); s.armor += 4; } },
  { id: 'wager', name: "Marksman's Wager", blurb: 'QUEST: land 30 crits. Reward: crits deal 250% damage and +10% crit chance.', rarity: 'prismatic', tags: ['crit'], max: 1, icon: '♠', quest: { kind: 'crits', count: 30, reward: '250% crit damage, +10% crit chance' }, apply: () => {}, questApply: s => { s.critMult = 2.5; s.critChance += 0.1; } },
];

export const RARITY_WEIGHT: Record<Rarity, number> = { silver: 6, gold: 3, prismatic: 1 };
export const RARITY_LABEL: Record<Rarity, string> = { silver: 'Silver', gold: 'Gold', prismatic: 'Prismatic' };
/**
 * Rarity marble bag: each offer slot draws a rarity from this bag without replacement, so randomness has
 * memory (Candlesan: "instead of stateless RNG, give the randomness a memory"). 65% Silver, 30% Gold, 5% Prismatic.
 */
export const RARITY_BAG: Rarity[] = [
  'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver', 'silver',
  'gold', 'gold', 'gold', 'gold', 'gold', 'gold',
  'prismatic',
];
/** A run may hold at most this many Prismatics; further Prismatic slots resolve as Gold. */
export const PRISMATIC_CAP = 4;
/** Attack speed above this is compressed to 40% effectiveness before the hard cap of 3 (soft ceiling on the Rapid Fire lane). */
export const ATTACK_SPEED_KNEE = 2.4;

/**
 * Which tiers a wave's draft may contain. Only waves 12 and 24 are guaranteed Prismatic drafts; every fourth
 * wave skips Silver. The first Prismatic of a run is otherwise predetermined invisibly in the simulation
 * (a hidden wave rolled at run start), never on a fixed wave players could farm towards.
 */
export function offerTier(wave: number): Rarity | 'mixed' {
  if (wave % 12 === 0) return 'prismatic';
  if (wave % 4 === 0) return 'gold';
  return 'mixed';
}

/** Can this augment appear in a draft given what the run already holds, which class is playing, and what was banished? */
export function eligible(u: Upgrade, relics: Relic[], hero: HeroId, banished: ReadonlySet<string> = new Set()): boolean {
  const owned = (id: string) => relics.some(r => r.id === id);
  if (banished.has(u.id)) return false;
  if ((relics.find(r => r.id === u.id)?.stacks ?? 0) >= u.max) return false;
  if (u.heroOnly && u.heroOnly !== hero) return false;
  if (u.requires && !u.requires.some(owned)) return false;
  if (u.quest && relics.some(r => UPGRADES.find(x => x.id === r.id)?.quest)) return false;
  return true;
}

/** The owned quest augment, if any. */
export function activeQuest(relics: Relic[]): Upgrade | null {
  for (const r of relics) {
    const def = UPGRADES.find(u => u.id === r.id);
    if (def?.quest) return def;
  }
  return null;
}

export const SHARD_POOL: Shard[] = [
  { key: 'damage', name: 'Sharpened', amount: 4, display: '+4 damage', icon: '◆' },
  { key: 'attackSpeed', name: 'Oiled', amount: 0.06, display: '+6% attack speed', icon: '⚡' },
  { key: 'maxHp', name: 'Hardy', amount: 15, display: '+15 max HP', icon: '▣' },
  { key: 'moveSpeed', name: 'Nimble', amount: 12, display: '+12 move speed', icon: '»' },
  { key: 'range', name: 'Extended', amount: 20, display: '+20 range', icon: '⟶' },
  { key: 'critChance', name: 'Lucky', amount: 0.05, display: '+5% crit', icon: '◎' },
  { key: 'armor', name: 'Plated', amount: 1.5, display: '+1.5 armour', icon: '⛨' },
  { key: 'goldMult', name: 'Thrifty', amount: 0.12, display: '+12% gold', icon: '¤' },
];

export function applyShards(stats: Stats, shards: Shards) {
  for (const key of Object.keys(shards) as ShardKey[]) {
    const n = shards[key] ?? 0;
    const def = SHARD_POOL.find(p => p.key === key)!;
    if (key === 'attackSpeed') stats.attackSpeed *= Math.pow(1 + def.amount, n);
    else stats[key] += def.amount * n;
  }
}

/**
 * Base sheet, then augments (scaled by the augment-power knob), then anvil shards at full strength, then the
 * attack-speed knee. Shards sit outside the augment scale on purpose: they are a separate, priced system.
 */
export function computeStats(settings: Settings, relics: Relic[], shards: Shards = {}, questDone = false, tuning: Tuning = DEFAULT_TUNING): Stats {
  const base = baseStats(settings, tuning);
  let stats = { ...base };
  for (const relic of relics) {
    const def = UPGRADES.find(u => u.id === relic.id);
    if (!def) continue;
    for (let i = 0; i < relic.stacks; i++) def.apply(stats);
    if (def.quest && questDone && def.questApply) def.questApply(stats);
  }
  stats = scaleAugments(base, stats, tuning.augmentPower);
  applyShards(stats, shards);
  if (stats.attackSpeed > ATTACK_SPEED_KNEE) stats.attackSpeed = ATTACK_SPEED_KNEE + (stats.attackSpeed - ATTACK_SPEED_KNEE) * 0.4;
  stats.attackSpeed = Math.min(stats.attackSpeed, 3);
  return stats;
}
