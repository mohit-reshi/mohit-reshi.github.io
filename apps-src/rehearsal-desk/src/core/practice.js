// Practice helpers: key facts in an answer, fading an answer for recall drills, spaced review dates,
// "what to prepare first" ranking, mock interview picking, and the resume facts that fit a card.
import { norm, hash, trunc } from './text.js';
import { skillsIn, skillLabel } from './jd.js';
import { sayBullet, topBullets } from './questions.js';

const DAY = 864e5;
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];

/** Numbers with units, tools and proper names: the facts a good answer should hit. */
export function keyFacts(text) {
  const t = String(text || '').replace(/\[add:[^\]]*\]/gi, ' ');
  const out = [];
  const add = (s) => { s = norm(s); if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s); };
  (t.match(/[£$€₹]?\d[\d,.]*\s?(?:%|k|m|bn|x|hours?|days?|weeks?|months?|years?|stores?|people|users?|managers?|reports?|tables?|minutes?)?/gi) || []).forEach((m) => { if (/\d/.test(m) && m.trim().length > 0) add(m); });
  skillsIn(t).forEach((id) => add(skillLabel(id)));
  (t.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g) || []).forEach((m) => { if (!/^(?:I|My|The|At|Before|Most|After|Since)\b/.test(m)) add(m); });
  return out.slice(0, 8);
}

/** Splits an answer into words that can be hidden. level: 0 full, 1 cues, 2 first words, 3 blank. */
export function fadeTokens(text, level) {
  const facts = keyFacts(text).map((f) => f.toLowerCase());
  const parts = String(text || '').split(/(\s+)/);
  let sentenceStart = true; let wi = 0;
  return parts.map((p) => {
    if (!p) return { t: p, hide: false };
    if (/^\s+$/.test(p)) return { t: p, hide: false, space: true };
    const bare = p.replace(/^[^\w£$€₹[]+|[^\w%\]]+$/g, '').toLowerCase();
    const isGap = /^\[add:|\]$/.test(p) || /^\[add/.test(p);
    const isFact = facts.some((f) => f.split(/\s+/).includes(bare) || bare === f) || /\d/.test(p);
    const first = sentenceStart; sentenceStart = /[.!?]["')]*$/.test(p);
    const h = parseInt(hash(String(wi++) + p), 36) % 100;
    let hide = false;
    if (level === 1) hide = !isFact && !isGap && !first && h < 45;
    else if (level === 2) hide = !isFact && !isGap && !first;
    else if (level >= 3) hide = true;
    return { t: p, hide };
  });
}

// ---------- spaced review ----------
export function scheduleReview(prev, ok, now) {
  now = now || Date.now();
  const box = ok ? Math.min(((prev && prev.box) || 0) + 1, INTERVAL_DAYS.length - 1) : 0;
  return { n: ((prev && prev.n) || 0) + 1, last: now, ok: !!ok, box, due: now + (ok ? INTERVAL_DAYS[box] * DAY : 10 * 60000) };
}
export function isDue(card, now) {
  now = now || Date.now();
  if (!card.practice) return true;
  return now >= (card.practice.due !== undefined ? card.practice.due : card.practice.last + 7 * DAY);
}
export function dueCount(cards, now) { return cards.filter((c) => norm(c.a) && isDue(c, now)).length; }

// ---------- what to prepare first ----------
const FIRST = ['intro:yourself', 'gen:proud', 'intro:looking', 'gen:weakness', 'gen:strengths'];
export function priorityCards(cards, max) {
  const open = cards.filter((c) => c.status !== 'perfected' && !c.archived);
  const score = (c) => {
    const i = FIRST.indexOf(c.key); if (i >= 0) return 100 - i;
    if (c.source === 'jd' && /why-company|why-role/.test(c.key)) return 90;
    if (c.source === 'jd' && /skill-/.test(c.key) && c.tid === 'skillGap') return 85;
    if (c.tid === 'achievement' && c.cat === 'role') return 70;
    if (c.tid === 'roleOverview') return 60;
    if (c.tid === 'projEnd') return 55;
    if (c.cat === 'story') return 50;
    return 10;
  };
  return open.map((c) => ({ c, s: score(c) })).filter((x) => x.s >= 50).sort((a, b) => b.s - a.s || (a.c.seq || 0) - (b.c.seq || 0)).slice(0, max || 6).map((x) => x.c);
}

// ---------- mock interview ----------
export function buildMock(cards, minutes, rand) {
  rand = rand || Math.random;
  const pool = cards.filter((c) => !c.archived && norm(c.q));
  const pick = (fn, n) => { const a = pool.filter(fn).sort(() => rand() - 0.5); return a.slice(0, n); };
  const seq = [];
  const intro = pool.find((c) => c.key === 'intro:yourself'); if (intro) seq.push(intro);
  const per = minutes <= 20 ? 1 : minutes <= 30 ? 2 : 3;
  seq.push(...pick((c) => c.cat === 'role' && c.tid !== 'leaving', per + 1));
  seq.push(...pick((c) => c.cat === 'project' || c.cat === 'personal', Math.max(1, per - 1)));
  seq.push(...pick((c) => c.cat === 'jd' && c.tid !== 'ask', per));
  seq.push(...pick((c) => c.cat === 'general' && !['salary', 'notice', 'ask'].includes(c.tid), per));
  seq.push(...pick((c) => c.cat === 'collected', Math.max(0, per - 1)));
  const ask = pool.find((c) => c.tid === 'ask' && c.source === 'jd') || pool.find((c) => c.tid === 'ask'); if (ask) seq.push(ask);
  const seen = new Set(); const out = seq.filter((c) => !seen.has(c.id) && seen.add(c.id));
  // trim to the time: about the target seconds per answer plus 20 s of listening
  let total = 0; const fit = [];
  for (const c of out) { const t = (c.seconds || 75) + 20; if (total + t > minutes * 60 && fit.length >= 3) break; fit.push(c); total += t; }
  return fit;
}

// ---------- facts from the resume that fit a card ----------
export function factsFor(card, resume, jdRows) {
  if (!resume || !card) return [];
  const out = [];
  const slug = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
  const key = card.key || '';
  const job = (resume.experience || []).find((e) => key.startsWith('co:' + slug(e.company) + '-' + slug(e.role) + ':'));
  const proj = (resume.projects || []).concat(resume.personal || []).find((p) => key.startsWith('pr:' + slug(p.name) + ':') || key.startsWith('pp:' + slug(p.name) + ':'));
  const add = (label, text) => { if (norm(text) && !out.some((o) => o.text === text)) out.push({ label, text, say: sayBullet(text) }); };
  if (job) (job.bullets || []).forEach((b) => add((job.role || 'Role') + ' at ' + (job.company || ''), b));
  else if (proj) (proj.bullets || []).forEach((b) => add(proj.name, b));
  else if (card.source === 'jd') {
    (jdRows || []).forEach((r) => (r.evidence || []).forEach((e) => add(e.where, e.text)));
    (resume.experience || []).slice(0, 1).forEach((e) => topBullets(e.bullets, 2).forEach((b) => add((e.role || '') + ' at ' + (e.company || ''), b)));
  } else {
    (resume.experience || []).slice(0, 3).forEach((e) => topBullets(e.bullets, 2).forEach((b) => add((e.role || '') + ' at ' + (e.company || ''), b)));
  }
  return out.slice(0, 12);
}

export const STAR_FRAME = 'Situation: [add: what was happening and why it mattered]\nTask: [add: what you were responsible for]\nAction: [add: what you personally did]\nResult: [add: the outcome, with a number if you have one]';
