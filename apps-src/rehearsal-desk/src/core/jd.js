// Job description analysis and resume-to-JD matching. Rule based: a skills dictionary with synonyms, section cues
// ("Requirements", "Nice to have") and a few patterns for years, seniority, company and contact details.
import { norm, stripBullet, isBullet } from './text.js';
import { resumeText } from './parse.js';

// id, label, group, synonyms (matched as whole words, case-insensitive)
export const SKILLS = [
  ['sql', 'SQL', 'Data', ['sql', 't-sql', 'tsql', 'pl/sql', 'mysql', 'postgresql', 'postgres']],
  ['python', 'Python', 'Data', ['python', 'pandas', 'numpy']],
  ['r', 'R', 'Data', ['r programming', 'rstudio', 'r language', 'tidyverse', 'python or r', 'r or python']],
  ['excel', 'Excel', 'Tools', ['excel', 'spreadsheets', 'vba', 'google sheets']],
  ['powerbi', 'Power BI', 'BI', ['power bi', 'powerbi', 'dax', 'power query']],
  ['tableau', 'Tableau', 'BI', ['tableau']],
  ['looker', 'Looker', 'BI', ['looker', 'looker studio', 'data studio']],
  ['dashboards', 'Dashboards and reporting', 'BI', ['dashboard', 'dashboards', 'reporting', 'reports', 'visualisation', 'visualization', 'data visualisation', 'data visualization']],
  ['snowflake', 'Snowflake', 'Warehouse', ['snowflake']],
  ['bigquery', 'BigQuery', 'Warehouse', ['bigquery', 'big query']],
  ['redshift', 'Redshift', 'Warehouse', ['redshift']],
  ['warehouse', 'Cloud data warehouse', 'Warehouse', ['data warehouse', 'cloud data warehouse', 'warehouse', 'data warehousing', 'synapse', 'databricks']],
  ['dbt', 'dbt', 'Engineering', ['dbt']],
  ['etl', 'ETL / data pipelines', 'Engineering', ['etl', 'elt', 'data pipeline', 'data pipelines', 'airflow', 'data modelling', 'data modeling', 'ssis', 'azure data factory']],
  ['git', 'Git', 'Engineering', ['git', 'github', 'version control']],
  ['cloud', 'Cloud (AWS, Azure, GCP)', 'Engineering', ['aws', 'azure', 'gcp', 'google cloud']],
  ['abtesting', 'A/B testing and experiments', 'Analysis', ['a/b test', 'a/b testing', 'ab testing', 'experiment', 'experiments', 'experimentation', 'experiment design']],
  ['stats', 'Statistics', 'Analysis', ['statistics', 'statistical', 'hypothesis testing', 'regression', 'probability']],
  ['forecasting', 'Forecasting', 'Analysis', ['forecast', 'forecasting', 'demand modelling', 'demand modeling', 'time series', 'predictive']],
  ['ml', 'Machine learning', 'Analysis', ['machine learning', 'scikit-learn', 'sklearn', 'predictive modelling']],
  ['geospatial', 'Geospatial data', 'Analysis', ['geospatial', 'gis', 'spatial data']],
  ['kpi', 'KPIs and metrics', 'Analysis', ['kpi', 'kpis', 'metrics', 'okr']],
  ['quality', 'Data quality and testing', 'Engineering', ['data quality', 'well-tested', 'testing', 'validation', 'data governance']],
  ['stakeholders', 'Stakeholder management', 'People', ['stakeholder', 'stakeholders', 'senior stakeholders', 'cross-functional', 'business partners']],
  ['communication', 'Communication and storytelling', 'People', ['communication', 'storytelling', 'present findings', 'presentation', 'presenting', 'communicate']],
  ['mentoring', 'Mentoring and leadership', 'People', ['mentor', 'mentoring', 'coach', 'coaching', 'lead a team', 'team lead', 'line management', 'leadership']],
  ['agile', 'Agile ways of working', 'People', ['agile', 'scrum', 'kanban', 'jira']],
  ['product', 'Product analytics', 'Analysis', ['product analytics', 'product team', 'product managers', 'funnel', 'retention']],
];

const NICE_HEAD = /^(?:nice to have|preferred|bonus|desirable|a plus|nice-to-have|plus|good to have|would be a plus|advantageous)/i;
const REQ_HEAD = /^(?:requirements?|what you(?:'|’)ll need|what we(?:'|’)re looking for|must have|essential|you have|qualifications|skills and experience|about you|who you are|key skills)/i;
const RESP_HEAD = /^(?:responsibilities|what you(?:'|’)ll do|the role|key responsibilities|duties|your role|day to day|in this role)/i;

function re(syn) { return new RegExp('(?<![A-Za-z0-9+#])' + syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '(?![A-Za-z0-9+#])', 'i'); }
const SKILL_RES = SKILLS.map(([id, label, group, syns]) => ({ id, label, group, res: syns.map(re) }));
export const skillById = (id) => SKILLS.find((s) => s[0] === id);
export const skillLabel = (id) => (skillById(id) || [id, id])[1];

export function skillsIn(text) {
  const t = String(text || '');
  return SKILL_RES.filter((s) => s.res.some((r) => r.test(t))).map((s) => s.id);
}

function headingOf(line) {
  const t = norm(line).replace(/[:\-*#]+$/g, '').trim();
  if (!t || t.length > 60 || /[.!?]$/.test(t)) return null;
  if (NICE_HEAD.test(t)) return 'nice';
  if (REQ_HEAD.test(t)) return 'req';
  if (RESP_HEAD.test(t)) return 'resp';
  return null;
}

export function analyseJd(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n');
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''));
  const nonEmpty = lines.filter((l) => norm(l));
  const title = norm(nonEmpty[0] || '').replace(/^job title\s*[:-]\s*/i, '');

  const emails = [...new Set(raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])];
  const phones = [...new Set((raw.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,5}\)?[\s.-]\d{3,5}[\s.-]?\d{3,5}/g) || []).map(norm))];
  const links = [...new Set(raw.match(/https?:\/\/[^\s)]+/g) || [])];

  let company = '';
  let m = /^\s*(?:company|employer|organisation|organization)\s*[:\-]\s*(.+)$/im.exec(raw);
  if (m) company = norm(m[1]);
  if (!company) { m = /^\s*about\s+(?:us\s*[:\-]?\s*)?(.{2,50}?)\s*$/im.exec(raw); if (m && !/^(?:us|the role|you|the team)$/i.test(m[1])) company = norm(m[1]); }
  if (!company && nonEmpty[1] && norm(nonEmpty[1]).length <= 50 && !/[:.]$/.test(norm(nonEmpty[1])) && !/location|salary|contract/i.test(nonEmpty[1])) company = norm(nonEmpty[1]);
  if (!company) { m = /\bat\s+([A-Z][A-Za-z0-9&' -]{2,40})(?:[,.\s]|$)/.exec(raw); if (m) company = norm(m[1]); }

  const loc = (/^\s*location\s*[:\-]\s*(.+)$/im.exec(raw) || [])[1] || '';
  const yearsM = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/i.exec(raw);
  const years = yearsM ? +yearsM[1] : 0;
  const hay = (title + ' ' + raw.slice(0, 400)).toLowerCase();
  const seniority = /\b(principal|head of|director)\b/.test(hay) ? 'lead' : /\b(lead|staff)\b/.test(hay) ? 'lead' : /\bsenior|sr\.?\b/.test(hay) ? 'senior' : /\b(junior|graduate|entry)\b/.test(hay) ? 'junior' : years >= 6 ? 'senior' : years >= 3 ? 'mid' : 'mid';

  // Walk the lines tracking which block we are in, so skills under "Nice to have" count as optional.
  let mode = 'other';
  const required = new Set(), nice = new Set(), responsibilities = [], reqLines = [], groups = [];
  for (const l of lines) {
    const h = headingOf(l);
    if (h) { mode = h; continue; }
    const t = norm(l);
    if (!t) continue;
    if (/^(?:about|to apply|how to apply|benefits|what we offer|salary)\b/i.test(t) && !isBullet(l)) mode = 'other';
    const found = skillsIn(t);
    if (found.length > 1 && /\b(?:or|such as|e\.g\.)\b|\//i.test(t)) groups.push(found);
    if (mode === 'nice') found.forEach((id) => nice.add(id));
    else found.forEach((id) => required.add(id));
    if (mode === 'resp' && isBullet(l)) responsibilities.push(stripBullet(l));
    if (mode === 'req' && isBullet(l)) reqLines.push(stripBullet(l));
  }
  nice.forEach((id) => { if (required.has(id)) nice.delete(id); });
  // Skills only mentioned in the "about" paragraph are weak signals; keep the ones found in a responsibilities or requirements line.
  const strong = new Set();
  [...responsibilities, ...reqLines].forEach((l) => skillsIn(l).forEach((id) => strong.add(id)));
  const req = [...required].filter((id) => strong.has(id) || !strong.size);

  const themes = [];
  if (seniority === 'senior' || seniority === 'lead') themes.push('Ownership and judgement: can you run an area of analysis without close direction?');
  if (req.includes('stakeholders') || req.includes('communication')) themes.push('Influence: can you explain findings and change a senior person’s mind?');
  if (req.includes('mentoring')) themes.push('Leadership: have you raised the level of other people’s work?');
  if (req.includes('abtesting') || req.includes('stats')) themes.push('Rigour: do you design and read experiments correctly?');
  if (req.includes('sql') || req.includes('warehouse')) themes.push('Technical depth: writing clear, correct, tested SQL on a real warehouse.');
  if (req.includes('dashboards') || req.includes('powerbi') || req.includes('tableau')) themes.push('Product thinking: dashboards people actually use, not just build.');

  return { title, company, location: norm(loc), emails, phones, links, years, seniority, required: req, nice: [...nice], responsibilities, themes, groups };
}

/** Which JD skills does the resume show, and where? */
export function matchJd(jd, resume) {
  const rows = [];
  const bulletsOf = [];
  (resume.experience || []).forEach((e) => (e.bullets || []).forEach((b) => bulletsOf.push({ where: (e.role || 'Role') + ' at ' + (e.company || 'company'), text: b })));
  (resume.projects || []).concat(resume.personal || []).forEach((p) => (p.bullets || []).forEach((b) => bulletsOf.push({ where: p.name, text: b })));
  const skillsText = (resume.skills || []).join(', ') + ' ' + (resume.summary || '');
  const add = (id, optional) => {
    const entry = SKILL_RES.find((s) => s.id === id); if (!entry) return;
    const inSkills = entry.res.some((r) => r.test(skillsText));
    const evidence = bulletsOf.filter((b) => entry.res.some((r) => r.test(b.text))).slice(0, 3);
    const status = evidence.length ? 'shown' : inSkills ? 'listed' : 'missing';
    rows.push({ id, label: entry.label, optional: !!optional, status, evidence });
  };
  jd.required.forEach((id) => add(id, false));
  jd.nice.forEach((id) => add(id, true));
  // "Snowflake or BigQuery": one of them is enough, so a missing alternative is not a gap.
  (jd.groups || []).forEach((g) => {
    const members = rows.filter((r) => g.includes(r.id));
    if (members.length < 2) return;
    const best = members.find((r) => r.status === 'shown') || members.find((r) => r.status === 'listed');
    if (best) members.forEach((r) => { if (r !== best && r.status === 'missing') { r.status = 'alt'; r.altOf = best.label; } });
  });
  const req = rows.filter((r) => !r.optional && r.status !== 'alt');
  const score = req.length ? Math.round(req.reduce((n, r) => n + (r.status === 'shown' ? 1 : r.status === 'listed' ? 0.6 : 0), 0) / req.length * 100) : null;
  const resumeSkills = skillsIn(resumeText(resume));
  const extras = resumeSkills.filter((id) => !jd.required.includes(id) && !jd.nice.includes(id)).map(skillLabel);
  const suggestions = [];
  rows.forEach((r) => {
    if (r.status === 'missing' && !r.optional) suggestions.push('The role asks for ' + r.label + ' and your resume does not show it. If you have used it, add it to a bullet with what you did and the result. If not, prepare an honest answer about how you would learn it.');
    else if (r.status === 'listed') suggestions.push(r.label + ' is only in your skills list. Add it to a bullet so the reader can see where you used it.');
  });
  if (jd.years && resume.years && resume.years < jd.years) suggestions.push('The role asks for ' + jd.years + '+ years and your resume shows about ' + resume.years + '. Be ready to explain how your depth makes up for it.');
  return { rows, score, extras, suggestions };
}
