import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResume } from '../src/core/parse.js';
import { analyseJd, matchJd } from '../src/core/jd.js';
import { checkResume } from '../src/core/ats.js';
import { buildResumeCards, buildJdCards, categorise, periodOf } from '../src/core/questions.js';
import { analyseAnswer } from '../src/core/answers.js';
import { extractQA } from '../src/core/extract.js';
import { sampleResume, SAMPLE_JD } from '../src/sample.js';
import { jaccard, parseDate, monthsBetween } from '../src/core/text.js';

const NOW = new Date('2026-10-07T12:00:00Z');
const resume = () => parseResume(sampleResume(NOW), NOW);

test('parser reads the sample resume: contact, three jobs, projects, skills', () => {
  const r = resume();
  assert.equal(r.contact.name, 'Jordan Avery');
  assert.equal(r.contact.email, 'jordan.avery@example.com');
  assert.deepEqual(r.experience.map((e) => [e.company, e.role]), [['Brightleaf Analytics', 'Senior Data Analyst'], ['Harborline Logistics', 'Data Analyst'], ['Pinecrest Retail', 'Junior Analyst']]);
  assert.equal(r.experience[0].end, 'Present');
  assert.equal(r.experience[0].bullets.length, 5);
  assert.equal(r.projects.length, 2); assert.equal(r.personal.length, 1);
  assert.ok(r.skills.includes('Power BI') && r.skills.includes('SQL'));
  assert.equal(r.warnings.length, 0);
  assert.ok(r.years >= 7.5 && r.years <= 8.5);
});

test('parser handles a company-above-role layout, dates on their own line and a wrapped bullet', () => {
  const r = parseResume(`ALEX MORGAN
alex@example.com  07700 900456

PROFESSIONAL EXPERIENCE

Harbor Retail Group — London
Business Intelligence Analyst
01/2019 – 03/2022
• Maintained SQL reports for 12 stores
• Wrote documentation

Northwind Traders
Data Analyst                                   2016 – 2018
Cleaned data in Excel
and prepared weekly packs for the sales team.

TECHNICAL SKILLS
SQL, Excel, Tableau`, NOW);
  assert.deepEqual(r.experience.map((e) => [e.company, e.role, e.location]), [['Harbor Retail Group', 'Business Intelligence Analyst', 'London'], ['Northwind Traders', 'Data Analyst', '']]);
  assert.equal(r.experience[1].bullets.length, 1);
  assert.deepEqual(r.skills, ['SQL', 'Excel', 'Tableau']);
});

test('parser handles a resume with no section headings', () => {
  const r = parseResume('Sam Lee\nData Engineer, Acme Data Ltd (Jan 2020 – Present)\nBuilt pipelines in Airflow.\nAnalyst, Old Corp (2017 – 2019)\nWrote reports.', NOW);
  assert.deepEqual(r.experience.map((e) => [e.company, e.role]), [['Acme Data Ltd', 'Data Engineer'], ['Old Corp', 'Analyst']]);
});

test('parser never throws on junk and warns when it finds nothing', () => {
  for (const t of ['', '   ', '\n\n', 'just some words', '%%%\u0000###', 'a'.repeat(5000)]) {
    const r = parseResume(t, NOW);
    assert.ok(Array.isArray(r.experience));
  }
  assert.ok(parseResume('hello', NOW).warnings.length > 0);
});

test('JD analysis finds company, contact, years, seniority and optional skills', () => {
  const jd = analyseJd(SAMPLE_JD);
  assert.equal(jd.title, 'Senior Data Analyst');
  assert.equal(jd.company, 'Fernwood Mobility');
  assert.deepEqual(jd.emails, ['talent@fernwoodmobility.example']);
  assert.equal(jd.years, 6); assert.equal(jd.seniority, 'senior');
  assert.ok(jd.required.includes('sql') && jd.required.includes('powerbi'));
  assert.ok(jd.nice.includes('dbt') && jd.nice.includes('geospatial'));
  assert.ok(!jd.required.includes('dbt'));
});

test('JD match: shown, listed, missing, and "X or Y" alternatives are not gaps', () => {
  const m = matchJd(analyseJd(SAMPLE_JD), resume());
  const by = (id) => m.rows.find((r) => r.id === id);
  assert.equal(by('sql').status, 'shown');
  assert.equal(by('mentoring').status, 'listed');
  assert.equal(by('bigquery').status, 'alt');
  assert.equal(by('geospatial').status, 'missing');
  assert.ok(m.score > 80 && m.score <= 100);
});

test('readability checks pass the sample and flag weak resumes', () => {
  const ok = checkResume(resume());
  assert.ok(ok.passed >= ok.total - 2);
  const bad = checkResume(parseResume('Some Person\nExperience\nAnalyst, Foo (2020 - 2021)\nResponsible for reports\nWorked on dashboards', NOW));
  assert.ok(bad.items.find((i) => i.id === 'email').level === 'fail');
  assert.ok(bad.items.find((i) => i.id === 'weak').level === 'warn');
  assert.ok(bad.suggestions.length > 0);
});

test('resume cards: stable keys, every question has a section, gaps are marked, no invented numbers', () => {
  const r = resume();
  const cards = buildResumeCards(r);
  const keys = cards.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  assert.deepEqual(keys, buildResumeCards(resume()).map((c) => c.key), 'keys are stable between runs');
  assert.ok(cards.every((c) => c.sec && c.q && c.tid));
  const intro = cards.find((c) => c.key === 'intro:yourself');
  assert.ok(intro.a.includes('Brightleaf Analytics') && intro.a.includes('[add:'));
  const numbers = (s) => (s.match(/\d+(?:\.\d+)?/g) || []);
  const resumeNums = new Set(numbers(sampleResume(NOW)));
  cards.forEach((c) => numbers(c.a.replace(/\[add:[^\]]*\]/g, '')).forEach((n) => assert.ok(resumeNums.has(n) || ['1', '2', '3', '30', '60', '90'].includes(n), 'unexpected number ' + n + ' in ' + c.key)));
  assert.ok(cards.some((c) => c.sec.key.startsWith('pr:')) && cards.some((c) => c.sec.key.startsWith('pp:')));
});

test('resume cards include gap and short-stint questions when the dates call for them', () => {
  const r = parseResume('Pat Doe\npat@example.com\n\nEXPERIENCE\nAnalyst | A Co | Jan 2018 - Mar 2018\n- Did work\nAnalyst | B Co | Jan 2020 - Present\n- Did more work', NOW);
  const keys = buildResumeCards(r).map((c) => c.key);
  assert.ok(keys.some((k) => k.startsWith('story:gap')));
  assert.ok(keys.some((k) => k.startsWith('story:short')));
});

test('JD cards: gap questions for missing required skills, none for alternatives', () => {
  const jd = analyseJd(SAMPLE_JD); const r = resume(); const m = matchJd(jd, r);
  const cards = buildJdCards(jd, r, m, 'x');
  assert.ok(cards.some((c) => c.tid === 'whyCompany' && c.q.includes('Fernwood Mobility')));
  assert.ok(!cards.some((c) => c.key.endsWith('skill-bigquery')));
  assert.ok(cards.every((c) => c.sec.key === 'jd:x'));
});

test('answer checks: result, number, hedging, ownership and gaps', () => {
  const a = analyseAnswer('I built a dashboard that cut reporting time by 40%. As a result managers adopted it.', 90);
  assert.ok(a.checks.find((c) => c.id === 'result').ok && a.checks.find((c) => c.id === 'number').ok);
  const b = analyseAnswer('Maybe we kind of just did some things. I think it was probably fine. [add: result]', 90);
  assert.ok(!b.checks.find((c) => c.id === 'hedge').ok && !b.checks.find((c) => c.id === 'gaps').ok);
});

test('extractQA: numbered questions with answers, Q/A markers, imperatives, wrapped lines', () => {
  const t = `Round 1 notes
1. What is the difference between INNER JOIN and LEFT JOIN?
Inner returns only matching rows.
Left keeps all rows from the left table.

2. Tell me about a time you disagreed with a manager.
I pushed back on a deadline and proposed a smaller scope.

Q: How do you handle missing data?
A: Depends on why it is missing; I check the source first.

Explain window functions
and when you would use them
What is a primary key?`;
  const items = extractQA(t);
  assert.equal(items.length, 5);
  assert.match(items[0].q, /INNER JOIN/); assert.match(items[0].a, /Left keeps all rows/);
  assert.match(items[2].q, /missing data/); assert.match(items[2].a, /check the source/);
  assert.match(items[3].q, /window functions and when/);
  assert.equal(items[4].a, '');
  assert.deepEqual(extractQA(''), []); assert.deepEqual(extractQA('no questions here at all.'), []);
});

test('categorise and text helpers', () => {
  assert.equal(categorise('What is a window function in SQL?'), 'sql');
  assert.equal(categorise('Tell me about a time you failed'), 'behavioural');
  assert.equal(categorise('What is your notice period?'), 'hr');
  assert.ok(jaccard('What is a primary key?', 'what is primary key') > 0.6);
  assert.equal(monthsBetween(parseDate('Jan 2020'), parseDate('Mar 2020')), 2);
  assert.equal(periodOf({ start: 'Jan 2020', end: 'Present' }), 'Jan 2020 to Present');
});
