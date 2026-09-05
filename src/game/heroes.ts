import type { HeroId, Settings, Stats } from './types.ts';

/** Persistent progress used for unlocks. Stored by the UI in localStorage. */
export type Progress = { bestWave: number; totalKills: number; runs: number };
export const EMPTY_PROGRESS: Progress = { bestWave: 0, totalKills: 0, runs: 0 };

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
  weapon: 'bow' | 'cannon' | 'blade';
  colors: { skin: string; trim: string; dark: string; cape: string; capeTrim: string; bolt: string };
  unlock: { desc: string; check: (p: Progress) => boolean };
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
    unlock: { desc: 'Available from the start.', check: () => true },
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
    unlock: { desc: 'Reach wave 4 in any run.', check: p => p.bestWave >= 4 },
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
    unlock: { desc: 'Reach 200 career kills.', check: p => p.totalKills >= 200 },
  },
];

export const heroById = (id: HeroId): Hero => HEROES.find(h => h.id === id) ?? HEROES[0];
export const isUnlocked = (id: HeroId, p: Progress) => heroById(id).unlock.check(p);
