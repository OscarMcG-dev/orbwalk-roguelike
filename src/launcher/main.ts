/**
 * 1v5.dev launcher: selection, input (keyboard, mouse, touch, gamepad), sound, the memory card and the BIOS
 * lines. The HTML list in index.html is the real UI; the three.js stage (scene.ts) is loaded after first paint and
 * only draws. Without WebGL, the same panel and dock run over a CSS backdrop.
 */

import { Blips } from './audio';
import { GAMES, type Game } from './games';
import type { Stage } from './scene';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches || params.has('still');
if (params.has('still')) root.classList.add('still');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tiles = [...document.querySelectorAll<HTMLLIElement>('#shelf .tile')];
const games: Game[] = tiles.map(t => GAMES.find(g => g.id === t.dataset.game)!).filter(Boolean);
const hits = tiles.map(t => t.querySelector<HTMLElement>('.tile-hit')!);
const panel = $('panel');
const play = $<HTMLAnchorElement>('panel-play');
const shelf = $('shelf');
const blips = new Blips();
const SEL_KEY = '1v5-launcher-selected';

let selected = 0;
let stage: Stage | null = null;
let launching = false;
let lastPointer: string = 'mouse';

// ---------------------------------------------------------------- memory card

function hasSave(g: Game): boolean {
  try { return (g.saveKeys ?? []).some(k => localStorage.getItem(k) !== null); } catch { return false; }
}
const saves = games.map(hasSave);

function renderMemcard() {
  const blocks = $('memcard-blocks');
  blocks.textContent = '';
  const used = games.filter((_, i) => saves[i]);
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('i');
    const g = used[i];
    if (g) { b.className = 'used'; b.style.setProperty('--c', g.accent); b.style.animationDelay = `${i * 0.4}s`; }
    blocks.append(b);
  }
  $('memcard').setAttribute('aria-label', used.length
    ? `Memory card: save data for ${used.map(g => g.title).join(' and ')}`
    : 'Memory card: no saves yet');
}

// ---------------------------------------------------------------- selection

function pad2(n: number) { return String(n).padStart(2, '0'); }

function select(i: number, how: 'init' | 'key' | 'hover' | 'pad' | 'tap' | 'wheel' | 'focus' = 'key', focus = false) {
  const n = games.length;
  i = ((i % n) + n) % n;
  const changed = i !== selected || how === 'init';
  selected = i;
  const g = games[i];
  tiles.forEach((t, k) => t.classList.toggle('is-selected', k === i));
  if (focus && document.activeElement !== hits[i]) hits[i].focus({ preventScroll: true });
  if (!changed) return;
  root.style.setProperty('--accent', g.accent);
  $('panel-slot').textContent = `BLOCK ${pad2(i + 1)} / ${pad2(n)}`;
  $('panel-state').textContent = g.href ? 'LIVE' : 'WORKSHOP';
  $('panel-title').textContent = g.title;
  $('panel-kind').textContent = g.kind;
  $('panel-pitch').textContent = g.pitch;
  $('panel-controls').textContent = g.controls;
  $('panel-tech').textContent = g.tech;
  $('panel-save').hidden = !saves[i];
  panel.classList.toggle('is-locked', !g.href);
  if (g.href) {
    play.href = g.href;
    play.removeAttribute('aria-disabled');
    play.querySelector('.gel-label')!.textContent = 'Play';
    play.title = `Play ${g.title}`;
  } else {
    play.removeAttribute('href');
    play.setAttribute('aria-disabled', 'true');
    play.querySelector('.gel-label')!.textContent = 'In the workshop';
    play.title = `${g.title} is not playable here yet`;
  }
  if (how !== 'init') {
    panel.classList.remove('swap');
    void panel.offsetWidth;
    panel.classList.add('swap');
    blips.move(i);
  }
  keepTileInView(i, how === 'init' ? 'auto' : 'smooth');
  stage?.setSelected(i);
  try { sessionStorage.setItem(SEL_KEY, g.id); } catch { /* storage blocked */ }
}

function keepTileInView(i: number, behavior: ScrollBehavior) {
  if (shelf.scrollWidth <= shelf.clientWidth + 1) return;
  const t = tiles[i];
  const left = t.offsetLeft - (shelf.clientWidth - t.offsetWidth) / 2;
  shelf.scrollTo({ left, behavior: reduced ? 'auto' : behavior });
}

// ---------------------------------------------------------------- launch

function launch(i = selected) {
  if (launching) return;
  const g = games[i];
  if (i !== selected) select(i, 'key');
  if (!g.href) {
    blips.locked();
    if (!reduced) panel.animate?.([{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '7px 0' }, { translate: '0 0' }], { duration: 260 });
    return;
  }
  launching = true;
  blips.confirm();
  const at = stage?.launch() ?? { x: 0.45, y: 0.45 };
  root.style.setProperty('--fx', `${(at.x * 100).toFixed(1)}%`);
  root.style.setProperty('--fy', `${(at.y * 100).toFixed(1)}%`);
  document.body.classList.add('launching');
  const href = g.href;
  setTimeout(() => location.assign(href), reduced ? 60 : 640);
}

function unlaunch() {
  launching = false;
  document.body.classList.remove('launching');
  stage?.reset();
}
// Coming back with the browser's Back button restores this page from the bfcache mid-launch.
addEventListener('pageshow', e => { if (e.persisted) unlaunch(); });

function plainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

// ---------------------------------------------------------------- input: pointer

addEventListener('pointerdown', e => { lastPointer = e.pointerType; blips.unlock(); stage?.skipBoot(); }, { capture: true });
addEventListener('keydown', () => { blips.unlock(); stage?.skipBoot(); }, { capture: true });

tiles.forEach((t, i) => {
  t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !launching) select(i, 'hover'); });
  hits[i].addEventListener('focus', () => select(i, 'focus'));
  hits[i].addEventListener('click', e => {
    if (!plainClick(e)) return; // let new-tab and friends through untouched
    e.preventDefault();
    if (lastPointer !== 'mouse' && i !== selected) { select(i, 'tap'); return; }
    launch(i);
  });
});

play.addEventListener('click', e => {
  if (!plainClick(e)) return;
  e.preventDefault();
  launch(selected);
});

// canvas: tap or click a prop to select it, again to play; swipe or wheel to browse
const canvas = $<HTMLCanvasElement>('stage');
let swipe: { x: number; y: number; id: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }; });
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') {
    stage?.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    if (stage) canvas.style.cursor = stage.pick(e.clientX, e.clientY) >= 0 ? 'pointer' : '';
  }
  if (!swipe || swipe.id !== e.pointerId) return;
  const dx = e.clientX - swipe.x;
  if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) {
    select(selected + (dx < 0 ? 1 : -1), 'tap');
    swipe.x = e.clientX;
    swipe.moved = true;
  }
});
canvas.addEventListener('pointerup', e => {
  const s = swipe;
  swipe = null;
  if (!s || s.moved || !stage) return;
  const i = stage.pick(e.clientX, e.clientY);
  if (i < 0) return;
  if (i === selected) launch(i); else select(i, 'tap');
});
canvas.addEventListener('pointercancel', () => { swipe = null; });
let wheelAcc = 0, wheelAt = 0;
addEventListener('wheel', e => {
  if ((e.target as HTMLElement).closest('#shelf') && shelf.scrollWidth > shelf.clientWidth) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  wheelAcc += d;
  const now = performance.now();
  if (Math.abs(wheelAcc) > 60 && now - wheelAt > 180) {
    select(selected + Math.sign(wheelAcc), 'wheel');
    wheelAcc = 0;
    wheelAt = now;
  }
}, { passive: true });

// ---------------------------------------------------------------- input: keyboard

addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || launching) return;
  const t = e.target as HTMLElement;
  const onUi = t.id === 'mute' || t.closest('.credit');
  switch (e.key) {
    case 'ArrowLeft': case 'ArrowUp': case 'a': case 'A':
      e.preventDefault(); select(selected - 1, 'key', true); break;
    case 'ArrowRight': case 'ArrowDown': case 'd': case 'D':
      e.preventDefault(); select(selected + 1, 'key', true); break;
    case 'Home': e.preventDefault(); select(0, 'key', true); break;
    case 'End': e.preventDefault(); select(games.length - 1, 'key', true); break;
    case 'Enter': case ' ':
      if (onUi) return;
      e.preventDefault(); launch(selected); break;
    case 'm': case 'M': toggleSound(); break;
    default:
      if (/^[1-9]$/.test(e.key) && +e.key <= games.length) select(+e.key - 1, 'key', true);
  }
});

// ---------------------------------------------------------------- input: gamepad

let padRaf = 0;
const padState = { dir: 0, next: 0, a: false, start: false, back: false };
function pollPads(now: number) {
  padRaf = 0;
  const pads = navigator.getGamepads?.() ?? [];
  let dir = 0, a = false, start = false, back = false, any = false;
  for (const p of pads) {
    if (!p) continue;
    any = true;
    const ax = p.axes[0] ?? 0;
    if (ax < -0.5 || p.buttons[14]?.pressed || p.buttons[12]?.pressed || p.buttons[4]?.pressed) dir = -1;
    if (ax > 0.5 || p.buttons[15]?.pressed || p.buttons[13]?.pressed || p.buttons[5]?.pressed) dir = 1;
    a ||= !!p.buttons[0]?.pressed;
    start ||= !!p.buttons[9]?.pressed;
    back ||= !!p.buttons[8]?.pressed;
  }
  if (dir !== 0 && (dir !== padState.dir || now >= padState.next)) {
    stage?.skipBoot();
    select(selected + dir, 'pad', true);
    padState.next = now + (dir !== padState.dir ? 380 : 150);
  }
  padState.dir = dir;
  if ((a && !padState.a) || (start && !padState.start)) { stage?.skipBoot(); launch(selected); }
  if (back && !padState.back) toggleSound();
  padState.a = a; padState.start = start; padState.back = back;
  if (any) padRaf = requestAnimationFrame(pollPads);
}
addEventListener('gamepadconnected', () => {
  $('hint-go').textContent = 'Ⓐ';
  if (!padRaf) padRaf = requestAnimationFrame(pollPads);
});
addEventListener('gamepaddisconnected', () => {
  if (!(navigator.getGamepads?.() ?? []).some(Boolean)) $('hint-go').textContent = '↵';
});

// ---------------------------------------------------------------- sound toggle

const muteBtn = $<HTMLButtonElement>('mute');
function paintMute() {
  muteBtn.setAttribute('aria-pressed', String(blips.enabled));
  muteBtn.title = blips.enabled ? 'Sound on (M)' : 'Sound off (M)';
}
function toggleSound() {
  blips.unlock();
  blips.setEnabled(!blips.enabled);
  paintMute();
  if (blips.enabled) setTimeout(() => blips.chime(), 60);
}
muteBtn.hidden = false;
muteBtn.addEventListener('click', toggleSound);
paintMute();
document.addEventListener('visibilitychange', () => blips.setVisible(document.visibilityState === 'visible'));

// ---------------------------------------------------------------- BIOS lines

const booted = (() => { try { return sessionStorage.getItem('1v5-booted') === '1'; } catch { return false; } })();
const bootRun = (!booted || params.has('boot')) && !reduced;
try { sessionStorage.setItem('1v5-booted', '1'); } catch { /* storage blocked */ }

function typeBoot(lines: string[]) {
  const el = $('boot');
  if (!bootRun) return;
  el.classList.add('on');
  const text = lines.join('\n');
  let n = 0;
  const tick = () => {
    n = Math.min(text.length, n + 3);
    el.textContent = text.slice(0, n) + (n < text.length ? '█' : '');
    if (n < text.length) setTimeout(tick, 16);
    else setTimeout(() => el.classList.remove('on'), 1500);
  };
  tick();
}

// ---------------------------------------------------------------- stage

function webglLikely(): boolean {
  if (params.has('nogl')) return false;
  return typeof WebGL2RenderingContext !== 'undefined' || typeof WebGLRenderingContext !== 'undefined';
}

function noGl(reason: string) {
  root.classList.remove('gl-ready');
  root.classList.add('no-gl');
  $('bios').textContent = `1V5 SYSTEM · ${reason}`;
}

async function bootStage() {
  const live = games.filter(g => g.href).length;
  const bootLines = (gpu: string) => [
    '1V5 ENTERTAINMENT SYSTEM   BIOS 1.0',
    `MEMORY CARD 1 ..... OK  ${saves.filter(Boolean).length} BLOCK(S) USED`,
    `DISC .............. ${live} TITLES, ${games.length - live} IN WORKSHOP`,
    `GPU ............... ${gpu}`,
  ];
  if (!webglLikely()) { noGl('NO GPU · 2D MODE'); typeBoot(bootLines('NOT FOUND · 2D MODE')); return; }
  try {
    const { createStage } = await import('./scene');
    stage = createStage(canvas, games, {
      reduced,
      boot: bootRun,
      onReady: () => root.classList.add('gl-ready'),
      onLost: () => { stage = null; noGl('GPU LOST · 2D MODE'); },
    });
    stage.setSelected(selected);
    const [w, h] = stage.lowRes();
    $('bios').textContent = `1V5 SYSTEM · ${w}×${h} · DITHER ON`;
    typeBoot(bootLines(`${w}x${h}  15-BIT  DITHER ON`));
    if (import.meta.env.DEV) (window as unknown as { __launcher: unknown }).__launcher = { stage, select, get selected() { return selected; } };
  } catch (err) {
    console.warn('1v5 launcher: 3D stage unavailable, staying in 2D', err);
    noGl('NO GPU · 2D MODE');
  }
}

motionQuery.addEventListener('change', e => { reduced = e.matches; stage?.setReduced(reduced); });

// ---------------------------------------------------------------- go

renderMemcard();
let start = 0;
try {
  const id = sessionStorage.getItem(SEL_KEY);
  start = Math.max(0, games.findIndex(g => g.id === id));
} catch { /* storage blocked */ }
select(start, 'init');

// Let the HTML paint first, then fetch and build the 3D stage (the timeout covers tabs opened in the background).
let stageBooting = false;
const bootOnce = () => { if (!stageBooting) { stageBooting = true; void bootStage(); } };
requestAnimationFrame(() => setTimeout(bootOnce, 0));
setTimeout(bootOnce, 300);
