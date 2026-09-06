import type { HeroId, Settings, Stats } from './types.ts';

/** Career progress (stats only since the Armoury took over unlocks). Stored by the UI in localStorage. */
export type Progress = { bestWave: number; totalKills: number; runs: number };
/** What the hero picker needs to know about ownership; the Account in arsenal.ts is the source of truth. */
export type Ownership = { owned: string[] };
export const EMPTY_PROGRESS: Progress = { bestWave: 0, totalKills: 0, runs: 0 };

export type Weapon = 'bow' | 'cannon' | 'blade' | 'crossbow' | 'garand' | 'pistols';

/**
 * Weapon presentation (brief "attack feel", slice A). The one table both the simulation and the renderer read, so a
 * recoil can never be timed by one file and normalised by another. Cosmetic only: nothing here owns cooldown,
 * `canFire`, movement, damage or RNG. Units: seconds and arena units.
 */
export type WeaponPresentation = {
  /** Length of the recoil recovery. `Simulation.release()` sets `recoil` to this; the renderer divides by it. */
  recoil: number;
  /** Peak upper-body kick along the aim, applied at once on release and eased out over `recoil`. */
  kick: number;
  /** How long the torso holds the exact release direction before easing back to the smoothed aim. */
  hold: number;
};

/** Durations are the values that shipped before the table existed; only the source of truth moved. */
export const WEAPON_PRESENTATION: Record<Weapon, WeaponPresentation> = {
  bow: { recoil: 0.12, kick: 5, hold: 0.05 },
  blade: { recoil: 0.12, kick: 5, hold: 0.05 },
  crossbow: { recoil: 0.2, kick: 5, hold: 0.05 },
  garand: { recoil: 0.14, kick: 5, hold: 0.05 },
  pistols: { recoil: 0.08, kick: 5, hold: 0.05 },
  cannon: { recoil: 0.18, kick: 9, hold: 0.05 },
};

export type Hero = {
  id: HeroId;
  name: string;
  title: string;
  blurb: string;
  /** Default marksman-profile slider values for this hero. */
  profile: Pick<Settings, 'attackSpeed' | 'windup' | 'moveSpeed' | 'range'>;
  /** Stat overrides layered on top of the base sheet. */
  stats: Partial<Stats>;
  /** `toward` dashes at the cursor; `away` recoils from it (a kiting hop). */
  dashMode: 'toward' | 'away';
  /** Cannoneer heat: attacks fired without moving in between lengthen the next windup. */
  heat: boolean;
  /** Skirmisher tempo: a bolt released within half a second of moving is empowered. */
  tempo: boolean;
  /** Skirmisher blade dash: enemies passed through during a dash are cut once each. */
  dashStrike: boolean;
  /** Magazine weapons: `size` shots, then `reload` seconds during which you may move but not fire. `ping` is the Garand's en-bloc clip. */
  magazine?: { size: number; reload: number; ping: boolean };
  /** Crank weapons: firing spends the crank and only this many units of walking rewinds it. */
  crank?: number;
  /** Piercing shots fly straight and pass through up to this many enemies, losing 15% per body. */
  pierce?: number;
  /** Off-hand weapon: every attack also fires at the nearest other enemy in range for this fraction of the damage. */
  offhand?: number;
  weapon: Weapon;
  colors: { skin: string; trim: string; dark: string; cape: string; capeTrim: string; bolt: string };
  /** How the class is obtained: the Marksman is free, every other weapon is bought in the Armoury with credits. */
  unlock: { desc: string; price: number };
};

export const HEROES: Hero[] = [
  {
    id: 'marksman',
    name: 'Marksman',
    title: 'The baseline kiter',
    blurb: 'Balanced bow. Dash toward the cursor. Learn the rhythm here.',
    profile: { attackSpeed: 1.3, windup: 22, moveSpeed: 325, range: 450 },
    stats: {},
    dashMode: 'toward',
    heat: false,
    tempo: false,
    dashStrike: false,
    weapon: 'bow',
    colors: { skin: '#51cdb2', trim: '#ddfff4', dark: '#173c39', cape: '#2f8f7c', capeTrim: '#7fe0c9', bolt: '#8dffe4' },
    unlock: { desc: 'Available from the start.', price: 0 },
  },
  {
    id: 'arbalest',
    name: 'Arbalest',
    title: 'Heavy crossbow',
    blurb: 'One quarrel, one line: it punches through up to four enemies. Firing spends the crank, and only walking rewinds it (90 units). Aim long, then run.',
    profile: { attackSpeed: 0.55, windup: 32, moveSpeed: 300, range: 640 },
    stats: { damage: 62, maxHp: 110, dashCd: 4.2, critChance: 0.06 },
    dashMode: 'toward',
    heat: false,
    tempo: false,
    dashStrike: false,
    crank: 90,
    pierce: 4,
    weapon: 'crossbow',
    colors: { skin: '#7d9bc7', trim: '#e3ecff', dark: '#1d2a44', cape: '#3a4f80', capeTrim: '#9fb8e8', bolt: '#dfe9ff' },
    unlock: { desc: 'Armoury · 40 credits', price: 40 },
  },
  {
    id: 'cannoneer',
    name: 'Cannoneer',
    title: 'Heavy ordnance',
    blurb: 'Slow, long-range shells that burst on impact. E recoil-hops AWAY from the cursor. Standing still builds heat that drags out your windup; moving vents it.',
    profile: { attackSpeed: 0.8, windup: 30, moveSpeed: 305, range: 560 },
    stats: { damage: 44, maxHp: 120, dashCd: 3.6, splash: 55, critChance: 0.02 },
    dashMode: 'away',
    heat: true,
    tempo: false,
    dashStrike: false,
    weapon: 'cannon',
    colors: { skin: '#e0a35a', trim: '#fff0d6', dark: '#4a2c14', cape: '#8a4f2a', capeTrim: '#f0b67f', bolt: '#ffd27a' },
    unlock: { desc: 'Armoury · 80 credits', price: 80 },
  },
  {
    id: 'rifleman',
    name: 'Rifleman',
    title: 'M1 Garand',
    blurb: 'Eight rounds, semi-automatic, hard-hitting. The empty clip leaves with a PING and 1.6 s of reload you spend moving. R ejects the clip early.',
    profile: { attackSpeed: 1.6, windup: 10, moveSpeed: 315, range: 540 },
    stats: { damage: 26, maxHp: 100, critChance: 0.08 },
    dashMode: 'toward',
    heat: false,
    tempo: false,
    dashStrike: false,
    magazine: { size: 8, reload: 1.6, ping: true },
    weapon: 'garand',
    colors: { skin: '#9aa86a', trim: '#eef2d6', dark: '#2e3319', cape: '#5d6b34', capeTrim: '#c8d48a', bolt: '#fff1b8' },
    unlock: { desc: 'Armoury · 60 credits', price: 60 },
  },
  {
    id: 'skirmisher',
    name: 'Skirmisher',
    title: 'Blades at close quarters',
    blurb: 'Short range, very fast throwing blades. A blade released within half a second of moving is a TEMPO shot: +40% damage and +15% crit. E is a blade dash that cuts through everything it passes. Move, then strike.',
    profile: { attackSpeed: 2.0, windup: 18, moveSpeed: 350, range: 260 },
    stats: { damage: 13, maxHp: 90, dashCd: 3.2, critChance: 0.1 },
    dashMode: 'toward',
    heat: false,
    tempo: true,
    dashStrike: true,
    weapon: 'blade',
    colors: { skin: '#ff6b7f', trim: '#ffe3e8', dark: '#3a1420', cape: '#a3283f', capeTrim: '#ff9fb0', bolt: '#ffd0d8' },
    unlock: { desc: 'Armoury · 120 credits', price: 120 },
  },
  {
    id: 'gunslinger',
    name: 'Gunslinger',
    title: 'Twin Berettas',
    blurb: 'Two pistols, fifteen rounds each, alternating hands. The off hand fires at a second enemy in reach for 60% damage. Thirty rounds, then a 1.1 s reload (R reloads early). Short reach, quick feet.',
    profile: { attackSpeed: 2.3, windup: 9, moveSpeed: 345, range: 310 },
    stats: { damage: 9, maxHp: 95, dashCd: 3.4, critChance: 0.08 },
    dashMode: 'toward',
    heat: false,
    tempo: false,
    dashStrike: false,
    magazine: { size: 30, reload: 1.1, ping: false },
    offhand: 0.6,
    weapon: 'pistols',
    colors: { skin: '#c9a36b', trim: '#fff3dc', dark: '#2b2118', cape: '#6b4a2b', capeTrim: '#e8c98f', bolt: '#ffe8a8' },
    unlock: { desc: 'Armoury · 100 credits', price: 100 },
  },
];

export const heroById = (id: HeroId): Hero => HEROES.find(h => h.id === id) ?? HEROES[0];
/** Owned in the account (or free). The item id matches arsenal.ts `weaponItemId`. */
export const isUnlocked = (id: HeroId, a: Ownership) => id === 'marksman' || a.owned.includes(`weapon.${id}`);
