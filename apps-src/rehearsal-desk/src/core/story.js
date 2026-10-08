// "My story": one section per company or project, one card per fact group you want to know by heart.
// Pure helpers only (no storage, no DOM) so they can be unit tested.
import { norm } from './text.js';

export const UNIT_KINDS = { company: 'Company', project: 'Project' };

const COMPANY = [
  { title: 'Snapshot', hue: 'blue', hint: 'Employer type, dates, location, the client or domain, and what the team did.' },
  { title: 'My role and team', hue: 'yellow', hint: 'Title, who I reported to, team size, who I worked with every day.' },
  { title: 'What I owned', hue: 'green', hint: 'The three to five things I was responsible for.' },
  { title: 'Projects here', hue: 'purple', hint: 'Each project in one line, newest first.' },
  { title: 'Tech stack', hue: 'orange', hint: 'Tools I used every day and what each was for.' },
  { title: 'Wins I can prove', hue: 'teal', hint: 'Only facts I can back up. Use a number only if it is true and I remember where it came from.' },
  { title: 'Hard questions', hue: 'pink', hint: 'Why I left, gaps, anything that needs a calm answer.' },
  { title: '30-second pitch', hue: 'slate', hint: 'How I introduce this job out loud.' },
];
const PROJECT = [
  { title: 'What it is', hue: 'blue', hint: 'One or two sentences a stranger would understand.' },
  { title: 'Why it existed', hue: 'yellow', hint: 'The business problem and who needed it.' },
  { title: 'My role and team', hue: 'green', hint: 'What I did, who else was on it, team size.' },
  { title: 'Structure', hue: 'purple', hint: 'How it is built: layers, data flow, models, pages. The picture I would draw on a whiteboard.' },
  { title: 'Tech stack', hue: 'orange', hint: 'Each tool and what it was used for.' },
  { title: 'The hard parts', hue: 'pink', hint: 'The two or three problems that took thought, and how I solved them.' },
  { title: 'Results', hue: 'teal', hint: 'What changed because of it. Only facts I can back up.' },
  { title: 'Likely follow-ups', hue: 'slate', hint: 'What an interviewer will ask next, and my answer.' },
  { title: '30-second pitch', hue: 'blue', hint: 'How I introduce this project out loud.' },
];
export const templateFor = (kind) => (kind === 'project' ? PROJECT : COMPANY).map((t) => Object.assign({}, t));

/** The small facts shown in a section header. */
export const UNIT_FIELDS = [
  ['role', 'Role'], ['period', 'Period'], ['team', 'Team size'], ['domain', 'Domain or client'], ['stack', 'Stack (comma separated)'],
];
export const PROJECT_FIELDS = [['company', 'Worked on at']];

export function blankStory() { return { units: {}, cards: {}, seq: 0 }; }
export function normaliseStory(s) {
  const out = Object.assign(blankStory(), s || {});
  out.units = out.units || {}; out.cards = out.cards || {};
  out.seq = Math.max(out.seq || 0, ...Object.values(out.cards).map((c) => c.seq || 0), ...Object.values(out.units).map((u) => u.order || 0), 0);
  return out;
}
export const stackList = (text) => String(text || '').split(/[,;\n]/).map((x) => norm(x)).filter(Boolean);

/** Counts for the readiness line: cards, known, still holding an [add: ...] gap, empty. */
export function storyStats(story, unitId) {
  const cards = Object.values(story.cards).filter((c) => !unitId || c.unit === unitId);
  return {
    total: cards.length,
    known: cards.filter((c) => c.status === 'known').length,
    gaps: cards.filter((c) => /\[add:/.test(c.body || '')).length,
    empty: cards.filter((c) => !norm(c.body)).length,
  };
}

/** Checks and cleans an import file. Throws a short, readable message when the file is not usable. */
export function parseStoryImport(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
  if (!d || d.app !== 'rehearsal-desk-story' || !Array.isArray(d.units)) throw new Error('That file is not a Rehearsal Desk story file.');
  const units = d.units.map((u, i) => {
    if (!u || typeof u !== 'object') throw new Error('Section ' + (i + 1) + ' is not valid.');
    const kind = u.kind === 'project' ? 'project' : 'company';
    const title = norm(u.title);
    if (!title) throw new Error('Section ' + (i + 1) + ' has no title.');
    const fields = {};
    UNIT_FIELDS.concat(PROJECT_FIELDS).forEach(([k]) => { if (u.fields && typeof u.fields[k] === 'string') fields[k] = u.fields[k]; });
    const cards = (Array.isArray(u.cards) ? u.cards : []).filter((c) => c && norm(c.title)).map((c) => ({ title: norm(c.title), body: String(c.body || ''), hue: typeof c.hue === 'string' ? c.hue : '' }));
    return { kind, title, fields, cards };
  });
  if (!units.length) throw new Error('The file has no sections.');
  return units;
}
