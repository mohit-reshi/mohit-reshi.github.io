// Resume text -> structured record. Rule based: headings, date ranges, bullets. Imperfect by nature, so every result
// carries warnings and the UI lets the user correct what was found.
import { norm, stripBullet, isBullet, parseDate, monthsBetween, fmtYM } from './text.js';

const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = '(?:' + MON + '\\.?\\s*,?\\s*\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})';
const END = '(?:' + DATE + '|present|current|now|till date|to date|ongoing)';
export const RANGE_RE = new RegExp('(' + DATE + ')\\s*(?:-|\\u2013|\\u2014|to|until|till)\\s*(' + END + ')', 'i');
const ROLE_RE = /\b(analyst|engineer|developer|manager|lead|consultant|scientist|intern|architect|specialist|associate|director|head|officer|administrator|coordinator|executive|designer|programmer|statistician|researcher|trainee|assistant|supervisor|owner|partner|founder|vp|president)\b/i;
const LOCATION_RE = /^(remote|hybrid|on-?site|[A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?,\s*[A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)$/;

const HEADINGS = [
  ['summary', /^(?:professional |career |executive |personal )?(?:summary|profile|about(?: me)?|objective|overview)$/i],
  ['experience', /^(?:(?:work|professional|relevant|employment|career) )?(?:experience|history)$|^employment(?: history)?$|^work history$|^professional experience$/i],
  ['personal', /^(?:personal|side|independent|open[- ]source|self[- ]directed|hobby) projects?$/i],
  ['projects', /^(?:key |selected |academic |technical |notable )?projects?$/i],
  ['skills', /^(?:(?:technical|key|core|professional) )?skills(?: (?:&|and) (?:tools|technologies))?$|^(?:tools|technologies|tech stack|core competencies|tools (?:&|and) technologies)$/i],
  ['education', /^(?:education|academic background|qualifications|education (?:&|and) training)$/i],
  ['certifications', /^(?:certifications?|licen[sc]es?(?: (?:&|and) certifications?)?|courses|training|certificates)$/i],
  ['achievements', /^(?:achievements?|awards?|honou?rs?|accomplishments|awards (?:&|and) honou?rs)$/i],
  ['languages', /^languages?$/i],
  ['interests', /^(?:interests|hobbies)$/i],
];

export function headingKind(line) {
  const t = norm(line).replace(/[:\-_=*#|]+$/g, '').replace(/^[#*_=\-\s]+/, '').trim();
  if (!t || t.length > 42 || /[.!?]$/.test(t)) return null;
  for (const [kind, re] of HEADINGS) if (re.test(t)) return kind;
  return null;
}

function splitSections(lines) {
  const out = []; let cur = { kind: 'top', lines: [] };
  for (const raw of lines) {
    const k = headingKind(raw);
    if (k) { out.push(cur); cur = { kind: k, lines: [] }; } else cur.lines.push(raw);
  }
  out.push(cur);
  return out;
}

/** Joins wrapped lines (PDF text often breaks mid-sentence) into whole bullets. */
function toBullets(lines) {
  const out = [];
  for (const raw of lines) {
    const t = norm(raw);
    if (!t) continue;
    if (isBullet(raw)) { out.push(stripBullet(raw)); continue; }
    const prev = out[out.length - 1];
    if (prev && /^[a-z(]/.test(t) && !/[.!?]$/.test(prev)) out[out.length - 1] = prev + ' ' + t;
    else if (prev !== undefined && out.length && !isBullet(raw) && t.length < 60 && /[,;]$/.test(prev)) out[out.length - 1] = prev + ' ' + t;
    else out.push(t);
  }
  return out;
}

function partsOf(text) {
  text = norm(text).replace(/^[\s|\u2022\u00b7@\u2014\u2013-]+|[\s|\u2022\u00b7@\u2014\u2013-]+$/g, '');
  return text.split(/\s+[|•·@—–-]\s+|\s*\|\s*|,\s+(?=[A-Z])/).map((p) => norm(p)).filter(Boolean);
}

function readHeader(candidates) {
  let company = '', role = '', location = '';
  const parts = []; const rest = [];
  for (const c of candidates) partsOf(c).forEach((p) => parts.push(p));
  for (const p of parts) {
    if (!role && ROLE_RE.test(p) && p.length <= 70) { role = p; continue; }
    if (!location && LOCATION_RE.test(p) && company) { location = p; continue; }
    if (!company && !ROLE_RE.test(p)) { company = p; continue; }
    if (!location && company && role && p.length <= 40) { location = p; continue; }
    if (!location && LOCATION_RE.test(p)) { location = p; continue; }
    rest.push(p);
  }
  if (!location) location = rest.find((p) => p.length <= 30 && /^[A-Z][A-Za-z.]*(?: [A-Z][A-Za-z.]*)?$/.test(p)) || '';
  if (!company && parts.length > 1) company = parts.find((p) => p !== role) || '';
  return { company, role, location };
}

let SKIP_LINES = new Set();
const isHeaderLine = (l) => { const t = norm(l); return t && t.length <= 80 && !isBullet(l) && !/[.!?]$/.test(t) && !headingKind(t) && !SKIP_LINES.has(t) && !/@|https?:/.test(t); };

function parseExperience(lines, now, skip) {
  skip = skip || new Set();
  const idx = [];
  lines.forEach((l, i) => { if (RANGE_RE.test(l) && l.length < 120) idx.push(i); });
  const entries = [];
  const starts = [];
  for (const i of idx) {
    let s = i; let n = 0;
    while (s > 0 && n < 2 && isHeaderLine(lines[s - 1]) && !RANGE_RE.test(lines[s - 1]) && !(starts.length && s - 1 <= starts[starts.length - 1].dateIdx)) { s--; n++; }
    starts.push({ dateIdx: i, headStart: s });
  }
  starts.forEach((st, k) => {
    const m = RANGE_RE.exec(lines[st.dateIdx]);
    const dateLineRest = norm(lines[st.dateIdx].replace(RANGE_RE, ' ').replace(/[()]/g, ' '));
    const head = [];
    for (let i = st.headStart; i < st.dateIdx; i++) head.push(norm(lines[i]));
    if (dateLineRest) head.push(dateLineRest);
    let bodyStart = st.dateIdx + 1;
    let info = readHeader(head);
    // Date line first, header after it ("Mar 2021 - Present" then "Role, Company"), or company above and role below.
    if ((!info.company || !info.role) && bodyStart < lines.length && isHeaderLine(lines[bodyStart]) && !RANGE_RE.test(lines[bodyStart])) {
      info = readHeader(head.concat(norm(lines[bodyStart]))); bodyStart++;
    }
    const end = k + 1 < starts.length ? starts[k + 1].headStart : lines.length;
    const bullets = toBullets(lines.slice(bodyStart, end));
    const start = parseDate(m[1], false, now), stop = parseDate(m[2], true, now);
    entries.push({
      kind: 'job', company: info.company, role: info.role, location: info.location,
      start: start ? fmtYM(start) : m[1], end: stop ? (stop.present ? 'Present' : fmtYM(stop)) : m[2],
      _start: start, _end: stop, bullets,
      confidence: info.company && info.role && start ? 'high' : 'low',
    });
  });
  return entries;
}

function parseProjects(lines, kind) {
  const entries = []; let cur = null;
  for (const raw of lines) {
    const t = norm(raw);
    if (!t) continue;
    const bullet = isBullet(raw);
    const looksTitle = !bullet && t.length <= 90 && !/[.!?]$/.test(t);
    if (looksTitle && (!cur || cur.bullets.length)) {
      const parts = t.split(/\s+[|—–-]\s+|\s*\|\s*/).map(norm).filter(Boolean);
      let name = parts[0] || t; let tech = parts.slice(1).join(', ');
      const par = /^(.*?)\s*\(([^)]+)\)$/.exec(name);
      if (par) { name = par[1]; tech = tech || par[2]; }
      cur = { kind, name, tech, bullets: [], confidence: 'medium' };
      entries.push(cur);
    } else if (cur) {
      const m = /^(?:tech(?:nologies)?|stack|tools)\s*[:\-]\s*(.+)$/i.exec(stripBullet(raw));
      if (m) cur.tech = m[1]; else cur.bullets.push(...toBullets([raw]));
    } else {
      cur = { kind, name: 'Project', tech: '', bullets: toBullets([raw]), confidence: 'low' }; entries.push(cur);
    }
  }
  // Merge wrapped bullets that were split across lines
  entries.forEach((e) => { e.bullets = toBullets(e.bullets); });
  return entries;
}

function parseSkills(lines) {
  const items = []; const groups = [];
  for (const raw of lines) {
    let t = stripBullet(raw);
    if (!t) continue;
    let label = '';
    const m = /^([A-Za-z][A-Za-z &/]{1,28}):\s*(.+)$/.exec(t);
    if (m) { label = m[1]; t = m[2]; }
    const list = t.split(/[,;|•·]|\s{2,}|\s\/\s/).map((s) => norm(s).replace(/\.$/, '')).filter((s) => s.length >= 2 && s.length <= 40);
    list.forEach((s) => { if (!items.some((x) => x.toLowerCase() === s.toLowerCase())) items.push(s); });
    if (label) groups.push({ label, items: list });
  }
  return { items, groups };
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)\d{3,5}[\s.-]?\d{3,5}/;

function parseContact(topLines, all) {
  const text = all.join('\n');
  const email = (EMAIL_RE.exec(text) || [''])[0];
  const phone = (topLines.join(' ').match(PHONE_RE) || [''])[0].trim();
  const links = (text.match(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|medium\.com)\/[^\s,;|)]+/gi) || []);
  let name = '';
  for (const l of topLines) {
    const t = norm(l);
    if (!t || EMAIL_RE.test(t) || /\d/.test(t) || /https?:|www\./i.test(t)) continue;
    if (/^[A-Za-z][A-Za-z.'’-]*(?: [A-Za-z][A-Za-z.'’-]*){1,3}$/.test(t) && !ROLE_RE.test(t)) { name = t; break; }
  }
  const headline = (() => { for (const l of topLines) { const t = norm(l); if (t && t !== name && ROLE_RE.test(t) && t.length <= 80 && !EMAIL_RE.test(t) && !/\d{4}/.test(t)) return t; } return ''; })();
  const loc = (() => { for (const l of topLines) for (const p of norm(l).split(/\s*\|\s*|\s+[\u2022\u00b7]\s+/).map(norm)) if (LOCATION_RE.test(p) && !ROLE_RE.test(p) && p !== name && !EMAIL_RE.test(p)) return p; return ''; })();
  return { name, headline, email, phone, location: loc, links: links.map((x) => x.replace(/[.)]+$/, '')) };
}

export function parseResume(text, now) {
  const raw = String(text || '').replace(/\r\n?/g, '\n');
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''));
  const secs = splitSections(lines);
  const warnings = [];
  const get = (k) => secs.filter((s) => s.kind === k);
  const top = (secs[0] && secs[0].lines) || [];
  const contact = parseContact(top.filter((l) => norm(l)).slice(0, 8), lines);

  let summary = get('summary').map((s) => toBullets(s.lines).join(' ')).join(' ').trim();
  if (!summary) {
    const para = toBullets(top.slice(1)).filter((l) => l.split(/\s+/).length >= 18).join(' ');
    summary = para;
  }

  let experience = [];
  SKIP_LINES = new Set([contact.name, contact.headline].filter(Boolean).map(norm));
  get('experience').forEach((s) => { experience = experience.concat(parseExperience(s.lines, now)); });
  // Some resumes have no "Experience" heading: look for dated entries in the loose text instead.
  if (!experience.length && !get('experience').length) experience = parseExperience(top, now);
  SKIP_LINES = new Set();
  const projects = []; get('projects').forEach((s) => projects.push(...parseProjects(s.lines, 'project')));
  const personal = []; get('personal').forEach((s) => personal.push(...parseProjects(s.lines, 'personal')));
  const skillSec = get('skills'); const sk = parseSkills([].concat(...skillSec.map((s) => s.lines)));
  const education = [].concat(...get('education').map((s) => toBullets(s.lines)));
  const certifications = [].concat(...get('certifications').map((s) => toBullets(s.lines)));
  const achievements = [].concat(...get('achievements').map((s) => toBullets(s.lines)));

  if (!experience.length) warnings.push('No jobs with dates were found. Check that each job has a date range such as "Mar 2021 - Present".');
  experience.forEach((e) => { if (e.confidence === 'low') warnings.push('Check the company, role and dates for the entry "' + (e.company || e.role || 'unnamed') + '".'); });
  if (!contact.name) warnings.push('No name was found at the top.');
  if (!contact.email) warnings.push('No email address was found.');
  if (!sk.items.length) warnings.push('No skills section was found.');

  // Total experience in years (first start to last end, ignoring overlaps).
  let years = 0;
  const starts = experience.map((e) => e._start).filter(Boolean);
  const ends = experience.map((e) => e._end).filter(Boolean);
  if (starts.length && ends.length) {
    const first = starts.reduce((a, b) => (a.y * 12 + a.m < b.y * 12 + b.m ? a : b));
    const last = ends.reduce((a, b) => (a.y * 12 + a.m > b.y * 12 + b.m ? a : b));
    years = Math.max(0, Math.round(monthsBetween(first, last) / 12 * 10) / 10);
  }
  experience.forEach((e) => { delete e._start; delete e._end; });
  // Dates are recomputed from the visible strings when needed (see datesOf in questions.js).

  return {
    contact, summary, experience, projects, personal, skills: sk.items, skillGroups: sk.groups,
    education, certifications, achievements, years, warnings,
    foundAt: Date.now(),
  };
}

/** Plain text of a structured resume (used for JD matching and the ATS keyword checks). */
export function resumeText(r) {
  if (!r) return '';
  const out = [r.contact && r.contact.name, r.contact && r.contact.headline, r.summary];
  (r.experience || []).forEach((e) => { out.push(e.role, e.company, ...(e.bullets || [])); });
  (r.projects || []).concat(r.personal || []).forEach((p) => { out.push(p.name, p.tech, ...(p.bullets || [])); });
  out.push((r.skills || []).join(', '), ...(r.education || []), ...(r.certifications || []), ...(r.achievements || []));
  return out.filter(Boolean).join('\n');
}
