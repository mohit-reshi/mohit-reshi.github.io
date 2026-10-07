// The Q&A board: sections stacked, cards wrapping in rows, a focus bar that follows the section in view,
// and auto-fit scrolling. Uses the shared state (S, UI) from store.js and the helpers from core/.

const HUE = { intro: 'blue', role: 'yellow', project: 'green', personal: 'purple', story: 'orange', general: 'slate', jd: 'pink', collected: 'teal' };

export function markGaps(text) {
  return esc(text).replace(/\[add:([^\]]*)\]/g, '<mark class="gap">[add:$1]</mark>').replace(/\n/g, '<br>');
}

export function cardHtml(c, admin) {
  const done = c.status === 'perfected';
  const a = norm(c.a);
  const an = analyseAnswer(c.a, c.seconds);
  const hue = HUE[c.cat] || 'slate';
  const flags = [];
  if (c.lowConf) flags.push('<span class="flag" title="The split between question and answer may be wrong">Check this split</span>');
  if (c.similarTo && S.cards[c.similarTo]) flags.push('<span class="flag">Similar to an existing card</span>');
  if (c.askedCount > 1) flags.push('<span class="flag">Asked ' + c.askedCount + ' times</span>');
  if (c.source === 'collected' && !c.hasAnswer && c.gen) flags.push('<span class="flag need">No answer yet</span>');
  const topic = c.source === 'collected' && c.topic ? '<span class="chip">' + esc(TOPIC_LABEL[c.topic] || c.topic) + '</span>' : '';
  return '<article class="card hue-' + hue + (done ? ' perfected' : '') + (UI.selected.has(c.id) ? ' selected' : '') + '" data-card="' + esc(c.id) + '" tabindex="-1" aria-label="' + esc(c.q) + '">' +
    '<div class="card-top"><span class="cat">' + esc((CATS[c.cat] || {}).label || '') + '</span>' + topic +
    (done ? '<span class="badge-done"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg> Perfected</span>' : '') + '</div>' +
    '<h3 class="q">' + esc(c.q) + '</h3>' +
    '<div class="a">' + (a ? markGaps(c.a) : '<span class="muted">No answer yet. Open the editor to write one.</span>') + '</div>' +
    '<div class="card-meta"><span>~' + an.seconds + ' s</span><span>' + an.words + ' words</span>' + (an.gaps ? '<span>' + an.gaps + ' to fill</span>' : '') + flags.join('') + '</div>' +
    '<div class="card-actions">' +
    (admin ? '<label class="sel"><input type="checkbox" data-action="select" data-id="' + esc(c.id) + '"' + (UI.selected.has(c.id) ? ' checked' : '') + '> <span>Select</span></label>' : '') +
    '<button class="btn small" data-action="edit" data-id="' + esc(c.id) + '">Edit</button>' +
    '<button class="btn small' + (done ? ' on' : '') + '" data-action="perfect" data-id="' + esc(c.id) + '" aria-pressed="' + done + '">' + (done ? 'Perfected' : 'Mark perfected') + '</button>' +
    (admin && c.similarTo ? '<button class="btn small" data-action="merge-dup" data-id="' + esc(c.id) + '">Merge duplicate</button>' : '') +
    (admin && c.source === 'collected' ? '<button class="btn small" data-action="merge-next" data-id="' + esc(c.id) + '" title="Join this card with the next one">Join next</button><button class="btn small" data-action="split-card" data-id="' + esc(c.id) + '" title="Split at the first blank line of the answer">Split</button>' : '') +
    '</div></article>';
}

function matches(c) {
  if (UI.filter === 'draft' && c.status === 'perfected') return false;
  if (UI.filter === 'perfected' && c.status !== 'perfected') return false;
  if (UI.filter === 'noanswer' && norm(c.a) && !/\[add:/.test(c.a)) return false;
  if (UI.filter === 'collected' && c.source !== 'collected') return false;
  const q = norm(UI.search).toLowerCase();
  return !q || (c.q + ' ' + c.a).toLowerCase().includes(q);
}

export function renderBoard() {
  const admin = isAdmin();
  const secs = sectionsInOrder();
  const total = secs.reduce((n, x) => n + x.cards.length, 0);
  const done = secs.reduce((n, x) => n + x.cards.filter((c) => c.status === 'perfected').length, 0);
  const filters = [['all', 'All'], ['draft', 'Needs work'], ['perfected', 'Perfected'], ['noanswer', 'Has gaps to fill']].concat(admin ? [['collected', 'Collected']] : []);
  const targets = secs.map((x) => x.s);
  let html = '<div class="board">' +
    (S.sample ? '<div class="notice">This is a fictional sample. Edits here are not saved. Paste your own resume on <a href="#/home">Home</a> to start saving.</div>' : '') +
    (readiness().priority.length ? '<div class="priority" role="region" aria-label="Start with these"><strong>Start with these</strong>' + readiness().priority.map((c) => '<button class="chipbtn" data-action="edit" data-id="' + esc(c.id) + '">' + esc(trunc(c.q, 46)) + '</button>').join('') + '</div>' : '') +
    '<div class="board-tools"><div class="seg" role="group" aria-label="Show">' + filters.map(([v, l]) => '<button class="seg-btn" data-action="filter" data-v="' + v + '" aria-pressed="' + (UI.filter === v) + '">' + l + '</button>').join('') + '</div>' +
    '<label class="search"><span class="sr">Search cards</span><input type="search" id="board-search" placeholder="Search questions and answers" value="' + esc(UI.search) + '"></label>' +
    '<span class="muted">' + done + ' of ' + total + ' perfected</span></div>';
  if (admin) {
    html += '<div class="admin-bar" role="region" aria-label="Move cards"><span class="pill">Admin</span><span id="sel-count">' + UI.selected.size + ' selected</span>' +
      '<div class="menu-wrap"><button class="btn small" data-action="move-menu" ' + (UI.selected.size ? '' : 'disabled') + ' aria-haspopup="true" aria-expanded="' + (UI.openMenu === 'move') + '">Move to…</button>' +
      (UI.openMenu === 'move' ? '<div class="menu" role="menu">' + targets.map((s) => '<button role="menuitem" data-action="move-to" data-sec="' + esc(s.id) + '">' + esc(s.title) + '</button>').join('') + '<button role="menuitem" class="newsec" data-action="move-new">New section…</button></div>' : '') + '</div>' +
      '<button class="btn small" data-action="clear-sel" ' + (UI.selected.size ? '' : 'disabled') + '>Clear selection</button>' +
      '<button class="btn small" data-action="new-section">New section</button></div>';
  }
  const visible = secs.map((x) => ({ s: x.s, cards: x.cards.filter(matches).sort(byOrder) })).filter((x) => x.cards.length || (admin && !UI.search && UI.filter === 'all' && (x.s.kind === 'custom' || x.s.kind === 'collected')));
  if (!visible.length) html += '<div class="empty"><strong>No cards match.</strong><p>Change the filter or search, or analyse a resume on Home.</p></div>';
  visible.forEach((x, i) => {
    const s = x.s; const all = secs.find((y) => y.s.id === s.id).cards; const p = all.filter((c) => c.status === 'perfected').length;
    const batch = S.batches.find((b) => b.secId === s.id);
    html += '<section class="sec" id="' + esc(s.id.replace(/[^a-z0-9]/gi, '_')) + '" data-sec="' + esc(s.id) + '" aria-labelledby="h-' + i + '">' +
      '<header class="sec-head"><div><h2 id="h-' + i + '">' + esc(s.title) + '</h2>' + (s.sub ? '<p class="sub">' + esc(s.sub) + '</p>' : '') + '</div>' +
      '<div class="sec-side"><span class="ring" role="img" aria-label="' + p + ' of ' + all.length + ' perfected"><span style="--p:' + (all.length ? Math.round(p / all.length * 100) : 0) + '"></span><b>' + p + '/' + all.length + '</b></span>' +
      (admin ? '<div class="menu-wrap"><button class="btn small" data-action="sec-menu" data-sec="' + esc(s.id) + '" aria-haspopup="true" aria-expanded="' + (UI.openMenu === s.id) + '" aria-label="Section options for ' + esc(s.title) + '">Section</button>' +
        (UI.openMenu === s.id ? '<div class="menu right" role="menu"><button role="menuitem" data-action="sec-rename" data-sec="' + esc(s.id) + '">Rename</button><button role="menuitem" data-action="sec-up" data-sec="' + esc(s.id) + '">Move up</button><button role="menuitem" data-action="sec-down" data-sec="' + esc(s.id) + '">Move down</button><button role="menuitem" data-action="sec-select" data-sec="' + esc(s.id) + '">Select all cards</button>' + (batch ? '<button role="menuitem" data-action="undo-import" data-batch="' + esc(batch.batch) + '">Undo this import</button>' : '') + '<button role="menuitem" data-action="sec-delete" data-sec="' + esc(s.id) + '">Delete (if empty)</button></div>' : '') + '</div>' : '') +
      '</div></header>' +
      '<div class="cards">' + (x.cards.length ? x.cards.map((c) => cardHtml(c, admin)).join('') : '<p class="muted">No cards in this section yet. Select cards elsewhere and use "Move to".</p>') + '</div></section>';
  });
  const arch = archivedCards();
  if (arch.length) html += '<details class="archived"><summary>' + arch.length + ' archived card(s): their source is gone from the resume</summary><div class="cards">' + arch.map((c) => cardHtml(c, admin)).join('') + '</div></details>';
  html += '<div class="board-end" aria-hidden="true"></div></div>';
  return '<div id="focusbar" class="focusbar" role="navigation" aria-label="Sections"><div class="fb-main"><button class="btn small" data-action="sec-prev" aria-label="Previous section">←</button>' +
    '<div class="fb-title" aria-live="polite"><span class="fb-kicker">In focus</span><strong id="fb-name">' + esc(visible[0] ? visible[0].s.title : '') + '</strong><span id="fb-count" class="muted"></span></div>' +
    '<button class="btn small" data-action="sec-next" aria-label="Next section">→</button></div>' +
    '<div class="fb-side"><button class="btn small primary" data-action="next-work" title="Jump to the next answer that still needs work">Next to work on</button><button class="btn small" data-action="autofit" aria-pressed="' + S.ui.autofit + '" title="Scroll so that each section fits the screen">Auto-fit sections: ' + (S.ui.autofit ? 'on' : 'off') + '</button></div>' +
    '<ol class="rail" aria-label="Jump to a section">' + visible.map((x, i) => '<li><button data-action="jump" data-sec="' + esc(x.s.id) + '" aria-label="' + esc(x.s.title) + '" title="' + esc(x.s.title) + '"></button></li>').join('') + '</ol></div>' + html;
}
const byOrder = (a, b) => ((a.seq || 0) - (b.seq || 0)) || a.key.localeCompare(b.key);

// ---------- focus bar and auto-fit scrolling ----------
let scrollBound = false, snapTimer = null, lastY = 0, dir = 0, programmatic = false, pointerDown = false, progTimer = null;
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function offsetTop() {
  const h = document.querySelector('.topbar'), f = document.getElementById('focusbar');
  return (h ? h.getBoundingClientRect().height : 0) + (f ? f.getBoundingClientRect().height : 0) + 6;
}
function secEls() { return Array.prototype.slice.call(document.querySelectorAll('.board .sec')); }
function geometry() {
  const off = offsetTop(); const vh = window.innerHeight;
  return secEls().map((el) => { const r = el.getBoundingClientRect(); return { el, top: r.top, bottom: r.bottom, h: r.height, off, vh }; });
}
export function updateFocus() {
  const g = geometry(); if (!g.length) return;
  const off = g[0].off;
  let cur = g[0];
  for (const x of g) if (x.top <= off + 40) cur = x;
  const name = document.getElementById('fb-name'); if (!name) return;
  const title = cur.el.querySelector('h2').textContent;
  if (name.textContent !== title) name.textContent = title;
  const idx = g.indexOf(cur);
  const cnt = document.getElementById('fb-count'); if (cnt) cnt.textContent = 'Section ' + (idx + 1) + ' of ' + g.length;
  document.querySelectorAll('.rail button').forEach((b, i) => { b.classList.toggle('on', i === idx); b.setAttribute('aria-current', i === idx ? 'true' : 'false'); });
  document.documentElement.style.setProperty('--board-offset', off + 'px');
  return { cur, idx, g };
}
function scrollToY(y) {
  programmatic = true; clearTimeout(progTimer);
  window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
  progTimer = setTimeout(() => { programmatic = false; }, reduced() ? 120 : 700);
}
export function scrollToSection(i) {
  const g = geometry(); if (!g[i]) return;
  scrollToY(window.scrollY + g[i].top - g[i].off);
}
export function stepSection(delta) {
  const f = updateFocus(); if (!f) return;
  const i = Math.max(0, Math.min(f.g.length - 1, f.idx + delta));
  // If the current section is partly above the bar, "previous" first returns to its own top.
  if (delta < 0 && f.cur.top < f.cur.off - 30) return scrollToSection(f.idx);
  scrollToSection(i);
}
/** Snap rule: when the section above is >= 90% out of view, align the new section; going up, do the mirror image.
 * A section taller than the screen is only aligned at its top and then scrolls freely. */
function maybeSnap() {
  if (!S.ui.autofit || programmatic || pointerDown || UI.route !== 'board') return;
  const g = geometry(); if (g.length < 2) return;
  const off = g[0].off, vh = window.innerHeight;
  if (dir > 0) {
    // the first section whose top is on screen below the bar: if the one above it has almost left, bring it to the top
    for (let j = 1; j < g.length; j++) {
      const prev = g[j - 1], cur = g[j];
      if (cur.top > off + 24 && cur.top < vh - 40) {
        const prevVisible = Math.max(0, Math.min(prev.bottom, vh) - Math.max(prev.top, off));
        if (prevVisible <= prev.h * 0.1) scrollToY(window.scrollY + cur.top - off);
        return;
      }
    }
  } else if (dir < 0) {
    // going up: a section that starts above the bar, with the next one almost gone below, is shown whole if it fits
    for (let j = 0; j < g.length - 1; j++) {
      const cur = g[j], next = g[j + 1];
      if (cur.top < off - 24 && cur.bottom > off + 4) {
        const nextVisible = Math.max(0, Math.min(next.bottom, vh) - Math.max(next.top, off));
        if (nextVisible <= next.h * 0.1 && cur.h <= vh - off) scrollToY(window.scrollY + cur.top - off);
        return;
      }
    }
  }
}
function onScroll() {
  const y = window.scrollY; if (y !== lastY) dir = y > lastY ? 1 : -1; lastY = y;
  if (UI.route !== 'board') return;
  updateFocus();
  clearTimeout(snapTimer); snapTimer = setTimeout(maybeSnap, 160);
}
export function bindBoardScroll() {
  lastY = window.scrollY; dir = 0;
  if (scrollBound) return;
  scrollBound = true;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { if (UI.route === 'board') updateFocus(); });
  window.addEventListener('pointerdown', () => { pointerDown = true; }, { passive: true });
  const up = () => { if (pointerDown) { pointerDown = false; clearTimeout(snapTimer); snapTimer = setTimeout(maybeSnap, 160); } };
  window.addEventListener('pointerup', up, { passive: true }); window.addEventListener('pointercancel', up, { passive: true });
}
export function flashCard(id) {
  const el = document.querySelector('[data-card="' + CSS.escape(id) + '"]'); if (!el) return false;
  const off = offsetTop();
  window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - off - 12), behavior: 'auto' });
  el.classList.add('flash'); try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  setTimeout(() => el.classList.remove('flash'), 2200);
  return true;
}
