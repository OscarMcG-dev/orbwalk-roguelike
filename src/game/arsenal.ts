import { HEROES, heroById } from './heroes.ts';
import { Rng } from './math.ts';
import type { Tuning } from './tuning.ts';
import type { HeroId } from './types.ts';

/**
 * The earned arsenal (brief 05): one account currency, one launch case, three attachment slots, and the class
 * weapons themselves. Pure and headless: every function takes an Account and returns a new one; persistence,
 * locking and presentation live in the React layer. Nothing here touches the run economy (gold) or the sim's RNG.
 *
 * Design stance (design/PILLARS.md, pillar 5): ownership widens the loadout; rarity changes how a weapon plays,
 * not how big its numbers are. Every functional part has a nonrandom route (direct purchase, or the guarantee).
 */

export type ItemTier = 'standard' | 'signature' | 'chase';
export type ItemSlot = 'action' | 'handling' | 'finish' | 'weapon';
export type FinishId = 'finish.matte-enamel' | 'finish.copper-inlay' | 'finish.signal-tape';

/** What an equipped loadout changes. Computed once at run start; the sim reads it, never the hero definition. */
export type LoadoutMods = {
  /** Clip size override (magazine weapons). */
  magazine?: number;
  reloadMult: number;
  /** Walking distance to rewind the crank (crank weapons). */
  crank?: number;
  /** Bodies a quarrel passes through (pierce weapons). */
  pierce?: number;
  splashMult: number;
  damageMult: number;
  moveMult: number;
  rangeMult: number;
  /** Cannoneer heat: multiplier on the per-heat windup penalty. */
  heatPenaltyMult: number;
  /** Cannoneer recoil hop distance multiplier (direction unchanged). */
  hopMult: number;
  /** Rifleman steady stock: presentation only (less visual recoil, clearer recovery cue). */
  steadyStock: boolean;
  /** Chase actions. */
  finalRound: boolean;
  spoolReturn: boolean;
  delayedBurst: boolean;
  finish: FinishId | null;
};

export const BASE_MODS: LoadoutMods = {
  reloadMult: 1, splashMult: 1, damageMult: 1, moveMult: 1, rangeMult: 1, heatPenaltyMult: 1, hopMult: 1,
  steadyStock: false, finalRound: false, spoolReturn: false, delayedBurst: false, finish: null,
};

export type ArsenalItem = {
  id: string;
  name: string;
  tier: ItemTier;
  slot: ItemSlot;
  /** Compatible class. Finishes fit every weapon. Weapons are the class itself. */
  hero?: HeroId;
  blurb: string;
  /** The upside and the price, in the player's units. Empty cost means a pure cosmetic. */
  benefit: string;
  cost: string;
  /** Direct credit price. Chase parts also need weapon mastery (CHASE_MASTERY_WAVES). */
  price: number;
  inCase: boolean;
  icon: string;
  mods: Partial<LoadoutMods>;
};

export const STANDARD_PRICE = 150;
export const CHASE_PRICE = 2000;
export const DUPLICATE_REFUND = 20;
/** Cumulative waves cleared with a weapon before its Chase part can be bought outright. */
export const CHASE_MASTERY_WAVES = 12;
/** The 60th consecutive non-Chase case awards a Chase. */
export const PITY_GUARANTEE = 60;
export const ACCOUNT_SCHEMA = 1;
const MAX_RECEIPTS = 24;
const MAX_SETTLEMENTS = 200;
/** Cosmetic reel filler seeds derive from the purchase sequence, never from the loot RNG state. */
const FILLER_SALT = 0x51ed270b;

export const WEAPON_PRICES: Partial<Record<HeroId, number>> = { arbalest: 40, rifleman: 60, cannoneer: 80, gunslinger: 100, skirmisher: 120 };
export const weaponItemId = (hero: HeroId) => `weapon.${hero}`;

export const CATALOGUE: ArsenalItem[] = [
  // ---- Standard Actions
  { id: 'part.rifleman.short-clip', name: 'Short clip', tier: 'standard', slot: 'action', hero: 'rifleman', icon: '▮', price: STANDARD_PRICE, inCase: true,
    blurb: 'A six-round en-bloc clip that seats faster.', benefit: 'Reload 20% faster', cost: 'Six rounds instead of eight', mods: { magazine: 6, reloadMult: 0.8 } },
  { id: 'part.arbalest.quick-spool', name: 'Quick spool', tier: 'standard', slot: 'action', hero: 'arbalest', icon: '⟲', price: STANDARD_PRICE, inCase: true,
    blurb: 'A lighter spool rewinds in fewer steps.', benefit: 'Crank rewinds in 70 units of walking, not 90', cost: 'Quarrels pierce three bodies instead of four', mods: { crank: 70, pierce: 3 } },
  { id: 'part.cannoneer.wide-choke', name: 'Wide choke', tier: 'standard', slot: 'action', hero: 'cannoneer', icon: '◎', price: STANDARD_PRICE, inCase: true,
    blurb: 'Shells burst wider and hit the centre softer.', benefit: 'Splash radius +20%', cost: 'Direct damage −10%', mods: { splashMult: 1.2, damageMult: 0.9 } },
  // ---- Standard Handling
  { id: 'part.rifleman.steady-stock', name: 'Steady stock', tier: 'standard', slot: 'handling', hero: 'rifleman', icon: '═', price: STANDARD_PRICE, inCase: true,
    blurb: 'A heavier stock. Less visual kick and a clearer recovery cue.', benefit: 'Steadier sight picture', cost: 'No damage change', mods: { steadyStock: true } },
  { id: 'part.arbalest.light-frame', name: 'Light frame', tier: 'standard', slot: 'handling', hero: 'arbalest', icon: '◇', price: STANDARD_PRICE, inCase: true,
    blurb: 'Shorter limbs, lighter carriage.', benefit: 'Move speed +3%', cost: 'Range −8%', mods: { moveMult: 1.03, rangeMult: 0.92 } },
  { id: 'part.cannoneer.reinforced-carriage', name: 'Reinforced carriage', tier: 'standard', slot: 'handling', hero: 'cannoneer', icon: '▣', price: STANDARD_PRICE, inCase: true,
    blurb: 'Braces the barrel against heat and recoil.', benefit: 'Heat windup penalty −20%', cost: 'Recoil hop travels 15% less (same direction)', mods: { heatPenaltyMult: 0.8, hopMult: 0.85 } },
  // ---- Signature Finishes (cosmetic, account-wide)
  { id: 'finish.matte-enamel', name: 'Matte enamel', tier: 'signature', slot: 'finish', icon: '◼', price: STANDARD_PRICE, inCase: true,
    blurb: 'Dark enamel with a pale edge.', benefit: 'Weapon surface only', cost: '', mods: { finish: 'finish.matte-enamel' } },
  { id: 'finish.copper-inlay', name: 'Copper inlay', tier: 'signature', slot: 'finish', icon: '◈', price: STANDARD_PRICE, inCase: true,
    blurb: 'Brushed copper detail along the stock.', benefit: 'Weapon surface only', cost: '', mods: { finish: 'finish.copper-inlay' } },
  { id: 'finish.signal-tape', name: 'Signal tape', tier: 'signature', slot: 'finish', icon: '▰', price: STANDARD_PRICE, inCase: true,
    blurb: 'Small diagonal identification marks.', benefit: 'Weapon surface only', cost: '', mods: { finish: 'finish.signal-tape' } },
  // ---- Chase Actions
  { id: 'chase.rifleman.final-round', name: 'Final round', tier: 'chase', slot: 'action', hero: 'rifleman', icon: '➶', price: CHASE_PRICE, inCase: true,
    blurb: 'The last round in the clip is loaded hot.', benefit: 'The final round punches through into one extra body at full damage', cost: 'Six rounds instead of eight', mods: { magazine: 6, finalRound: true } },
  { id: 'chase.arbalest.spool-return', name: 'Spool return', tier: 'chase', slot: 'action', hero: 'arbalest', icon: '↻', price: CHASE_PRICE, inCase: true,
    blurb: 'A quarrel that threads three bodies hands half the crank back.', benefit: 'Three-body hits refund half the crank', cost: 'Single-target damage −15%', mods: { spoolReturn: true, damageMult: 0.85 } },
  { id: 'chase.cannoneer.delayed-burst', name: 'Delayed burst', tier: 'chase', slot: 'action', hero: 'cannoneer', icon: '✹', price: CHASE_PRICE, inCase: true,
    blurb: 'The shell buries itself and goes off a beat later.', benefit: 'Leaves a ground charge at impact: 60% damage in a 90 unit ring after 0.6 s', cost: 'No immediate splash', mods: { splashMult: 0, delayedBurst: true } },
  // ---- Weapons (the classes). Not in the case; bought outright.
  ...HEROES.filter(h => h.id !== 'marksman').map<ArsenalItem>(h => ({
    id: weaponItemId(h.id), name: h.name, tier: 'standard', slot: 'weapon', hero: h.id, icon: '⚔', price: WEAPON_PRICES[h.id] ?? 100, inCase: false,
    blurb: h.blurb, benefit: h.title, cost: '', mods: {},
  })),
];

export const itemById = (id: string) => CATALOGUE.find(i => i.id === id);
export const CASE_POOL = CATALOGUE.filter(i => i.inCase);
export const caseTier = (tier: ItemTier) => CASE_POOL.filter(i => i.tier === tier);
export const TIER_LABEL: Record<ItemTier, string> = { standard: 'Standard', signature: 'Signature', chase: 'Chase' };

/** Finishes fit everything; parts fit their class; a weapon is its class. */
export const compatible = (item: ArsenalItem, hero: HeroId) => item.slot === 'finish' || item.hero === hero;

// ---------------------------------------------------------------- account envelope

export type CaseReceipt = {
  requestId: string;
  sequence: number;
  itemId: string;
  tier: ItemTier;
  duplicate: boolean;
  refund: number;
  debit: number;
  guaranteed: boolean;
  pityBefore: number;
  pityAfter: number;
  /** Cosmetic seed for the reel filler. */
  fillerSeed: number;
};

export type Equipped = { action: string | null; handling: string | null; finish: string | null };

export type Account = {
  schemaVersion: number;
  saveId: string;
  revision: number;
  credits: number;
  owned: string[];
  /** Item ids from an older catalogue that this build no longer knows. Kept, shown, never silently dropped. */
  retired: string[];
  equipped: Partial<Record<HeroId, Equipped>>;
  /** Consecutive non-Chase cases. */
  pity: number;
  wishlist: string | null;
  /** Run settlement ids already paid (bounded, newest last). */
  settlements: string[];
  purchaseSequence: number;
  lootRngState: number;
  pendingReceipt: CaseReceipt | null;
  receipts: CaseReceipt[];
  /** Cumulative waves cleared per weapon (the Chase mastery condition). */
  mastery: Partial<Record<HeroId, number>>;
  createdAt: string;
};

export type CaseConfig = { caseCost: number; chaseOdds: number; signatureOdds: number };
export type CreditConfig = { creditsPerWave: number; creditsPerWarden: number; creditsCap: number };

export const caseConfig = (t: Tuning): CaseConfig => ({ caseCost: Math.max(0, Math.round(t.caseCost)), chaseOdds: Math.min(1, Math.max(0, t.chaseOdds / 100)), signatureOdds: Math.min(1, Math.max(0, t.signatureOdds / 100)) });
export const creditConfig = (t: Tuning): CreditConfig => ({ creditsPerWave: t.creditsPerWave, creditsPerWarden: t.creditsPerWarden, creditsCap: t.creditsCap });
export const DEFAULT_CASE: CaseConfig = { caseCost: 100, chaseOdds: 0.01, signatureOdds: 0.19 };
export const DEFAULT_CREDITS: CreditConfig = { creditsPerWave: 4, creditsPerWarden: 8, creditsCap: 60 };

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20)}`;
}

export function newAccount(saveId = uuid(), seed = (Date.now() ^ 0x2545f491) >>> 0, createdAt = new Date().toISOString()): Account {
  return {
    schemaVersion: ACCOUNT_SCHEMA, saveId, revision: 0, credits: 0, owned: [], retired: [], equipped: {}, pity: 0, wishlist: null,
    settlements: [], purchaseSequence: 0, lootRngState: seed >>> 0 || 1, pendingReceipt: null, receipts: [], mastery: {}, createdAt,
  };
}

const bump = (a: Account): Account => ({ ...a, revision: a.revision + 1 });

export const owns = (a: Account, id: string) => a.owned.includes(id);
/** Marksman is free; every other weapon is bought in the Armoury. */
export const weaponOwned = (a: Account, hero: HeroId) => hero === 'marksman' || owns(a, weaponItemId(hero));
export const nextRequestId = (a: Account) => `${a.saveId}:${a.purchaseSequence + 1}`;

// ---------------------------------------------------------------- odds

/** Tier probabilities for the next case, honouring the guarantee. Odds shown to the player must come from here. */
export function nextCaseOdds(a: Account, cfg: CaseConfig = DEFAULT_CASE) {
  const guaranteed = a.pity >= PITY_GUARANTEE - 1;
  const chase = guaranteed ? 1 : cfg.chaseOdds;
  const signature = guaranteed ? 0 : Math.min(1 - chase, cfg.signatureOdds);
  return { chase, signature, standard: Math.max(0, 1 - chase - signature), guaranteed, casesToGuarantee: Math.max(0, PITY_GUARANTEE - a.pity) };
}

/** Probability of at least one naturally rolled Chase in `n` cases. */
export const chanceWithin = (n: number, p: number) => 1 - Math.pow(1 - p, n);

// ---------------------------------------------------------------- transactions

export type TxResult<T = undefined> = { ok: true; account: Account; value: T } | { ok: false; account: Account; error: string };

/**
 * Buy one case. Idempotent on `requestId`: the same id returns the same receipt without rolling or debiting again.
 * The result is committed to the returned envelope before any presentation; the caller persists it, then reveals.
 */
export function purchaseCase(a: Account, requestId: string, cfg: CaseConfig = DEFAULT_CASE): TxResult<CaseReceipt> {
  const existing = a.receipts.find(r => r.requestId === requestId);
  if (existing) return { ok: true, account: a, value: existing };
  if (a.pendingReceipt) return { ok: false, account: a, error: 'A reveal is still pending. Continue it first.' };
  if (requestId !== nextRequestId(a)) return { ok: false, account: a, error: 'Stale purchase request. Reload the account and try again.' };
  if (!Number.isInteger(a.credits) || a.credits < cfg.caseCost) return { ok: false, account: a, error: `Need ${cfg.caseCost} credits.` };

  const rng = new Rng(a.lootRngState);
  const guaranteed = a.pity >= PITY_GUARANTEE - 1;
  let tier: ItemTier;
  if (guaranteed) tier = 'chase';
  else {
    const r = rng.next();
    tier = r < cfg.chaseOdds ? 'chase' : r < cfg.chaseOdds + cfg.signatureOdds ? 'signature' : 'standard';
  }
  let item: ArsenalItem;
  if (tier === 'chase' && guaranteed) {
    // The guaranteed opening honours the wishlist snapshot, else any unowned Chase, else a normal roll (all owned).
    const chases = caseTier('chase');
    const wished = a.wishlist ? chases.find(i => i.id === a.wishlist && !owns(a, i.id)) : undefined;
    const unowned = chases.filter(i => !owns(a, i.id));
    item = wished ?? (unowned.length ? unowned[Math.floor(rng.next() * unowned.length)] : chases[Math.floor(rng.next() * chases.length)]);
  } else {
    const pool = caseTier(tier);
    item = pool[Math.floor(rng.next() * pool.length)];
  }
  const duplicate = owns(a, item.id);
  const refund = duplicate ? DUPLICATE_REFUND : 0;
  const sequence = a.purchaseSequence + 1;
  const receipt: CaseReceipt = {
    requestId, sequence, itemId: item.id, tier: item.tier, duplicate, refund, debit: cfg.caseCost, guaranteed,
    pityBefore: a.pity, pityAfter: item.tier === 'chase' ? 0 : a.pity + 1, fillerSeed: (sequence * 2654435761 ^ FILLER_SALT) >>> 0 || 1,
  };
  const account: Account = bump({
    ...a,
    credits: a.credits - cfg.caseCost + refund,
    owned: duplicate ? a.owned : [...a.owned, item.id],
    pity: receipt.pityAfter,
    purchaseSequence: sequence,
    lootRngState: rng.seed,
    pendingReceipt: receipt,
    receipts: [...a.receipts, receipt].slice(-MAX_RECEIPTS),
  });
  return { ok: true, account, value: receipt };
}

/** "Continue" acknowledges the reveal. The award was already owned when the receipt was written. */
export function acknowledgeReveal(a: Account): Account {
  return a.pendingReceipt ? bump({ ...a, pendingReceipt: null }) : a;
}

/** Direct purchase: standard and signature parts, weapons, or a Chase once the weapon is mastered. */
export function buyDirect(a: Account, itemId: string): TxResult {
  const item = itemById(itemId);
  if (!item) return { ok: false, account: a, error: 'Unknown item.' };
  if (owns(a, itemId)) return { ok: false, account: a, error: 'Already owned.' };
  if (item.tier === 'chase') {
    const waves = a.mastery[item.hero!] ?? 0;
    if (waves < CHASE_MASTERY_WAVES) return { ok: false, account: a, error: `Clear ${CHASE_MASTERY_WAVES - waves} more waves with the ${heroById(item.hero!).name} first.` };
  }
  if (!Number.isInteger(a.credits) || a.credits < item.price) return { ok: false, account: a, error: `Need ${item.price} credits.` };
  return { ok: true, account: bump({ ...a, credits: a.credits - item.price, owned: [...a.owned, itemId] }), value: undefined };
}

export type RunSettlement = { settlementId: string; hero: HeroId; wavesCleared: number; wardenWavesCleared: number; sandbox: boolean };

/**
 * Settle a finished run once. Sandbox runs (fixtures, custom tuning) record mastery for nothing and pay nothing.
 * Idempotent on `settlementId`.
 */
export function settleRun(a: Account, s: RunSettlement, cfg: CreditConfig = DEFAULT_CREDITS): { account: Account; credits: number; mastery: number } {
  if (a.settlements.includes(s.settlementId)) return { account: a, credits: 0, mastery: 0 };
  const waves = Math.max(0, Math.floor(s.wavesCleared)), wardens = Math.max(0, Math.floor(s.wardenWavesCleared));
  const credits = s.sandbox ? 0 : Math.min(Math.round(cfg.creditsCap), Math.round(waves * cfg.creditsPerWave + wardens * cfg.creditsPerWarden));
  const mastery = s.sandbox ? 0 : waves;
  const account = bump({
    ...a,
    credits: a.credits + credits,
    settlements: [...a.settlements, s.settlementId].slice(-MAX_SETTLEMENTS),
    mastery: { ...a.mastery, [s.hero]: (a.mastery[s.hero] ?? 0) + mastery },
  });
  return { account, credits, mastery };
}

export const equippedFor = (a: Account, hero: HeroId): Equipped => a.equipped[hero] ?? { action: null, handling: null, finish: null };

/** Equip an owned, compatible item into its slot (or clear the slot with null). Only the React layer gates "outside a run". */
export function equipItem(a: Account, hero: HeroId, slot: 'action' | 'handling' | 'finish', itemId: string | null): TxResult {
  if (itemId !== null) {
    const item = itemById(itemId);
    if (!item) return { ok: false, account: a, error: 'Unknown item.' };
    if (item.slot !== slot) return { ok: false, account: a, error: `${item.name} is a ${item.slot} part.` };
    if (!owns(a, itemId)) return { ok: false, account: a, error: 'Not owned.' };
    if (!compatible(item, hero)) return { ok: false, account: a, error: `${item.name} does not fit the ${heroById(hero).name}.` };
  }
  const cur = equippedFor(a, hero);
  if (cur[slot] === itemId) return { ok: true, account: a, value: undefined };
  return { ok: true, account: bump({ ...a, equipped: { ...a.equipped, [hero]: { ...cur, [slot]: itemId } } }), value: undefined };
}

export function setWishlist(a: Account, itemId: string | null): Account {
  if (itemId !== null && itemById(itemId)?.tier !== 'chase') return a;
  return a.wishlist === itemId ? a : bump({ ...a, wishlist: itemId });
}

/** The loadout the sim runs with, computed from the equipped ids. Unknown or foreign ids contribute nothing. */
export function loadoutFor(a: Account, hero: HeroId): LoadoutMods {
  const eq = equippedFor(a, hero);
  const mods: LoadoutMods = { ...BASE_MODS };
  for (const id of [eq.action, eq.handling, eq.finish]) {
    if (!id) continue;
    const item = itemById(id);
    if (!item || !owns(a, id) || !compatible(item, hero) || item.slot === 'weapon') continue;
    Object.assign(mods, item.mods);
  }
  return mods;
}

export const loadoutIds = (a: Account, hero: HeroId) => {
  const eq = equippedFor(a, hero);
  return [eq.action, eq.handling, eq.finish].filter((x): x is string => !!x);
};

// ---------------------------------------------------------------- readout

export type ReadoutRow = { label: string; before: string; after: string; changed: boolean };

/** The assembled weapon in familiar units: rounds, reload seconds, range, bodies pierced, walking distance, splash. */
export function loadoutReadout(hero: HeroId, mods: LoadoutMods, base: { range: number; moveSpeed: number; damage: number; splash: number }): ReadoutRow[] {
  const h = heroById(hero);
  const rows: ReadoutRow[] = [];
  const row = (label: string, b: number | string, a: number | string) => rows.push({ label, before: `${b}`, after: `${a}`, changed: `${b}` !== `${a}` });
  if (h.magazine) {
    row('Rounds', h.magazine.size, mods.magazine ?? h.magazine.size);
    row('Reload', `${h.magazine.reload.toFixed(2)} s`, `${(h.magazine.reload * mods.reloadMult).toFixed(2)} s`);
  }
  if (h.crank) row('Walk to crank', `${h.crank} units`, `${mods.crank ?? h.crank} units`);
  if (h.pierce) row('Bodies pierced', h.pierce, mods.pierce ?? h.pierce);
  row('Damage', Math.round(base.damage), Math.round(base.damage * mods.damageMult));
  row('Range', Math.round(base.range), Math.round(base.range * mods.rangeMult));
  row('Move speed', Math.round(base.moveSpeed), Math.round(base.moveSpeed * mods.moveMult));
  if (h.heat) {
    row('Splash', `${Math.round(base.splash)} units`, mods.splashMult === 0 ? 'none (delayed burst)' : `${Math.round(base.splash * mods.splashMult)} units`);
    row('Heat penalty', '+12% windup / heat', `+${Math.round(12 * mods.heatPenaltyMult)}% windup / heat`);
    row('Recoil hop', '195 units', `${Math.round(195 * mods.hopMult)} units`);
  }
  if (mods.finalRound) row('Final round', 'ordinary', 'punches into one extra body');
  if (mods.spoolReturn) row('Three-body hit', 'nothing', 'refunds half the crank');
  if (mods.steadyStock) row('Sight picture', 'standard', 'steady (no damage change)');
  return rows;
}

// ---------------------------------------------------------------- validation and migration

export type Validation = { ok: boolean; account: Account | null; issues: string[] };

/**
 * Coerce a stored envelope. Unknown items move to `retired` (kept, never dropped); numbers are bounded; anything
 * structurally unusable is reported so the caller can keep the last valid backup rather than reset silently.
 */
export function validateAccount(raw: unknown): Validation {
  const issues: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, account: null, issues: ['not an object'] };
  const r = raw as Record<string, unknown>;
  if (typeof r.saveId !== 'string' || !r.saveId) return { ok: false, account: null, issues: ['missing saveId'] };
  if (typeof r.schemaVersion !== 'number' || r.schemaVersion > ACCOUNT_SCHEMA) return { ok: false, account: null, issues: [`unsupported schema ${String(r.schemaVersion)}`] };
  const int = (v: unknown, lo: number, hi: number, name: string, fallback = 0) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) { if (v !== undefined) issues.push(`${name} not a number`); return fallback; }
    const n = Math.round(v);
    if (n < lo || n > hi) { issues.push(`${name} out of bounds (${n})`); return Math.min(hi, Math.max(lo, n)); }
    return n;
  };
  const strings = (v: unknown, name: string): string[] => {
    if (!Array.isArray(v)) { if (v !== undefined) issues.push(`${name} not a list`); return []; }
    return v.filter((x): x is string => typeof x === 'string');
  };
  const ownedRaw = strings(r.owned, 'owned');
  const known = ownedRaw.filter(id => itemById(id));
  const retired = [...new Set([...strings(r.retired, 'retired'), ...ownedRaw.filter(id => !itemById(id))])];
  if (retired.length) issues.push(`${retired.length} retired item id(s) kept aside`);
  const equipped: Partial<Record<HeroId, Equipped>> = {};
  if (r.equipped && typeof r.equipped === 'object') {
    for (const h of HEROES) {
      const e = (r.equipped as Record<string, unknown>)[h.id];
      if (!e || typeof e !== 'object') continue;
      const pick = (slot: 'action' | 'handling' | 'finish') => {
        const v = (e as Record<string, unknown>)[slot];
        if (typeof v !== 'string') return null;
        const item = itemById(v);
        if (!item || item.slot !== slot || !known.includes(v) || !compatible(item, h.id)) { issues.push(`unequipped ${v} from ${h.id}`); return null; }
        return v;
      };
      equipped[h.id] = { action: pick('action'), handling: pick('handling'), finish: pick('finish') };
    }
  }
  const receipts = Array.isArray(r.receipts) ? (r.receipts as CaseReceipt[]).filter(x => x && typeof x === 'object' && typeof x.requestId === 'string') : [];
  const pending = r.pendingReceipt && typeof r.pendingReceipt === 'object' && typeof (r.pendingReceipt as CaseReceipt).requestId === 'string' ? (r.pendingReceipt as CaseReceipt) : null;
  const mastery: Partial<Record<HeroId, number>> = {};
  if (r.mastery && typeof r.mastery === 'object') for (const h of HEROES) { const v = (r.mastery as Record<string, unknown>)[h.id]; if (typeof v === 'number' && Number.isFinite(v)) mastery[h.id] = Math.max(0, Math.round(v)); }
  const wishlist = typeof r.wishlist === 'string' && itemById(r.wishlist)?.tier === 'chase' ? r.wishlist : null;
  const account: Account = {
    schemaVersion: ACCOUNT_SCHEMA,
    saveId: r.saveId,
    revision: int(r.revision, 0, 1e9, 'revision'),
    credits: int(r.credits, 0, 1e7, 'credits'),
    owned: [...new Set(known)],
    retired,
    equipped,
    pity: int(r.pity, 0, PITY_GUARANTEE - 1, 'pity'),
    wishlist,
    settlements: strings(r.settlements, 'settlements').slice(-MAX_SETTLEMENTS),
    purchaseSequence: int(r.purchaseSequence, 0, 1e9, 'purchaseSequence'),
    lootRngState: int(r.lootRngState, 1, 0xffffffff, 'lootRngState', 1),
    pendingReceipt: pending,
    receipts: receipts.slice(-MAX_RECEIPTS),
    mastery,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
  };
  return { ok: true, account, issues };
}

/** Old unlock rules (best wave / career kills) become owned weapons once, so nobody loses a class to the new economy. */
export function grantLegacyUnlocks(a: Account, progress: { bestWave: number; totalKills: number }): Account {
  const legacy: Partial<Record<HeroId, (p: { bestWave: number; totalKills: number }) => boolean>> = {
    arbalest: p => p.bestWave >= 2, rifleman: p => p.bestWave >= 3, cannoneer: p => p.bestWave >= 4, gunslinger: p => p.totalKills >= 150, skirmisher: p => p.totalKills >= 200,
  };
  const grant = (Object.keys(legacy) as HeroId[]).filter(h => legacy[h]!(progress) && !owns(a, weaponItemId(h)));
  return grant.length ? bump({ ...a, owned: [...a.owned, ...grant.map(weaponItemId)] }) : a;
}

/** Terse description for the playtest note. */
export function describeAccount(a: Account) {
  return `credits=${a.credits} owned=${a.owned.length} pity=${a.pity}${a.wishlist ? ` wish=${a.wishlist.split('.').pop()}` : ''}`;
}
