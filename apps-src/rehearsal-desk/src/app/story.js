// "My story" tab (admin only): a board like the question cards, but one section per company or project and
// cards that hold the facts to know by heart. The data lives in S.story, so it is saved, backed up and synced
// with everything else, and it is never part of the published app.
import { esc, norm, uid } from '../core/text.js';
import { templateFor, normaliseStory, stackList, storyStats, parseStoryImport, UNIT_FIELDS, PROJECT_FIELDS } from '../core/story.js';
import { scheduleReview, isDue } from '../core/practice.js';

const story = () => { S.story = normaliseStory(S.story); return S.story; };
/** Sample data is never stored, so the first edit starts a real workspace instead of losing the change. */
function ensureReal() { if (S.sample) S = blank(); story(); }

export const storyUnits = () => Object.values(story().units).sort((a, b) => (a.order || 0) - (b.order || 0));
export const storyCards = (unitId) => Object.values(story().cards).filter((c) => c.unit === unitId).sort((a, b) => (a.seq || 0) - (b.seq || 0));

// ---------- changes ----------
export function addUnit(kind, title) {
  ensureReal(); const st = story();
  const id = uid('u');
  st.units[id] = { id, kind: kind === 'project' ? 'project' : 'company', title: norm(title) || (kind === 'project' ? 'New project' : 'New company'), order: ++st.seq, createdAt: Date.now() };
  templateFor(kind).forEach((t) => { const cid = uid('sc'); st.cards[cid] = { id: cid, unit: id, title: t.title, hint: t.hint, hue: t.hue, body: '', seq: ++st.seq, status: 'draft', practice: null }; });
  save(); return id;
}
export function addStoryCard(unitId) {
  ensureReal(); const st = story(); const cid = uid('sc');
  st.cards[cid] = { id: cid, unit: unitId, title: 'New card', hint: '', hue: 'slate', body: '', seq: ++st.seq, status: 'draft', practice: null };
  save(); return cid;
}
export function removeUnit(id) { const st = story(); delete st.units[id]; Object.values(st.cards).forEach((c) => { if (c.unit === id) delete st.cards[c.id]; }); save(); }
export function removeStoryCard(id) { delete story().cards[id]; save(); }
export function moveUnit(id, dir) {
  const list = storyUnits(); const i = list.findIndex((u) => u.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const t = list[i].order; list[i].order = list[j].order; list[j].order = t; save();
}
export function setUnitField(id, f, v) { const u = story().units[id]; if (u) { u[f] = v; save(); } }
export function setStoryCardField(id, f, v) { const c = story().cards[id]; if (c) { c[f] = v; if (f === 'body') c.status = c.status === 'known' && norm(v) ? 'known' : 'draft'; save(); } }
export function toggleKnown(id) { const c = story().cards[id]; if (c) { c.status = c.status === 'known' ? 'draft' : 'known'; save(); } }
export function rateStoryCard(id, ok) { const c = story().cards[id]; if (!c) return; c.practice = scheduleReview(c.practice, ok, Date.now()); c.status = ok ? 'known' : 'draft'; save(); }
export function exportStoryJson() {
  const st = story();
  return JSON.stringify({ app: 'rehearsal-desk-story', units: storyUnits().map((u) => ({ kind: u.kind, title: u.title, fields: Object.fromEntries(UNIT_FIELDS.concat(PROJECT_FIELDS).filter(([k]) => u[k]).map(([k]) => [k, u[k]])), cards: storyCards(u.id).map((c) => ({ title: c.title, body: c.body, hue: c.hue })) })) }, null, 1);
}
/** Adds sections from a story file. A section with the same kind and title as one you already have is skipped. */
export function importStoryJson(text) {
  const units = parseStoryImport(text);
  ensureReal(); const st = story(); let added = 0, skipped = 0;
  units.forEach((u) => {
    if (storyUnits().some((x) => x.kind === u.kind && x.title.toLowerCase() === u.title.toLowerCase())) { skipped++; return; }
    const id = uid('u');
    st.units[id] = Object.assign({ id, kind: u.kind, title: u.title, order: ++st.seq, createdAt: Date.now() }, u.fields);
    u.cards.forEach((c) => { const cid = uid('sc'); st.cards[cid] = { id: cid, unit: id, title: c.title, hint: '', hue: c.hue || 'slate', body: c.body, seq: ++st.seq, status: 'draft', practice: null }; });
    added++;
  });
  save(); return { added, skipped };
}

// ---------- view ----------
function bodyHtml(text) {
  const lines = String(text || '').split('\n'); const out = []; let list = null;
  const gap = (s) => esc(s).replace(/\[add:([^\]]*)\]/g, '<mark class="gap">[add:$1]</mark>');
  lines.forEach((ln) => {
    const m = /^\s*[-*•]\s+(.*)$/.exec(ln);
    if (m) { if (!list) { list = []; out.push(list); } list.push(m[1]); }
    else { list = null; if (ln.trim()) out.push(ln); }
  });
  return out.map((x) => Array.isArray(x) ? '<ul>' + x.map((i) => '<li>' + gap(i) + '</li>').join('') + '</ul>' : '<p>' + gap(x) + '</p>').join('');
}
const shown = () => (UI.storyShown = UI.storyShown || new Set());
const storyMatches = (c) => {
  if (UI.storyFilter === 'learning' && c.status === 'known') return false;
  if (UI.storyFilter === 'known' && c.status !== 'known') return false;
  if (UI.storyFilter === 'gaps' && !(/\[add:/.test(c.body || '') || !norm(c.body))) return false;
  const q = norm(UI.storySearch).toLowerCase();
  return !q || (c.title + ' ' + c.body).toLowerCase().includes(q);
};

function storyCardHtml(c) {
  const editing = UI.storyEdit === c.id; const known = c.status === 'known';
  const covered = UI.storyCover && !shown().has(c.id) && !editing;
  const hue = c.hue || 'slate';
  const due = c.practice && isDue(c, Date.now()) ? '<span class="flag">Due for review</span>' : '';
  let body;
  if (editing) body = '<label class="field"><span class="sr">Card title</span><input data-sf="card.title" data-id="' + esc(c.id) + '" value="' + esc(c.title) + '" autocomplete="off"></label>' +
    '<label class="field"><span class="sr">What to know</span><textarea data-sf="card.body" data-id="' + esc(c.id) + '" rows="9" placeholder="' + esc(c.hint || 'Write what you want to know by heart. Start a line with - for a list.') + '">' + esc(c.body) + '</textarea></label>' +
    '<p class="hint">' + esc(c.hint || '') + ' Write [add: what is missing] where you still need to find a fact.</p>';
  else if (covered) body = '<h3 class="q">' + esc(c.title) + '</h3><button class="btn small reveal" data-action="st-reveal" data-id="' + esc(c.id) + '">Say it from memory, then reveal</button>';
  else body = '<h3 class="q">' + esc(c.title) + '</h3><div class="a story-a">' + (norm(c.body) ? bodyHtml(c.body) : '<span class="muted">' + esc(c.hint || 'Nothing written yet.') + '</span>') + '</div>';
  const actions = editing
    ? '<button class="btn small primary" data-action="st-done">Done</button><button class="btn small" data-action="st-del-card" data-id="' + esc(c.id) + '">Delete card</button>'
    : (UI.storyCover && shown().has(c.id) ? '<button class="btn small" data-action="st-rate" data-ok="1" data-id="' + esc(c.id) + '">I knew it</button><button class="btn small" data-action="st-rate" data-ok="0" data-id="' + esc(c.id) + '">Missed</button>' : '') +
      '<button class="btn small" data-action="st-edit" data-id="' + esc(c.id) + '">Edit</button><button class="btn small' + (known ? ' on' : '') + '" data-action="st-known" data-id="' + esc(c.id) + '" aria-pressed="' + known + '">' + (known ? 'Known by heart' : 'Mark as known') + '</button>';
  return '<article class="card hue-' + esc(hue) + (known ? ' perfected' : '') + '" data-card="' + esc(c.id) + '" tabindex="-1" aria-label="' + esc(c.title) + '"><div class="card-top"><span class="cat">' + esc((story().units[c.unit] || {}).kind === 'project' ? 'Project' : 'Company') + '</span>' +
    (known ? '<span class="badge-done">Known</span>' : '') + due + '</div>' + body + '<div class="card-actions">' + actions + '</div></article>';
}

function unitHeadHtml(u, i, all) {
  const st = storyStats(story(), u.id);
  const facts = UNIT_FIELDS.filter(([k]) => k !== 'stack' && norm(u[k])).map(([k, l]) => '<div><dt>' + esc(l) + '</dt><dd>' + esc(u[k]) + '</dd></div>').join('') + (u.kind === 'project' && norm(u.company) ? '<div><dt>Worked on at</dt><dd>' + esc(u.company) + '</dd></div>' : '');
  const chips = stackList(u.stack).map((x) => '<span class="chip">' + esc(x) + '</span>').join('');
  const editing = UI.storyUnit === u.id;
  const form = editing ? '<div class="unit-form"><label class="field"><span>Name</span><input data-sf="unit.title" data-id="' + esc(u.id) + '" value="' + esc(u.title) + '" autocomplete="off"></label>' +
    UNIT_FIELDS.concat(u.kind === 'project' ? PROJECT_FIELDS : []).map(([k, l]) => '<label class="field"><span>' + esc(l) + '</span><input data-sf="unit.' + k + '" data-id="' + esc(u.id) + '" value="' + esc(u[k] || '') + '" autocomplete="off"></label>').join('') +
    '<div class="row"><button class="btn small primary" data-action="st-unit-done">Done</button></div></div>' : '';
  return '<header class="sec-head"><div><h2 id="h-' + i + '">' + esc(u.title) + '</h2><p class="sub"><span class="chip">' + (u.kind === 'project' ? 'Project' : 'Company') + '</span>' + st.known + ' of ' + st.total + ' known by heart' + (st.gaps ? ', ' + st.gaps + ' with gaps to fill' : '') + '</p>' +
    (facts ? '<dl class="facts-strip">' + facts + '</dl>' : '') + (chips ? '<div class="stack">' + chips + '</div>' : '') + form + '</div>' +
    '<div class="sec-side"><button class="btn small" data-action="st-unit-edit" data-id="' + esc(u.id) + '">Edit details</button><button class="btn small" data-action="st-add-card" data-id="' + esc(u.id) + '">Add card</button>' +
    '<button class="btn small" data-action="st-up" data-id="' + esc(u.id) + '" aria-label="Move ' + esc(u.title) + ' up"' + (i === 0 ? ' disabled' : '') + '>Up</button><button class="btn small" data-action="st-down" data-id="' + esc(u.id) + '" aria-label="Move ' + esc(u.title) + ' down"' + (i === all - 1 ? ' disabled' : '') + '>Down</button>' +
    '<button class="btn small" data-action="st-del-unit" data-id="' + esc(u.id) + '">Delete</button></div></header>';
}

export function renderStory() {
  if (!isAdmin()) return '<div class="empty"><strong>This tab is for the owner.</strong></div>';
  const units = storyUnits(); const st = story(); const all = storyStats(st);
  const filters = [['all', 'All'], ['learning', 'Still learning'], ['known', 'Known by heart'], ['gaps', 'Has gaps to fill']];
  const vis = units.map((u) => ({ u, cards: storyCards(u.id).filter(storyMatches) })).filter((x) => x.cards.length || (!UI.storySearch && UI.storyFilter === 'all'));
  let html = '<div class="board story">' +
    '<div class="board-tools"><div class="seg" role="group" aria-label="Show">' + filters.map(([v, l]) => '<button class="seg-btn" data-action="st-filter" data-v="' + v + '" aria-pressed="' + (UI.storyFilter === v) + '">' + l + '</button>').join('') + '</div>' +
    '<label class="search"><span class="sr">Search my story</span><input type="search" id="story-search" placeholder="Search companies, projects and facts" value="' + esc(UI.storySearch) + '"></label>' +
    '<span class="muted">' + all.known + ' of ' + all.total + ' known by heart</span></div>' +
    '<div class="admin-bar" role="region" aria-label="My story tools"><span class="pill">Admin</span>' +
    '<button class="btn small primary" data-action="st-add-unit" data-kind="company">Add a company</button><button class="btn small primary" data-action="st-add-unit" data-kind="project">Add a project</button>' +
    '<button class="btn small" data-action="st-cover" aria-pressed="' + !!UI.storyCover + '" title="Hide the answers so you can say them from memory first">Recall mode: ' + (UI.storyCover ? 'on' : 'off') + '</button>' +
    '<button class="btn small" data-action="st-export">Download my story</button><label class="btn small file">Import a story file<input type="file" id="story-file" accept=".json,application/json" hidden></label></div>' +
    (UI.notice ? '<p class="status" role="status">' + esc(UI.notice) + '</p>' : '');
  if (!units.length) html += '<div class="empty"><strong>Nothing here yet.</strong><p>Add a company or a project, or import a story file. Each one gets cards for the facts you should know by heart: role, team, structure, tech stack, hard parts and a 30-second pitch. This tab is saved only in your browser and your private sync, never in the published app.</p></div>';
  else if (!vis.length) html += '<div class="empty"><strong>No cards match.</strong><p>Change the filter or the search.</p></div>';
  vis.forEach((x, i) => {
    html += '<section class="sec" id="' + esc(x.u.id.replace(/[^a-z0-9]/gi, '_')) + '" data-sec="' + esc(x.u.id) + '" aria-labelledby="h-' + i + '">' + unitHeadHtml(x.u, i, vis.length) +
      '<div class="cards">' + (x.cards.length ? x.cards.map(storyCardHtml).join('') : '<p class="muted">No cards in this section. Use Add card.</p>') + '</div></section>';
  });
  html += '<div class="board-end" aria-hidden="true"></div></div>';
  return focusbarHtml(vis.map((x) => ({ id: x.u.id, title: x.u.title })), false) + html;
}

// ---------- events ----------
function rerenderStory() { const y = window.scrollY; $('#main').innerHTML = renderStory(); renderNav(); window.scrollTo(0, y); updateFocus(); }
const download = (name, text) => { const b = new Blob([text], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); };

/** Returns true when it handled the action. */
export function storyAction(a, t) {
  if (a.indexOf('st-') !== 0) return false;
  const id = t.dataset.id;
  switch (a) {
    case 'st-filter': UI.storyFilter = t.dataset.v; rerenderStory(); break;
    case 'st-cover': UI.storyCover = !UI.storyCover; shown().clear(); rerenderStory(); break;
    case 'st-reveal': shown().add(id); rerenderStory(); break;
    case 'st-rate': rateStoryCard(id, t.dataset.ok === '1'); shown().delete(id); rerenderStory(); break;
    case 'st-edit': UI.storyEdit = id; rerenderStory(); { const f = $('[data-sf="card.body"]'); if (f) f.focus(); } break;
    case 'st-done': UI.storyEdit = null; flush(); rerenderStory(); break;
    case 'st-known': toggleKnown(id); rerenderStory(); break;
    case 'st-del-card': askDialog('Delete this card?', { text: 'This cannot be undone.', ok: 'Delete' }, () => { removeStoryCard(id); UI.storyEdit = null; rerenderStory(); }); break;
    case 'st-add-card': { const cid = addStoryCard(id); UI.storyEdit = cid; rerenderStory(); const f = $('[data-sf="card.title"]'); if (f) { f.focus(); f.select(); } break; }
    case 'st-unit-edit': UI.storyUnit = id; rerenderStory(); break;
    case 'st-unit-done': UI.storyUnit = null; flush(); rerenderStory(); break;
    case 'st-up': moveUnit(id, -1); rerenderStory(); break;
    case 'st-down': moveUnit(id, 1); rerenderStory(); break;
    case 'st-del-unit': { const u = story().units[id]; askDialog('Delete ' + (u ? u.title : 'this section') + '?', { text: 'Its cards are deleted too. Download your story first if you may want it back.', ok: 'Delete' }, () => { removeUnit(id); rerenderStory(); }); break; }
    case 'st-add-unit': { const kind = t.dataset.kind; askDialog(kind === 'project' ? 'Name the project' : 'Name the company', { value: '', ok: 'Create' }, (v) => { const uid2 = addUnit(kind, v); UI.storyUnit = uid2; UI.scrollSec = uid2; render(); const el = document.getElementById(uid2.replace(/[^a-z0-9]/gi, '_')); if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offsetTopSafe(), behavior: 'auto' }); }); break; }
    case 'st-export': download('rehearsal-desk-story.json', exportStoryJson()); break;
    default: return false;
  }
  return true;
}
export function storyInput(el) {
  const [kind, f] = el.dataset.sf.split('.');
  if (kind === 'card') setStoryCardField(el.dataset.id, f, el.value);
  else if (kind === 'unit') setUnitField(el.dataset.id, f, el.value);
}
export function storyFile(file) {
  file.text().then((text) => {
    try { const r = importStoryJson(text); UI.notice = 'Imported ' + r.added + ' section(s)' + (r.skipped ? ', skipped ' + r.skipped + ' you already have' : '') + '.'; }
    catch (e) { UI.notice = e.message; }
    go('#/story'); render();
  });
}
