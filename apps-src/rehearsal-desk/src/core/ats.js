// Resume readability checks: what an automated parser or a quick human skim will trip on. These are rules of thumb,
// not a real ATS score, and the UI says so.
import { norm, wordCount, parseDate, monthsBetween } from './text.js';
import { resumeText } from './parse.js';

const WEAK = [
  [/\bresponsible for\b/i, 'Replace "responsible for" with what you did: "Owned", "Ran", "Built".'],
  [/\bworked (?:on|with)\b/i, '"Worked on" hides your part. Say what you did and what changed.'],
  [/\bhelped (?:with|to)?\b/i, '"Helped" understates your role. Name your contribution.'],
  [/\bduties (?:include|included)\b/i, 'List results, not duties.'],
  [/\bassisted (?:with|in)\b/i, '"Assisted" reads as a minor role. Say what you delivered.'],
  [/\bsupported\b/i, '"Supported" is vague. Say what you produced or improved.'],
];
const ACTION = /^(?:built|led|ran|drove|wrote|made|cut|grew|won|set up|designed|developed|created|launched|delivered|automated|reduced|increased|improved|owned|managed|analysed|analyzed|presented|forecast|mentored|migrated|implemented|introduced|streamlined|negotiated|defined|established|trained|identified|combined|visualised|visualized|published|cleaned|prepared|replaced|raised|scaled|rebuilt|produced|partnered|collaborated|coordinated|reviewed|tested|optimised|optimized|simplified|standardised|standardized|transformed|supported|helped|worked|used|maintained)\b/i;
const HAS_NUMBER = /\d|%|£|\$|€|₹/;

export function checkResume(r, rawText) {
  const items = [];
  const add = (id, area, level, title, detail) => items.push({ id, area, level, title, detail });
  const c = r.contact || {};
  const bullets = [];
  (r.experience || []).forEach((e) => (e.bullets || []).forEach((b) => bullets.push({ b, where: e.company || e.role || 'a job' })));
  (r.projects || []).concat(r.personal || []).forEach((p) => (p.bullets || []).forEach((b) => bullets.push({ b, where: p.name })));
  const text = rawText || resumeText(r);
  const wc = wordCount(text);

  // Contact
  add('email', 'Contact', c.email ? 'pass' : 'fail', c.email ? 'Email address found' : 'No email address', c.email ? '' : 'Recruiters and ATS forms look for an email near the top.');
  add('phone', 'Contact', c.phone ? 'pass' : 'warn', c.phone ? 'Phone number found' : 'No phone number', c.phone ? '' : 'Add a phone number unless you prefer email only.');
  add('links', 'Contact', (c.links || []).length ? 'pass' : 'info', (c.links || []).length ? 'Profile link found' : 'No LinkedIn or portfolio link', (c.links || []).length ? '' : 'A LinkedIn or GitHub link helps for analyst and engineering roles.');
  if (/\b(date of birth|dob|marital status|nationality|passport)\b/i.test(text)) add('personal', 'Contact', 'warn', 'Personal details that are usually left out', 'Date of birth, marital status and nationality are usually omitted for US, UK and EU roles. Keep them only if the employer asks.');

  // Structure
  add('summary', 'Structure', r.summary ? 'pass' : 'warn', r.summary ? 'Summary found' : 'No summary', r.summary ? '' : 'Two or three lines at the top say who you are and what you offer.');
  add('experience', 'Structure', (r.experience || []).length ? 'pass' : 'fail', (r.experience || []).length ? (r.experience.length + ' jobs with dates found') : 'No dated jobs found', (r.experience || []).length ? '' : 'Use a clear job header with a date range for each role.');
  add('skills', 'Structure', (r.skills || []).length >= 6 ? 'pass' : (r.skills || []).length ? 'warn' : 'fail', (r.skills || []).length ? (r.skills.length + ' skills listed') : 'No skills section', (r.skills || []).length >= 6 ? '' : 'List at least six relevant tools and methods so keyword searches can find you.');
  add('education', 'Structure', (r.education || []).length ? 'pass' : 'warn', (r.education || []).length ? 'Education found' : 'No education section', '');

  // Dates and gaps
  const jobs = r.experience || [];
  const bad = jobs.filter((e) => !parseDate(e.start) || !parseDate(e.end, true));
  add('dates', 'Dates', !jobs.length ? 'info' : bad.length ? 'warn' : 'pass', bad.length ? bad.length + ' job(s) with unclear dates' : 'Dates are readable', bad.length ? 'Use "Mon YYYY - Mon YYYY" for every role.' : '');
  const gaps = [];
  const dated = jobs.map((e) => ({ e, s: parseDate(e.start), t: parseDate(e.end, true) })).filter((x) => x.s && x.t).sort((a, b) => (a.s.y * 12 + a.s.m) - (b.s.y * 12 + b.s.m));
  for (let i = 1; i < dated.length; i++) { const g = monthsBetween(dated[i - 1].t, dated[i].s); if (g > 6) gaps.push((dated[i - 1].e.company || 'job') + ' to ' + (dated[i].e.company || 'job') + ' (' + g + ' months)'); }
  add('gaps', 'Dates', gaps.length ? 'info' : 'pass', gaps.length ? 'Gap between jobs: ' + gaps.join('; ') : 'No gaps over six months', gaps.length ? 'Gaps are normal. Add a one-line reason if it was study, caring, travel or freelance work.' : '');

  // Bullets
  const long = bullets.filter((x) => wordCount(x.b) > 38);
  const withNum = bullets.filter((x) => HAS_NUMBER.test(x.b));
  const withAction = bullets.filter((x) => ACTION.test(x.b));
  const share = bullets.length ? withNum.length / bullets.length : 0;
  add('metrics', 'Impact', !bullets.length ? 'info' : share >= 0.4 ? 'pass' : share >= 0.2 ? 'warn' : 'fail', bullets.length ? withNum.length + ' of ' + bullets.length + ' bullets include a number' : 'No bullets found', share >= 0.4 ? '' : 'Aim for a number in at least four bullets in ten: money, time, volume, accuracy or people affected.');
  add('verbs', 'Impact', !bullets.length ? 'info' : withAction.length / bullets.length >= 0.7 ? 'pass' : 'warn', bullets.length ? withAction.length + ' of ' + bullets.length + ' bullets start with an action verb' : '', 'Start each bullet with what you did: Built, Led, Cut, Automated.');
  add('long', 'Impact', long.length ? 'warn' : 'pass', long.length ? long.length + ' bullet(s) are long' : 'Bullets are a good length', long.length ? 'Keep bullets under about two lines. Split long ones into action and result.' : '');
  const jobBullets = jobs.map((e) => (e.bullets || []).length);
  add('depth', 'Impact', jobs.length && jobBullets.some((n) => n < 2) ? 'warn' : 'pass', jobs.length && jobBullets.some((n) => n < 2) ? 'A job has fewer than two bullets' : 'Each job has enough detail', '');

  // Wording
  const weak = [];
  bullets.forEach((x) => WEAK.forEach(([rx, tip]) => { if (rx.test(x.b)) weak.push({ where: x.where, bullet: x.b, tip }); }));
  add('weak', 'Wording', weak.length ? 'warn' : 'pass', weak.length ? weak.length + ' bullet(s) use weak phrasing' : 'No weak phrasing found', weak.length ? 'See the suggestions list for each one.' : '');
  const first = bullets.filter((x) => /\b(I|my)\b/.test(x.b));
  add('pronouns', 'Wording', first.length ? 'warn' : 'pass', first.length ? first.length + ' bullet(s) use "I" or "my"' : 'No first-person pronouns', first.length ? 'Resume bullets usually drop "I" and start with the verb.' : '');
  add('length', 'Length', wc < 250 ? 'warn' : wc > 1000 ? 'warn' : 'pass', wc + ' words', wc < 250 ? 'Short for a senior resume. Add detail on results.' : wc > 1000 ? 'Long. Two pages is usually the limit.' : '');
  add('chars', 'Format', /[─-╿�■-◿]/.test(text.replace(/[▪●◦■○]/g, '')) ? 'warn' : 'pass', 'Characters', 'Avoid boxes, icons and decorative characters. Parsers may drop them or turn them into noise.');

  const suggestions = [];
  weak.forEach((w) => suggestions.push({ kind: 'wording', where: w.where, text: w.tip, bullet: w.bullet }));
  bullets.filter((x) => !HAS_NUMBER.test(x.b)).slice(0, 8).forEach((x) => suggestions.push({ kind: 'metric', where: x.where, text: 'Add a number or result: how many, how much, how often, or what changed?', bullet: x.b }));
  long.slice(0, 4).forEach((x) => suggestions.push({ kind: 'length', where: x.where, text: 'Shorten to one idea: the action, then the result.', bullet: x.b }));

  const counts = items.reduce((a, i) => { a[i.level] = (a[i.level] || 0) + 1; return a; }, {});
  const scored = items.filter((i) => i.level !== 'info');
  return { items, suggestions, passed: scored.filter((i) => i.level === 'pass').length, total: scored.length, counts };
}
