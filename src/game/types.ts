export type Point = { x: number; y: number };
export type Difficulty = 'easy' | 'standard' | 'hard';
export type Mode = 'run' | 'drill';
export type Drill = 'mixed' | 'rhythm' | 'dodge';
/** Augment tiers, Arena style. */
export type Rarity = 'silver' | 'gold' | 'prismatic';
export type Tag = 'speed' | 'power' | 'crit' | 'sustain' | 'mobility' | 'aoe' | 'greed' | 'range';
export type HeroId = 'marksman' | 'cannoneer' | 'skirmisher' | 'arbalest' | 'rifleman' | 'gunslinger';

export type Settings = {
  mode: Mode;
  drill: Drill;
  difficulty: Difficulty;
  hero: HeroId;
  attackSpeed: number;
  windup: number;
  moveSpeed: number;
  range: number;
  quick: boolean;
  showRange: boolean;
  sound: boolean;
  shake: boolean;
};

export type Status = 'idle' | 'running' | 'paused' | 'choosing' | 'ended';
export type WaveState = 'banner' | 'spawning' | 'fighting' | 'clear' | 'none';

export type EnemyKind = 'dummy' | 'drone' | 'archer' | 'bomber' | 'warden' | 'leech' | 'splitter' | 'bulwark' | 'miner' | 'hexer' | 'reaver';

/**
 * Champion affixes rolled onto ordinary enemies from wave 4. Swift: fast and worth double.
 * Volatile: detonates on death. Gilded: flees with a gold bounty and escapes if ignored.
 * Warded: pulses a bolt-proof ward every few seconds.
 */
export type Affix = 'swift' | 'volatile' | 'gilded' | 'warded';

export type Enemy = Point & {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  flash: number;
  slow: number;
  /** 0..1 spawn-in progress; enemy is inert until it reaches 1. */
  spawn: number;
  cooldown: number;
  angle: number;
  spin: number;
  arming: number;
  dead: boolean;
  invulnerable: boolean;
  contactCd: number;
  wobble: number;
  base: Point | null;
  pattern: number;
  elite: boolean;
  gold: number;
  /** Slow Cooker burn stacks and remaining time. */
  burn: number;
  burnTime: number;
  affix: Affix | null;
  /** Bulwark shield facing (turns slowly toward the player). */
  facing: number;
  /** Leech: currently attached to the player. */
  latched: boolean;
  /** Splitter generation: 0 is the original, 2 no longer splits. */
  generation: number;
  /** Shatter Point: seconds of +20% damage taken remaining. */
  shred: number;
  /** Warded affix: seconds until the next ward pulse. */
  wardTimer: number;
  /** Seconds until this enemy leaves on its own (Gilded escape). */
  life: number;
  /** Bulwark block flash timer (render only). */
  block: number;
  /** Knockback velocity from landed bolts; decays quickly. */
  kx: number;
  ky: number;
  /** Hit-stun: seconds the enemy is frozen after a landed bolt. */
  stagger: number;
};

export type DangerKind = 'line' | 'circle' | 'mine' | 'cloud';

export type Danger = Point & {
  vx: number;
  vy: number;
  delay: number;
  age: number;
  life: number;
  radius: number;
  kind: DangerKind;
  hit: boolean;
  resolved: boolean;
  damage: number;
  trail: Point[];
  /** Cloud: the caster; the cloud dispels when it dies. */
  owner?: number;
};

export type Bolt = Point & {
  /** Where the bolt was fired from; Bulwarks block bolts arriving inside their shield arc. */
  origin: Point;
  target: Enemy;
  damage: number;
  crit: boolean;
  bounces: number;
  speed: number;
  trail: Point[];
  splash: number;
  /** Empowered shots (Tempest chain, heavy cannon rounds) render larger. */
  heavy: boolean;
  /** Piercing quarrels fly straight along `dir` instead of homing, hitting each enemy they cross once. */
  dir?: Point;
  pierce?: number;
  struck?: number[];
  travel?: number;
  maxTravel?: number;
};

export type Beam = { points: Point[]; life: number; max: number; color: string };

export type Effect = Point & {
  life: number;
  max: number;
  color: string;
  text?: string;
  size?: number;
  rise?: number;
};

export type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  shape: 'dot' | 'shard' | 'ring';
  rot: number;
  spin: number;
};

export type GoldOrb = Point & { vx: number; vy: number; value: number; life: number; born: number; /** Mid-wave bounty cache: rendered large and labelled. */ bounty?: boolean };

/**
 * Mid-wave events: surprises fired part-way through a fight to break autopilot play.
 * ambush / barrage / champion are threats, bounty is a reward, tithe and cull are priced choices.
 */
export type EventKind = 'ambush' | 'barrage' | 'bounty' | 'champion' | 'tithe' | 'cull';
export type MidEvent = { kind: EventKind; at: number };
/**
 * A telegraphed spot on the floor. Ambush and bounty omens resolve when their timer runs out;
 * a shrine (Tithe) resolves when the player touches it and simply expires otherwise.
 */
export type Omen = Point & { life: number; max: number; kind: 'ambush' | 'bounty' | 'shrine'; enemy?: EnemyKind; value?: number };
export type EventBanner = { text: string; sub: string; color: string; life: number; max: number };

export type Ghost = Point & { life: number; angle: number };

export type Stats = {
  attackSpeed: number;
  windup: number;
  moveSpeed: number;
  range: number;
  damage: number;
  critChance: number;
  critMult: number;
  projectiles: number;
  bounces: number;
  lifesteal: number;
  maxHp: number;
  regen: number;
  dashCd: number;
  dashCharges: number;
  armor: number;
  splash: number;
  slow: number;
  adrenaline: number;
  goldMult: number;
  /** Flat gold added to every kill (Coin Pouch). */
  goldFlat: number;
  magnet: number;
  // Prismatic flags (0 or 1)
  tempest: number;
  momentum: number;
  executioner: number;
  burn: number;
  // Combo and class augments (0 or 1 unless noted)
  /** Shatter Point: crits mark the target to take this fraction more damage for 3s. */
  shred: number;
  frostbite: number;
  wildfire: number;
  thunderhead: number;
  kinetic: number;
  overclock: number;
  quickdraw: number;
  focus: number;
  berserk: number;
  /** Overflow: overheal becomes a shield up to this many points. */
  shieldMax: number;
  /** Riposte (Skirmisher): dash cooldown refunded per enemy cut by a blade dash. */
  riposte: number;
};

/** Stat Anvil shard: a small permanent stat bump bought with gold. */
export type ShardKey = 'damage' | 'attackSpeed' | 'maxHp' | 'moveSpeed' | 'range' | 'critChance' | 'armor' | 'goldMult';
export type Shard = { key: ShardKey; name: string; amount: number; display: string; icon: string };
export type Shards = Partial<Record<ShardKey, number>>;

export type QuestKind = 'kills' | 'dodges' | 'crits';
export type Quest = { kind: QuestKind; count: number; reward: string };

export type Upgrade = {
  id: string;
  name: string;
  blurb: string;
  rarity: Rarity;
  tags: Tag[];
  max: number;
  icon: string;
  /** Quest augments complete after `count` of `kind` and then apply `questApply`. */
  quest?: Quest;
  /** Offered only while at least one of these augment ids is owned. */
  requires?: string[];
  /** Offered only to this class. */
  heroOnly?: HeroId;
  apply: (s: Stats) => void;
  questApply?: (s: Stats) => void;
};

export type Relic = { id: string; name: string; stacks: number; rarity: Rarity; icon: string; tags: Tag[] };

export type Offer = {
  id: string;
  name: string;
  blurb: string;
  rarity: Rarity;
  icon: string;
  stacks: number;
  max: number;
  synergy: boolean;
  quest?: Quest;
  /** Display name of the owned augment that unlocked this combo offer. */
  unlockedBy?: string;
  heroOnly?: HeroId;
};

export type Snapshot = {
  status: Status;
  mode: Mode;
  hero: HeroId;
  time: number;
  runTime: number;
  fired: number;
  cancelled: number;
  hits: number;
  dodged: number;
  moved: number;
  phase: string;
  progress: number;
  streak: number;
  best: number;
  hp: number;
  maxHp: number;
  shield: number;
  gold: number;
  wave: number;
  waveState: WaveState;
  kills: number;
  damageDealt: number;
  enemiesLeft: number;
  dashCd: number;
  dashMax: number;
  dashCharges: number;
  dashMaxCharges: number;
  offers: Offer[] | null;
  offerTier: Rarity | 'mixed';
  /** Free rerolls remaining this run; once spent, `rerollCost` is the gold price of the next one. */
  rerollsLeft: number;
  rerollCost: number;
  healCost: number;
  /** One heal per shop. */
  healUsed: boolean;
  anvil: Shard[];
  anvilCost: number;
  /** Shards still purchasable this shop (two per shop). */
  anvilLeft: number;
  /** Shop sinks: reveal a fourth offer, banish an offer from the run, buy a Prismatic draft next shop. */
  fourthCost: number;
  fourthBought: boolean;
  banishCost: number;
  banishMode: boolean;
  ascendCost: number;
  ascended: boolean;
  /** Intermission: claim and departure are separate. `nextShopWave` follows the shopEvery cadence. */
  draftClaimed: boolean;
  claimedOffer: Offer | null;
  nextWave: number;
  nextShopWave: number;
  /** HP the field repair would restore right now. */
  healAmount: number;
  /** Derived before/after for each anvil shard's stat, in the same order as `anvil`. */
  anvilPreview: { key: ShardKey; before: number; after: number }[];
  shards: Shards;
  relics: Relic[];
  questProgress: number;
  questNeed: number;
  questDone: boolean;
  stats: Stats;
  heat: number;
  momentum: number;
  focus: number;
  latched: number;
  /** Skirmisher: the next blade would be a Tempo shot. */
  tempoReady: boolean;
  tempoShots: number;
  /** Magazine weapons: rounds left and clip size (0/0 for others). */
  ammo: number;
  ammoMax: number;
  /** Reload progress 0..1 while reloading, else 0. */
  reload: number;
  /** Crank weapons: 0..1 rewound (1 for others). */
  crank: number;
  /** Active mid-wave event banner text, if one is showing. */
  event: string | null;
  /** Enrage clock: seconds until the current wave enrages (negative once it has) and the current enrage level. */
  enrageIn: number;
  enrage: number;
  /** Cull event: number of marked enemies still alive (the player takes +20% damage while any live). */
  cull: number;
  dead: boolean;
  eliteHp: number | null;
};
