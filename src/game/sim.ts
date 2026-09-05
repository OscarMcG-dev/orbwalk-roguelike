import { heroById, type Hero } from './heroes.ts';
import { H, PLAYER_R, Rng, W, clamp, distance, segmentDistance } from './math.ts';
import type {
  Affix, Beam, Bolt, Danger, Effect, Enemy, EnemyKind, EventBanner, EventKind, Ghost, GoldOrb, MidEvent, Offer, Omen, Particle,
  Point, QuestKind, Rarity, Relic, Settings, Shard, Shards, Snapshot, Stats, Status, Upgrade, WaveState,
} from './types.ts';
import { DEFAULT_TUNING, rarityBag, type Tuning } from './tuning.ts';
import { PRISMATIC_CAP, SHARD_POOL, UPGRADES, activeQuest, computeStats, eligible, offerTier } from './upgrades.ts';

const DRILL_LENGTH = 60;
const DASH_TIME = 0.15;
const DASH_SPEED = 1300;
const SPAWN_TIME = 0.7;
const MAX_PARTICLES = 700;
/**
 * Salt that derives the cosmetic RNG seed from the gameplay seed at start(). Particles, dust and damage-text jitter
 * draw from `fx`, never from `rng`, so a feel setting cannot move a spawn, affix, event or draft roll.
 */
export const FX_SEED_SALT = 0x9e3779b9;
const HEAT_MAX = 4;
const MOMENTUM_MAX = 20;
const FOCUS_MAX = 10;
/** Arena-wide caps so Miners and Hexers cannot carpet the floor. */
const MINE_CAP = 7;
const CLOUD_CAP = 3;
/** Bulwark shield half-angle in radians (about 60 degrees either side of its facing). */
const SHIELD_ARC = 1.05;
/** Skirmisher: a blade released within this many seconds of moving is a Tempo shot. */
const TEMPO_WINDOW = 0.5;
const TEMPO_DAMAGE = 1.4;
const TEMPO_CRIT = 0.15;
/** Blade dash: damage multiplier per enemy cut, and how many cuts Riposte may refund. */
const DASH_STRIKE = 1.2;
const RIPOSTE_CAP = 3;
/**
 * Hit-stun on landed bolts: a small shove away from the player (units per second, decaying) and a brief
 * freeze. Deliberately minor: enough to buy a step of breathing room while kiting something faster.
 */
const KNOCKBACK = 110;
const KNOCK_DRAG = 12;
const STAGGER = 0.07;
/** Reaver: a melee swinger. Reach beyond its radius, windup before the swing, recovery after, and half-arc. */
export const REAVER = { reach: 64, windup: 0.6, recover: 0.55, arc: 0.95, damage: 14 };

export const EVENT_LABEL: Record<EventKind, string> = { ambush: 'AMBUSH', barrage: 'BARRAGE', bounty: 'BOUNTY', champion: 'CHAMPION', tithe: 'TITHE', cull: 'CULL' };
export const EVENT_COLORS: Record<EventKind, string> = { ambush: '#ff6b6b', barrage: '#ff9d6b', bounty: '#ffd66b', champion: '#d79bff', tithe: '#8de3ff', cull: '#ffb35c' };
/** Events that are pure threat; these obey the low-HP fairness clause. */
const THREAT_EVENTS: EventKind[] = ['ambush', 'barrage', 'champion'];
/** Shop economy. Gold is meant to run out: every sink competes with every other one. */
const BANISH_COST = 6;
const ANVIL_PER_SHOP = 2;
const REROLL_BASE = 4;
/** Enrage clock: seconds of fighting before a wave enrages, and the step between enrage levels. */
const ENRAGE_STEP = 5;
/** Cull: damage taken multiplier while marked enemies live. */
const CULL_VULNERABILITY = 1.2;

export const ENEMY_COLORS: Record<EnemyKind, string> = {
  dummy: '#c7a46b',
  drone: '#ff8f6b',
  archer: '#c98bff',
  bomber: '#ffd166',
  warden: '#ff5c8a',
  leech: '#b6ff5c',
  splitter: '#5cd6ff',
  bulwark: '#9aa7c7',
  miner: '#ffb35c',
  hexer: '#d45cff',
  reaver: '#efe6d3',
};

export const AFFIX_COLORS: Record<Affix, string> = {
  swift: '#7ff6ff',
  volatile: '#ff7a3d',
  gilded: '#ffd66b',
  warded: '#c9b6ff',
};

export const AFFIX_LABEL: Record<Affix, string> = { swift: 'SWIFT', volatile: 'VOLATILE', gilded: 'GILDED', warded: 'WARDED' };

/** Wave budget spent per spawn. Drones and Leeches are filler; Bulwarks and Hexers are set pieces. */
export const KIND_COST: Record<EnemyKind, number> = {
  dummy: 0, drone: 1, leech: 1, archer: 2, bomber: 2, splitter: 2, miner: 2, reaver: 2, bulwark: 3, hexer: 3, warden: 6,
};

const DIFF = {
  easy: { hp: 0.8, dmg: 0.7, budget: 0.8, hazard: 2.2, speed: 410, delay: 0.85 },
  standard: { hp: 1, dmg: 1, budget: 1, hazard: 1.45, speed: 540, delay: 0.62 },
  hard: { hp: 1.3, dmg: 1.3, budget: 1.25, hazard: 0.9, speed: 690, delay: 0.42 },
};

const angleDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Headless, deterministic simulation. Renders nothing; the Arena subclass wires it to a
 * canvas. Everything here is exercised by the Node test-suite.
 */
export class Simulation {
  settings: Settings;
  /** Live tuning knobs (see tuning.ts). Defaults are a no-op; the dev panel and A/B presets change them. */
  tuning: Tuning = { ...DEFAULT_TUNING };
  status: Status = 'idle';
  rng = new Rng(7);
  /** Cosmetic-only RNG. Reseeded from `rng.seed ^ FX_SEED_SALT` in start(); see FX_SEED_SALT. */
  fx = new Rng(7 ^ 0x9e3779b9);

  // clock
  elapsed = 0;
  runTime = 0;

  // player
  player: Point = { x: 650, y: 520 };
  previous: Point = { x: 650, y: 520 };
  destination: Point | null = null;
  cursor: Point = { x: 850, y: 450 };
  angle = 0;
  /** Direction the torso and weapon point; decoupled from body facing. */
  aimAngle = 0;
  armed = false;
  target: Enemy | null = null;
  attackOrder = false;
  attackPoint: Point | null = null;
  windupLeft = 0;
  windupTotal = 1;
  cooldown = 0;
  previousCooldown = 0;
  flash = 0;
  hurtFlash = 0;
  recoil = 0;
  dustTimer = 0;
  hp = 100;
  /** Overflow shield points; absorbed before HP. */
  shield = 0;
  dead = false;
  invulnerable = 0;
  /** Damage-over-time bookkeeping so drains print one number every half second. */
  drainAcc = 0;
  drainTimer = 0;
  /** Number of Leeches currently attached. */
  latched = 0;

  // hero mechanics
  heat = 0;
  /** Distance moved since the last shell; starts open so the first shot is always cool. */
  movedSinceShot = Infinity;
  momentum = 0;
  momentumDistance = 0;
  stillTime = 0;
  attackCount = 0;
  /** Hunter's Focus: the target being ramped on and how many stacks it holds. */
  focusTarget = -1;
  focusStacks = 0;
  /** Quickdraw: the last target actually fired at. */
  lastFiredTarget = -1;
  /** Skirmisher: Tempo shots landed this run, and a short flash for the renderer. */
  tempoShots = 0;
  tempoFlash = 0;
  /** Blade dash: enemies already cut during the current dash. */
  dashStruck: number[] = [];
  /** Magazine weapons: rounds in the clip and seconds of reload left. */
  ammo = 0;
  reloadLeft = 0;
  /** Crank weapons: 0..1 rewound. Starts loaded. */
  crank = 1;

  // mid-wave events
  omens: Omen[] = [];
  /** Events waiting to fire this wave, soonest first. */
  pendingEvents: MidEvent[] = [];
  /** Seconds spent in the current wave's fighting phase. */
  fightTime = 0;
  eventBanner: EventBanner | null = null;
  /** Cull: ids of the marked quarry; the player is vulnerable while any of them live. */
  cullIds: number[] = [];
  /** Seconds the player has been below a quarter health (fairness clause for threat events). */
  lowHpTimer = 0;

  // shop economy
  /** Rarity marble bag for offer slots, refilled and shuffled when empty. */
  rarityBag: Rarity[] = [];
  /** Hidden: the wave whose shop is guaranteed to hold one Prismatic. Rolled at run start, never shown. */
  firstPrismaticWave = 0;
  /** Whether the hidden guarantee has been pinned to an actual shop (drafts may skip waves under tuning). */
  guaranteePinned = false;
  banished = new Set<string>();
  banishMode = false;
  /** Paid rerolls taken in this shop (price doubles each time). */
  paidRerolls = 0;
  healedThisShop = false;
  anvilBoughtThisShop = 0;
  /** Shards bought across the whole run; the anvil price never resets. */
  shardsBought = 0;
  fourthBought = false;
  /** Ascend: the next shop is a Prismatic draft. */
  ascendNext = false;
  ascended = false;
  /** Intermission: the free draft has been claimed; the player departs explicitly with continueWave(). */
  draftClaimed = false;
  claimedOffer: Offer | null = null;
  /** Affix marble bag so champions never streak one affix. */
  affixBag: Affix[] = [];

  // dash
  dashCd = 0;
  dashCharges = 1;
  dashing = 0;
  dashDir: Point = { x: 1, y: 0 };
  ghosts: Ghost[] = [];

  // cue timers (visual only, decay in update)
  dashReadyPulse = 0;
  attackReadyPulse = 0;
  eliteFlash = 0;
  /** Vertical impact bump on landed hits (Candlesan: a tenth of a second, one axis). */
  impact = 0;

  // run
  stats: Stats;
  relics: Relic[] = [];
  shards: Shards = {};
  offers: Offer[] | null = null;
  offerTier: Rarity | 'mixed' = 'mixed';
  anvil: Shard[] = [];
  anvilBought = 0;
  rerollsLeft = 2;
  questProgress = 0;
  questDone = false;
  gold = 0;
  wave = 0;
  waveState: WaveState = 'none';
  waveTimer = 0;
  spawnQueue: EnemyKind[] = [];
  /** Marble bag: enemy kinds drawn without replacement so waves never streak one type. */
  bag: EnemyKind[] = [];
  /** Pity counter: shops in a row whose draft held nothing above Silver. */
  dryShops = 0;
  spawnTimer = 0;
  kills = 0;
  damageDealt = 0;
  adrenaline: number[] = [];

  // stats
  fired = 0;
  cancelled = 0;
  hits = 0;
  dodged = 0;
  movingTime = 0;
  streak = 0;
  best = 0;

  // world
  enemies: Enemy[] = [];
  dangers: Danger[] = [];
  bolts: Bolt[] = [];
  beams: Beam[] = [];
  effects: Effect[] = [];
  particles: Particle[] = [];
  orbs: GoldOrb[] = [];
  nextDanger = 1.2;
  nextId = 1;
  shake = 0;

  // event counters the renderer/audio layer diffs against
  shotEvent = 0;
  hitEvent = 0;
  killEvent = 0;
  pickupEvent = 0;
  waveEvent = 0;
  dashEvent = 0;
  dashReadyEvent = 0;
  upgradeEvent = 0;
  questEvent = 0;
  blockEvent = 0;
  championEvent = 0;
  eventEvent = 0;
  cutEvent = 0;
  /** A Reaver swung (hit or miss). */
  swingEvent = 0;
  /** Garand clip ejected (the ping), a reload started (rack), a reload or crank finished (ready). */
  pingEvent = 0;
  rackEvent = 0;
  loadedEvent = 0;
  /** Any paid intermission purchase (anvil, heal, fourth offer, banish, Ascend) landed. */
  buyEvent = 0;

  constructor(settings: Settings) {
    this.settings = { ...settings };
    this.stats = computeStats(this.settings, this.relics);
    this.hp = this.stats.maxHp;
    this.dashCharges = this.stats.dashCharges;
    this.resetTargets();
  }

  get isRun() {
    return this.settings.mode === 'run';
  }
  get hero(): Hero {
    return heroById(this.settings.hero);
  }
  get diff() {
    return DIFF[this.settings.difficulty];
  }
  get alive() {
    return this.enemies.filter(e => !e.dead);
  }
  /** One heal per shop, priced by wave, restoring 35% of max HP. */
  get healCost() {
    return 8 + this.wave * 3;
  }
  /** The anvil price climbs for the whole run; it never resets between shops. */
  get anvilCost() {
    return 6 + this.shardsBought * 4;
  }
  get anvilLeft() {
    return Math.max(0, ANVIL_PER_SHOP - this.anvilBoughtThisShop);
  }
  /** Free while a free reroll remains, then 4, 8, 16 gold within a shop. */
  get rerollCost() {
    return this.rerollsLeft > 0 ? 0 : REROLL_BASE * Math.pow(2, this.paidRerolls);
  }
  get fourthCost() {
    return 10 + this.wave * 2;
  }
  get ascendCost() {
    return 30 + this.wave * 4;
  }
  get banishCost() {
    return BANISH_COST;
  }
  get prismaticsOwned() {
    return this.relics.filter(r => r.rarity === 'prismatic').length;
  }
  get quest() {
    return activeQuest(this.relics);
  }
  get hpFrac() {
    return this.hp / Math.max(1, this.stats.maxHp);
  }
  /** Seconds of fighting before this wave enrages: generous against a normal clear, punishing against stalling. */
  get enrageLimit() {
    return 40 + this.wave * 2.5;
  }
  /** Enrage level: 0 until the limit, then +1 every five seconds. Enemies gain 8% speed and 10% damage per level. */
  get enrage() {
    if (this.waveState !== 'fighting' || this.fightTime <= this.enrageLimit) return 0;
    return Math.floor((this.fightTime - this.enrageLimit) / ENRAGE_STEP) + 1;
  }
  get cullAlive() {
    return this.enemies.filter(e => !e.dead && this.cullIds.includes(e.id)).length;
  }
  /** Cull: the player takes more damage while marked quarry live. */
  get vulnerable() {
    return this.cullAlive > 0;
  }

  // ---------------------------------------------------------------- setup

  makeEnemy(kind: EnemyKind, p: Point, extra: Partial<Enemy> = {}): Enemy {
    return {
      id: this.nextId++, kind, x: p.x, y: p.y, hp: 1, maxHp: 1, radius: 16, speed: 0, flash: 0, slow: 0,
      spawn: 1, cooldown: 0, angle: 0, spin: 0, arming: 0, dead: false, invulnerable: false, contactCd: 0,
      wobble: this.rng.range(0, Math.PI * 2), base: null, pattern: 0, elite: false, gold: 0, burn: 0, burnTime: 0,
      affix: null, facing: 0, latched: false, generation: 0, shred: 0, wardTimer: 0, life: Infinity, block: 0, kx: 0, ky: 0, stagger: 0, ...extra,
    };
  }

  /** Training dummies for drill mode. */
  resetTargets() {
    this.enemies = [];
    if (this.isRun || this.settings.drill === 'dodge') return;
    const bases = [{ x: 970, y: 400 }, { x: 1050, y: 630 }, { x: 550, y: 270 }];
    bases.forEach((b, i) => {
      this.enemies.push(this.makeEnemy('dummy', b, { id: i + 1, hp: Infinity, maxHp: Infinity, radius: 20, invulnerable: true, base: { ...b } }));
    });
    this.nextId = 10;
  }

  /** Apply tuning knobs live. Player-side knobs take effect through the stat sheet; the rest are read each step. */
  setTuning(patch: Partial<Tuning>) {
    this.tuning = { ...this.tuning, ...patch };
    this.recomputeStats();
  }

  recomputeStats() {
    const before = this.stats;
    this.stats = computeStats(this.settings, this.relics, this.shards, this.questDone, this.tuning);
    if (this.stats.maxHp > before.maxHp) this.hp += this.stats.maxHp - before.maxHp;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.shield = Math.min(this.shield, this.stats.shieldMax);
    // Gaining a dash charge grants it immediately.
    if (this.stats.dashCharges > before.dashCharges) this.dashCharges += this.stats.dashCharges - before.dashCharges;
    this.dashCharges = Math.min(this.dashCharges, this.stats.dashCharges);
  }

  start() {
    this.status = 'running';
    // Derive the cosmetic stream from the gameplay seed without consuming a gameplay draw.
    this.fx = new Rng(this.rng.seed ^ FX_SEED_SALT);
    this.elapsed = 0;
    this.runTime = 0;
    this.player = { x: 650, y: 520 };
    this.previous = { ...this.player };
    this.destination = null;
    this.target = null;
    this.attackOrder = false;
    this.attackPoint = null;
    this.armed = false;
    this.windupLeft = 0;
    this.cooldown = 0;
    this.previousCooldown = 0;
    this.fired = 0;
    this.cancelled = 0;
    this.hits = 0;
    this.dodged = 0;
    this.movingTime = 0;
    this.streak = 0;
    this.best = 0;
    this.flash = 0;
    this.aimAngle = 0;
    this.hurtFlash = 0;
    this.recoil = 0;
    this.dustTimer = 0;
    this.heat = 0;
    this.movedSinceShot = Infinity;
    this.momentum = 0;
    this.momentumDistance = 0;
    this.stillTime = 0;
    this.attackCount = 0;
    this.focusTarget = -1;
    this.focusStacks = 0;
    this.lastFiredTarget = -1;
    this.tempoShots = 0;
    this.tempoFlash = 0;
    this.dashStruck = [];
    this.ammo = this.hero.magazine?.size ?? 0;
    this.reloadLeft = 0;
    this.crank = 1;
    this.omens = [];
    this.pendingEvents = [];
    this.fightTime = 0;
    this.eventBanner = null;
    this.cullIds = [];
    this.lowHpTimer = 0;
    this.rarityBag = [];
    this.firstPrismaticWave = this.rng.int(4, 9);
    this.guaranteePinned = false;
    this.banished = new Set();
    this.banishMode = false;
    this.paidRerolls = 0;
    this.healedThisShop = false;
    this.anvilBoughtThisShop = 0;
    this.shardsBought = 0;
    this.fourthBought = false;
    this.ascendNext = false;
    this.ascended = false;
    this.draftClaimed = false;
    this.claimedOffer = null;
    this.affixBag = [];
    this.shield = 0;
    this.drainAcc = 0;
    this.drainTimer = 0;
    this.latched = 0;
    this.nextDanger = 1.2;
    this.dangers = [];
    this.effects = [];
    this.bolts = [];
    this.beams = [];
    this.particles = [];
    this.orbs = [];
    this.ghosts = [];
    this.relics = [];
    this.shards = {};
    this.offers = null;
    this.anvil = [];
    this.anvilBought = 0;
    this.rerollsLeft = 1;
    this.questProgress = 0;
    this.questDone = false;
    this.gold = 0;
    this.wave = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.adrenaline = [];
    this.dashCd = 0;
    this.dashing = 0;
    this.dashReadyPulse = 0;
    this.attackReadyPulse = 0;
    this.eliteFlash = 0;
    this.impact = 0;
    this.bag = [];
    this.dryShops = 0;
    this.invulnerable = 0;
    this.dead = false;
    this.shake = 0;
    this.spawnQueue = [];
    this.waveState = 'none';
    this.recomputeStats();
    this.hp = this.stats.maxHp;
    this.dashCharges = this.stats.dashCharges;
    this.resetTargets();
    if (this.isRun) this.beginWave(1);
  }

  // ---------------------------------------------------------------- fx helpers

  effect(p: Point, color: string, text?: string, size = 19) {
    const life = text ? 0.9 : 0.35;
    this.effects.push({ x: p.x, y: p.y, color, text, size: text ? size * this.tuning.textSize : size, life, max: life, rise: text ? 42 : 0 });
  }

  burst(p: Point, color: string, count: number, speed = 220, shape: Particle['shape'] = 'shard', size = 4) {
    if (this.particles.length > MAX_PARTICLES) return;
    count = Math.round(count * this.tuning.particles);
    for (let i = 0; i < count; i++) {
      const a = this.fx.range(0, Math.PI * 2), v = speed * this.fx.range(0.35, 1);
      const life = this.fx.range(0.3, 0.75);
      this.particles.push({
        x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life,
        size: size * this.fx.range(0.6, 1.4), color, drag: 3.2, shape, rot: a, spin: this.fx.range(-12, 12),
      });
    }
  }

  /** Footstep dust kicked up behind the player while running. */
  puff() {
    if (this.particles.length > MAX_PARTICLES) return;
    const back = this.angle + Math.PI, side = this.fx.range(-0.6, 0.6);
    this.particles.push({
      x: this.player.x + Math.cos(back) * 12 + Math.cos(back + Math.PI / 2) * side * 10,
      y: this.player.y + Math.sin(back) * 12 + Math.sin(back + Math.PI / 2) * side * 10,
      vx: Math.cos(back + side) * 40, vy: Math.sin(back + side) * 40, life: 0.45, max: 0.45,
      size: this.fx.range(2.5, 4.5), color: '#9fb8b4', drag: 2, shape: 'dot', rot: 0, spin: 0,
    });
  }

  ring(p: Point, color: string, size = 12) {
    this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.45, max: 0.45, size, color, drag: 0, shape: 'ring', rot: 0, spin: 0 });
  }

  // ---------------------------------------------------------------- orders

  cancel() {
    if (this.windupLeft > 0) {
      this.cancelled++;
      this.windupLeft = 0;
      this.cooldown = 0;
      this.effect(this.player, '#ffb56c', 'CANCELLED');
    }
  }

  move(p: Point) {
    if (this.status !== 'running') return;
    this.cancel();
    this.attackOrder = false;
    this.attackPoint = null;
    this.target = null;
    this.armed = false;
    this.destination = { x: clamp(p.x, 40, W - 40), y: clamp(p.y, 55, H - 45) };
    this.effect(this.destination, '#63e7d0');
  }

  stop() {
    this.cancel();
    this.destination = null;
    this.attackOrder = false;
    this.attackPoint = null;
    this.target = null;
    this.armed = false;
  }

  /** Enemies that can currently be targeted. */
  targetable() {
    return this.enemies.filter(e => !e.dead && e.spawn >= 1);
  }

  inRange(e: Enemy) {
    return distance(this.player, e) <= this.stats.range + e.radius - 16;
  }

  acquire(p: Point): Enemy | null {
    let candidates = this.targetable().filter(t => distance(t, p) < 220);
    if (!candidates.length) candidates = this.targetable().filter(t => this.inRange(t));
    return candidates.sort((a, b) => distance(a, p) - distance(b, p))[0] ?? null;
  }

  attack(p: Point) {
    if (this.status !== 'running') return;
    this.armed = false;
    const t = this.acquire(p);
    if (!t) {
      // Classic attack-move: walk to the point and engage whatever comes into range.
      this.move(p);
      this.attackOrder = true;
      this.attackPoint = { ...this.destination! };
      return;
    }
    if (this.target?.id !== t.id) this.cancel();
    this.target = t;
    this.attackOrder = true;
    this.attackPoint = { ...p };
    this.destination = null;
    this.effect(t, '#e7c177');
  }

  /** Magazine and crank gates on the next shot. An empty clip starts its reload here. */
  canFire() {
    if (this.hero.magazine) {
      if (this.reloadLeft > 0) return false;
      if (this.ammo <= 0) {
        this.startReload();
        return false;
      }
    }
    if (this.hero.crank && this.crank < 1) return false;
    return true;
  }

  /** Begin a reload: the Garand's clip leaves with a ping, pistols rack. Moving is free throughout. */
  startReload() {
    const mag = this.hero.magazine;
    if (!mag || this.reloadLeft > 0) return;
    this.reloadLeft = mag.reload;
    if (mag.ping) {
      this.pingEvent++;
      this.effect({ x: this.player.x, y: this.player.y - 14 }, '#ffe9a8', 'PING', 15);
      // The en-bloc clip: one brass shard tossed up and away.
      this.particles.push({ x: this.player.x + 8, y: this.player.y - 6, vx: 120 + this.fx.range(0, 60), vy: -260, life: 0.7, max: 0.7, size: 5, color: '#ffd27a', drag: 1.2, shape: 'shard', rot: 0, spin: 14 });
    } else {
      this.rackEvent++;
      this.effect({ x: this.player.x, y: this.player.y - 14 }, '#ffe9a8', 'RELOAD', 13);
    }
  }

  /** Manual reload (R): eject a partial clip early. */
  reload() {
    const mag = this.hero.magazine;
    if (this.status !== 'running' || !mag || this.ammo >= mag.size || this.reloadLeft > 0) return;
    if (this.windupLeft > 0) this.cancel();
    this.startReload();
  }

  dash(p: Point) {
    if (this.status !== 'running' || this.dashCharges <= 0 || this.dashing > 0) return;
    const d = distance(p, this.player);
    let dir = d > 1 ? { x: (p.x - this.player.x) / d, y: (p.y - this.player.y) / d } : { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    if (this.hero.dashMode === 'away') dir = { x: -dir.x, y: -dir.y };
    this.dashDir = dir;
    this.dashStruck = [];
    this.cancel();
    this.dashing = DASH_TIME;
    this.invulnerable = DASH_TIME + 0.05;
    this.dashCharges--;
    if (this.dashCd <= 0) this.dashCd = this.stats.dashCd;
    this.destination = null;
    this.angle = Math.atan2(dir.y, dir.x);
    this.dashEvent++;
    this.ring(this.player, '#9ff5ff', 20);
    // A dash shakes off every attached Leech and leaves it stunned behind you.
    for (const e of this.enemies) {
      if (e.dead || !e.latched) continue;
      e.latched = false;
      e.cooldown = 0.9;
      e.contactCd = 1.3;
      e.x = clamp(this.player.x - dir.x * 70 + this.rng.range(-20, 20), 30, W - 30);
      e.y = clamp(this.player.y - dir.y * 70 + this.rng.range(-20, 20), 45, H - 45);
      this.effect({ x: e.x, y: e.y - 14 }, ENEMY_COLORS.leech, 'SHAKEN OFF', 13);
      this.burst(e, ENEMY_COLORS.leech, 8, 200, 'dot', 2.5);
    }
  }

  // ---------------------------------------------------------------- roguelike loop

  /** Spawn budget: linear early, then super-linear from wave 9 so waves keep pace with a compounding build. */
  budget(n: number) {
    return Math.round((3 + n * 2.2) * (1 + Math.max(0, n - 8) * 0.05) * this.diff.budget * this.tuning.waveBudget);
  }

  /** Seconds between spawn trickles inside a wave; tightens with the wave, scaled by the pace knob. */
  spawnGap() {
    return Math.max(0.9, 2.6 - this.wave * 0.12) * this.tuning.spawnPace;
  }

  /** Late HP multiplier layered on the linear per-kind HP: +6% per wave past 8. */
  lateHp(n: number) {
    return 1 + Math.max(0, n - 8) * 0.06;
  }

  /** Enemy kinds available on wave `n`; duplicates raise a kind's share of the marble bag. */
  wavePool(n: number): EnemyKind[] {
    const pool: EnemyKind[] = ['drone', 'drone', 'drone'];
    if (n >= 2) pool.push('archer', 'archer');
    if (n >= 3) pool.push('bomber', 'reaver');
    if (n >= 4) pool.push('leech', 'leech', 'splitter');
    if (n >= 5) pool.push('archer', 'bomber');
    if (n >= 6) pool.push('bulwark', 'reaver');
    if (n >= 7) pool.push('miner', 'leech');
    if (n >= 8) pool.push('hexer');
    if (n >= 10) pool.push('bulwark', 'hexer', 'splitter', 'reaver');
    return pool;
  }

  beginWave(n: number) {
    this.wave = n;
    this.waveState = 'banner';
    this.waveTimer = 1.4;
    this.spawnQueue = [];
    this.omens = [];
    this.cullIds = [];
    this.fightTime = 0;
    this.pendingEvents = this.scheduleEvents(n);
    this.waveEvent++;
    let b = this.budget(n);
    // Wardens: every third wave up to wave 9, every wave from 10, and a pair on every sixth wave.
    const wardens = this.wardenCount(n);
    for (let i = 0; i < wardens; i++) {
      this.spawnQueue.push('warden');
      b -= KIND_COST.warden;
    }
    const pool = this.wavePool(n);
    // Debut rule: a kind is guaranteed to show up on the wave that introduces it, so every
    // new threat is met once on schedule rather than whenever the bag happens to cough it up.
    const previous = new Set(this.wavePool(n - 1));
    for (const kind of new Set(pool.filter(k => !previous.has(k)))) {
      if (KIND_COST[kind] <= b) {
        this.spawnQueue.push(kind);
        b -= KIND_COST[kind];
      }
    }
    this.bag = [];
    while (b > 0) {
      const kind = this.drawKind(pool);
      const cost = KIND_COST[kind];
      if (cost > b) {
        // Too rich for what is left: top up with filler instead of overspending.
        this.spawnQueue.push('drone');
        b -= 1;
      } else {
        this.spawnQueue.push(kind);
        b -= cost;
      }
    }
    // Wardens lead the pack so the elite bar appears immediately.
    this.spawnQueue.sort((a, b2) => (a === 'warden' ? -1 : b2 === 'warden' ? 1 : 0));
  }

  wardenCount(n: number) {
    if (n % 6 === 0) return 2;
    if (n >= 10 || n % 3 === 0) return 1;
    return 0;
  }

  /** Shuffle a copy of `pool` with the run's RNG (Fisher-Yates). */
  shuffled<T>(pool: readonly T[]): T[] {
    const out = [...pool];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Draw from the marble bag, refilling it with a shuffled copy of the pool when empty. */
  drawKind(pool: EnemyKind[]): EnemyKind {
    if (!this.bag.length) this.bag = this.shuffled(pool);
    return this.bag.pop()!;
  }

  drawRarity(): Rarity {
    if (!this.rarityBag.length) this.rarityBag = this.shuffled(rarityBag(this.tuning));
    return this.rarityBag.pop()!;
  }

  drawAffix(): Affix {
    if (!this.affixBag.length) this.affixBag = this.shuffled<Affix>(['swift', 'volatile', 'gilded', 'warded']);
    return this.affixBag.pop()!;
  }

  spawnPoint(): Point {
    for (let i = 0; i < 12; i++) {
      const side = this.rng.int(0, 3);
      const p = side === 0 ? { x: 60, y: this.rng.range(90, H - 90) }
        : side === 1 ? { x: W - 60, y: this.rng.range(90, H - 90) }
        : side === 2 ? { x: this.rng.range(90, W - 90), y: 70 }
        : { x: this.rng.range(90, W - 90), y: H - 70 };
      if (distance(p, this.player) > 380) return p;
    }
    return { x: W - 60, y: 100 };
  }

  /** Chance that an ordinary spawn on wave `n` rolls a champion affix. Nothing before wave 4, up to 30%. */
  affixChance(n: number) {
    return n < 4 ? 0 : Math.min(0.3, 0.05 + (n - 4) * 0.025);
  }

  /** Portal an enemy in at an arena edge, or at `at` for ambushes. */
  spawnEnemy(kind: EnemyKind, at: Point | null = null) {
    const n = this.wave, hpMult = this.diff.hp * this.lateHp(n) * this.tuning.enemyHp;
    const p = at ?? this.spawnPoint();
    const def: Partial<Enemy> =
      kind === 'drone' ? { hp: (30 + n * 7) * hpMult, radius: 18, speed: 135 + Math.min(120, n * 6), gold: 1 }
      : kind === 'archer' ? { hp: (26 + n * 6) * hpMult, radius: 16, speed: 175, gold: 2, cooldown: this.rng.range(1, 2) }
      : kind === 'bomber' ? { hp: (44 + n * 9) * hpMult, radius: 20, speed: 215 + Math.min(60, n * 4), gold: 2 }
      : kind === 'leech' ? { hp: (18 + n * 4) * hpMult, radius: 12, speed: 250 + Math.min(90, n * 5), gold: 1 }
      : kind === 'splitter' ? { hp: (54 + n * 11) * hpMult, radius: 22, speed: 140, gold: 2 }
      : kind === 'bulwark' ? { hp: (95 + n * 22) * hpMult, radius: 26, speed: 150, gold: 4, arming: 1.2 }
      : kind === 'miner' ? { hp: (34 + n * 7) * hpMult, radius: 15, speed: 195, gold: 3, cooldown: this.rng.range(1.2, 2) }
      : kind === 'hexer' ? { hp: (40 + n * 8) * hpMult, radius: 17, speed: 165, gold: 4, cooldown: 2.5 }
      : kind === 'reaver' ? { hp: (42 + n * 8) * hpMult, radius: 19, speed: 190 + Math.min(60, n * 4), gold: 2 }
      : { hp: (260 + n * 80) * hpMult * (n % 6 === 0 ? 1.6 : 1), radius: n % 6 === 0 ? 42 : 34, speed: 105, gold: 12, elite: true, cooldown: 1.6 };
    const e = this.makeEnemy(kind, p, { ...def, maxHp: def.hp, spawn: 0 });
    if (kind === 'bulwark') e.facing = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    if (!e.elite && this.rng.next() < this.affixChance(n)) this.applyAffix(e, this.drawAffix());
    this.enemies.push(e);
    this.ring(p, ENEMY_COLORS[kind], 40);
    if (e.elite) this.eliteFlash = 0.9;
    return e;
  }

  applyAffix(e: Enemy, affix: Affix) {
    e.affix = affix;
    e.radius *= 1.12;
    // Champions are threats, not piñatas: the gold bump is modest so danger does not pay for itself.
    if (affix === 'swift') { e.speed *= 1.4; e.hp *= 0.9; e.gold = Math.round(e.gold * 1.5); }
    else if (affix === 'volatile') { e.hp *= 1.1; e.gold = Math.round(e.gold * 1.5); }
    else if (affix === 'gilded') { e.speed *= 1.1; e.gold *= 3; e.life = 14; }
    else if (affix === 'warded') { e.hp *= 1.15; e.gold = Math.round(e.gold * 1.5); e.wardTimer = 2.5; }
    e.maxHp = e.hp;
    this.championEvent++;
    this.eliteFlash = Math.max(this.eliteFlash, 0.45);
  }

  /** Splitter death: two smaller, faster halves boil out of the corpse. Generation 2 no longer splits. */
  splitEnemy(parent: Enemy) {
    for (let i = 0; i < 2; i++) {
      const a = parent.wobble + i * Math.PI;
      const p = { x: clamp(parent.x + Math.cos(a) * parent.radius * 1.2, 30, W - 30), y: clamp(parent.y + Math.sin(a) * parent.radius * 1.2, 45, H - 45) };
      const hp = Math.max(6, parent.maxHp * 0.45);
      this.enemies.push(this.makeEnemy('splitter', p, {
        // Halves pay one gold each; the four quarters pay nothing, so a Splitter is worth 4 in total, not 8.
        hp, maxHp: hp, radius: Math.max(9, parent.radius * 0.7), speed: parent.speed * 1.3, gold: parent.generation === 0 ? 1 : 0,
        generation: parent.generation + 1, spawn: 0.4, burn: parent.burn, burnTime: parent.burnTime,
      }));
    }
    this.ring(parent, ENEMY_COLORS.splitter, parent.radius + 16);
  }

  // ---------------------------------------------------------------- mid-wave events

  /**
   * Roll whether wave `n` hides a surprise, and when in the fighting phase it lands.
   * Nothing before wave 3; the odds climb to 60%. Kinds unlock with the wave like enemies do.
   */
  scheduleEvent(n: number): MidEvent | null {
    if (n < 3) return null;
    if (this.rng.next() >= Math.min(0.75, 0.3 + n * 0.04)) return null;
    // Choice events (tithe, cull) are weighted so at least a third of what fires asks a question.
    const kinds: EventKind[] = ['ambush', 'bounty'];
    if (n >= 4) kinds.push('barrage', 'tithe', 'tithe');
    if (n >= 5) kinds.push('champion');
    if (n >= 6) kinds.push('cull', 'cull');
    return { kind: this.rng.pick(kinds), at: this.rng.range(2.5, 7) };
  }

  /** One event per wave from wave 3; from wave 8 a second, independent 25% roll lands at least six seconds later. */
  scheduleEvents(n: number): MidEvent[] {
    const out: MidEvent[] = [];
    const first = this.scheduleEvent(n);
    if (first) out.push(first);
    if (n >= 8 && this.rng.next() < 0.25) {
      const second = this.scheduleEvent(n);
      if (second) out.push({ kind: second.kind, at: (first?.at ?? 2.5) + 6 + this.rng.range(0, 4) });
    }
    return out.sort((a, b) => a.at - b.at);
  }

  announce(kind: EventKind, sub: string) {
    this.eventBanner = { text: EVENT_LABEL[kind], sub, color: EVENT_COLORS[kind], life: 2.2, max: 2.2 };
    this.eventEvent++;
    this.shake = Math.max(this.shake, 0.5);
  }

  /** A point at least `min` from the player, inside the playable area. */
  farPoint(min: number): Point {
    for (let i = 0; i < 12; i++) {
      const p = { x: this.rng.range(120, W - 120), y: this.rng.range(120, H - 120) };
      if (distance(p, this.player) > min) return p;
    }
    return { x: this.player.x > W / 2 ? 140 : W - 140, y: this.player.y > H / 2 ? 140 : H - 140 };
  }

  fireEvent(kind: EventKind) {
    const n = this.wave;
    if (kind === 'ambush') {
      // Portals ring the player at close range; omens give a beat to move before they open.
      const count = Math.min(5, 2 + Math.floor(n / 3));
      const start = this.rng.range(0, Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const a = start + (i / count) * Math.PI * 2 + this.rng.range(-0.3, 0.3), d = this.rng.range(190, 260);
        const p = { x: clamp(this.player.x + Math.cos(a) * d, 60, W - 60), y: clamp(this.player.y + Math.sin(a) * d, 70, H - 70) };
        const enemy: EnemyKind = n >= 4 && this.rng.next() < 0.5 ? 'leech' : 'drone';
        this.omens.push({ ...p, life: 1.1, max: 1.1, kind: 'ambush', enemy });
      }
      this.announce(kind, `${count} PORTALS OPENING AROUND YOU`);
    } else if (kind === 'tithe') {
      // A shrine across the arena: touch it for gold, and three more hostiles portal in beside you, tougher than usual.
      const p = this.farPoint(340);
      const value = 10 + n * 2;
      this.omens.push({ ...p, life: 8, max: 8, kind: 'shrine', value });
      this.announce(kind, `SHRINE PAYS ${value} GOLD · IT WILL CALL REINFORCEMENTS`);
    } else if (kind === 'cull') {
      // Three marked quarry flee for twelve seconds; you take 20% more damage until every one is dead or gone.
      for (let i = 0; i < 3; i++) {
        const e = this.spawnEnemy(this.rng.pick<EnemyKind>(['drone', 'leech', 'archer']));
        if (e.affix !== 'gilded') this.applyAffix(e, 'gilded');
        e.gold = 8;
        e.life = 12;
        this.cullIds.push(e.id);
      }
      this.announce(kind, 'THREE QUARRY · +20% DAMAGE TAKEN WHILE THEY LIVE');
    } else if (kind === 'barrage') {
      // Seven ground bursts: three on top of the player, the rest scattered, staggered so you thread them.
      for (let i = 0; i < 7; i++) {
        const near = i < 3;
        const p = near
          ? { x: clamp(this.player.x + this.rng.range(-150, 150), 80, W - 80), y: clamp(this.player.y + this.rng.range(-120, 120), 90, H - 90) }
          : { x: this.rng.range(100, W - 100), y: this.rng.range(100, H - 100) };
        this.circleDanger(p, 90, 0.9 + i * 0.22, 14);
      }
      this.announce(kind, 'GROUND BURSTS INCOMING');
    } else if (kind === 'bounty') {
      const p = this.farPoint(380);
      this.omens.push({ ...p, life: 0.7, max: 0.7, kind: 'bounty' });
      this.announce(kind, `${6 + n} GOLD ACROSS THE ARENA · 9 SECONDS`);
    } else {
      // A champion joins mid-fight, always affixed.
      const pool = this.wavePool(n).filter(k => k !== 'drone');
      const e = this.spawnEnemy(pool.length ? this.rng.pick(pool) : 'drone');
      if (!e.affix) this.applyAffix(e, this.drawAffix());
      this.announce(kind, `A ${AFFIX_LABEL[e.affix!]} ${e.kind.toUpperCase()} JOINS THE FIGHT`);
    }
  }

  /** An omen's timer ran out: open the portal or drop the cache. Shrines that time out simply vanish. */
  resolveOmen(o: Omen) {
    if (o.kind === 'ambush') {
      const e = this.spawnEnemy(o.enemy ?? 'drone', { x: o.x, y: o.y });
      // Tithe reinforcements arrive tougher (`value` carries the HP multiplier).
      if (o.value && o.value > 1) { e.hp *= o.value; e.maxHp = e.hp; }
    } else if (o.kind === 'bounty') {
      this.orbs.push({ x: o.x, y: o.y, vx: 0, vy: 0, value: 6 + this.wave, life: 9, born: this.runTime, bounty: true });
      this.ring(o, EVENT_COLORS.bounty, 60);
      this.burst(o, EVENT_COLORS.bounty, 20, 240, 'dot', 3);
    }
  }

  /** Tithe accepted: pay out, then three reinforcements at +25% HP portal in around the player. */
  takeTithe(o: Omen) {
    const value = o.value ?? 10;
    this.gold += value;
    this.pickupEvent++;
    this.effect({ x: this.player.x, y: this.player.y - 14 }, EVENT_COLORS.tithe, `+${value} TITHE`, 18);
    this.burst(o, EVENT_COLORS.tithe, 30, 300, 'dot', 3);
    this.ring(o, EVENT_COLORS.tithe, 80);
    const start = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      const a = start + (i / 3) * Math.PI * 2, d = this.rng.range(200, 260);
      const p = { x: clamp(this.player.x + Math.cos(a) * d, 60, W - 60), y: clamp(this.player.y + Math.sin(a) * d, 70, H - 70) };
      const enemy: EnemyKind = this.wave >= 4 && i === 1 ? 'leech' : 'drone';
      this.omens.push({ ...p, life: 1.1, max: 1.1, kind: 'ambush', enemy, value: 1.25 });
    }
    this.shake = Math.max(this.shake, 0.4);
  }

  toOffer(u: Upgrade): Offer {
    const owned = new Set(this.relics.flatMap(r => r.tags));
    return {
      id: u.id, name: u.name, blurb: u.blurb, rarity: u.rarity, icon: u.icon, quest: u.quest, heroOnly: u.heroOnly,
      unlockedBy: u.requires ? this.relics.find(r => u.requires!.includes(r.id))?.name : undefined,
      stacks: this.relics.find(r => r.id === u.id)?.stacks ?? 0, max: u.max,
      synergy: owned.size > 0 && u.tags.some(t => owned.has(t)),
    };
  }

  /** Lift a rarity to the shop's tier floor and cap Prismatics per run. */
  resolveRarity(drawn: Rarity, tier: Rarity | 'mixed'): Rarity {
    let r = drawn;
    if (tier === 'gold' && r === 'silver') r = 'gold';
    if (tier === 'prismatic') r = 'prismatic';
    if (r === 'prismatic' && this.prismaticsOwned >= PRISMATIC_CAP) r = 'gold';
    return r;
  }

  /**
   * Pick one augment of the wanted rarity (falling down a tier when that rarity has nothing eligible),
   * weighted by synergy with what you hold, combo payoff, and diversity against `taken`.
   */
  drawAugment(wanted: Rarity, taken: Offer[]): Upgrade | null {
    const owned = new Set(this.relics.flatMap(r => r.tags));
    const takenIds = new Set(taken.map(o => o.id));
    const takenTags = new Set(taken.flatMap(o => UPGRADES.find(u => u.id === o.id)?.tags ?? []));
    const eligibleAll = UPGRADES.filter(u => eligible(u, this.relics, this.settings.hero, this.banished) && !takenIds.has(u.id));
    const order: Rarity[] = wanted === 'prismatic' ? ['prismatic', 'gold', 'silver'] : wanted === 'gold' ? ['gold', 'silver', 'prismatic'] : ['silver', 'gold', 'prismatic'];
    for (const rarity of order) {
      const pool = eligibleAll.filter(u => u.rarity === rarity);
      if (!pool.length) continue;
      const weight = (u: Upgrade) => {
        let w = 1;
        if (u.tags.some(t => owned.has(t))) w *= 1.35;
        // Combo augments are the payoff for an earlier pick: make sure they actually show up.
        if (u.requires) w *= 2.2;
        // Diversity: the same draft should not offer three augments from one lane.
        if (u.tags.some(t => takenTags.has(t))) w *= 0.5;
        return w;
      };
      const total = pool.reduce((s, u) => s + weight(u), 0);
      let roll = this.rng.next() * total;
      for (const u of pool) {
        roll -= weight(u);
        if (roll <= 0) return u;
      }
      return pool[pool.length - 1];
    }
    return null;
  }

  /**
   * Arena-style draft. Each slot draws its rarity from the marble bag (memory, not a coin flip), lifted to the
   * shop's tier floor. The run's hidden first-Prismatic wave and Ascend force exactly one Prismatic slot; pity
   * upgrades a slot only after two dry shops in a row.
   */
  rollOffers(count = 3): Offer[] {
    const tier = this.ascendNext ? 'prismatic' : offerTier(this.wave);
    const picks: Offer[] = [];
    for (let i = 0; i < count; i++) {
      const u = this.drawAugment(this.resolveRarity(this.drawRarity(), tier), picks);
      if (u) picks.push(this.toOffer(u));
    }
    const upgradeSlot = (rarity: Rarity) => {
      const u = this.drawAugment(rarity, picks);
      if (u && u.rarity === rarity) picks[picks.length - 1] = this.toOffer(u);
    };
    const hasPrismatic = picks.some(o => o.rarity === 'prismatic');
    // Predetermined first Prismatic: invisible to the player, so there is no wave to farm towards.
    if (picks.length && !hasPrismatic && this.wave === this.firstPrismaticWave && this.prismaticsOwned === 0) upgradeSlot('prismatic');
    // Pity: two consecutive all-Silver shops guarantee a Gold-or-better offer.
    if (this.dryShops >= 2 && picks.length && picks.every(o => o.rarity === 'silver')) upgradeSlot('gold');
    return picks;
  }

  rollAnvil(): Shard[] {
    const pool = [...SHARD_POOL];
    const out: Shard[] = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(this.rng.int(0, pool.length - 1), 1)[0]);
    return out;
  }

  openShop() {
    this.status = 'choosing';
    this.paidRerolls = 0;
    this.healedThisShop = false;
    this.anvilBoughtThisShop = 0;
    this.fourthBought = false;
    this.banishMode = false;
    this.ascended = false;
    this.draftClaimed = false;
    this.claimedOffer = null;
    this.offerTier = this.ascendNext ? 'prismatic' : offerTier(this.wave);
    // Pin the hidden first-Prismatic guarantee to the first shop that actually opens on or after its wave.
    if (!this.guaranteePinned && this.wave >= this.firstPrismaticWave) {
      this.firstPrismaticWave = this.wave;
      this.guaranteePinned = true;
    }
    this.offers = this.rollOffers();
    this.ascendNext = false;
    this.dryShops = this.offers.every(o => o.rarity === 'silver') ? this.dryShops + 1 : 0;
    this.anvil = this.rollAnvil();
    this.anvilBought = 0;
  }

  /** Fourth Offer: pay to reveal one more augment, Gold or better. Its rarity still comes from the bag, so it is never a cheap Prismatic. */
  buyFourth() {
    if (this.status !== 'choosing' || !this.offers || this.draftClaimed || this.fourthBought || this.gold < this.fourthCost) return;
    const floor = this.offerTier === 'prismatic' ? 'prismatic' : 'gold';
    const u = this.drawAugment(this.resolveRarity(this.drawRarity(), floor), this.offers);
    if (!u) return;
    this.gold -= this.fourthCost;
    this.fourthBought = true;
    this.buyEvent++;
    this.offers.push(this.toOffer(u));
  }

  toggleBanish() {
    if (this.status !== 'choosing') return;
    if (this.banishMode) { this.banishMode = false; return; }
    if (this.draftClaimed || this.gold < this.banishCost) return;
    this.banishMode = true;
  }

  /** Banish: remove an offer from the run's pool for good and redraw that slot. Cheap on purpose: it is the answer to a dry shop. */
  banish(index: number) {
    if (this.status !== 'choosing' || !this.offers || this.draftClaimed || this.gold < this.banishCost) return;
    const offer = this.offers[index];
    if (!offer) return;
    this.gold -= this.banishCost;
    this.buyEvent++;
    this.banished.add(offer.id);
    this.banishMode = false;
    const rest = this.offers.filter((_, i) => i !== index);
    const u = this.drawAugment(this.resolveRarity(offer.rarity, this.offerTier), rest);
    if (u) this.offers[index] = this.toOffer(u);
    else this.offers.splice(index, 1);
  }

  /** Ascend: the one big purchase. The next shop is a Prismatic draft. */
  ascend() {
    if (this.status !== 'choosing' || this.ascended || this.ascendNext || this.gold < this.ascendCost) return;
    this.gold -= this.ascendCost;
    this.ascendNext = true;
    this.ascended = true;
    this.buyEvent++;
  }

  /** Claim the free draft. Applies exactly one reward and leaves the intermission open; continueWave() departs. */
  choose(index: number) {
    if (this.status !== 'choosing' || !this.offers) return;
    if (this.banishMode) {
      this.banish(index);
      return;
    }
    if (this.draftClaimed) return;
    const offer = this.offers[index];
    if (!offer) return;
    const def = UPGRADES.find(u => u.id === offer.id)!;
    const existing = this.relics.find(r => r.id === offer.id);
    if (existing) existing.stacks++;
    else this.relics.push({ id: def.id, name: def.name, stacks: 1, rarity: def.rarity, icon: def.icon, tags: def.tags });
    if (def.quest) this.questProgress = 0;
    this.recomputeStats();
    this.draftClaimed = true;
    this.claimedOffer = { ...offer, stacks: existing ? existing.stacks : 1 };
    this.banishMode = false;
    this.upgradeEvent++;
    this.effect(this.player, '#ffe9a8', def.name.toUpperCase(), 22);
    this.burst(this.player, def.rarity === 'prismatic' ? '#d79bff' : def.rarity === 'gold' ? '#ffd66b' : '#ffe9a8', def.rarity === 'prismatic' ? 50 : 26, 260, 'dot', 3);
  }

  /** Depart the intermission. Only after the draft is claimed; begins exactly one wave and is inert afterwards. */
  continueWave() {
    if (this.status !== 'choosing' || !this.draftClaimed) return;
    this.offers = null;
    this.banishMode = false;
    this.status = 'running';
    this.beginWave(this.wave + 1);
  }

  /** First wave after the current one whose clear opens a draft, from the actual shop cadence. */
  get nextShopWave() {
    const every = Math.max(1, Math.round(this.tuning.shopEvery));
    let w = this.wave + 1;
    while (w % every !== 0) w++;
    return w;
  }

  /** HP a field repair would actually restore right now (35 percent of max, capped at the missing amount). */
  get healAmount() {
    return Math.max(0, Math.min(Math.round(this.stats.maxHp * 0.35), Math.ceil(this.stats.maxHp - this.hp)));
  }

  /** Before/after of the one stat each anvil shard moves, derived by the real stat pipeline. */
  anvilPreview() {
    return this.anvil.map(s => {
      const after = computeStats(this.settings, this.relics, { ...this.shards, [s.key]: (this.shards[s.key] ?? 0) + 1 }, this.questDone, this.tuning);
      return { key: s.key, before: this.stats[s.key], after: after[s.key] };
    });
  }

  /** Reroll the draft: one free per run, then 4, 8, 16 gold within a shop. A purchased fourth offer is kept. */
  reroll() {
    if (this.status !== 'choosing' || !this.offers || this.draftClaimed) return;
    const cost = this.rerollCost;
    if (cost > 0 && this.gold < cost) return;
    if (cost > 0) {
      this.gold -= cost;
      this.paidRerolls++;
    } else this.rerollsLeft--;
    const fourth = this.offers[3];
    this.offers = this.rollOffers();
    if (fourth) this.offers.push(fourth);
  }

  buyHeal() {
    if (this.status !== 'choosing' || this.healedThisShop || this.gold < this.healCost || this.hp >= this.stats.maxHp) return;
    this.gold -= this.healCost;
    this.healedThisShop = true;
    this.buyEvent++;
    this.hp = Math.min(this.stats.maxHp, this.hp + Math.round(this.stats.maxHp * 0.35));
  }

  buyShard(index: number) {
    if (this.status !== 'choosing' || this.anvilLeft <= 0) return;
    const shard = this.anvil[index];
    if (!shard || this.gold < this.anvilCost) return;
    this.gold -= this.anvilCost;
    this.anvilBought++;
    this.buyEvent++;
    this.anvilBoughtThisShop++;
    this.shardsBought++;
    this.shards[shard.key] = (this.shards[shard.key] ?? 0) + 1;
    this.anvil.splice(index, 1);
    this.recomputeStats();
  }

  /** Quest bookkeeping: only the owned quest's own metric advances it. */
  advanceQuest(kind: QuestKind, n = 1) {
    const q = this.quest;
    if (!q?.quest || this.questDone || q.quest.kind !== kind) return;
    this.questProgress += n;
    if (this.questProgress >= q.quest.count) {
      this.questDone = true;
      this.questEvent++;
      this.recomputeStats();
      this.effect({ x: this.player.x, y: this.player.y - 20 }, '#d79bff', 'QUEST COMPLETE', 24);
      this.burst(this.player, '#d79bff', 60, 320, 'dot', 3);
      this.ring(this.player, '#d79bff', 70);
    }
  }

  // ---------------------------------------------------------------- hazards

  /** Incoming damage scale: difficulty, wave, enrage level (+10% each) and the Cull vulnerability. */
  hazardDamage(base: number) {
    return base * this.diff.dmg * this.tuning.enemyDamage * (1 + this.wave * 0.03) * (1 + this.enrage * 0.1) * (this.vulnerable ? CULL_VULNERABILITY : 1);
  }

  /** Telegraph window after the tuning knob: how long a hazard warns before it goes live. */
  telegraph(delay: number) {
    return delay * this.tuning.telegraph;
  }

  lineDanger(from: Point, angle: number, speed: number, delay: number, damage: number, radius = 13) {
    const v = speed * this.tuning.projectileSpeed, d = this.telegraph(delay);
    this.dangers.push({
      x: from.x, y: from.y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, delay: d, age: 0,
      life: d + 3.8, radius, kind: 'line', hit: false, resolved: false, damage, trail: [],
    });
  }

  circleDanger(at: Point, radius: number, delay: number, damage: number) {
    const d = this.telegraph(delay);
    this.dangers.push({ x: at.x, y: at.y, vx: 0, vy: 0, delay: d, age: 0, life: d + 0.35, radius, kind: 'circle', hit: false, resolved: false, damage, trail: [] });
  }

  /** Proximity mine: harmless while arming, then sits until the player steps in or it times out. */
  mineDanger(at: Point) {
    this.dangers.push({ x: at.x, y: at.y, vx: 0, vy: 0, delay: this.telegraph(0.9), age: 0, life: 16, radius: 46, kind: 'mine', hit: false, resolved: false, damage: 13, trail: [] });
  }

  /** Hexer miasma: forms for a moment, then drifts after the player, draining anyone standing in it. */
  cloudDanger(at: Point, owner: number) {
    this.dangers.push({ x: at.x, y: at.y, vx: 0, vy: 0, delay: this.telegraph(0.9), age: 0, life: 8.5, radius: 72, kind: 'cloud', hit: false, resolved: false, damage: 11, trail: [], owner });
  }

  get mines() {
    return this.dangers.filter(d => d.kind === 'mine' && !d.resolved).length;
  }
  get clouds() {
    return this.dangers.filter(d => d.kind === 'cloud').length;
  }

  /** Drill-mode hazard schedule (the original trainer's arena spawner). */
  spawnDrillHazard() {
    const hard = this.settings.difficulty === 'hard', easy = this.settings.difficulty === 'easy';
    const n = Math.floor(this.elapsed / this.diff.hazard);
    const kind = n % 4 === 3 ? 'circle' : 'line';
    const delay = this.diff.delay;
    if (kind === 'circle') {
      this.circleDanger(this.player, 85, delay + 0.25, 18);
      return;
    }
    const side = n % 4;
    const origin = side === 0 ? { x: 40, y: 140 + (n * 107) % 600 }
      : side === 1 ? { x: 1460, y: 100 + (n * 71) % 700 }
      : side === 2 ? { x: 200 + (n * 131) % 1100, y: 55 }
      : { x: 150 + (n * 137) % 1150, y: 875 };
    const a = Math.atan2(this.player.y - origin.y, this.player.x - origin.x);
    const speed = easy ? 410 : hard ? 690 : 540;
    const offsets = n % 3 === 2 ? [-0.17, 0, 0.17] : [0];
    for (const o of offsets) this.lineDanger(origin, a + o, speed, delay, 10);
  }

  /** Overflow shield soaks damage first; returns what is left for HP. */
  absorb(dmg: number) {
    if (this.shield <= 0) return dmg;
    const a = Math.min(this.shield, dmg);
    this.shield -= a;
    return dmg - a;
  }

  hurt(base: number) {
    this.hits++;
    this.hitEvent++;
    this.streak = 0;
    this.hurtFlash = 0.22;
    if (!this.isRun) {
      this.effect(this.player, '#ff677d', 'HIT');
      return;
    }
    const raw = Math.max(1, Math.round(this.hazardDamage(base) - this.stats.armor));
    const dmg = this.absorb(raw);
    this.hp -= dmg;
    if (dmg <= 0) this.effect(this.player, '#9ff5ff', 'ABSORBED', 16);
    else this.effect(this.player, '#ff677d', `-${dmg}`, 22);
    if (this.hp <= 0) this.die();
  }

  /** Continuous damage (Leech drain, Hexer miasma): ignores armour, prints one number every half second. */
  drain(base: number, dt: number) {
    if (!this.isRun || this.dead) return;
    const dmg = this.absorb(this.hazardDamage(base) * dt);
    this.hp -= dmg;
    this.drainAcc += dmg;
    this.hurtFlash = Math.max(this.hurtFlash, 0.08);
    if (this.hp <= 0) this.die();
  }

  takeHit(d: Danger) {
    d.hit = true;
    this.shake = 1;
    this.burst(this.player, '#ff677d', 14, 260);
    this.hurt(d.damage);
  }

  contactHit(e: Enemy, base: number) {
    e.contactCd = 1.15;
    this.shake = 0.7;
    this.burst(this.player, '#ff677d', 8, 200);
    this.hurt(base);
  }

  /** Healing past full spills into the Overflow shield when owned. */
  heal(n: number) {
    this.hp += n;
    if (this.hp > this.stats.maxHp) {
      const over = this.hp - this.stats.maxHp;
      this.hp = this.stats.maxHp;
      if (this.stats.shieldMax) this.shield = Math.min(this.stats.shieldMax, this.shield + over);
    }
  }

  die() {
    this.hp = 0;
    this.dead = true;
    this.status = 'ended';
    this.armed = false;
    this.shake = 2;
    this.burst(this.player, this.hero.colors.skin, 60, 380, 'shard', 6);
    this.ring(this.player, '#ffffff', 30);
  }

  // ---------------------------------------------------------------- combat

  /** Outgoing damage multiplier from run-state augments: Kinetic Rounds, Last Stand, Hunter's Focus. */
  damageMultiplier() {
    let m = 1;
    if (this.stats.kinetic) m *= 1 + this.momentum * 0.015;
    if (this.stats.berserk) {
      const half = this.stats.maxHp * 0.5;
      if (this.hp < half) m *= 1 + 0.6 * clamp(1 - this.hp / half, 0, 1);
    }
    if (this.stats.focus) m *= 1 + 0.08 * this.focusStacks;
    return m;
  }

  /** Skirmisher: would a blade released right now be a Tempo shot? */
  get tempoReady() {
    return this.hero.tempo && this.stillTime < TEMPO_WINDOW;
  }

  rollDamage(target: Enemy | null = null, bonusCrit = 0) {
    let chance = this.stats.critChance + bonusCrit;
    if (this.stats.frostbite && target && target.slow > 0) chance *= 2;
    const crit = this.rng.next() < chance;
    return { damage: Math.round(this.stats.damage * this.damageMultiplier() * (crit ? this.stats.critMult : 1)), crit };
  }

  fireAt(target: Enemy, damage: number, crit: boolean, bounces: number, from: Point, heavy = false) {
    // Slow enough to be seen leaving the bow; bolts home, so speed is feel rather than accuracy.
    this.bolts.push({ x: from.x, y: from.y, origin: { ...from }, target, damage, crit, bounces, speed: (this.hero.weapon === 'cannon' ? 820 : 1000) * this.tuning.boltSpeed, trail: [], splash: this.stats.splash, heavy });
  }

  release() {
    if (!this.target) return;
    this.windupLeft = 0;
    this.fired++;
    this.attackCount++;
    this.shotEvent++;
    this.flash = 0.14;
    this.recoil = this.hero.weapon === 'cannon' ? 0.18 : this.hero.weapon === 'crossbow' ? 0.2 : this.hero.weapon === 'garand' ? 0.14 : this.hero.weapon === 'pistols' ? 0.08 : 0.12;
    // Ammunition: a clip round leaves the magazine (the last one starts the reload); a crank shot spends the crank.
    if (this.hero.magazine) {
      this.ammo = Math.max(0, this.ammo - 1);
      if (this.ammo === 0) this.startReload();
    }
    if (this.hero.crank) this.crank = 0;
    // Hunter's Focus: ramp on the same target, reset on a switch.
    if (this.stats.focus) {
      if (this.focusTarget === this.target.id) this.focusStacks = Math.min(FOCUS_MAX, this.focusStacks + 1);
      else { this.focusTarget = this.target.id; this.focusStacks = 0; }
    }
    this.lastFiredTarget = this.target.id;
    let boltMult = 1;
    if (this.hero.heat) {
      if (this.stats.overclock && this.heat >= HEAT_MAX) {
        // Overclock: the overheated shell hits like a truck and vents everything.
        boltMult = 1.75;
        this.heat = 0;
        this.effect({ x: this.player.x, y: this.player.y - 10 }, '#ffd27a', 'OVERCLOCK', 16);
        this.burst(this.player, '#ffd27a', 16, 240, 'dot', 3);
      } else {
        // Cannoneer: firing without having moved since the last shot builds heat.
        if (this.movedSinceShot < 40) this.heat = Math.min(HEAT_MAX, this.heat + 1);
        if (this.heat >= HEAT_MAX) this.effect({ x: this.player.x, y: this.player.y - 10 }, '#ff8f6b', this.stats.overclock ? 'PRIMED' : 'OVERHEAT', 15);
      }
      this.movedSinceShot = 0;
    }
    // Skirmisher Tempo: a blade thrown on the heels of a step hits harder and crits more.
    let bonusCrit = 0;
    if (this.tempoReady) {
      boltMult *= TEMPO_DAMAGE;
      bonusCrit = TEMPO_CRIT;
      this.tempoShots++;
      this.tempoFlash = 0.25;
      this.effect({ x: this.player.x, y: this.player.y - 12 }, this.hero.colors.capeTrim, 'TEMPO', 13);
    }
    const { damage: rolled, crit } = this.rollDamage(this.target, bonusCrit);
    const damage = Math.round(rolled * boltMult);
    if (this.hero.pierce) this.firePierce(this.target, damage, crit);
    else this.fireAt(this.target, damage, crit, this.stats.bounces, this.player, this.hero.weapon === 'cannon');
    // Split Shot: extra bolts at the next nearest enemies in range (or the same target).
    const others = this.targetable()
      .filter(e => e.id !== this.target!.id && distance(e, this.player) <= this.stats.range + e.radius)
      .sort((a, b) => distance(a, this.player) - distance(b, this.player));
    // Off-hand pistol: a second, weaker shot at the nearest other enemy in reach.
    if (this.hero.offhand && others[0]) {
      const roll = this.rollDamage(others[0], bonusCrit);
      this.fireAt(others[0], Math.max(1, Math.round(roll.damage * this.hero.offhand * boltMult)), roll.crit, this.stats.bounces, this.player);
    }
    for (let i = 1; i < this.stats.projectiles; i++) {
      const extra = others[i - 1] ?? this.target;
      const roll = this.rollDamage(extra, bonusCrit);
      this.fireAt(extra, Math.round(roll.damage * 0.8 * boltMult), roll.crit, this.stats.bounces, this.player);
    }
    const every = this.stats.thunderhead ? 2 : 3;
    if (this.stats.tempest && this.attackCount % every === 0) this.tempest(this.target, damage);
    this.effect(this.player, this.hero.colors.bolt);
  }

  /** Arbalest quarrel: flies straight through the target's position and on, hitting each enemy it crosses once. */
  firePierce(target: Enemy, damage: number, crit: boolean) {
    const d = distance(this.player, target) || 1;
    const dir = { x: (target.x - this.player.x) / d, y: (target.y - this.player.y) / d };
    this.bolts.push({
      x: this.player.x, y: this.player.y, origin: { ...this.player }, target, damage, crit, bounces: 0,
      speed: 1500 * this.tuning.boltSpeed, trail: [], splash: this.stats.splash, heavy: true,
      dir, pierce: this.hero.pierce ?? 1, struck: [], travel: 0, maxTravel: this.stats.range + 140,
    });
  }

  /** Step a piercing quarrel: straight flight, one hit per enemy crossed, damage falling 15% per body. */
  stepPierce(b: Bolt, dt: number) {
    const step = b.speed * dt;
    b.x += b.dir!.x * step;
    b.y += b.dir!.y * step;
    b.travel = (b.travel ?? 0) + step;
    for (const e of this.targetable()) {
      if (b.struck!.includes(e.id) || distance(e, b) > e.radius + 9) continue;
      b.struck!.push(e.id);
      const dmg = Math.max(1, Math.round(b.damage * Math.pow(0.85, b.struck!.length - 1)));
      if (this.blocks(e, b)) {
        e.block = 0.25;
        e.flash = 0.1;
        this.blockEvent++;
        this.effect({ x: e.x, y: e.y - e.radius - 8 }, '#cfe3ff', 'BLOCKED', 15);
        b.x = -9999;
        return;
      }
      this.damageEnemy(e, dmg, b.crit);
      if (b.struck!.length >= b.pierce!) {
        b.x = -9999;
        return;
      }
    }
    if (b.travel > (b.maxTravel ?? 0) || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) b.x = -9999;
  }

  /** Tempest: lightning chains from the target through nearby enemies. Thunderhead lengthens the chain. */
  tempest(first: Enemy, damage: number) {
    const chain: Enemy[] = [first];
    const max = this.stats.thunderhead ? 6 : 4;
    let cur = first;
    while (chain.length < max) {
      const next = this.targetable()
        .filter(e => !chain.includes(e) && distance(e, cur) < 350)
        .sort((a, b) => distance(a, cur) - distance(b, cur))[0];
      if (!next) break;
      chain.push(next);
      cur = next;
    }
    const points: Point[] = [{ ...this.player }];
    for (const e of chain) {
      points.push({ x: e.x, y: e.y });
      this.damageEnemy(e, Math.max(1, Math.round(damage * 0.6)), false);
    }
    this.beams.push({ points, life: 0.22, max: 0.22, color: '#bfe4ff' });
    this.shake = Math.max(this.shake, 0.35);
  }

  damageEnemy(e: Enemy, dmg: number, crit: boolean) {
    if (e.dead) return;
    e.flash = 0.17;
    if (e.invulnerable && e.kind !== 'dummy') {
      // Warded champions shrug bolts off entirely while the ward is up.
      this.effect({ x: e.x + this.fx.range(-10, 10), y: e.y - 10 }, AFFIX_COLORS.warded, 'WARDED', 15);
      this.burst(e, AFFIX_COLORS.warded, 5, 140, 'dot', 2);
      return;
    }
    if (e.shred > 0) dmg = Math.round(dmg * (1 + this.stats.shred));
    if (this.stats.frostbite && e.slow > 0) dmg = Math.round(dmg * 1.25);
    let text = `${dmg}`, color = crit ? '#ffe37a' : '#f6d895', size = crit ? 26 : 18;
    if (this.stats.executioner && !e.elite && !e.invulnerable && e.hp - dmg > 0 && e.hp / e.maxHp < 0.15) {
      dmg = Math.ceil(e.hp);
      text = 'EXECUTED';
      color = '#ff5c8a';
      size = 20;
    }
    this.effect({ x: e.x + this.fx.range(-10, 10), y: e.y - 10 }, color, text, size);
    this.burst(e, crit ? '#ffe37a' : ENEMY_COLORS[e.kind], crit ? 8 : 4, 160, 'dot', 2.5);
    if (e.invulnerable) return;
    e.hp -= dmg;
    this.damageDealt += dmg;
    this.knock(e, crit ? 1.3 : 1);
    if (crit) {
      this.advanceQuest('crits');
      if (this.stats.shred) e.shred = 3;
    }
    if (this.stats.slow) e.slow = Math.max(e.slow, 1);
    if (this.stats.burn) {
      e.burn = Math.min(3, e.burn + 1);
      e.burnTime = 3;
    }
    if (this.stats.lifesteal) this.heal(this.stats.lifesteal);
    this.impact = Math.max(this.impact, 0.1);
    if (e.hp <= 0) this.kill(e, -e.hp / e.maxHp);
  }

  /**
   * Hit-stun: shove the enemy a step away from the player and freeze it for a few frames. Elites, planted
   * Bulwarks and latched Leeches do not budge; heavy cannon shells shove harder.
   */
  knock(e: Enemy, scale = 1) {
    if (e.elite || e.kind === 'dummy' || e.latched || (e.kind === 'bulwark' && e.pattern === 1)) return;
    const dx = e.x - this.player.x, dy = e.y - this.player.y, d = Math.hypot(dx, dy) || 1;
    const force = KNOCKBACK * this.tuning.knockback * scale * (this.hero.weapon === 'cannon' ? 1.6 : 1);
    e.kx += dx / d * force;
    e.ky += dy / d * force;
    e.stagger = Math.max(e.stagger, STAGGER * this.tuning.stagger);
  }

  /** `overkill` is excess damage as a fraction of max HP; big overkills get bigger send-offs. */
  kill(e: Enemy, overkill = 0) {
    if (e.dead) return;
    e.dead = true;
    e.latched = false;
    this.kills++;
    this.killEvent++;
    const extra = Math.min(24, Math.round(overkill * 30));
    this.shake = Math.max(this.shake, (e.elite ? 1.2 : 0.25) + Math.min(0.4, overkill * 0.4));
    this.burst(e, ENEMY_COLORS[e.kind], (e.elite ? 60 : 18) + extra, (e.elite ? 420 : 280) + extra * 8, 'shard', e.elite ? 7 : 4);
    this.ring(e, ENEMY_COLORS[e.kind], e.radius + extra * 1.5);
    if (overkill > 0.5) this.effect({ x: e.x, y: e.y - 30 }, '#ffffff', 'OVERKILL', 14);
    if (this.stats.adrenaline) {
      this.adrenaline.push(3);
      if (this.adrenaline.length > 3) this.adrenaline.shift();
    }
    // Death riders: Splitters divide, Volatile champions detonate, Hexers take their miasma with them.
    if (e.kind === 'splitter' && e.generation < 2) this.splitEnemy(e);
    if (e.affix === 'volatile') {
      this.circleDanger(e, 110, 0.55, 16);
      this.effect({ x: e.x, y: e.y - 44 }, AFFIX_COLORS.volatile, 'VOLATILE', 13);
    }
    if (e.kind === 'hexer') this.dangers = this.dangers.filter(d => d.owner !== e.id);
    // Wildfire: a burning corpse lights everything nearby.
    if (this.stats.wildfire && e.burn > 0) {
      for (const o of this.targetable()) {
        if (o.id === e.id || o.dead || distance(o, e) > 120) continue;
        o.burn = Math.min(3, Math.max(o.burn, e.burn));
        o.burnTime = 3;
        this.burst(o, '#ff9a4a', 6, 160, 'dot', 2.5);
      }
      this.ring(e, '#ff9a4a', 120);
    }
    this.advanceQuest('kills');
    const value = Math.round(e.gold * this.stats.goldMult) + (e.gold > 0 ? this.stats.goldFlat : 0);
    const count = e.elite ? 6 : e.affix === 'gilded' ? Math.min(4, value) : value > 0 ? 1 + (this.rng.next() < 0.35 ? 1 : 0) : 0;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2), v = this.rng.range(80, 220);
      // Split the bounty exactly: the first `value % count` orbs carry the remainder.
      const share = Math.floor(value / count) + (i < value % count ? 1 : 0);
      this.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, value: Math.max(1, share), life: 14, born: this.runTime });
    }
    if (this.target?.id === e.id) this.target = null;
  }

  // ---------------------------------------------------------------- enemy AI

  /** Gilded champions run; catch them before the timer ends or the bounty walks off. */
  flee(e: Enemy, dir: Point, dist: number, speed: number, dt: number) {
    e.life -= dt;
    if (e.life <= 0) {
      e.dead = true;
      this.effect({ x: e.x, y: e.y - 20 }, AFFIX_COLORS.gilded, 'ESCAPED', 15);
      this.burst(e, AFFIX_COLORS.gilded, 14, 200, 'dot', 3);
      if (this.target?.id === e.id) this.target = null;
      return;
    }
    let away = { x: -dir.x, y: -dir.y };
    // Slide along walls rather than pinning against them.
    if ((e.x < 90 && away.x < 0) || (e.x > W - 90 && away.x > 0)) away = { x: 0, y: Math.sign(away.y || (e.id % 2 ? 1 : -1)) };
    if ((e.y < 100 && away.y < 0) || (e.y > H - 100 && away.y > 0)) away = { x: Math.sign(away.x || (e.id % 2 ? 1 : -1)), y: 0 };
    if (dist < 520) {
      e.x += away.x * speed * dt;
      e.y += away.y * speed * dt;
    } else {
      const s = e.id % 2 ? 1 : -1;
      e.x += -dir.y * s * speed * 0.5 * dt;
      e.y += dir.x * s * speed * 0.5 * dt;
    }
    e.angle = Math.atan2(away.y, away.x);
  }

  updateEnemy(e: Enemy, dt: number) {
    e.flash = Math.max(0, e.flash - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.shred = Math.max(0, e.shred - dt);
    e.block = Math.max(0, e.block - dt);
    e.contactCd = Math.max(0, e.contactCd - dt);
    e.spin += dt;
    if (e.spawn < 1) {
      e.spawn = Math.min(1, e.spawn + dt / SPAWN_TIME);
      return;
    }
    // Hit-stun: ride out the knockback, then hold still for the stagger before the AI resumes.
    if (e.kx !== 0 || e.ky !== 0) {
      e.x = clamp(e.x + e.kx * dt, 30, W - 30);
      e.y = clamp(e.y + e.ky * dt, 45, H - 45);
      const k = Math.max(0, 1 - KNOCK_DRAG * dt);
      e.kx *= k;
      e.ky *= k;
      if (Math.abs(e.kx) < 2 && Math.abs(e.ky) < 2) e.kx = e.ky = 0;
    }
    if (e.stagger > 0) {
      e.stagger = Math.max(0, e.stagger - dt);
      if (!e.latched) return;
    }
    if (e.affix === 'warded') {
      e.wardTimer -= dt;
      if (e.wardTimer <= 0) {
        e.wardTimer = 4.5;
        this.ring(e, AFFIX_COLORS.warded, e.radius + 10);
      }
      // The ward is up for the first 1.3s of every 4.5s cycle.
      e.invulnerable = e.wardTimer > 3.2;
    }
    if (e.burn > 0 && !e.invulnerable) {
      e.burnTime -= dt;
      const tick = 4 * e.burn * dt;
      e.hp -= tick;
      this.damageDealt += tick;
      if (this.fx.next() < dt * 6) this.burst(e, '#ff9a4a', 1, 60, 'dot', 2);
      if (e.burnTime <= 0) e.burn = 0;
      if (e.hp <= 0) {
        this.kill(e);
        return;
      }
    }
    const speed = e.speed * this.tuning.enemySpeed * (e.slow > 0 ? 1 - this.stats.slow : 1) * (1 + this.enrage * 0.08);
    const toP = { x: this.player.x - e.x, y: this.player.y - e.y };
    const dist = Math.hypot(toP.x, toP.y) || 1;
    const dir = { x: toP.x / dist, y: toP.y / dist };
    e.angle = Math.atan2(dir.y, dir.x);

    if (e.affix === 'gilded') {
      this.flee(e, dir, dist, speed, dt);
      e.x = clamp(e.x, 30, W - 30);
      e.y = clamp(e.y, 45, H - 45);
      return;
    }

    switch (e.kind) {
      case 'dummy': {
        if (this.settings.drill === 'mixed' && e.base) {
          e.x = e.base.x + Math.sin(this.elapsed * 0.65 + e.id) * 65;
          e.y = e.base.y + Math.cos(this.elapsed * 0.5 + e.id) * 40;
        }
        return;
      }
      case 'drone': {
        e.wobble += dt * 4;
        const side = Math.sin(e.wobble) * 0.35;
        e.x += (dir.x - dir.y * side) * speed * dt;
        e.y += (dir.y + dir.x * side) * speed * dt;
        if (dist < e.radius + PLAYER_R && e.contactCd <= 0 && this.invulnerable <= 0) {
          this.contactHit(e, 6);
          e.x -= dir.x * 45;
          e.y -= dir.y * 45;
        }
        break;
      }
      case 'archer': {
        const ideal = 410;
        if (dist > ideal + 40) {
          e.x += dir.x * speed * dt;
          e.y += dir.y * speed * dt;
        } else if (dist < ideal - 70) {
          e.x -= dir.x * speed * 0.8 * dt;
          e.y -= dir.y * speed * 0.8 * dt;
        } else {
          const s = e.id % 2 ? 1 : -1;
          e.x += -dir.y * s * speed * 0.45 * dt;
          e.y += dir.x * s * speed * 0.45 * dt;
        }
        e.cooldown -= dt;
        if (e.cooldown <= 0 && dist < 760) {
          this.lineDanger(e, e.angle, 500 + Math.min(200, this.wave * 9), 0.45, 9);
          e.cooldown = Math.max(1.3, 2.5 - this.wave * 0.06);
        }
        break;
      }
      case 'bomber': {
        if (e.arming > 0) {
          e.arming += dt;
          if (e.arming >= this.telegraph(0.72)) {
            // The circle danger spawned when arming began resolves itself; the bomber is spent.
            e.dead = true;
            this.kills++;
            this.killEvent++;
            this.burst(e, ENEMY_COLORS.bomber, 30, 360, 'shard', 5);
            this.ring(e, ENEMY_COLORS.bomber, 30);
            if (this.target?.id === e.id) this.target = null;
          }
          break;
        }
        e.x += dir.x * speed * dt;
        e.y += dir.y * speed * dt;
        if (dist < 118) {
          e.arming = 0.001;
          this.circleDanger(e, 105, 0.7, 16);
        }
        break;
      }
      case 'leech': {
        if (e.latched) {
          // Ride along on the player's flank and drain. Killing it or dashing gets it off.
          e.wobble += dt * 6;
          e.x = this.player.x + Math.cos(e.wobble * 0.7 + e.id) * 14;
          e.y = this.player.y + Math.sin(e.wobble * 0.7 + e.id) * 14;
          e.angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
          if (this.invulnerable <= 0) this.drain(3.5, dt);
          return;
        }
        if (e.cooldown > 0) {
          // Stunned after being shaken off.
          e.cooldown -= dt;
          break;
        }
        e.wobble += dt * 9;
        const side = Math.sin(e.wobble) * 0.6;
        e.x += (dir.x - dir.y * side) * speed * dt;
        e.y += (dir.y + dir.x * side) * speed * dt;
        if (dist < e.radius + PLAYER_R + 2 && e.contactCd <= 0 && this.invulnerable <= 0) {
          e.latched = true;
          e.contactCd = 1;
          this.shake = Math.max(this.shake, 0.4);
          this.effect({ x: this.player.x, y: this.player.y - 26 }, ENEMY_COLORS.leech, 'LATCHED', 15);
          this.burst(this.player, ENEMY_COLORS.leech, 8, 180, 'dot', 2.5);
        }
        break;
      }
      case 'splitter': {
        e.wobble += dt * 2.5;
        const squash = Math.sin(e.wobble) * 0.25;
        e.x += dir.x * speed * (1 + squash) * dt;
        e.y += dir.y * speed * (1 + squash) * dt;
        if (dist < e.radius + PLAYER_R && e.contactCd <= 0 && this.invulnerable <= 0) {
          this.contactHit(e, e.generation === 0 ? 8 : 5);
          e.x -= dir.x * 40;
          e.y -= dir.y * 40;
        }
        break;
      }
      case 'bulwark': {
        // Two-beat rhythm: plant (shield up, frozen facing) then advance (open on all sides).
        e.arming -= dt;
        if (e.pattern === 1) {
          if (e.arming <= 0) {
            e.pattern = 0;
            e.arming = 1.8;
          }
        } else {
          e.x += dir.x * speed * dt;
          e.y += dir.y * speed * dt;
          if (dist < e.radius + PLAYER_R && e.contactCd <= 0 && this.invulnerable <= 0) {
            this.contactHit(e, 10);
            // A shove: the player is bumped back.
            this.player.x = clamp(this.player.x + dir.x * 60, 40, W - 40);
            this.player.y = clamp(this.player.y + dir.y * 60, 55, H - 45);
          }
          if (e.arming <= 0) {
            e.pattern = 1;
            e.arming = 2.4;
            e.facing = e.angle;
            this.ring(e, ENEMY_COLORS.bulwark, e.radius + 12);
          }
        }
        break;
      }
      case 'miner': {
        const ideal = 340;
        if (dist > ideal + 60) {
          e.x += dir.x * speed * dt;
          e.y += dir.y * speed * dt;
        } else if (dist < ideal - 80) {
          e.x -= dir.x * speed * 0.9 * dt;
          e.y -= dir.y * speed * 0.9 * dt;
        } else {
          const s = e.id % 2 ? 1 : -1;
          e.x += -dir.y * s * speed * 0.7 * dt;
          e.y += dir.x * s * speed * 0.7 * dt;
        }
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          if (this.mines < MINE_CAP) {
            this.mineDanger(e);
            this.ring(e, ENEMY_COLORS.miner, e.radius + 8);
          }
          e.cooldown = 3.4;
        }
        break;
      }
      case 'hexer': {
        const ideal = 520;
        if (dist > ideal + 80) {
          e.x += dir.x * speed * dt;
          e.y += dir.y * speed * dt;
        } else if (dist < ideal - 80) {
          e.x -= dir.x * speed * 0.85 * dt;
          e.y -= dir.y * speed * 0.85 * dt;
        } else {
          const s = e.id % 2 ? 1 : -1;
          e.x += -dir.y * s * speed * 0.4 * dt;
          e.y += dir.x * s * speed * 0.4 * dt;
        }
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          if (this.clouds < CLOUD_CAP) {
            // The miasma forms between the Hexer and the player, then drifts in.
            const at = { x: this.player.x - dir.x * 220, y: this.player.y - dir.y * 220 };
            this.cloudDanger(at, e.id);
            this.ring(e, ENEMY_COLORS.hexer, e.radius + 14);
          }
          e.cooldown = 5;
        }
        break;
      }
      case 'reaver': {
        // Three beats. Chase; then a windup with the facing locked and the swing arc painted on the floor;
        // then the swing along that locked facing and a recovery pause. Step out of the arc and it whiffs.
        if (e.pattern === 1) {
          e.arming -= dt;
          if (e.arming <= 0) {
            this.swingEvent++;
            const a = Math.atan2(this.player.y - e.y, this.player.x - e.x);
            const inArc = dist < REAVER.reach + e.radius + PLAYER_R && Math.abs(angleDiff(a, e.facing)) < REAVER.arc;
            if (inArc && this.invulnerable <= 0) {
              this.contactHit(e, REAVER.damage);
            } else {
              this.dodged++;
              this.streak++;
              this.best = Math.max(this.best, this.streak);
              this.advanceQuest('dodges');
              this.effect({ x: this.player.x, y: this.player.y - 26 }, '#a2ebcd', 'SIDESTEP', 14);
            }
            e.pattern = 2;
            e.arming = REAVER.recover;
          }
          break;
        }
        if (e.pattern === 2) {
          e.arming -= dt;
          if (e.arming <= 0) e.pattern = 0;
          break;
        }
        e.x += dir.x * speed * dt;
        e.y += dir.y * speed * dt;
        if (dist < REAVER.reach + e.radius + PLAYER_R - 8 && e.contactCd <= 0) {
          e.pattern = 1;
          e.arming = this.telegraph(REAVER.windup);
          e.facing = e.angle;
          this.ring(e, '#ff677d', e.radius + 8);
        }
        break;
      }
      case 'warden': {
        if (dist > 330) {
          e.x += dir.x * speed * dt;
          e.y += dir.y * speed * dt;
        }
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          const p = e.pattern++ % 3;
          if (p === 0) {
            for (const o of [-0.32, -0.16, 0, 0.16, 0.32]) this.lineDanger(e, e.angle + o, 470, 0.55, 11);
          } else if (p === 1) {
            for (let i = 0; i < 10; i++) this.lineDanger(e, e.angle + (i / 10) * Math.PI * 2, 400, 0.6, 10, 12);
          } else {
            this.circleDanger(this.player, 115, 0.9, 16);
            for (let i = 0; i < 2; i++) this.circleDanger({ x: this.player.x + this.rng.range(-220, 220), y: this.player.y + this.rng.range(-160, 160) }, 95, 1.1, 14);
          }
          e.cooldown = Math.max(1.5, 2.4 - this.wave * 0.04);
        }
        break;
      }
    }
    e.x = clamp(e.x, 30, W - 30);
    e.y = clamp(e.y, 45, H - 45);
  }

  // ---------------------------------------------------------------- main step

  effectiveAttackSpeed() {
    const mult = 1 + this.stats.adrenaline * this.adrenaline.length + (this.stats.momentum ? this.momentum * 0.02 : 0);
    return Math.min(3, this.stats.attackSpeed * mult);
  }

  /** Windup fraction after Cannoneer heat: each heat point adds 12%. Overclock removes the drag at max heat. */
  effectiveWindup() {
    if (!this.hero.heat) return this.stats.windup;
    if (this.stats.overclock && this.heat >= HEAT_MAX) return this.stats.windup;
    return this.stats.windup * (1 + this.heat * 0.12);
  }

  /** Player move speed after Leech drag. */
  effectiveMoveSpeed() {
    return this.stats.moveSpeed * (1 - 0.22 * Math.min(2, this.latched));
  }

  update(dt: number) {
    if (this.status !== 'running') return;
    this.previous = { ...this.player };
    this.elapsed += dt;
    this.runTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt);
    this.dashReadyPulse = Math.max(0, this.dashReadyPulse - dt);
    this.attackReadyPulse = Math.max(0, this.attackReadyPulse - dt);
    this.eliteFlash = Math.max(0, this.eliteFlash - dt);
    this.impact = Math.max(0, this.impact - dt);
    this.tempoFlash = Math.max(0, this.tempoFlash - dt);
    if (this.eventBanner) {
      this.eventBanner.life -= dt;
      if (this.eventBanner.life <= 0) this.eventBanner = null;
    }
    this.adrenaline = this.adrenaline.map(t => t - dt).filter(t => t > 0);
    if (this.isRun && this.stats.regen) this.heal(this.stats.regen * dt);
    // Drain numbers: print the accumulated loss twice a second rather than every frame.
    if (this.drainAcc > 0) {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) {
        this.drainTimer = 0.5;
        this.effect({ x: this.player.x + 14, y: this.player.y - 8 }, '#ff9db0', `-${Math.max(1, Math.round(this.drainAcc))}`, 15);
        this.drainAcc = 0;
      }
    }

    // Reload clock: the clip refills when it runs out, with a ready cue.
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = this.hero.magazine?.size ?? 0;
        this.loadedEvent++;
        this.attackReadyPulse = 0.35;
      }
    }
    // Dash recharge with a ready cue once a charge comes back.
    if (this.dashCd > 0) {
      this.dashCd -= dt;
      if (this.dashCd <= 0) {
        this.dashCd = 0;
        this.dashCharges = Math.min(this.stats.dashCharges, this.dashCharges + 1);
        this.dashReadyPulse = 0.7;
        this.dashReadyEvent++;
        if (this.dashCharges < this.stats.dashCharges) this.dashCd = this.stats.dashCd;
      }
    }

    // Wave flow
    if (this.isRun) this.updateWave(dt);

    // Omens count down and resolve into ambushers or a bounty cache; shrines resolve on touch.
    if (this.omens.length) {
      const due: Omen[] = [];
      let touched: Omen | null = null;
      for (const o of this.omens) {
        o.life -= dt;
        if (o.kind === 'shrine' && !touched && distance(o, this.player) < 44) touched = o;
        else if (o.life <= 0) due.push(o);
      }
      if (due.length || touched) {
        this.omens = this.omens.filter(o => o.life > 0 && o !== touched);
        for (const o of due) if (o.kind !== 'shrine') this.resolveOmen(o);
        if (touched) this.takeTithe(touched);
      }
    }
    // Fairness clause bookkeeping: how long the player has been below a quarter health.
    this.lowHpTimer = this.isRun && this.hpFrac < 0.25 ? this.lowHpTimer + dt : 0;

    // Enemies
    for (const e of this.enemies) if (!e.dead) this.updateEnemy(e, dt);
    this.latched = this.enemies.reduce((n, e) => n + (!e.dead && e.latched ? 1 : 0), 0);
    if (this.target?.dead) this.target = null;
    if (this.target) this.aimAngle = Math.atan2(this.target.y - this.player.y, this.target.x - this.player.x);

    // Attack timing
    if (this.windupLeft > 0) {
      this.windupLeft -= dt;
      if (this.windupLeft <= 0) this.release();
    }
    if (this.attackOrder && this.windupLeft <= 0) {
      if (!this.target) {
        // Attack-move without a target: engage anything in range, else keep walking to the point.
        const t = this.targetable()
          .filter(e => this.inRange(e))
          .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
        if (t) {
          this.target = t;
          this.destination = null;
        } else if (this.attackPoint && !this.destination && distance(this.player, this.attackPoint) > 2) {
          this.destination = { ...this.attackPoint };
        }
      }
      if (this.target) {
        if (!this.inRange(this.target)) {
          this.destination = { ...this.target };
        } else {
          this.destination = null;
          if (this.cooldown <= 0 && this.canFire()) {
            const as = this.effectiveAttackSpeed();
            // Quickdraw: the first bolt at a fresh target skips the windup entirely.
            const instant = this.stats.quickdraw > 0 && this.target.id !== this.lastFiredTarget;
            this.windupTotal = instant ? 0.001 : (1 / as) * (this.effectiveWindup() / 100);
            this.windupLeft = this.windupTotal;
            this.cooldown = 1 / as;
            this.angle = Math.atan2(this.target.y - this.player.y, this.target.x - this.player.x);
            this.aimAngle = this.angle;
            if (instant) this.effect({ x: this.player.x, y: this.player.y - 12 }, '#ffe9a8', 'QUICKDRAW', 13);
          }
        }
      }
    }
    // Attack-ready cue: the cooldown just ended while no attack is queued.
    if (this.cooldown <= 0 && this.windupLeft <= 0 && this.previousCooldown > 0 && !this.target) this.attackReadyPulse = 0.35;
    this.previousCooldown = this.cooldown;

    // Dash movement
    let moved = 0;
    if (this.dashing > 0) {
      const step = Math.min(this.dashing, dt);
      this.dashing = Math.max(0, this.dashing - dt);
      const v = DASH_SPEED * this.tuning.dashDistance;
      const nx = clamp(this.player.x + this.dashDir.x * v * step, 40, W - 40);
      const ny = clamp(this.player.y + this.dashDir.y * v * step, 55, H - 45);
      moved = Math.hypot(nx - this.player.x, ny - this.player.y);
      this.player.x = nx;
      this.player.y = ny;
      this.ghosts.push({ x: this.player.x, y: this.player.y, life: 0.3, angle: this.angle });
      this.movingTime += dt;
      // Skirmisher blade dash: cut every enemy the dash passes through, once each.
      if (this.hero.dashStrike) {
        for (const e of this.targetable()) {
          if (this.dashStruck.includes(e.id) || distance(e, this.player) > PLAYER_R + e.radius + 8) continue;
          this.dashStruck.push(e.id);
          const roll = this.rollDamage(e);
          this.damageEnemy(e, Math.round(roll.damage * DASH_STRIKE), roll.crit);
          this.cutEvent++;
          this.burst(e, this.hero.colors.bolt, 10, 300, 'shard', 3);
          if (this.stats.riposte && this.dashStruck.length <= RIPOSTE_CAP) {
            this.dashCd = Math.max(0.05, this.dashCd - this.stats.riposte);
            this.effect({ x: this.player.x, y: this.player.y - 26 }, '#9ff5ff', 'RIPOSTE', 13);
          }
        }
      }
    } else if (this.destination && this.windupLeft <= 0) {
      const d = distance(this.player, this.destination), step = Math.min(d, this.effectiveMoveSpeed() * dt);
      if (d > 0.01) {
        this.angle = Math.atan2(this.destination.y - this.player.y, this.destination.x - this.player.x);
        this.player.x += Math.cos(this.angle) * step;
        this.player.y += Math.sin(this.angle) * step;
        this.movingTime += dt;
        moved = step;
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.11;
          this.puff();
        }
      }
      if (d <= step) {
        this.destination = null;
        if (this.attackOrder && !this.target && this.attackPoint && distance(this.player, this.attackPoint) < 2) {
          this.attackOrder = false;
          this.attackPoint = null;
        }
      }
    }
    // Hero mechanics driven by movement.
    if (moved > 0) {
      this.stillTime = 0;
      // Arbalest: walking rewinds the crank; a full crank clicks ready.
      if (this.hero.crank && this.crank < 1) {
        this.crank = Math.min(1, this.crank + moved / this.hero.crank);
        if (this.crank >= 1) {
          this.loadedEvent++;
          this.attackReadyPulse = 0.35;
          this.effect({ x: this.player.x, y: this.player.y - 14 }, this.hero.colors.capeTrim, 'LOADED', 13);
        }
      }
      if (this.hero.heat) {
        this.movedSinceShot += moved;
        if (this.movedSinceShot >= 40 && this.heat > 0) {
          this.heat = 0;
          this.effect({ x: this.player.x, y: this.player.y - 10 }, '#9ff5ff', 'VENT', 13);
        }
      }
      if (this.stats.momentum) {
        this.momentumDistance += moved;
        while (this.momentumDistance >= 40 && this.momentum < MOMENTUM_MAX) {
          this.momentumDistance -= 40;
          this.momentum++;
        }
        this.momentumDistance = Math.min(this.momentumDistance, 40);
      }
    } else {
      this.stillTime += dt;
      if (this.stats.momentum && this.stillTime > 0.6 && this.momentum > 0) {
        this.momentumDistance -= dt * 5 * 40;
        while (this.momentumDistance <= -40 && this.momentum > 0) {
          this.momentumDistance += 40;
          this.momentum--;
        }
        this.momentumDistance = Math.max(this.momentumDistance, -40);
      }
    }
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter(g => g.life > 0);

    // Bolts
    for (const b of this.bolts) {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 12) b.trail.shift();
      if (b.dir) {
        this.stepPierce(b, dt);
        continue;
      }
      const d = distance(b, b.target);
      if (d < b.speed * dt || b.target.dead && d < 30) {
        this.landBolt(b);
        b.x = -9999;
      } else {
        b.x += (b.target.x - b.x) / d * b.speed * dt;
        b.y += (b.target.y - b.y) / d * b.speed * dt;
      }
    }
    this.bolts = this.bolts.filter(b => b.x > -9000);
    for (const bm of this.beams) bm.life -= dt;
    this.beams = this.beams.filter(bm => bm.life > 0);

    // Hazard spawner (drill mode only)
    if (!this.isRun && this.settings.drill !== 'rhythm') {
      this.nextDanger -= dt;
      if (this.nextDanger <= 0) {
        this.spawnDrillHazard();
        this.nextDanger = this.diff.hazard;
      }
    }

    // Dangers
    for (const d of this.dangers) {
      d.age += dt;
      if (d.age < d.delay) continue;
      if (d.kind === 'line') {
        const old = { x: d.x, y: d.y };
        d.trail.push(old);
        if (d.trail.length > 5) d.trail.shift();
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (!d.hit && this.invulnerable <= 0) {
          const rel = segmentDistance({ x: 0, y: 0 }, { x: old.x - this.previous.x, y: old.y - this.previous.y }, { x: d.x - this.player.x, y: d.y - this.player.y });
          if (rel < d.radius + PLAYER_R) this.takeHit(d);
        }
      } else if (d.kind === 'circle') {
        if (!d.resolved) {
          if (this.invulnerable <= 0 && distance(d, this.player) < d.radius + PLAYER_R) this.takeHit(d);
          d.resolved = true;
          this.burst(d, '#ff7c7c', 16, 300, 'dot', 3);
        }
      } else if (d.kind === 'mine') {
        if (!d.resolved && this.invulnerable <= 0 && distance(d, this.player) < d.radius + PLAYER_R) {
          d.resolved = true;
          d.life = d.age + 0.35;
          this.burst(d, ENEMY_COLORS.miner, 22, 320, 'shard', 4);
          this.takeHit(d);
        }
        if (d.age > d.life) d.hit = true; // expired quietly: not a dodge
      } else if (d.kind === 'cloud') {
        // Homing miasma: drifts toward the player, drains while they stand in it.
        const dx = this.player.x - d.x, dy = this.player.y - d.y, len = Math.hypot(dx, dy) || 1;
        d.x += dx / len * 95 * dt;
        d.y += dy / len * 95 * dt;
        if (this.invulnerable <= 0 && len < d.radius + PLAYER_R * 0.5) this.drain(d.damage, dt);
        if (d.age > d.life) d.hit = true;
      }
      if ((d.age > d.life || d.x < -60 || d.x > W + 60 || d.y < -60 || d.y > H + 60) && !d.hit) {
        this.dodged++;
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        this.advanceQuest('dodges');
        if (this.streak % 5 === 0) this.effect({ x: this.player.x, y: this.player.y - 26 }, '#a2ebcd', `STREAK ${this.streak}`, 15);
        d.hit = true;
      }
    }
    this.dangers = this.dangers.filter(d => d.age <= d.life && d.x >= -60 && d.x <= W + 60 && d.y >= -60 && d.y <= H + 60);

    // Gold orbs
    for (const o of this.orbs) {
      o.life -= dt;
      const d = distance(o, this.player);
      if (d < this.stats.magnet) {
        const pull = (1 - d / this.stats.magnet) * 2600 + 400;
        o.vx += (this.player.x - o.x) / d * pull * dt;
        o.vy += (this.player.y - o.y) / d * pull * dt;
      }
      o.vx *= Math.max(0, 1 - 2.6 * dt);
      o.vy *= Math.max(0, 1 - 2.6 * dt);
      o.x = clamp(o.x + o.vx * dt, 40, W - 40);
      o.y = clamp(o.y + o.vy * dt, 55, H - 45);
      if (d < 22) {
        this.gold += o.value;
        this.pickupEvent++;
        o.life = 0;
        this.effect({ x: this.player.x, y: this.player.y - 10 }, '#ffd66b', `+${o.value}`, 15);
        this.burst(this.player, '#ffd66b', 5, 120, 'dot', 2);
      }
    }
    this.orbs = this.orbs.filter(o => o.life > 0);

    // Particles and effects
    for (const p of this.particles) {
      p.life -= dt;
      p.vx *= Math.max(0, 1 - p.drag * dt);
      p.vy *= Math.max(0, 1 - p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);

    if (!this.isRun && this.elapsed >= DRILL_LENGTH) {
      this.elapsed = DRILL_LENGTH;
      this.status = 'ended';
      this.armed = false;
    }
  }

  updateWave(dt: number) {
    switch (this.waveState) {
      case 'banner':
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.waveState = 'spawning';
          const initial = Math.min(this.spawnQueue.length, 3 + Math.floor(this.wave / 2));
          for (let i = 0; i < initial; i++) this.spawnEnemy(this.spawnQueue.shift()!);
          this.spawnTimer = this.spawnGap();
        }
        break;
      case 'spawning':
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.spawnQueue.length) {
          const n = Math.min(this.spawnQueue.length, this.rng.int(1, 2));
          for (let i = 0; i < n; i++) this.spawnEnemy(this.spawnQueue.shift()!);
          this.spawnTimer = this.spawnGap();
        }
        if (!this.spawnQueue.length) this.waveState = 'fighting';
        break;
      case 'fighting': {
        this.fightTime += dt;
        const next = this.pendingEvents[0];
        if (next && this.fightTime >= next.at && this.alive.length) {
          // Fairness clause: a threat never lands in the first 1.5 s after the player drops below a quarter health.
          const unfair = THREAT_EVENTS.includes(next.kind) && this.hpFrac < 0.25 && this.lowHpTimer < 1.5;
          if (!unfair) {
            this.pendingEvents.shift();
            this.fireEvent(next.kind);
          }
        }
        if (!this.alive.length && !this.omens.some(o => o.kind === 'ambush')) {
          this.pendingEvents = [];
          this.omens = [];
          this.cullIds = [];
          this.waveState = 'clear';
          this.waveTimer = 1.5;
          const bonus = 4 + Math.floor(this.wave * 0.6);
          this.gold += bonus;
          this.waveEvent++;
          this.effect({ x: this.player.x, y: this.player.y - 20 }, '#ffd66b', `+${bonus} GOLD`, 17);
          this.burst(this.player, '#a2ebcd', 40, 320, 'dot', 3);
          this.ring(this.player, '#a2ebcd', 60);
          // Sweep leftover hazards (including mines and miasma) so the shop is not interrupted.
          this.dangers = [];
        }
        break;
      }
      case 'clear':
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.waveState = 'none';
          // Reward cadence: a draft opens every N waves; the waves in between roll straight on.
          if (this.wave % Math.max(1, Math.round(this.tuning.shopEvery)) === 0) this.openShop();
          else this.beginWave(this.wave + 1);
        }
        break;
      default:
        break;
    }
  }

  /** Bulwark shield check: a planted Bulwark blocks bolts arriving inside its frontal arc. */
  blocks(t: Enemy, b: Bolt) {
    if (t.kind !== 'bulwark' || t.pattern !== 1 || t.dead) return false;
    const approach = Math.atan2(b.origin.y - t.y, b.origin.x - t.x);
    return Math.abs(angleDiff(approach, t.facing)) < SHIELD_ARC;
  }

  landBolt(b: Bolt) {
    const t = b.target;
    if (!t.dead) {
      if (this.blocks(t, b)) {
        t.block = 0.25;
        t.flash = 0.1;
        this.blockEvent++;
        this.effect({ x: t.x, y: t.y - t.radius - 8 }, '#cfe3ff', 'BLOCKED', 15);
        this.burst({ x: t.x + Math.cos(t.facing) * t.radius, y: t.y + Math.sin(t.facing) * t.radius }, '#e6f0ff', 10, 260, 'shard', 2.5);
      } else {
        this.damageEnemy(t, b.damage, b.crit);
      }
    }
    if (b.splash) {
      this.ring(t, b.heavy ? '#ffd27a' : '#ffd18a', b.splash);
      if (b.heavy) this.burst(t, '#ffd27a', 10, 220, 'dot', 3);
      for (const e of this.targetable()) {
        if (e.id !== t.id && !e.dead && distance(e, t) < b.splash + e.radius) this.damageEnemy(e, Math.max(1, Math.round(b.damage * 0.5)), false);
      }
    }
    if (b.bounces > 0) {
      const next = this.targetable()
        .filter(e => e.id !== t.id && !e.dead && distance(e, t) < 320)
        .sort((a, c) => distance(a, t) - distance(c, t))[0];
      if (next) this.fireAt(next, Math.max(1, Math.round(b.damage * 0.7)), b.crit, b.bounces - 1, t);
    }
  }

  // ---------------------------------------------------------------- snapshot

  snapshot(): Snapshot {
    const reloading = this.reloadLeft > 0, cranking = !!this.hero.crank && this.crank < 1;
    const phase = this.armed ? 'AIMING' : this.dashing > 0 ? 'DASH' : this.windupLeft > 0 ? 'WINDUP' : reloading ? 'RELOAD' : cranking ? 'CRANK' : this.cooldown > 0 ? 'RECOVERY' : 'READY';
    const elite = this.enemies.find(e => e.elite && !e.dead);
    const quest = this.quest;
    return {
      status: this.status,
      mode: this.settings.mode,
      hero: this.settings.hero,
      time: Math.max(0, DRILL_LENGTH - this.elapsed),
      runTime: this.runTime,
      fired: this.fired,
      cancelled: this.cancelled,
      hits: this.hits,
      dodged: this.dodged,
      moved: this.elapsed ? this.movingTime / this.elapsed * 100 : 0,
      phase,
      progress: this.windupLeft > 0 ? 1 - this.windupLeft / this.windupTotal
        : reloading ? 1 - this.reloadLeft / (this.hero.magazine?.reload ?? 1)
        : cranking ? this.crank
        : 1 - this.cooldown * this.effectiveAttackSpeed(),
      streak: this.streak,
      best: this.best,
      hp: Math.max(0, Math.ceil(this.hp)),
      maxHp: this.stats.maxHp,
      shield: Math.round(this.shield),
      gold: this.gold,
      wave: this.wave,
      waveState: this.waveState,
      kills: this.kills,
      damageDealt: this.damageDealt,
      enemiesLeft: this.alive.length + this.spawnQueue.length + this.omens.filter(o => o.kind === 'ambush').length,
      dashCd: this.dashCd,
      dashMax: this.stats.dashCd,
      dashCharges: this.dashCharges,
      dashMaxCharges: this.stats.dashCharges,
      offers: this.offers,
      offerTier: this.offerTier,
      rerollsLeft: this.rerollsLeft,
      rerollCost: this.rerollCost,
      healCost: this.healCost,
      healUsed: this.healedThisShop,
      anvil: this.anvil,
      anvilCost: this.anvilCost,
      anvilLeft: this.anvilLeft,
      fourthCost: this.fourthCost,
      fourthBought: this.fourthBought,
      banishCost: this.banishCost,
      banishMode: this.banishMode,
      ascendCost: this.ascendCost,
      ascended: this.ascended || this.ascendNext,
      draftClaimed: this.draftClaimed,
      claimedOffer: this.claimedOffer,
      nextWave: this.wave + 1,
      nextShopWave: this.nextShopWave,
      healAmount: this.healAmount,
      anvilPreview: this.status === 'choosing' ? this.anvilPreview() : [],
      shards: { ...this.shards },
      relics: this.relics.map(r => ({ ...r })),
      questProgress: this.questProgress,
      questNeed: quest?.quest?.count ?? 0,
      questDone: this.questDone,
      stats: { ...this.stats },
      heat: this.heat,
      momentum: this.momentum,
      focus: this.focusStacks,
      latched: this.latched,
      tempoReady: this.tempoReady,
      tempoShots: this.tempoShots,
      ammo: this.ammo,
      ammoMax: this.hero.magazine?.size ?? 0,
      reload: reloading ? 1 - this.reloadLeft / (this.hero.magazine?.reload ?? 1) : 0,
      crank: this.hero.crank ? this.crank : 1,
      event: this.eventBanner?.text ?? null,
      enrageIn: this.waveState === 'fighting' ? this.enrageLimit - this.fightTime : this.enrageLimit,
      enrage: this.enrage,
      cull: this.cullAlive,
      dead: this.dead,
      eliteHp: elite ? elite.hp / elite.maxHp : null,
    };
  }
}
