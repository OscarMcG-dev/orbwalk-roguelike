#!/usr/bin/env node
// Closing Time (a separate Godot project at ../closing-time) lives at https://1v5.dev/closing-time/ as a Windows
// download and playtest page. The zip is a GitHub release asset (tag closing-time-build, a stable URL), so no build
// ever enters git; this script packs it and writes the page that describes it.
//
//   npm run sync:closing-time              pack the newest tested zip, then write the page
//   ... -- --no-pack                       rewrite the page from the last pack (build/ClosingTime-win64.json)
//   ... -- --card=<path>                   use this test card instead of the newest docs/playtest/*-card-r*.md
//   ... -- --commit=<sha>                  stamp this commit (when master moved on after the export)
//   ... -- --allow-untested                pack a -untested zip (the page then says so)
//   ... -- --web                           also export the shelved web build into public/closing-time/web/
//
// The page's backdrop shader lives in tools/closing-time-backdrop.frag and is inlined (no extra request).
// Pack: copies closing-time/build/ClosingTime-win64-<date>.zip (from `.\export.ps1`) to build/ClosingTime-win64.zip,
// adds the test card as ClosingTime/TEST-CARD.txt, and records date, commit, size and SHA-256 in
// build/ClosingTime-win64.json. Page: tools/closing-time-page.html with the card rendered in, to
// public/closing-time/index.html; public/closing-time/download/ redirects there (old links). Hand-made page assets
// (screenshots, the m5x7 font, og.jpg) sit in public/closing-time/assets/ and are not touched.
//
// Publish (docs/recipes/deploy-web.md in closing-time): upload the zip first, then push, so the page never
// describes a zip that is not there yet.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCard } from './closing-time-card.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../closing-time');
const build = join(source, 'build');
const dest = resolve(here, '../public/closing-time');
const ZIP_URL = 'https://github.com/OscarMcG-dev/orbwalk-roguelike/releases/download/closing-time-build/ClosingTime-win64.zip';
const argv = process.argv.slice(2);
const has = f => argv.includes(`--${f}`);
const opt = f => argv.find(a => a.startsWith(`--${f}=`))?.slice(f.length + 3);
const die = msg => { console.error(msg); process.exit(1); };

if (!existsSync(source)) die(`Closing Time not found at ${source}: clone or move it there first.`);
const git = (...a) => execFileSync('git', ['-C', source, ...a]).toString().trim();

/** Newest docs/playtest/<date>-card-r<N>.md by date, then N. */
function newestCard() {
  const dir = join(source, 'docs/playtest');
  const cards = readdirSync(dir)
    .map(f => ({ f, m: /^(\d{4}-\d{2}-\d{2})-card-r(\d+)\.md$/.exec(f) }))
    .filter(c => c.m)
    .sort((a, b) => a.m[1].localeCompare(b.m[1]) || +a.m[2] - +b.m[2]);
  if (!cards.length) die(`No test card (docs/playtest/<date>-card-r<N>.md) in ${dir}.`);
  return join(dir, cards.at(-1).f);
}

const cardPath = opt('card') ? resolve(opt('card')) : newestCard();
const cardMd = readFileSync(cardPath, 'utf8');
const stampPath = join(build, 'ClosingTime-win64.json');

// ---------------------------------------------------------------- pack

function pack() {
  const zips = readdirSync(build)
    .map(f => ({ f, m: /^ClosingTime-win64-(\d{4}-\d{2}-\d{2})(-untested)?\.zip$/.exec(f) }))
    .filter(z => z.m)
    .map(z => ({ ...z, mtime: statSync(join(build, z.f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);
  if (!zips.length) die(`No build/ClosingTime-win64-<date>.zip in ${build}: run .\\export.ps1 in closing-time first.`);
  const zip = zips.at(-1);
  const untested = !!zip.m[2];
  if (untested && !has('allow-untested')) die(`${zip.f} is untested (export.ps1 -SkipTests). Re-export, or pass --allow-untested.`);

  // The export builds the working tree at that moment; say so when the checkout has moved or is dirty since.
  let commit = opt('commit') ?? git('rev-parse', '--short', 'HEAD');
  if (!opt('commit')) {
    const headTime = +git('log', '-1', '--format=%ct') * 1000;
    if (headTime > zip.mtime) console.warn(`WARNING: HEAD ${commit} is newer than ${zip.f}; re-export or pass --commit=<sha of the export>.`);
    const dirty = git('status', '--porcelain', '--untracked-files=no');
    if (dirty) console.warn(`WARNING: the closing-time checkout has uncommitted changes; the zip may not match ${commit}.`);
  }

  const out = join(build, 'ClosingTime-win64.zip');
  copyFileSync(join(build, zip.f), out);
  // The card goes inside the game folder, beside README.txt, with Windows line endings for Notepad.
  const stage = join(build, 'pack');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, 'ClosingTime'), { recursive: true });
  writeFileSync(join(stage, 'ClosingTime', 'TEST-CARD.txt'), cardMd.replace(/\r?\n/g, '\r\n'));
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${join(stage, 'ClosingTime')}' -DestinationPath '${out}' -Update`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-r', out, 'ClosingTime'], { cwd: stage, stdio: 'inherit' });
  }
  rmSync(stage, { recursive: true, force: true });

  const bytes = readFileSync(out);
  const stamp = {
    date: zip.m[1],
    commit,
    tested: !untested,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    from: zip.f,
    card: basename(cardPath),
    packed: new Date().toISOString(),
  };
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`Packed ${out} (${(stamp.size / 1048576).toFixed(1)} MB, sha256 ${stamp.sha256})`);
  return stamp;
}

const stamp = has('no-pack')
  ? (existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, 'utf8')) : die(`No ${stampPath}: run once without --no-pack.`))
  : pack();

// ---------------------------------------------------------------- page

const card = renderCard(cardMd);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = {
  DATE: stamp.date,
  COMMIT: stamp.commit,
  SIZE_MB: (stamp.size / 1048576).toFixed(1),
  SHA256: stamp.sha256,
  TESTED: stamp.tested ? 'tested' : 'untested',
  ZIP_URL,
  CARD: card.html,
  CARD_ID: card.id,
  CARD_TITLE: esc(card.title),
  CARD_SHORT: esc(card.short),
  CARD_COUNT: String(card.count),
  CARD_MINUTES: String(card.minutes),
  SHADER: readFileSync(new URL('./closing-time-backdrop.frag', import.meta.url), 'utf8').trimEnd(),
};
let page = readFileSync(new URL('./closing-time-page.html', import.meta.url), 'utf8');
page = page.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in fill ? fill[k] : die(`Unknown placeholder ${m} in the page template.`)));
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, 'index.html'), page);

// Old links (/closing-time/download/, shared with friends on 27 Sep) land on the page.
mkdirSync(join(dest, 'download'), { recursive: true });
writeFileSync(join(dest, 'download', 'index.html'), `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>Closing Time: download</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://1v5.dev/closing-time/">
<meta http-equiv="refresh" content="0; url=../">
<script>location.replace('../' + location.hash);</script>
</head>
<body style="background:#0b0a09;color:#e6dcc2;font:16px system-ui,sans-serif;padding:24px">
<p>The download moved to <a href="../" style="color:#ffb347">1v5.dev/closing-time</a>.</p>
</body>
</html>
`);
console.log(`Wrote public/closing-time/index.html (build ${stamp.date} ${stamp.commit}, card ${stamp.card}: ${card.count} items) and the download/ redirect`);

// ---------------------------------------------------------------- shelved web build (opt-in)

if (has('web')) {
  const godot = process.env.GODOT ?? join(source, 'tools/godot/Godot_v4.7.2-stable_win64_console.exe');
  if (!existsSync(godot)) die(`Godot not found at ${godot} (set GODOT=...).`);
  const web = join(build, 'web');
  // Empty rather than delete build/web: on Windows a local static server running in it would block the rm.
  mkdirSync(web, { recursive: true });
  for (const f of readdirSync(web)) rmSync(join(web, f), { recursive: true, force: true });
  writeFileSync(join(build, '.gdignore'), ''); // keep Godot from importing its own export output
  console.log(`Exporting the Web preset from ${source}…`);
  execFileSync(godot, ['--headless', '--path', source, '--export-release', 'Web', join(web, 'index.html')], { stdio: 'inherit' });
  if (!existsSync(join(web, 'index.pck')) || !existsSync(join(web, 'index.wasm'))) die('Export did not produce index.pck and index.wasm.');
  rmSync(join(dest, 'web'), { recursive: true, force: true });
  cpSync(web, join(dest, 'web'), { recursive: true });
  for (const f of readdirSync(join(dest, 'web'))) {
    const size = statSync(join(dest, 'web', f)).size;
    if (size > 95 * 1024 * 1024) console.warn(`WARNING: web/${f} is ${(size / 1048576).toFixed(1)} MB, near GitHub's 100 MB limit`);
  }
  console.log('Copied the web build to public/closing-time/web/ (shelved: linked only from the page footer).');
}
