// The 1v5.dev launcher: its shelf (src/launcher/games.ts) against the static list in index.html, and every live
// path against what this build actually serves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, LIVE_GAMES } from '../src/launcher/games.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(repo, p), 'utf8');
const html = read('index.html');
const viteConfig = read('vite.config.ts');

/** The <li class="tile …"> blocks of index.html, in order. */
function tiles() {
  const out = [];
  const re = /<li class="tile ([a-z]+)" data-game="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g;
  for (let m; (m = re.exec(html));) {
    const body = m[3];
    out.push({
      state: m[1],
      id: m[2],
      href: /<a class="tile-hit" href="([^"]+)"/.exec(body)?.[1] ?? null,
      title: /<span class="tile-title">([^<]+)<\/span>/.exec(body)?.[1] ?? null,
      pitch: /<p class="tile-pitch"[^>]*>([^<]+)<\/p>/.exec(body)?.[1] ?? null,
    });
  }
  return out;
}

test('the shelf has unique ids, real titles and valid accents', () => {
  assert.ok(GAMES.length >= 3);
  assert.equal(new Set(GAMES.map(g => g.id)).size, GAMES.length);
  for (const g of GAMES) {
    assert.ok(g.title && g.kind && g.pitch && g.controls && g.tech, g.id);
    assert.match(g.accent, /^#[0-9a-f]{6}$/i, g.id);
    assert.ok(['orb', 'card', 'stall', 'disc'].includes(g.prop), g.id);
  }
});

test('the live games are Orbwalk Rogue, Arcana Pets and Closing Time at their sub-paths', () => {
  assert.deepEqual(LIVE_GAMES.map(g => [g.id, g.href]), [
    ['orbwalk', '/orbwalk/'],
    ['arcana-pets', '/arcana-pets/'],
    ['closing-time', '/closing-time/'],
  ]);
});

test('every live path is served by this build', () => {
  for (const g of LIVE_GAMES) {
    assert.match(g.href, /^\/[a-z0-9-]+\/$/, `${g.id}: a root-relative folder path with a trailing slash`);
    const folder = g.href.slice(1, -1);
    const built = existsSync(resolve(repo, folder, 'index.html'));
    const copied = existsSync(resolve(repo, 'public', folder, 'index.html'));
    assert.ok(built !== copied, `${g.id}: exactly one of ${folder}/index.html (a Vite page) or public/${folder}/index.html (a checked-in build)`);
    if (built) assert.ok(viteConfig.includes(`'${folder}/index.html'`), `${g.id}: ${folder}/index.html is a build input in vite.config.ts`);
  }
});

test('index.html lists the same tiles, in order, as real links for the live ones', () => {
  const list = tiles();
  assert.deepEqual(list.map(t => t.id), GAMES.map(g => g.id));
  list.forEach((t, i) => {
    const g = GAMES[i];
    assert.equal(t.title, g.title, g.id);
    assert.ok(t.pitch?.startsWith(g.pitch), `${g.id}: the static pitch starts with games.ts's pitch`);
    if (g.href) {
      assert.equal(t.state, 'live', g.id);
      assert.equal(t.href, g.href, `${g.id}: a real <a href> to its path`);
    } else {
      assert.equal(t.state, 'locked', g.id);
      assert.equal(t.href, null, `${g.id}: a workshop tile is not a link`);
    }
  });
  // the panel's first paint shows the first live game, with a real link
  assert.ok(html.includes(`id="panel-play" href="${GAMES[0].href}"`));
});

test('Orbwalk Rogue moved to /orbwalk/ and old apex deep links forward there', () => {
  assert.ok(read('orbwalk/index.html').includes('src="/src/main.tsx"'));
  assert.ok(html.includes('src="/src/launcher/main.ts"'));
  assert.ok(!html.includes('/src/main.tsx'), 'the launcher does not load the game');
  assert.match(html, /q\.has\('tuning'\) \|\| q\.has\('dev'\)\) location\.replace\('\/orbwalk\/'/);
});

test('the launcher page carries its title, description, social card and icon', () => {
  assert.match(html, /<title>[^<]*1v5\.dev[^<]*<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{60,}"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/1v5\.dev\/"/);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url']) assert.ok(html.includes(`property="${p}"`), p);
  assert.ok(existsSync(resolve(repo, 'public/og.jpg')), 'public/og.jpg');
  assert.ok(existsSync(resolve(repo, 'public/launcher-icon.svg')), 'public/launcher-icon.svg');
});
