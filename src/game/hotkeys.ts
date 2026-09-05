/**
 * Browser chords that must not fire mid-run. The game's keys (A, S, E, R, H, F, B, digits, Space) sit under
 * the browser's own shortcuts, and a held modifier or a slipped finger opens the console, the save dialog or
 * view-source in the middle of a fight. This is a pure decision so it can be tested headlessly; the Arena
 * calls preventDefault on anything it returns.
 */
export type KeyLike = { key?: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

export type ChordAction = 'stop' | 'swallow';

/** Keys the game binds; a browser chord built on one of these is swallowed while a run is on screen. */
const GAME_KEYS = new Set(['a', 's', 'e', 'r', 'h', 'f', 'b', ' ', 'enter', 'escape', '1', '2', '3', '4', '7', '8', '9']);
/** Developer-tools chords across Chrome, Edge, Firefox and Safari. */
const DEVTOOLS_KEYS = new Set(['i', 'j', 'c', 'k', 'e']);

/**
 * `active` is true while a run or drill is on screen (running, paused or in the shop). Ctrl/Cmd+S always
 * maps to Stop so the save dialog never appears; everything else is only swallowed while active, so the
 * console still opens normally from the start screen.
 */
export function browserChord(e: KeyLike, active: boolean): ChordAction | null {
  const key = (e.key ?? '').toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && (key === 's' || e.code === 'KeyS')) return 'stop';
  if (!active) return null;
  if (key === 'f12' || e.code === 'F12') return 'swallow';
  if (mod && e.shiftKey && DEVTOOLS_KEYS.has(key)) return 'swallow';
  if (e.metaKey && e.altKey && DEVTOOLS_KEYS.has(key)) return 'swallow';
  if (mod && !e.shiftKey && !e.altKey && key === 'u') return 'swallow';
  if (mod && GAME_KEYS.has(key)) return 'swallow';
  return null;
}
