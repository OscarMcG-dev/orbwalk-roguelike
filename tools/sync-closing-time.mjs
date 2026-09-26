#!/usr/bin/env node
// Closing Time is a separate Godot project (../closing-time) that shares this domain, like Arcana Pets.
// This exports its "Web" preset (Compatibility renderer, no threads, so no COOP/COEP headers are needed) and
// copies the result into public/closing-time, which `npm run build` copies verbatim to
// https://1v5.dev/closing-time/.
//
// Needs the Godot 4.7.2 export templates in %APPDATA%/Godot/export_templates/4.7.2.stable/ (see
// closing-time/docs/recipes/deploy-web.md). Run after changing Closing Time, then commit public/closing-time.
// Nothing in CI does it: the checked-in copy is what deploys.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../closing-time');
const godot = process.env.GODOT ?? join(source, 'tools/godot/Godot_v4.7.2-stable_win64_console.exe');
const build = join(source, 'build/web');
const dest = resolve(here, '../public/closing-time');

if (!existsSync(source)) {
  console.error(`Closing Time not found at ${source} — clone or move it there first.`);
  process.exit(1);
}
if (!existsSync(godot)) {
  console.error(`Godot not found at ${godot} (set GODOT=...).`);
  process.exit(1);
}

// Empty rather than delete build/web: on Windows a local static server running in it would block the rm.
mkdirSync(build, { recursive: true });
for (const f of readdirSync(build)) rmSync(join(build, f), { recursive: true, force: true });
// Keep Godot from importing its own export output as project assets.
writeFileSync(join(source, 'build/.gdignore'), '');

console.log(`Exporting Closing Time (Web preset) from ${source}…`);
execFileSync(godot, ['--headless', '--path', source, '--export-release', 'Web', join(build, 'index.html')], {
  stdio: 'inherit',
});
if (!existsSync(join(build, 'index.pck')) || !existsSync(join(build, 'index.wasm'))) {
  console.error('Export did not produce index.pck and index.wasm; see the Godot output above.');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(build, dest, { recursive: true });
let total = 0;
for (const f of readdirSync(dest)) {
  const size = statSync(join(dest, f)).size;
  total += size;
  if (size > 95 * 1024 * 1024) console.warn(`WARNING: ${f} is ${(size / 1048576).toFixed(1)} MB, near GitHub's 100 MB limit`);
}
console.log(`Copied ${build} → public/closing-time (${(total / 1048576).toFixed(1)} MB)`);
