// Browser chords the Arena must swallow mid-run (src/game/hotkeys.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserChord } from '../src/game/hotkeys.ts';

const k = (key, mods = {}, code) => ({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test('Ctrl/Cmd+S is always Stop, never the save dialog', () => {
  assert.equal(browserChord(k('s', { ctrlKey: true }), true), 'stop');
  assert.equal(browserChord(k('S', { ctrlKey: true, shiftKey: true }), false), 'stop');
  assert.equal(browserChord(k('s', { metaKey: true }), false), 'stop');
  assert.equal(browserChord(k('ы', { ctrlKey: true }, 'KeyS'), true), 'stop', 'physical S on a non-Latin layout');
  assert.equal(browserChord(k('s', { ctrlKey: true, altKey: true }), true), 'swallow', 'with Alt held it is not Stop, but still not the browser\'s mid-run');
  assert.equal(browserChord(k('s', { ctrlKey: true, altKey: true }), false), null);
});

test('Developer-tools chords are swallowed while a run is on screen and left alone on the start screen', () => {
  const active = true;
  assert.equal(browserChord(k('F12'), active), 'swallow');
  assert.equal(browserChord(k('I', { ctrlKey: true, shiftKey: true }), active), 'swallow');
  assert.equal(browserChord(k('J', { ctrlKey: true, shiftKey: true }), active), 'swallow');
  assert.equal(browserChord(k('C', { ctrlKey: true, shiftKey: true }), active), 'swallow');
  assert.equal(browserChord(k('K', { ctrlKey: true, shiftKey: true }), active), 'swallow', 'Firefox console');
  assert.equal(browserChord(k('i', { metaKey: true, altKey: true }), active), 'swallow', 'Safari and mac Chrome');
  assert.equal(browserChord(k('u', { ctrlKey: true }), active), 'swallow', 'view source');
  for (const e of [k('F12'), k('I', { ctrlKey: true, shiftKey: true }), k('u', { ctrlKey: true })]) assert.equal(browserChord(e, false), null);
});

test('A modifier held over a game key is swallowed mid-run; plain keys and unrelated chords pass through', () => {
  for (const key of ['a', 'e', 'r', 'h', 'f', 'b', '1', '4', '7', '9', ' ', 'Enter', 'Escape']) {
    assert.equal(browserChord(k(key, { ctrlKey: true }), true), 'swallow', `ctrl+${key}`);
    assert.equal(browserChord(k(key), true), null, `plain ${key}`);
  }
  assert.equal(browserChord(k('a', { ctrlKey: true }), false), null, 'select-all is fine on the start screen');
  assert.equal(browserChord(k('t', { ctrlKey: true }), true), null, 'new tab is not ours to block');
  assert.equal(browserChord(k('w', { ctrlKey: true }), true), null);
});
