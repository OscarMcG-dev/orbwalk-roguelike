// Renders a Closing Time test card (closing-time/docs/playtest/<date>-card-r<N>.md) into the page's HTML. The card
// keeps a small, fixed shape so it reads well as plain text in the zip and as a checklist on the page:
//
//   # Title (the first line)
//   Intro paragraphs. One that starts "Build:" is for the zip copy only and is left off the page.
//   ## A. Session name, 10 min        a sitting; the letter is its plate
//   A paragraph here is the session's note.
//   ### A1. Item title
//   `++ --range --trait=skewer`        a line that is only a code span: a command (++ lines get the exe or
//                                      run.ps1 prefix on the page; anything else is shown as is, tagged "repo")
//   - Look: what to look for           (continuation lines indented by two spaces)
//   - Ask: the "closer to X or Y?" question
//   - anything else is a plain note
//
// Inline: `code`, **bold** (a single key like **Z** or **Shift+V** becomes a keycap), *em*, and bare URLs.

const cap = s => s.replace(/^([a-z])/, c => c.toUpperCase());
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KEY = /^(?:Shift\+[A-Z0-9]|Ctrl\+[A-Z0-9]|F\d{1,2}|[A-Z0-9]|Esc|Tab|Enter|Space)$/;

/** Inline markdown for the card's subset, HTML-escaped. */
export function inline(text) {
  return text.split(/(`[^`]+`)/).map(part => {
    if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
    return esc(part)
      .replace(/\*\*([^*]+)\*\*/g, (_, b) => (KEY.test(b) ? `<kbd>${b}</kbd>` : `<strong>${b}</strong>`))
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(https?:\/\/[^\s<)]+[^\s<).,:;])/g, '<a href="$1">$1</a>');
  }).join('');
}

function command(line) {
  const text = line.slice(1, -1);
  if (text.startsWith('++')) {
    const args = text.replace(/^\+\+\s*/, '');
    return `<div class="cmd" data-args="${esc(args)}"><code><span class="cmd-pre">.\\ClosingTime.exe ++</span> <span class="cmd-args">${args.split(/\s+/).map(a => `<span class="tok">${esc(a)}</span>`).join(' ')}</span></code><button type="button" class="copy" aria-label="Copy the command">Copy</button></div>`;
  }
  return `<div class="cmd is-literal" data-literal="${esc(text)}"><code>${esc(text)}</code><span class="cmd-tag">repo</span><button type="button" class="copy" aria-label="Copy the command">Copy</button></div>`;
}

/** Blocks of one section: paragraphs, bullets (with continuation lines) and command lines. */
function blocks(lines) {
  const out = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { cur = null; continue; }
    if (/^`[^`]+`$/.test(line.trim())) { out.push({ kind: 'cmd', text: line.trim() }); cur = null; continue; }
    const bullet = /^- (.*)$/.exec(line);
    if (bullet) { cur = { kind: 'bullet', text: bullet[1] }; out.push(cur); continue; }
    if (cur && /^\s{2,}\S/.test(line)) { cur.text += ` ${line.trim()}`; continue; }
    if (cur && cur.kind === 'para') { cur.text += ` ${line.trim()}`; continue; }
    cur = { kind: 'para', text: line.trim() };
    out.push(cur);
  }
  return out;
}

export function renderCard(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const title = (lines.find(l => l.startsWith('# ')) ?? '# Test card').slice(2).trim();
  const short = /\bcard (r\d+)\b/i.exec(title)?.[1] ?? 'card';

  // Split into intro / sessions / items by heading.
  const intro = [];
  const sessions = [];
  let session = null, item = null;
  for (const line of lines) {
    if (line.startsWith('# ')) continue;
    const s = /^##\s+([A-Z])\.\s+(.+?)(?:,\s*(\d+)\s*min)?\s*$/.exec(line);
    if (s) { session = { letter: s[1], name: s[2], minutes: +(s[3] ?? 0), note: [], items: [] }; sessions.push(session); item = null; continue; }
    const i = /^###\s+([A-Z]\d+)\.\s+(.+?)\s*$/.exec(line);
    if (i && session) { item = { id: i[1], title: i[2], lines: [] }; session.items.push(item); continue; }
    if (item) item.lines.push(line);
    else if (session) session.note.push(line);
    else intro.push(line);
  }
  if (!sessions.length) throw new Error('test card: no "## A. Name, N min" sessions found');

  const para = b => `<p>${inline(b.text)}</p>`;
  let html = '<div class="card-intro">';
  for (const b of blocks(intro)) if (!(b.kind === 'para' && b.text.startsWith('Build:'))) html += b.kind === 'cmd' ? command(b.text) : para(b);
  html += '</div>\n';

  let count = 0;
  for (const s of sessions) {
    const sid = `card-${s.letter.toLowerCase()}`;
    html += `<section class="session reveal" id="${sid}" aria-labelledby="${sid}-h">\n`;
    html += `<header class="session-head"><span class="plate plate-letter" aria-hidden="true">${s.letter}</span><h3 id="${sid}-h">${inline(s.name)}</h3>${s.minutes ? `<span class="session-mins">${s.minutes} min</span>` : ''}</header>\n`;
    for (const b of blocks(s.note)) html += b.kind === 'cmd' ? command(b.text) : `<p class="session-note">${inline(b.text)}</p>\n`;
    html += '<ol class="items">\n';
    for (const it of s.items) {
      count++;
      const id = it.id.toLowerCase();
      const bs = blocks(it.lines);
      const cmds = bs.filter(b => b.kind === 'cmd').map(b => command(b.text)).join('');
      const looks = bs.filter(b => b.kind === 'bullet' && /^Look:/.test(b.text)).map(b => `<li>${inline(cap(b.text.replace(/^Look:\s*/, '')))}</li>`).join('');
      const notes = bs.filter(b => b.kind === 'bullet' && !/^(Look|Ask):/.test(b.text)).map(b => `<li>${inline(b.text)}</li>`).join('');
      const paras = bs.filter(b => b.kind === 'para').map(para).join('');
      const asks = bs.filter(b => b.kind === 'bullet' && /^Ask:/.test(b.text))
        .map(b => `<p class="ask"><span class="ask-q" aria-hidden="true">?</span><span><span class="sr-only">Question: </span>${inline(cap(b.text.replace(/^Ask:\s*/, '')))}</span></p>`).join('');
      html += `<li class="item" id="card-${id}">`
        + `<div class="item-head"><label class="tick"><input type="checkbox" data-tick="${id}"><span class="tick-box" aria-hidden="true"></span><span class="sr-only">Done: ${esc(it.id)}</span></label>`
        + `<span class="item-id">${esc(it.id)}</span><h4>${inline(it.title)}</h4></div>`
        + (cmds ? `<div class="cmds">${cmds}</div>` : '')
        + paras
        + (looks ? `<ul class="look">${looks}</ul>` : '')
        + (notes ? `<ul class="notes">${notes}</ul>` : '')
        + asks
        + '</li>\n';
    }
    html += '</ol>\n</section>\n';
  }
  return {
    html,
    title,
    short,
    id: `ct-card-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}`,
    count,
    minutes: sessions.reduce((n, s) => n + s.minutes, 0),
  };
}
