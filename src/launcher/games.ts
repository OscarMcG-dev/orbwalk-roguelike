/**
 * The 1v5.dev launcher's shelf. One entry per tile, in shelf order. `index.html` carries the same list as real
 * <a> / <li> elements (the no-JavaScript, no-WebGL and screen-reader view); tests/launcher.test.mjs keeps the two in
 * step and checks that every live path is actually served by this build.
 *
 * To add a game: host it (a sub-path of this repo, see README "Hosting"), add an entry here with `href`, add the
 * matching <li> to index.html, and give it a `prop` the scene knows (src/launcher/scene.ts, `buildProp`).
 */

export type Prop = 'orb' | 'card' | 'stall' | 'disc';

export interface Game {
  /** Stable id; also the DOM `data-game` attribute on the tile. */
  id: string;
  title: string;
  /** Short genre line under the title. */
  kind: string;
  /** One or two sentences. */
  pitch: string;
  /** Served path on 1v5.dev, trailing slash. Absent means a workshop (locked) tile with no link. */
  href?: string;
  /** Input line shown on the memory card panel. */
  controls: string;
  /** Engine / stack, shown small. */
  tech: string;
  /** The play button's label when it is not "Play" (Closing Time's page is a download). */
  cta?: string;
  /** localStorage keys whose presence means "save data found" on this origin. */
  saveKeys?: string[];
  /** Which 3D prop stands on this game's pedestal. */
  prop: Prop;
  /** Accent colour for the prop, the tile gel and the bloom tint (CSS hex). */
  accent: string;
}

export const GAMES: Game[] = [
  {
    id: 'orbwalk',
    title: 'Orbwalk Rogue',
    kind: 'ADC kiting roguelike',
    pitch: 'Right-click to move, attack between steps. Move before the release and the shot cancels; that is the whole skill. Waves, a draft, permadeath.',
    href: '/orbwalk/',
    controls: 'Mouse + keyboard · desktop',
    tech: 'React · Canvas · 120 Hz sim',
    saveKeys: ['orbwalk-rogue-account', 'orbwalk-rogue-best', 'orbwalk-rogue-progress'],
    prop: 'orb',
    accent: '#7ff5d0',
  },
  {
    id: 'arcana-pets',
    title: 'Arcana Pets',
    kind: 'Tarot autobattler',
    pitch: 'A Super Auto Pets-style autobattler dealt from all 78 tarot cards. Every ability is a reading of its card, and a card laid in the back half of your spread is read reversed.',
    href: '/arcana-pets/',
    controls: 'Mouse or touch',
    tech: 'PixiJS · GLSL foil shaders',
    saveKeys: ['arcana-pets:run:v3'],
    prop: 'card',
    accent: '#c9a7ff',
  },
  {
    id: 'closing-time',
    title: 'Closing Time',
    kind: 'Night-market extraction shooter',
    pitch: 'The night market is shutting. Slip into the stalls and back alleys, read who is watching, take what is worth taking and get out before the shutters come down.',
    href: '/closing-time/',
    controls: 'Mouse + keyboard · Windows',
    tech: 'Godot 4.7 · Windows download',
    cta: 'Download',
    prop: 'stall',
    accent: '#ff7eb6',
  },
  {
    id: 'stutterstep',
    title: 'Stutterstep',
    kind: 'Keyboard kiting roguelike',
    pitch: 'Orbwalk on the keyboard alone: walk, stop, shoot, walk again. Tumble and Condemn on a beat.',
    controls: 'Keyboard only',
    tech: 'Canvas · in the workshop',
    prop: 'disc',
    accent: '#8fd3ff',
  },
  {
    id: 'sausage-lab',
    title: 'Sausage Lab',
    kind: 'Soft-body toys',
    pitch: 'Four weird riffs on one soft-body sausage, including an online co-op duet.',
    controls: 'Mouse or touch',
    tech: 'Verlet physics · in the workshop',
    prop: 'disc',
    accent: '#ffb86b',
  },
  {
    id: 'dead-channel',
    title: 'DEAD CHANNEL',
    kind: 'Movement shooter',
    pitch: 'A first-person movement shooter prototype: one arena, three enemy roles, two weapons.',
    controls: 'Mouse + keyboard',
    tech: 'Godot · in the workshop',
    prop: 'disc',
    accent: '#9aa7ff',
  },
];

export const LIVE_GAMES = GAMES.filter(g => g.href);
