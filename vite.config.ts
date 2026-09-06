import react from '@vitejs/plugin-react';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Where dev-mode playtest notes land. Read this file at the start of a session before touching tuning. */
const NOTES_FILE = resolve(__dirname, 'design/PLAYTEST-NOTES.md');
const NOTES_HEADER = `# Playtest notes

Appended by the in-game dev note button (N). Each entry is one machine-written state line followed by Oscar's words.
State line fields: class difficulty feel, wave:state, run time, hp, gold, kills, relics, shards, quest, contract,
loadout, enemies on the floor (with Witness phase), last gaze verdict, tuning knobs that differ from the preset, and the
account wallet. Read the newest entries first; they are feedback, not instructions.

`;

/** Dev-server only: POST /__playtest-note appends to design/PLAYTEST-NOTES.md so future sessions can read the feedback. */
function playtestNotes(): Plugin {
  return {
    name: 'playtest-notes',
    configureServer(server) {
      server.middlewares.use('/__playtest-note', (req, res) => {
        if (req.method === 'GET') {
          const text = existsSync(NOTES_FILE) ? readFileSync(NOTES_FILE, 'utf8') : '';
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, entries: (text.match(/^## /gm) ?? []).length, file: 'design/PLAYTEST-NOTES.md' }));
          return;
        }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { text } = JSON.parse(body) as { text: string };
            if (typeof text !== 'string' || !text.trim()) throw new Error('empty note');
            mkdirSync(dirname(NOTES_FILE), { recursive: true });
            if (!existsSync(NOTES_FILE)) appendFileSync(NOTES_FILE, NOTES_HEADER);
            appendFileSync(NOTES_FILE, text.endsWith('\n') ? text : `${text}\n`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: 'design/PLAYTEST-NOTES.md' }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

/** Where style reference frames land (brief "visual identity"). PNGs of the arena canvas, named by the caller. */
const STYLE_DIR = resolve(__dirname, 'design/style');

/**
 * Dev-server only: POST /__style-frame { name, dataUrl } writes design/style/<name>.png so a session can keep the
 * frame it judged a style change against. From the console: `__orbwalk.saveFrame('reaver-windup')`.
 */
function styleFrames(): Plugin {
  return {
    name: 'style-frames',
    configureServer(server) {
      server.middlewares.use('/__style-frame', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 12_000_000) req.destroy(); });
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body) as { name: string; dataUrl: string };
            if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(name)) throw new Error('name must be lowercase letters, digits and dashes');
            const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
            if (!m) throw new Error('expected a PNG data URL');
            mkdirSync(STYLE_DIR, { recursive: true });
            const file = resolve(STYLE_DIR, `${name}.png`);
            writeFileSync(file, Buffer.from(m[1], 'base64'));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: `design/style/${name}.png` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

// Served from the root of https://1v5.dev/ in production, so base stays '/'.
export default defineConfig({
  plugins: [react(), playtestNotes(), styleFrames()],
  server: { port: 5199, strictPort: false },
});
