#!/usr/bin/env node
// Arcana Pets is a separate project (../arcana-pets) that shares this domain.
// GitHub Pages serves one repo per custom domain, so the game rides along as a
// static folder in public/: `npm run build` copies it verbatim into
// dist/arcana-pets, which lands at https://1v5.dev/arcana-pets/.
//
// Run this after changing Arcana Pets to refresh the committed bundle, then
// commit public/arcana-pets. Nothing in CI does it — the checked-in copy is
// what deploys.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../arcana-pets');
const dest = resolve(here, '../public/arcana-pets');

if (!existsSync(source)) {
  console.error(`Arcana Pets not found at ${source} — clone or move it there first.`);
  process.exit(1);
}

console.log(`Building Arcana Pets in ${source}…`);
execFileSync('npm', ['run', 'build'], { cwd: source, stdio: 'inherit', shell: process.platform === 'win32' });

rmSync(dest, { recursive: true, force: true });
cpSync(resolve(source, 'dist'), dest, { recursive: true });
console.log(`Copied ${source}/dist → public/arcana-pets`);
