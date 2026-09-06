import type { Rarity, Stats } from './types.ts';

/**
 * Live tuning knobs. Everything here is a multiplier or a count layered on top of the hand-authored
 * numbers in heroes.ts, sim.ts and upgrades.ts, so the defaults are a no-op and the game plays exactly
 * as authored. The dev tuning panel edits these in real time; presets pair them into A/B variants.
 *
 * The point is taste capture: find the numbers that feel right by ear, then bake them into the source
 * and pin them with a test. See design/PILLARS.md.
 */
export type Tuning = {
  // Player tempo (multipliers on the class profile)
  playerMove: number;
  playerAttackSpeed: number;
  playerWindup: number;
  playerRange: number;
  // Enemy pressure
  enemySpeed: number;
  enemyHp: number;
  enemyDamage: number;
  /** Speed of enemy line shots (archer bolts, warden volleys). */
  projectileSpeed: number;
  /** Length of every telegraph window before a hazard goes live. Below 1 means less time to react. */
  telegraph: number;
  // Draft
  /** 0..1 scale of what augments add on top of the base sheet. 1 is authored strength. */
  augmentPower: number;
  /** A draft opens every N waves. */
  shopEvery: number;
  /** Rarity marble bag composition. */
  bagSilver: number;
  bagGold: number;
  bagPrismatic: number;
  // Feel
  /** Player bolt travel speed. Bolts home, so this is how long a shot is visible in flight. */
  boltSpeed: number;
  /** Dash distance (the dash lasts the same time, so this is also dash speed). */
  dashDistance: number;
  /** Hit-stun shove strength and freeze length on landed bolts. */
  knockback: number;
  stagger: number;
  /** Real-time slowdown after impacts. */
  hitStop: number;
  /** Screen shake amplitude. */
  shake: number;
  /** Combat text size (damage numbers, labels). */
  textSize: number;
  /** Particle counts for bursts and puffs. */
  particles: number;
  // Pace
  /** Gap between spawn trickles within a wave. */
  spawnPace: number;
  /** Spawn budget per wave. */
  waveBudget: number;
  // Experiments (briefs 03, 04, 05). Absolute values, not multipliers; excluded from preset matching.
  /** Witness gaze: effective radius in arena units, telegraph base in seconds (the 0.85 s floor is fixed), half-angle in degrees, stun seconds, cooldown seconds, debut wave. */
  witnessRadius: number;
  witnessWindup: number;
  witnessArc: number;
  witnessStun: number;
  witnessCooldown: number;
  witnessDebut: number;
  /** Overdraw contract: incoming damage multiplier, gold on clear, first wave it can be signed for. */
  overdrawMult: number;
  overdrawGold: number;
  overdrawFromWave: number;
  /** Account credits: per cleared wave, extra per cleared Warden wave, cap per run; case price; tier odds in percent. */
  creditsPerWave: number;
  creditsPerWarden: number;
  creditsCap: number;
  caseCost: number;
  chaseOdds: number;
  signatureOdds: number;
};

export type TuningKey = keyof Tuning;

export const DEFAULT_TUNING: Tuning = {
  playerMove: 1, playerAttackSpeed: 1, playerWindup: 1, playerRange: 1,
  enemySpeed: 1, enemyHp: 1, enemyDamage: 1, projectileSpeed: 1, telegraph: 1,
  augmentPower: 1, shopEvery: 1, bagSilver: 13, bagGold: 6, bagPrismatic: 1,
  boltSpeed: 1, dashDistance: 1, knockback: 1, stagger: 1, hitStop: 1, shake: 1, textSize: 1, particles: 1,
  spawnPace: 1, waveBudget: 1,
  witnessRadius: 300, witnessWindup: 1.15, witnessArc: 70, witnessStun: 0.35, witnessCooldown: 4.5, witnessDebut: 7,
  overdrawMult: 1.35, overdrawGold: 18, overdrawFromWave: 4,
  creditsPerWave: 4, creditsPerWarden: 8, creditsCap: 60, caseCost: 100, chaseOdds: 1, signatureOdds: 19,
};

export type TuningGroup = 'player' | 'enemy' | 'draft' | 'feel' | 'pace' | 'witness' | 'contract' | 'arsenal';

/** Knob groups that belong to the current experiments. They do not count toward preset matching (Iron stays Iron). */
export const EXPERIMENT_GROUPS: TuningGroup[] = ['witness', 'contract', 'arsenal'];

export type TuningKnob = {
  key: TuningKey;
  label: string;
  group: TuningGroup;
  min: number;
  max: number;
  step: number;
  /** Plain-language reading of what the knob does, for the panel. */
  note: string;
  format: (v: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const TUNING_KNOBS: TuningKnob[] = [
  { key: 'playerMove', label: 'Move speed', group: 'player', min: 0.5, max: 1.3, step: 0.05, format: pct, note: 'How fast you walk. Against enemy speed this sets the kite margin.' },
  { key: 'playerAttackSpeed', label: 'Attack speed', group: 'player', min: 0.5, max: 1.3, step: 0.05, format: pct, note: 'Shots per second. Lower means each shot has to count.' },
  { key: 'playerWindup', label: 'Windup', group: 'player', min: 0.6, max: 1.8, step: 0.05, format: pct, note: 'Commitment before the release. Longer means moving costs you more.' },
  { key: 'playerRange', label: 'Range', group: 'player', min: 0.6, max: 1.3, step: 0.05, format: pct, note: 'Your reach. The gap between this and enemy reach is the kiting fantasy.' },
  { key: 'enemySpeed', label: 'Enemy speed', group: 'enemy', min: 0.6, max: 1.8, step: 0.05, format: pct, note: 'All enemy movement. Which enemies can catch a walking player?' },
  { key: 'enemyHp', label: 'Enemy health', group: 'enemy', min: 0.5, max: 2, step: 0.05, format: pct, note: 'Time to kill. Higher stretches every fight.' },
  { key: 'enemyDamage', label: 'Enemy damage', group: 'enemy', min: 0.5, max: 2.5, step: 0.05, format: pct, note: 'Lethality per hit, contact and hazards alike.' },
  { key: 'projectileSpeed', label: 'Shot speed', group: 'enemy', min: 0.6, max: 1.8, step: 0.05, format: pct, note: 'How fast archer bolts and warden volleys travel. Effective enemy reach.' },
  { key: 'telegraph', label: 'Telegraph window', group: 'enemy', min: 0.4, max: 1.6, step: 0.05, format: pct, note: 'Warning time before a hazard goes live. Shorter is deadlier.' },
  { key: 'augmentPower', label: 'Augment power', group: 'draft', min: 0, max: 1.5, step: 0.05, format: pct, note: 'Scales what every augment adds. Shards and class kits are untouched.' },
  { key: 'shopEvery', label: 'Draft every', group: 'draft', min: 1, max: 4, step: 1, format: v => `${v} wave${v === 1 ? '' : 's'}`, note: 'Reward cadence. Fewer drafts means each one matters more.' },
  { key: 'bagSilver', label: 'Silver marbles', group: 'draft', min: 0, max: 30, step: 1, format: v => `${v}`, note: 'Rarity bag composition. The bag is drawn without replacement.' },
  { key: 'bagGold', label: 'Gold marbles', group: 'draft', min: 0, max: 20, step: 1, format: v => `${v}`, note: '' },
  { key: 'bagPrismatic', label: 'Prismatic marbles', group: 'draft', min: 0, max: 5, step: 1, format: v => `${v}`, note: 'Zero removes random Prismatics; the hidden first-Prismatic guarantee still fires.' },
  { key: 'boltSpeed', label: 'Bolt speed', group: 'feel', min: 0.3, max: 2, step: 0.05, format: pct, note: 'How fast your shots fly. They always land; this is how long you watch them.' },
  { key: 'dashDistance', label: 'Dash distance', group: 'feel', min: 0.4, max: 1.8, step: 0.05, format: pct, note: 'How far E carries you. Same duration, so also how fast.' },
  { key: 'knockback', label: 'Hit shove', group: 'feel', min: 0, max: 3, step: 0.1, format: pct, note: 'How far a landed bolt pushes an ordinary enemy back.' },
  { key: 'stagger', label: 'Hit freeze', group: 'feel', min: 0, max: 4, step: 0.1, format: pct, note: 'How long a landed bolt freezes the enemy. 100% is about eight frames.' },
  { key: 'hitStop', label: 'Hit-stop', group: 'feel', min: 0, max: 3, step: 0.1, format: pct, note: 'Real-time slowdown on impacts and kills. Zero removes it.' },
  { key: 'shake', label: 'Screen shake', group: 'feel', min: 0, max: 2.5, step: 0.1, format: pct, note: 'Shake amplitude. The settings toggle still switches it off entirely.' },
  { key: 'textSize', label: 'Combat text', group: 'feel', min: 0.5, max: 2.2, step: 0.05, format: pct, note: 'Size of damage numbers and floating labels.' },
  { key: 'particles', label: 'Particles', group: 'feel', min: 0, max: 2.5, step: 0.1, format: pct, note: 'Burst and puff density.' },
  { key: 'spawnPace', label: 'Spawn gap', group: 'pace', min: 0.3, max: 2.5, step: 0.05, format: pct, note: 'Time between spawn trickles inside a wave. Lower is a denser, faster wave.' },
  { key: 'waveBudget', label: 'Wave size', group: 'pace', min: 0.4, max: 2, step: 0.05, format: pct, note: 'Spawn budget per wave. Debuts and Wardens are unaffected.' },
  { key: 'witnessRadius', label: 'Gaze radius', group: 'witness', min: 150, max: 480, step: 10, format: v => `${v} units`, note: 'Centre to centre. Standing exactly on the line is safe.' },
  { key: 'witnessWindup', label: 'Gaze windup', group: 'witness', min: 0.5, max: 2.5, step: 0.05, format: v => `${v.toFixed(2)} s`, note: 'Telegraph base before the eye opens. Scaled by the telegraph knob, never below 0.85 s.' },
  { key: 'witnessArc', label: 'Facing arc', group: 'witness', min: 20, max: 120, step: 5, format: v => `±${v}°`, note: 'How far off the Witness you can face and still be caught. Smaller is more forgiving.' },
  { key: 'witnessStun', label: 'Stun length', group: 'witness', min: 0.1, max: 1.2, step: 0.05, format: v => `${v.toFixed(2)} s`, note: 'Control lock on a caught player. No damage. 1.5 s of immunity follows.' },
  { key: 'witnessCooldown', label: 'Gaze cooldown', group: 'witness', min: 2, max: 9, step: 0.5, format: v => `${v.toFixed(1)} s`, note: 'Rest between gazes, after the 1.1 s recovery.' },
  { key: 'witnessDebut', label: 'Debut wave', group: 'witness', min: 3, max: 15, step: 1, format: v => `wave ${v}`, note: 'First wave a Witness can appear (guaranteed that wave; at most one alive). Events are held on the debut wave.' },
  { key: 'overdrawMult', label: 'Overdraw damage', group: 'contract', min: 1, max: 2.2, step: 0.05, format: v => `×${v.toFixed(2)}`, note: 'Incoming damage multiplier for the contracted wave. Snapshotted when you depart.' },
  { key: 'overdrawGold', label: 'Overdraw payout', group: 'contract', min: 0, max: 60, step: 1, format: v => `${v} gold`, note: 'Paid once at wave clear, on top of the ordinary clear bonus.' },
  { key: 'overdrawFromWave', label: 'Offered from', group: 'contract', min: 2, max: 10, step: 1, format: v => `wave ${v}`, note: 'The first wave that can be contracted. Never the Witness debut wave.' },
  { key: 'creditsPerWave', label: 'Credits per wave', group: 'arsenal', min: 0, max: 12, step: 1, format: v => `${v}`, note: 'Account credits per cleared wave, settled once when the run ends.' },
  { key: 'creditsPerWarden', label: 'Warden bonus', group: 'arsenal', min: 0, max: 24, step: 1, format: v => `+${v}`, note: 'Extra credits per cleared Warden wave.' },
  { key: 'creditsCap', label: 'Credits cap', group: 'arsenal', min: 10, max: 240, step: 5, format: v => `${v} / run`, note: 'Most a single run can settle.' },
  { key: 'caseCost', label: 'Case price', group: 'arsenal', min: 20, max: 300, step: 5, format: v => `${v} cr`, note: 'One item per case. Duplicates refund 20.' },
  { key: 'chaseOdds', label: 'Chase odds', group: 'arsenal', min: 0, max: 10, step: 0.5, format: v => `${v}%`, note: 'Per case. The 60th case without a Chase guarantees one regardless.' },
  { key: 'signatureOdds', label: 'Signature odds', group: 'arsenal', min: 0, max: 50, step: 1, format: v => `${v}%`, note: 'Per case; the rest is Standard.' },
];

/** Knobs that belong to an experiment group. */
export const isExperimentKnob = (key: TuningKey) => EXPERIMENT_GROUPS.includes(TUNING_KNOBS.find(k => k.key === key)?.group ?? 'player');

export type TuningPreset = { id: string; name: string; tag: string; blurb: string; tuning: Tuning; /** A labelled experiment rather than a control; Iron and Easy stay the controls. */ experiment?: boolean };

/** Iron: Oscar's chosen feel after AB-001. Named so experiments can derive from it by changing one number. */
const IRON: Tuning = {
  ...DEFAULT_TUNING,
  playerMove: 0.8, playerAttackSpeed: 0.65, playerWindup: 0.95, playerRange: 0.6,
  enemySpeed: 0.95, enemyHp: 1.2, enemyDamage: 1.3, projectileSpeed: 1.4, telegraph: 0.65,
  augmentPower: 0.75, shopEvery: 2, bagSilver: 22, bagGold: 7, bagPrismatic: 2,
};

/**
 * Presets. Ledger is the authored v0.4 scale (every knob at 1), kept as the dev reference. Iron is the
 * shipped default: Oscar's chosen feel after AB-001 (design/AB-001-tempo.md). Easy sits halfway back
 * toward Ledger for players who want the old, more forgiving kite; it is the player-facing "easy mode".
 * Refit 3 is the brief 01 cadence experiment: Iron with a refit after every third wave instead of every second.
 */
export const TUNING_PRESETS: TuningPreset[] = [
  {
    id: 'ledger', name: 'Ledger', tag: 'A',
    blurb: 'The v0.4 authored scale. Fast kiter, generous margin, a draft every wave.',
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: 'iron', name: 'Iron', tag: 'B',
    blurb: 'The intended feel. Short reach, slow deliberate shots, fast enemy fire and short warnings. Weaker augments, a draft every second wave, rarer Prismatics.',
    tuning: { ...IRON },
  },
  {
    id: 'easy', name: 'Easy', tag: 'C',
    blurb: 'Room to learn the rhythm: full speed and near-full reach, slower and softer enemies with longer warnings, a draft every wave, and a firmer shove on every hit.',
    tuning: {
      ...DEFAULT_TUNING,
      playerMove: 1, playerAttackSpeed: 1, playerWindup: 1, playerRange: 0.9,
      enemySpeed: 0.9, enemyHp: 0.85, enemyDamage: 0.8, projectileSpeed: 1, telegraph: 1.15,
      augmentPower: 1, shopEvery: 1, bagSilver: 13, bagGold: 6, bagPrismatic: 1,
      knockback: 1.4, stagger: 1.4,
    },
  },
  {
    id: 'iron3', name: 'Refit 3', tag: 'X', experiment: true,
    blurb: 'EXPERIMENT (brief 01). Iron in every number except cadence: a refit after every third wave (3, 6, 9, 12), in step with the Wardens. Four free drafts and four repairs by wave 12 instead of six; the same gold, prices and rarity odds.',
    tuning: { ...IRON, shopEvery: 3 },
  },
];

/** What a fresh install plays. */
export const DEFAULT_PRESET = 'iron';

/** Where the Easy pressure slider starts (0 is the Easy floor, 1 is Iron). */
export const EASY_DEFAULT_LEVEL = 0.4;
/** The slider stops short of 1 so Easy never silently becomes Iron. */
export const EASY_MAX_LEVEL = 0.9;

/**
 * Easy mode's pressure slider: every knob moves `level` of the way from the Easy floor to Iron. Counts
 * round to whole marbles; the draft cadence flips to every second wave past 60 percent.
 */
export function easyBlend(level: number): Tuning {
  const t = Math.min(EASY_MAX_LEVEL, Math.max(0, level));
  const lo = TUNING_PRESETS.find(p => p.id === 'easy')!.tuning, hi = TUNING_PRESETS.find(p => p.id === 'iron')!.tuning;
  const out = { ...lo };
  for (const k of Object.keys(DEFAULT_TUNING) as TuningKey[]) {
    const v = lo[k] + (hi[k] - lo[k]) * t;
    out[k] = k === 'shopEvery' ? (t >= 0.6 ? hi[k] : lo[k]) : k.startsWith('bag') ? Math.round(v) : Math.round(v * 1000) / 1000;
  }
  return out;
}

export const presetById = (id: string) => TUNING_PRESETS.find(p => p.id === id) ?? TUNING_PRESETS[0];

/** Same feel: every non-experiment knob matches. Experiment knobs (Witness, contract, arsenal) never move a preset off its name. */
export const sameTuning = (a: Tuning, b: Tuning) => (Object.keys(DEFAULT_TUNING) as TuningKey[]).every(k => isExperimentKnob(k) || Math.abs(a[k] - b[k]) < 1e-9);

/** Knobs that differ from the defaults, for the playtest note snapshot. */
export const tuningDiff = (t: Tuning, from: Tuning = DEFAULT_TUNING): Partial<Tuning> => {
  const out: Partial<Tuning> = {};
  for (const k of Object.keys(DEFAULT_TUNING) as TuningKey[]) if (Math.abs(t[k] - from[k]) > 1e-9) out[k] = t[k];
  return out;
};

/** Which preset these values match, or null when they are custom. */
export const matchPreset = (t: Tuning): TuningPreset | null => TUNING_PRESETS.find(p => sameTuning(p.tuning, t)) ?? null;

/** Coerce a loosely typed object (localStorage, URL) into a complete Tuning. */
export function normaliseTuning(raw: unknown): Tuning {
  const out = { ...DEFAULT_TUNING };
  if (!raw || typeof raw !== 'object') return out;
  for (const knob of TUNING_KNOBS) {
    const v = (raw as Record<string, unknown>)[knob.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[knob.key] = Math.min(knob.max, Math.max(knob.min, v));
  }
  return out;
}

/** The rarity marble bag for this tuning. Falls back to a single Silver so the bag is never empty. */
export function rarityBag(t: Tuning): Rarity[] {
  const bag: Rarity[] = [];
  for (let i = 0; i < t.bagSilver; i++) bag.push('silver');
  for (let i = 0; i < t.bagGold; i++) bag.push('gold');
  for (let i = 0; i < t.bagPrismatic; i++) bag.push('prismatic');
  return bag.length ? bag : ['silver'];
}

/** Stats that are on/off switches for a mechanic; scaling them would break the mechanic rather than weaken it. */
const FLAG_STATS: (keyof Stats)[] = ['tempest', 'momentum', 'executioner', 'burn', 'frostbite', 'wildfire', 'thunderhead', 'kinetic', 'overclock', 'quickdraw', 'focus', 'berserk'];
/** Stats that only make sense as whole numbers. */
const INTEGER_STATS: (keyof Stats)[] = ['projectiles', 'bounces', 'dashCharges'];

/**
 * Scale what augments added: every numeric stat is moved `power` of the way from the base sheet to the
 * fully augmented sheet. Mechanic flags stay on; counts round to whole numbers (a +1 at 50% is still +1).
 */
export function scaleAugments(base: Stats, full: Stats, power: number): Stats {
  if (power === 1) return full;
  const out = { ...full };
  for (const key of Object.keys(full) as (keyof Stats)[]) {
    if (FLAG_STATS.includes(key)) continue;
    const scaled = base[key] + (full[key] - base[key]) * power;
    out[key] = INTEGER_STATS.includes(key) ? Math.round(scaled) : scaled;
  }
  return out;
}

/**
 * Derived readings for the panel: what the current numbers mean in play. Speeds are units per second at
 * the given wave for the shipped enemy table (drone 135 + 6 per wave up to +120, bomber 215 + 4 per wave
 * up to +60, leech 250 + 5 per wave up to +90, archer 175).
 */
export function kiteMargins(t: Tuning, playerMove: number, wave: number) {
  const player = playerMove * t.playerMove;
  const enemy = (base: number, perWave: number, cap: number) => (base + Math.min(cap, wave * perWave)) * t.enemySpeed;
  return {
    player,
    drone: player - enemy(135, 6, 120),
    archer: player - enemy(175, 0, 0),
    bomber: player - enemy(215, 4, 60),
    leech: player - enemy(250, 5, 90),
  };
}
