// State and persistence. One localStorage key holds everything, so the owner sync can copy it as a single document.
// Sample data lives in memory only: it is never written to storage, so it can never overwrite real data.
import { uid, slug, norm, jaccard, hash } from '../core/text.js';
import { parseResume } from '../core/parse.js';
import { analyseJd, matchJd } from '../core/jd.js';
import { checkResume } from '../core/ats.js';
import { buildResumeCards, buildJdCards, categorise, scaffoldFor } from '../core/questions.js';
import { extractQA } from '../core/extract.js';
import { scheduleReview, isDue, dueCount, priorityCards } from '../core/practice.js';
import { sampleResume, SAMPLE_JD } from '../sample.js';

const KEY = 'rehearsal-desk-v1';
const VERSION = 1;
const MAX_HISTORY = 5;
let S = null;
const UI = { route: 'home', focusCard: null, ret: null, notice: '', resumeTab: 'content', filter: 'all', search: '', selected: new Set(), openMenu: null, practice: null };

const defaultUi = () => ({ template: 'classic', paper: 'a4', autofit: true, include: { projects: true, personal: true, certifications: true, education: true } });

function blank() {
  return { v: VERSION, sample: false, seq: 0, lastBackup: 0, resumeText: '', resume: null, resumeAt: 0, jds: {}, activeJd: null, sections: {}, cards: {}, batches: [], ui: defaultUi() };
}

function migrate(s) {
  const out = Object.assign(blank(), s || {});
  out.ui = Object.assign(defaultUi(), out.ui || {}); out.ui.include = Object.assign(defaultUi().include, (s && s.ui && s.ui.include) || {});
  out.jds = out.jds || {}; out.sections = out.sections || {}; out.cards = out.cards || {}; out.batches = out.batches || [];
  out.seq = Math.max(out.seq || 0, ...Object.values(out.cards).map((c) => c.seq || 0), 0);
  out.v = VERSION;
  return out;
}

export function isAdmin() { try { return !!(window.appChrome && window.appChrome.isOwner()); } catch (e) { return false; } }

// ---------- persistence ----------
let saveTimer = null;
function persistNow() {
  if (!S || S.sample) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: work in memory */ }
}
export function save() { if (!S || S.sample) return; clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 250); }
export function flush() { clearTimeout(saveTimer); persistNow(); }

export function load(now) {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (raw) { try { S = migrate(JSON.parse(raw)); return S; } catch (e) { /* fall through to the sample */ } }
  S = sampleState(now);
  return S;
}
export function reloadFromStorage() { S = null; return load(); }
export const state = () => S;
export const ui = () => UI;

// ---------- sample ----------
export function sampleState(now) {
  const s = blank();
  s.sample = true;
  s.resumeText = sampleResume(now);
  s.resume = parseResume(s.resumeText, now);
  s.resumeAt = Date.now();
  const id = 'current';
  const analysis = analyseJd(SAMPLE_JD);
  s.jds[id] = { id, text: SAMPLE_JD, analysis, company: analysis.company, title: analysis.title, hr: { name: '', email: (analysis.emails || [])[0] || '', phone: '' }, link: '', status: 'saved', notes: '', createdAt: Date.now(), analysedAt: Date.now() };
  s.activeJd = id;
  S = s;
  applyResumeCards();
  applyJdCards(id);
  return s;
}
export function useSampleAgain(now) { UI.selected.clear(); S = sampleState(now); return S; }

// ---------- merging generated cards ----------
function ensureSection(def, extra) {
  const id = 'sec:' + def.key;
  const cur = S.sections[id];
  if (!cur) S.sections[id] = Object.assign({ id, key: def.key, title: def.title, sub: def.sub || '', kind: def.kind, order: def.order, createdAt: Date.now() }, extra || {});
  else { if (!cur.renamed) cur.title = def.title; cur.sub = def.sub || ''; if (!cur.moved) cur.order = def.order; }
  return id;
}

function mergeDrafts(drafts, source, jdId) {
  const existing = Object.values(S.cards).filter((c) => c.source === source && (jdId ? c.jdId === jdId : !c.jdId));
  const byKey = new Map(existing.map((c) => [c.key, c]));
  const seen = new Set();
  const added = [], archived = [], kept = [];
  for (const d of drafts) {
    const secId = ensureSection(d.sec);
    const cur = byKey.get(d.key);
    seen.add(d.key);
    if (cur) {
      cur.archived = false;
      const unedited = cur.a === cur.gen || !norm(cur.a);
      cur.q = d.q; cur.cat = d.cat; cur.tid = d.tid; cur.seconds = d.seconds;
      if (!cur.seq) cur.seq = ++S.seq;
      if (unedited) cur.a = d.a;
      cur.gen = d.a;
      if (!cur.secMoved) cur.secId = secId;
      kept.push(cur.id);
    } else {
      const id = uid('c');
      S.cards[id] = { id, key: d.key, seq: ++S.seq, source, jdId: jdId || null, secId, cat: d.cat, tid: d.tid, q: d.q, a: d.a, gen: d.a, seconds: d.seconds, status: 'draft', history: [], archived: false, askedCount: 1, practice: null, createdAt: Date.now() };
      added.push(id);
    }
  }
  existing.forEach((c) => { if (!seen.has(c.key) && !c.archived) { c.archived = true; archived.push(c.id); } });
  return { added, archived, kept };
}

export function applyResumeCards() {
  if (!S.resume) return { added: [], archived: [], kept: [] };
  return mergeDrafts(buildResumeCards(S.resume), 'resume', null);
}
export function applyJdCards(jdId) {
  const jd = S.jds[jdId];
  if (!jd || !jd.analysis || !S.resume) return { added: [], archived: [], kept: [] };
  const match = matchJd(jd.analysis, S.resume);
  return mergeDrafts(buildJdCards(jd.analysis, S.resume, match, jdId), 'jd', jdId);
}

// ---------- analyse ----------
/** Runs the whole process on pasted text. Keeps the answers the user already wrote for unchanged facts. */
export function analyse({ resumeText, jdText, now }) {
  const isSampleText = resumeText === sampleResume(now) && (jdText || '') === SAMPLE_JD;
  if (S.sample && !isSampleText) { S = blank(); }
  if (S.sample && isSampleText) return { sample: true };
  const out = {};
  if (norm(resumeText)) {
    S.resumeText = resumeText; S.resume = parseResume(resumeText, now); S.resumeAt = Date.now();
    out.resume = applyResumeCards();
  }
  if (norm(jdText)) {
    const id = isAdmin() && S.activeJd && S.activeJd !== 'current' && S.jds[S.activeJd] && S.jds[S.activeJd].text === jdText ? S.activeJd : (S.activeJd === 'current' || !isAdmin() ? 'current' : newJdId());
    out.jd = analyseJdInto(id, jdText);
    S.activeJd = id;
  }
  S.sample = false;
  save();
  return out;
}

function newJdId() { return 'jd' + Date.now().toString(36); }

export function analyseJdInto(id, text) {
  const analysis = analyseJd(text);
  const cur = S.jds[id] || { id, hr: { name: '', email: '', phone: '' }, link: '', status: 'saved', notes: '', createdAt: Date.now() };
  cur.text = text; cur.analysis = analysis; cur.analysedAt = Date.now();
  if (!cur.company || cur.autoCompany) { cur.company = analysis.company; cur.autoCompany = true; }
  if (!cur.title || cur.autoTitle) { cur.title = analysis.title; cur.autoTitle = true; }
  if (!cur.hr.email && analysis.emails[0]) cur.hr.email = analysis.emails[0];
  if (!cur.hr.phone && analysis.phones[0]) cur.hr.phone = analysis.phones[0];
  S.jds[id] = cur;
  return applyJdCards(id);
}

// ---------- resume editing ----------
export function updateResume(mutator) { mutator(S.resume); save(); }
export function saveResumeChanges() {
  const res = applyResumeCards();
  Object.keys(S.jds).forEach((id) => { if (S.jds[id].analysis) applyJdCards(id); });
  S.resumeAt = Date.now(); save();
  return res;
}
export function checks() { return S.resume ? checkResume(S.resume) : null; }
export function matchFor(jdId) { const jd = S.jds[jdId]; return jd && jd.analysis && S.resume ? matchJd(jd.analysis, S.resume) : null; }

// ---------- cards ----------
export const getCard = (id) => S.cards[id];
export function setAnswer(id, text) { const c = S.cards[id]; if (!c) return; c.a = text; save(); }
export function commitVersion(id, previous) {
  const c = S.cards[id]; if (!c) return;
  if (previous !== undefined && norm(previous) && previous !== c.a && !(c.history[0] && c.history[0].a === previous)) {
    c.history.unshift({ a: previous, at: Date.now() });
    c.history = c.history.slice(0, MAX_HISTORY);
    save();
  }
}
export function restoreVersion(id, i) { const c = S.cards[id]; if (!c || !c.history[i]) return; const cur = c.a; c.a = c.history[i].a; c.history.splice(i, 1); commitVersion(id, cur); save(); }
export function resetToStarter(id) { const c = S.cards[id]; if (!c) return; const cur = c.a; c.a = c.gen || ''; commitVersion(id, cur); c.status = 'draft'; save(); }
export function togglePerfected(id) { const c = S.cards[id]; if (!c) return; c.status = c.status === 'perfected' ? 'draft' : 'perfected'; c.perfectedAt = c.status === 'perfected' ? Date.now() : null; save(); return c.status; }
export function rateCard(id, ok, spoken) {
  const c = S.cards[id]; if (!c) return;
  c.practice = Object.assign(scheduleReview(c.practice, ok, Date.now()), spoken ? { spoken } : {});
  save();
}
export function deleteCard(id) { delete S.cards[id]; UI.selected.delete(id); save(); }

// ---------- reading order, readiness and what to do next ----------
export function orderedCards() {
  return sectionsInOrder().flatMap((x) => x.cards.slice().sort((a, b) => ((a.seq || 0) - (b.seq || 0)) || a.key.localeCompare(b.key)));
}
export function neighbourCard(id, delta) {
  const list = orderedCards(); const i = list.findIndex((c) => c.id === id);
  return i < 0 ? null : list[i + delta] || null;
}
const hasGaps = (c) => !norm(c.a) || /\[add:/.test(c.a);
/** The next card after `id` (wrapping) that is not perfected, preferring ones with gaps to fill. */
export function nextToWork(id) {
  const list = orderedCards(); if (!list.length) return null;
  const start = Math.max(0, list.findIndex((c) => c.id === id) + 1);
  const rotated = list.slice(start).concat(list.slice(0, start)).filter((c) => c.id !== id);
  return rotated.find((c) => c.status !== 'perfected' && hasGaps(c)) || rotated.find((c) => c.status !== 'perfected') || null;
}
export function readiness() {
  const cards = orderedCards();
  const perfected = cards.filter((c) => c.status === 'perfected').length;
  const gaps = cards.filter((c) => c.status !== 'perfected' && hasGaps(c)).length;
  const due = dueCount(cards.filter((c) => c.status === 'perfected' || norm(c.a) && !hasGaps(c)), Date.now());
  const sections = sectionsInOrder().map((x) => ({ id: x.s.id, title: x.s.title, total: x.cards.length, perfected: x.cards.filter((c) => c.status === 'perfected').length }));
  return { total: cards.length, perfected, gaps, due, pct: cards.length ? Math.round(perfected / cards.length * 100) : 0, sections, priority: priorityCards(cards, 5) };
}
export function practiceDeck(scope) {
  const all = orderedCards();
  const now = Date.now();
  const ready = (c) => norm(c.a) && !/\[add:/.test(c.a);
  return all.filter((c) => scope === 'all' ? true : scope === 'draft' ? c.status !== 'perfected' : scope === 'perfected' ? c.status === 'perfected' : scope === 'due' ? (ready(c) && isDue(c, now)) : c.secId === scope);
}
export function addSkill(label) {
  if (!S.resume) return false;
  const have = (S.resume.skills || []).some((x) => x.toLowerCase() === String(label).toLowerCase());
  if (have) return false;
  S.resume.skills = (S.resume.skills || []).concat(label); save(); return true;
}
export function markBackup() { S.lastBackup = Date.now(); save(); }
export function applyRewrite(ref, text) {
  const list = ref.kind === 'job' ? S.resume.experience : ref.kind === 'project' ? S.resume.projects : S.resume.personal;
  const item = list && list[ref.i]; if (!item || item.bullets[ref.line] === undefined) return false;
  item.bullets[ref.line] = text; save(); return true;
}

// ---------- sections ----------
export function sectionsInOrder() {
  const adminView = isAdmin();
  const list = Object.values(S.sections).filter((s) => {
    if (s.kind === 'jd') return s.key === 'jd:' + S.activeJd;
    return true;
  });
  const withCards = list.map((s) => ({ s, cards: cardsIn(s.id) })).filter((x) => x.cards.length || (adminView && s_custom(x.s)));
  withCards.sort((a, b) => (a.s.order - b.s.order) || (a.s.createdAt - b.s.createdAt));
  return withCards;
}
const s_custom = (s) => s.kind === 'collected' || s.kind === 'custom';
export function cardsIn(secId) {
  return Object.values(S.cards).filter((c) => c.secId === secId && !c.archived && (c.source !== 'jd' || c.jdId === S.activeJd));
}
export function archivedCards() { return Object.values(S.cards).filter((c) => c.archived); }
export function createSection(title, label) {
  const id = 'sec:custom:' + uid('s');
  const maxOrder = Math.max(...Object.values(S.sections).map((s) => s.order), 100);
  S.sections[id] = { id, key: id.slice(4), title: norm(title) || 'New section', sub: label || '', kind: 'custom', order: maxOrder + 1, createdAt: Date.now(), renamed: true, moved: true };
  save(); return id;
}
export function renameSection(id, title) { const s = S.sections[id]; if (!s) return; s.title = norm(title) || s.title; s.renamed = true; save(); }
export function moveSection(id, dir) {
  const list = sectionsInOrder().map((x) => x.s);
  const i = list.findIndex((s) => s.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i], b = list[j]; const t = a.order; a.order = b.order; b.order = t === b.order ? t + dir * 0.5 : t;
  a.moved = b.moved = true; save();
}
export function deleteSection(id) {
  const s = S.sections[id]; if (!s) return false;
  if (cardsIn(id).length) return false;
  delete S.sections[id]; save(); return true;
}
export function moveCards(ids, secId) {
  ids.forEach((id) => { const c = S.cards[id]; if (c) { c.secId = secId; c.secMoved = true; c.archived = false; } });
  UI.selected.clear(); save();
}

// ---------- collected questions (admin) ----------
export function dateLabel(d) { const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear(); }
export function importCollected(text, label, now) {
  const items = extractQA(text);
  if (!items.length) return null;
  const when = now || new Date();
  const base = 'Added ' + dateLabel(when);
  const sameDay = Object.values(S.sections).filter((s) => s.kind === 'collected' && s.title.startsWith(base)).length;
  const batch = uid('b');
  const secId = 'sec:col:' + batch;
  const minOrder = Math.min(...Object.values(S.sections).filter((s) => s.kind === 'collected').map((s) => s.order), 500);
  S.sections[secId] = { id: secId, key: 'col:' + batch, title: base + (sameDay ? ' (' + (sameDay + 1) + ')' : ''), sub: norm(label || ''), kind: 'collected', order: minOrder - 1, createdAt: Date.now(), batch, renamed: true, moved: true };
  const existing = Object.values(S.cards).filter((c) => !c.archived);
  let dupes = 0;
  items.forEach((it, i) => {
    const topic = categorise(it.q);
    const sim = existing.map((c) => ({ c, j: jaccard(c.q, it.q) })).sort((a, b) => b.j - a.j)[0];
    const similar = sim && sim.j >= 0.6 ? sim.c : null;
    if (similar) { similar.askedCount = (similar.askedCount || 1) + 1; dupes++; }
    const id = uid('c');
    const a = it.a || scaffoldFor(topic);
    S.cards[id] = { id, key: 'col:' + batch + ':' + i, seq: ++S.seq, source: 'collected', jdId: null, secId, cat: 'collected', tid: null, topic, q: it.q, a, gen: it.a ? '' : a, seconds: 90, status: 'draft', history: [], archived: false, askedCount: 1, practice: null, createdAt: Date.now(), lowConf: it.confidence === 'low', hasAnswer: !!it.a, similarTo: similar ? similar.id : null, batch };
  });
  S.batches.unshift({ batch, secId, at: Date.now(), label: norm(label || ''), count: items.length });
  save();
  return { secId, count: items.length, dupes, batch };
}
export function undoImport(batch) {
  const b = S.batches.find((x) => x.batch === batch); if (!b) return 0;
  let n = 0;
  Object.values(S.cards).forEach((c) => { if (c.batch === batch && c.secId === b.secId) { if (c.similarTo && S.cards[c.similarTo] && S.cards[c.similarTo].askedCount > 1) S.cards[c.similarTo].askedCount--; delete S.cards[c.id]; n++; } });
  if (!cardsIn(b.secId).length) delete S.sections[b.secId];
  S.batches = S.batches.filter((x) => x.batch !== batch); save();
  return n;
}
export function mergeCardInto(id) { // a flagged duplicate: remove it, give its answer to the original if the original has none
  const c = S.cards[id]; if (!c) return; const o = c.similarTo && S.cards[c.similarTo];
  if (o && c.hasAnswer && !norm(o.a)) { o.a = c.a; }
  deleteCard(id);
}
export function splitCard(id) { // break a collected card into two at the first blank line of its answer
  const c = S.cards[id]; if (!c) return null;
  const parts = c.a.split(/\n\s*\n/);
  if (parts.length < 2) return null;
  const q2 = parts[1].split('\n')[0];
  c.a = parts[0].trim();
  const nid = uid('c');
  S.cards[nid] = Object.assign({}, c, { id: nid, seq: (c.seq || 0) + 0.5, key: c.key + '-s', q: q2, a: parts.slice(1).join('\n\n').split('\n').slice(1).join('\n').trim() || scaffoldFor(c.topic), gen: '', history: [], lowConf: true, status: 'draft' });
  save(); return nid;
}
export function mergeNext(id) { // join a collected card with the next card in the same section
  const c = S.cards[id]; if (!c) return false;
  const list = cardsIn(c.secId).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const i = list.findIndex((x) => x.id === id); const n = list[i + 1];
  if (!n) return false;
  c.q = c.q + ' ' + n.q; c.a = [c.a, n.a].filter(Boolean).join('\n'); c.lowConf = false;
  delete S.cards[n.id]; save(); return true;
}

// ---------- JD library (admin) ----------
export function jdList() { return Object.values(S.jds).filter((j) => j.id !== 'current' || isAdmin() === false || true).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)); }
export function saveJdToLibrary(fields) {
  const cur = S.jds[S.activeJd];
  const id = cur && cur.id !== 'current' ? cur.id : newJdId();
  const base = cur || {};
  const jd = Object.assign({ hr: { name: '', email: '', phone: '' }, status: 'saved', notes: '', link: '', createdAt: Date.now() }, base, fields, { id });
  jd.hr = Object.assign({ name: '', email: '', phone: '' }, base.hr, fields.hr || {});
  jd.updatedAt = Date.now(); jd.autoCompany = false; jd.autoTitle = false;
  const wasCurrent = cur && cur.id === 'current';
  S.jds[id] = jd;
  if (wasCurrent) { Object.values(S.cards).forEach((c) => { if (c.jdId === 'current') { c.jdId = id; c.key = c.key.replace('jd:current', 'jd:' + id); } }); Object.values(S.sections).forEach((s) => { if (s.key === 'jd:current') { delete S.sections[s.id]; s.id = 'sec:jd:' + id; s.key = 'jd:' + id; S.sections[s.id] = s; } }); Object.values(S.cards).forEach((c) => { if (c.jdId === id) c.secId = 'sec:jd:' + id; }); delete S.jds.current; }
  S.activeJd = id; S.sample = false; save();
  return id;
}
export function newJdDraft() { const id = newJdId(); S.jds[id] = { id, text: '', analysis: null, company: '', title: '', hr: { name: '', email: '', phone: '' }, link: '', status: 'saved', notes: '', createdAt: Date.now() }; S.activeJd = id; S.sample = false; save(); return id; }
export function updateJdFields(id, fields) { const j = S.jds[id]; if (!j) return; const { hr, ...rest } = fields; Object.assign(j, rest); if (hr) j.hr = Object.assign({}, j.hr, hr); j.updatedAt = Date.now(); if ('company' in fields) j.autoCompany = false; if ('title' in fields) j.autoTitle = false; save(); }
export function setActiveJd(id) { if (S.jds[id]) { S.activeJd = id; save(); } }
export function deleteJd(id) {
  delete S.jds[id];
  Object.values(S.cards).forEach((c) => { if (c.jdId === id) delete S.cards[c.id]; });
  Object.values(S.sections).forEach((s) => { if (s.key === 'jd:' + id) delete S.sections[s.id]; });
  if (S.activeJd === id) S.activeJd = Object.keys(S.jds)[0] || null;
  save();
}
export function rerunJd(id) { const j = S.jds[id]; if (!j || !norm(j.text)) return null; const r = analyseJdInto(id, j.text); j.updatedAt = Date.now(); save(); return r; }

export function setUi(patch) { Object.assign(S.ui, patch); if (!S.sample) save(); }
export function resetAll() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } UI.selected.clear(); S = sampleState(); return S; }
export function exportJson() { return JSON.stringify(Object.assign({ app: 'rehearsal-desk' }, S), null, 1); }
export function importJson(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'rehearsal-desk' || typeof d.cards !== 'object') throw new Error('bad');
  delete d.app; S = migrate(d); S.sample = false; flush(); return S;
}
export const helpers = { slug, hash };
