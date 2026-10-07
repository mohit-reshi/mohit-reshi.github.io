// Turns a structured resume (and optionally a JD analysis) into interview questions with starter answers.
// Starter answers use only facts from the resume. Anything the resume does not say is left as a visible gap:
// "[add: ...]". Nothing is invented.
import { norm, slug, hash, lcFirst, trunc, parseDate, monthsBetween } from './text.js';
import { skillsIn, skillLabel } from './jd.js';

export const CATS = {
  intro: { label: 'Introduction', hue: 'blue' },
  role: { label: 'Role', hue: 'yellow' },
  project: { label: 'Project', hue: 'green' },
  personal: { label: 'Personal project', hue: 'purple' },
  story: { label: 'Career story', hue: 'orange' },
  general: { label: 'Common question', hue: 'slate' },
  jd: { label: 'This job', hue: 'pink' },
  collected: { label: 'Collected', hue: 'teal' },
};

const GAP = (s) => '[add: ' + s + ']';

// What the interviewer is really testing, what a good answer holds, what to avoid, and likely follow-ups.
export const COACH = {
  yourself: { test: 'Can you give a clear, relevant summary of your career in about a minute and a half?', include: ['Present: who you are and what you do now', 'Past: two or three proof points with numbers', 'Future: why this role is the next step'], avoid: ['Reading your resume aloud', 'Personal life details', 'Going past two minutes'], followups: ['What are you proudest of?', 'Why are you looking to move?'], seconds: 90 },
  walkthrough: { test: 'Is there a logical story behind your moves, and did you choose each step?', include: ['One line per job: what you did and what you learned', 'Why each move happened', 'Growth in scope over time'], avoid: ['Listing duties', 'Apologising for short stints'], followups: ['Which job taught you the most?', 'Why did you leave the last one?'], seconds: 120 },
  looking: { test: 'Are you moving towards something, or running away from something?', include: ['A positive reason', 'What you want to learn or own next', 'A link to this role'], avoid: ['Criticising a past employer', 'Money as the only reason'], followups: ['What would make you stay?'], seconds: 45 },
  strengths: { test: 'Do you know your strengths, and can you prove them?', include: ['Two strengths that this job needs', 'A short example for each'], avoid: ['Generic words like "hard-working" with no proof'], followups: ['Give me an example.'], seconds: 45 },
  weakness: { test: 'Are you self-aware and working on it?', include: ['A real, small weakness', 'What you do about it', 'Progress so far'], avoid: ['A fake weakness such as "I work too hard"', 'A weakness the job depends on'], followups: ['How do you know it is improving?'], seconds: 45 },
  achievement: { test: 'What does "good" look like to you, and how big was your part?', include: ['Situation and your goal', 'What you personally did', 'A measurable result'], avoid: ['Saying "we" throughout', 'No numbers'], followups: ['What would you do differently?', 'Who else was involved?'], seconds: 90 },
  challenge: { test: 'How do you handle difficulty, and what do you learn from it?', include: ['The problem and why it was hard', 'Your options and why you chose one', 'The result and what you learned'], avoid: ['Blaming others', 'A problem that was easy'], followups: ['What would you do if it happened again?'], seconds: 90 },
  conflict: { test: 'Can you disagree with someone and still get to a good result?', include: ['The disagreement in neutral words', 'How you listened and what you proposed', 'The outcome and the relationship afterwards'], avoid: ['Painting the other person as the villain'], followups: ['What did you learn about yourself?'], seconds: 90 },
  failure: { test: 'Do you take responsibility and learn?', include: ['A real mistake that you owned', 'What you did to fix it', 'What you changed afterwards'], avoid: ['A story with no cost', 'Blame'], followups: ['How do you stop it happening again?'], seconds: 75 },
  pressure: { test: 'How do you prioritise and communicate when time is short?', include: ['How you decided what mattered', 'Who you told and when', 'The outcome'], avoid: ['Heroics with no planning'], followups: ['What did you say no to?'], seconds: 75 },
  influence: { test: 'Can you change a decision without having authority?', include: ['The decision and the people involved', 'The evidence you used', 'How you handled push-back'], avoid: ['Saying you just told them'], followups: ['What if they had still said no?'], seconds: 90 },
  salary: { test: 'Have you done your homework, and are you flexible and realistic?', include: ['A researched range', 'Flexibility based on the whole package', 'Interest in the role first'], avoid: ['A single fixed number too early'], followups: ['What is your current salary?'], seconds: 30 },
  notice: { test: 'Can you start when they need, and are you leaving professionally?', include: ['Your actual notice period', 'Willingness to hand over well'], avoid: ['Vague answers'], followups: [], seconds: 20 },
  ask: { test: 'Are you curious and have you thought about the job?', include: ['Two or three real questions', 'One about the team and how success is measured'], avoid: ['"No questions"', 'Asking only about pay and leave'], followups: [], seconds: 45 },
  roleOverview: { test: 'Do you understand your role and its scope?', include: ['Your title and reporting line', 'Who you worked with and for', 'The two or three things you owned'], avoid: ['A list of tasks with no outcome'], followups: ['What did your typical week look like?'], seconds: 60 },
  tools: { test: 'Do you choose tools for a reason, and how deep is your use?', include: ['What each tool was for', 'Why you chose it over another', 'One thing you know that a beginner does not'], avoid: ['Naming tools you only touched once'], followups: ['What would you use instead?'], seconds: 60 },
  stakeholders: { test: 'Can you work with non-technical people and manage expectations?', include: ['Who the stakeholders were', 'How you gathered requirements', 'How you reported back'], avoid: ['Jargon', 'Only describing meetings'], followups: ['Tell me about a difficult stakeholder.'], seconds: 60 },
  deepdive: { test: 'Is this bullet true, and do you understand how it worked?', include: ['The starting problem', 'The steps you took', 'The result and how you measured it'], avoid: ['Vague answers', 'Claiming the team’s work as yours'], followups: ['How did you check it was right?', 'What went wrong?'], seconds: 90 },
  leaving: { test: 'Why do people leave you, and how do you talk about past employers?', include: ['A calm, positive reason', 'What you gained there'], avoid: ['Criticism of managers or colleagues'], followups: ['What would have made you stay?'], seconds: 45 },
  leading: { test: 'Can you raise other people’s work, not just your own?', include: ['Who you helped and what they struggled with', 'What you did', 'How they improved'], avoid: ['Taking credit for their results'], followups: ['Tell me about someone who did not improve.'], seconds: 75 },
  projEnd: { test: 'Can you tell a whole project story, from the problem to the result?', include: ['The business problem', 'The data and method', 'The result and who used it'], avoid: ['Only talking about tools'], followups: ['What would you change?'], seconds: 120 },
  projPart: { test: 'What was your part, as opposed to the team’s?', include: ['Your specific tasks', 'Decisions you made', 'What others did'], avoid: ['"We" for everything'], followups: ['Who disagreed with you?'], seconds: 60 },
  projTrade: { test: 'Do you understand trade-offs and can you justify choices?', include: ['Two options you considered', 'Why you chose one', 'What you gave up'], avoid: ['Pretending there was only one way'], followups: ['What if the data had been ten times bigger?'], seconds: 90 },
  projRedo: { test: 'Do you reflect honestly?', include: ['One specific change', 'Why it would be better'], avoid: ['"Nothing, it was perfect"'], followups: [], seconds: 60 },
  personalWhy: { test: 'Do you learn on your own and care about the craft?', include: ['What sparked it', 'What you wanted to learn', 'What you built'], avoid: ['Apologising that it is "just" a side project'], followups: ['What was the hardest part?'], seconds: 60 },
  gap: { test: 'Is there a reason for the gap, and are you ready to work now?', include: ['A short, honest reason', 'What you did or learned', 'Why you are ready'], avoid: ['Long explanations', 'Defensiveness'], followups: [], seconds: 45 },
  short: { test: 'Is there a pattern of leaving early?', include: ['A clear, neutral reason', 'What you took from it'], avoid: ['Blame'], followups: ['Would you stay in this role?'], seconds: 45 },
  progress: { test: 'Is your career moving upward in scope?', include: ['What grew: scope, people, impact', 'What you chose to take on'], avoid: ['Titles only'], followups: [], seconds: 60 },
  whyCompany: { test: 'Have you researched them, and is your interest real?', include: ['Something specific about the company', 'How it connects to your work', 'What you would add'], avoid: ['Copying the careers page', 'Only mentioning benefits'], followups: ['What do you know about our product?'], seconds: 60 },
  whyRole: { test: 'Do you understand the role, and does it fit your direction?', include: ['What attracts you in the description', 'Evidence that you can do it', 'What you want to grow into'], avoid: ['Generic enthusiasm'], followups: ['What worries you about the role?'], seconds: 60 },
  skillShown: { test: 'Can you prove this required skill with a real example?', include: ['One strong, recent example', 'What you personally did', 'A measurable result'], avoid: ['Listing the tool without a story'], followups: ['How would you do it differently now?'], seconds: 90 },
  skillListed: { test: 'Is this skill real, or only on the resume?', include: ['Where you used it', 'How deep your use went'], avoid: ['Overclaiming'], followups: ['What is a mistake people make with it?'], seconds: 60 },
  skillGap: { test: 'How do you handle a gap honestly, and can you learn quickly?', include: ['What you have done that is closest', 'A concrete plan to close the gap', 'An example of learning fast'], avoid: ['Pretending you have the skill', 'Saying "I am a fast learner" with no proof'], followups: ['How long would it take you?'], seconds: 75 },
  respHow: { test: 'Have you done this kind of work before?', include: ['A closest example', 'What was similar and what was different'], avoid: ['A generic answer'], followups: [], seconds: 75 },
  first90: { test: 'Do you have a sensible plan to get useful quickly?', include: ['Listening first', 'One early win', 'How you would learn the data and the people'], avoid: ['Promising to change everything'], followups: [], seconds: 75 },
};

const GENERIC_COACH = { test: 'Can you answer clearly, with an example, in a reasonable time?', include: ['A direct first sentence', 'One example', 'A result or lesson'], avoid: ['Rambling', 'No example'], followups: ['Can you give another example?'], seconds: 75 };
export const COLLECTED_COACH = {
  sql: { test: 'Do you know the concept and can you apply it to a real query?', include: ['A one-line definition', 'A small example query or table', 'When it goes wrong or is slow'], avoid: ['Reciting a definition with no example'], followups: ['How would you make it faster?'], seconds: 90 },
  python: { test: 'Do you understand the language beyond copying snippets?', include: ['The idea in plain words', 'A short code example', 'A trade-off or gotcha'], avoid: ['Only naming libraries'], followups: ['What would you do with ten times more data?'], seconds: 90 },
  bi: { test: 'Can you build and explain reports that people use?', include: ['The concept and where you used it', 'A real example', 'A common mistake'], avoid: ['Only describing buttons'], followups: ['How would you check it is right?'], seconds: 90 },
  excel: { test: 'How deep is your spreadsheet skill?', include: ['The function or feature', 'A real use', 'A limit and what you use instead'], avoid: [], followups: [], seconds: 60 },
  stats: { test: 'Do you reason correctly about data?', include: ['The idea in plain words', 'A concrete example', 'A pitfall'], avoid: ['Formulas with no meaning'], followups: ['How would you explain it to a manager?'], seconds: 90 },
  behavioural: { test: 'What does your past behaviour say about how you will work?', include: ['A specific situation', 'What you did', 'The result and a lesson'], avoid: ['Generalities', 'Blame'], followups: ['What would you do differently?'], seconds: 90 },
  leadership: { test: 'Can you lead and develop others?', include: ['The people and the goal', 'What you did', 'How they changed'], avoid: ['Credit-taking'], followups: [], seconds: 75 },
  hr: { test: 'Are you realistic, professional and a good fit for the terms?', include: ['A short, honest answer', 'Flexibility where true'], avoid: ['Evasion'], followups: [], seconds: 30 },
  general: GENERIC_COACH,
};

export function coachFor(card) {
  if (!card) return GENERIC_COACH;
  if (card.source === 'collected') return COLLECTED_COACH[card.topic] || GENERIC_COACH;
  return COACH[card.tid] || GENERIC_COACH;
}

// ---------- helpers ----------
const PAST = /^(?:built|led|ran|drove|wrote|made|cut|grew|won|set up|took|brought|began|got|gave|found|taught|spoke|held|kept|sold|saw|put|chose|rebuilt|\w+ed)\b/i;
const article = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
export const periodOf = (e) => [e.start, e.end].filter(Boolean).join(' to ');
const clean = (s) => norm(s).replace(/[.;:]+$/, '');
/** "Built a dashboard..." -> "I built a dashboard..."; otherwise quote the bullet so the sentence still reads. */
export function sayBullet(b) {
  const t = clean(b);
  if (!t) return '';
  return PAST.test(t) ? 'I ' + lcFirst(t) : 'one thing I did was this: "' + trunc(t, 140) + '"';
}
const hasNum = (s) => /\d|%/.test(s);
export function topBullets(bullets, n) {
  return (bullets || []).map((b, i) => ({ b, i, score: (hasNum(b) ? 100 : 0) + Math.min(b.length, 120) / 2 - i })).sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.b);
}
const label = (e) => e.company || e.role || 'this job';
const jobKey = (e) => 'co:' + slug(e.company) + '-' + slug(e.role);

function endOf(e) { return parseDate(e.end, true); }
export function latestJob(r) {
  const jobs = (r.experience || []).slice();
  jobs.sort((a, b) => { const x = endOf(a), y = endOf(b); return (y ? y.y * 12 + y.m : 0) - (x ? x.y * 12 + x.m : 0); });
  return jobs[0] || null;
}
function topSkills(r, n) { return (r.skills || []).slice(0, n).join(', '); }
function isCurrent(e) { return /present|current|now/i.test(e.end || ''); }

// ---------- resume cards ----------
export function buildResumeCards(r) {
  const out = [];
  const add = (sec, tid, cat, key, q, a) => out.push({ key, sec, cat, tid, q, a, seconds: (COACH[tid] || GENERIC_COACH).seconds });
  const jobs = r.experience || [];
  const latest = latestJob(r);
  const name = (r.contact && r.contact.name) || '';

  // Start here
  const S1 = { key: 'intro', title: 'Start here', kind: 'resume', order: 10 };
  const prior = jobs.filter((e) => e !== latest)[0];
  const proof = latest ? topBullets(latest.bullets, 1)[0] : '';
  const proof2 = prior ? topBullets(prior.bullets, 1)[0] : '';
  const who = (r.contact && r.contact.headline) || (latest && latest.role) || GAP('your job title');
  const yrs = r.years ? 'about ' + Math.round(r.years) + ' years' : GAP('number of years');
  const sk = topSkills(r, 3) || GAP('your three main skills');
  add(S1, 'yourself', 'intro', 'intro:yourself', 'Tell me about yourself.',
    'I am ' + article(who) + ' with ' + yrs + ' of experience in ' + sk + '. ' +
    (latest && proof ? 'Most recently at ' + label(latest) + ', ' + sayBullet(proof) + '. ' : '') +
    (prior && proof2 ? 'Before that, at ' + label(prior) + ', ' + sayBullet(proof2) + '. ' : '') +
    GAP('one line on what you are best known for') + ' ' +
    'I am now looking for a role where I can ' + GAP('what you want to do next') + '.');
  add(S1, 'walkthrough', 'intro', 'intro:walkthrough', 'Walk me through your resume.',
    jobs.length ? jobs.slice().reverse().map((e) => 'At ' + label(e) + ' (' + periodOf(e) + ') I worked as ' + (e.role ? article(e.role) : GAP('role')) + '. ' + (topBullets(e.bullets, 1)[0] ? sayBullet(topBullets(e.bullets, 1)[0]) + '. ' : '') + GAP('why you moved on, or what you learned')).join('\n\n')
      : GAP('one line per job: what you did and why you moved'));
  add(S1, 'looking', 'intro', 'intro:looking', 'Why are you looking for a new role?',
    latest ? 'I have learned a lot at ' + label(latest) + ', in particular ' + GAP('one thing you learned') + '. ' + GAP('the positive reason you want to move: scope, learning, domain') + '. This role looks like the right next step because ' + GAP('link to the job') + '.' : GAP('a positive reason'));

  // Common questions
  const S2 = { key: 'general', title: 'Common questions', kind: 'resume', order: 20 };
  const bestAch = latest ? topBullets(latest.bullets, 1)[0] : '';
  add(S2, 'strengths', 'general', 'gen:strengths', 'What are your strengths?', 'My strengths are ' + GAP('strength 1') + ' and ' + GAP('strength 2') + '. For example, ' + (bestAch ? sayBullet(bestAch) : GAP('a short example')) + '.');
  add(S2, 'weakness', 'general', 'gen:weakness', 'What is your biggest weakness?', 'I have found that ' + GAP('a real, small weakness') + '. To work on it I ' + GAP('what you do about it') + ', and ' + GAP('a sign that it is improving') + '.');
  add(S2, 'achievement', 'general', 'gen:proud', 'What achievement are you most proud of?',
    bestAch ? 'The thing I am proudest of is this. ' + GAP('the situation and goal') + '. ' + sayBullet(bestAch) + '. ' + GAP('what you personally did that others might not have') + '. ' + GAP('the result, with a number if you have one') : GAP('situation, what you did, result'));
  add(S2, 'conflict', 'general', 'gen:conflict', 'Tell me about a time you disagreed with a colleague or manager.', 'The situation was ' + GAP('what the disagreement was about') + '. I ' + GAP('how you listened and what you proposed') + '. The outcome was ' + GAP('result and relationship afterwards') + '.');
  add(S2, 'failure', 'general', 'gen:failure', 'Tell me about a time you made a mistake.', 'I ' + GAP('the mistake, in one sentence') + '. I told ' + GAP('who and when') + ' and fixed it by ' + GAP('what you did') + '. Since then I ' + GAP('what you changed') + '.');
  add(S2, 'pressure', 'general', 'gen:deadline', 'How do you handle tight deadlines and competing priorities?', 'I start by ' + GAP('how you decide what matters most') + '. An example was ' + GAP('a real deadline') + ', where I ' + GAP('what you did and who you told') + '.');
  add(S2, 'influence', 'general', 'gen:influence', 'Tell me about a time you changed someone’s mind with data.', 'The decision was ' + GAP('the decision') + '. I showed ' + GAP('the evidence you used') + ', and when ' + GAP('the push-back') + ', I ' + GAP('how you handled it') + '. The result was ' + GAP('outcome') + '.');
  add(S2, 'salary', 'general', 'gen:salary', 'What are your salary expectations?', 'I would like to understand the full role first. Based on my research for ' + GAP('role and location') + ', I am looking at ' + GAP('your researched range') + ', and I am flexible depending on the whole package.');
  add(S2, 'notice', 'general', 'gen:notice', 'What is your notice period?', 'My notice period is ' + GAP('your notice period') + '. I would hand over ' + GAP('what you would hand over') + ' properly before leaving.');
  add(S2, 'ask', 'general', 'gen:ask', 'What questions do you have for us?', '1. How is success measured for this role in the first year?\n2. ' + GAP('a question about the team or data') + '\n3. ' + GAP('a question about the business problem you would work on'));

  // One section per job
  jobs.forEach((e, i) => {
    const S = { key: jobKey(e), title: (e.role || 'Role') + ' at ' + label(e), sub: periodOf(e), kind: 'resume', order: 30 + i };
    const bl = e.bullets || [];
    const tb = topBullets(bl, 2);
    add(S, 'roleOverview', 'role', S.key + ':overview', 'Tell me about your role at ' + label(e) + '.',
      'At ' + label(e) + ' I was ' + (e.role ? article(e.role) : GAP('your role')) + ' from ' + periodOf(e) + '. ' + tb.map((b) => sayBullet(b) + '.').join(' ') + ' ' + GAP('team size and who you worked with'));
    const ach = topBullets(bl.filter(hasNum), 1)[0] || topBullets(bl, 1)[0];
    add(S, 'achievement', 'role', S.key + ':achievement', 'What was your biggest achievement at ' + label(e) + '?',
      GAP('situation: what was wrong or needed') + ' ' + (ach ? sayBullet(ach) + '.' : GAP('what you did')) + ' ' + GAP('the result, with a number if you have one') + ' ' + GAP('why it mattered to the business'));
    add(S, 'challenge', 'role', S.key + ':challenge', 'What was the hardest problem you solved at ' + label(e) + '?',
      'The problem was ' + GAP('the problem and why it was hard') + '. I considered ' + GAP('two options') + ' and chose ' + GAP('which and why') + '. ' + GAP('the result and what you learned'));
    const used = skillsIn(bl.join(' ')).map(skillLabel);
    add(S, 'tools', 'role', S.key + ':tools', 'Which tools and methods did you use at ' + label(e) + ', and why?',
      used.length ? 'I mainly used ' + used.join(', ') + '. ' + GAP('what each was used for and why you chose it') : GAP('the tools you used and why'));
    add(S, 'stakeholders', 'role', S.key + ':stakeholders', 'Who did you work with at ' + label(e) + ' and how did you handle requests?',
      'I worked with ' + GAP('teams and seniority') + '. When a request came in, I ' + GAP('how you clarified the need and agreed scope') + '. I reported back by ' + GAP('how and how often') + '.');
    tb.forEach((b) => add(S, 'deepdive', 'role', S.key + ':b-' + hash(b), 'You wrote: “' + trunc(clean(b), 150) + '”. Walk me through how you did that.',
      'The starting point was ' + GAP('the problem or request') + '. ' + sayBullet(b) + '. The steps were ' + GAP('step 1, step 2, step 3') + '. I checked it by ' + GAP('how you validated it') + '. The result was ' + GAP('measured result') + '.'));
    if (bl.some((b) => /\b(mentor|coach|train|led|lead|managed|supervis)/i.test(b))) {
      const lb = bl.find((b) => /\b(mentor|coach|train|led|lead|managed|supervis)/i.test(b));
      add(S, 'leading', 'role', S.key + ':leading', 'Tell me about a time you led or mentored someone at ' + label(e) + '.', sayBullet(lb) + '. ' + GAP('who they were and what they struggled with') + ' ' + GAP('what changed for them'));
    }
    add(S, 'leaving', 'role', S.key + ':leaving', isCurrent(e) ? 'Why are you looking to leave ' + label(e) + '?' : 'Why did you leave ' + label(e) + '?',
      'I gained ' + GAP('what you gained') + ' at ' + label(e) + '. ' + GAP('a calm, positive reason for moving on') + '.');
  });

  // Projects
  (r.projects || []).forEach((p, i) => {
    const S = { key: 'pr:' + slug(p.name), title: 'Project: ' + p.name, sub: p.tech || '', kind: 'resume', order: 60 + i };
    const tb = topBullets(p.bullets, 2);
    add(S, 'projEnd', 'project', S.key + ':end', 'Describe the project “' + p.name + '” from start to finish.',
      'The problem was ' + GAP('the business problem') + '. ' + tb.map((b) => sayBullet(b) + '.').join(' ') + (p.tech ? ' I used ' + p.tech + '.' : '') + ' ' + GAP('the result and who used it'));
    add(S, 'projPart', 'project', S.key + ':part', 'What exactly was your contribution to “' + p.name + '”?', 'I personally ' + GAP('your tasks and decisions') + '. Others ' + GAP('what others did') + '.');
    add(S, 'projTrade', 'project', S.key + ':tradeoff', 'What trade-offs did you make in “' + p.name + '”?', 'I considered ' + GAP('option A and option B') + ' and chose ' + GAP('which') + ' because ' + GAP('why') + '. I gave up ' + GAP('what you gave up') + '.');
    add(S, 'projRedo', 'project', S.key + ':redo', 'What would you do differently on “' + p.name + '”?', 'I would ' + GAP('one specific change') + ', because ' + GAP('why it would be better') + '.');
  });
  (r.personal || []).forEach((p, i) => {
    const S = { key: 'pp:' + slug(p.name), title: 'Personal project: ' + p.name, sub: p.tech || '', kind: 'resume', order: 80 + i };
    const tb = topBullets(p.bullets, 2);
    add(S, 'personalWhy', 'personal', S.key + ':why', 'Why did you build “' + p.name + '”?', 'I wanted to ' + GAP('what you wanted to learn or solve') + '. ' + tb.map((b) => sayBullet(b) + '.').join(' '));
    add(S, 'personalWhy', 'personal', S.key + ':learned', 'What did you learn from “' + p.name + '”?', 'The main thing I learned was ' + GAP('lesson') + '. It changed how I ' + GAP('how it changed your work') + '.');
    add(S, 'projTrade', 'personal', S.key + ':scale', 'How would you scale or improve “' + p.name + '”?', 'First I would ' + GAP('first improvement') + ', then ' + GAP('second improvement') + '.');
  });

  // Career story: gaps, short stints, progression
  const S4 = { key: 'story', title: 'Career story', kind: 'resume', order: 90 };
  const dated = jobs.map((e) => ({ e, s: parseDate(e.start), t: parseDate(e.end, true) })).filter((x) => x.s && x.t).sort((a, b) => (a.s.y * 12 + a.s.m) - (b.s.y * 12 + b.s.m));
  for (let i = 1; i < dated.length; i++) {
    const g = monthsBetween(dated[i - 1].t, dated[i].s);
    if (g > 6) add(S4, 'gap', 'story', 'story:gap-' + slug(dated[i - 1].e.company) + '-' + slug(dated[i].e.company), 'Can you explain the gap between ' + label(dated[i - 1].e) + ' and ' + label(dated[i].e) + '?', 'Between ' + dated[i - 1].e.end + ' and ' + dated[i].e.start + ' I ' + GAP('what you did: study, caring, travel, freelance') + '. During that time I ' + GAP('what you learned or kept up') + '. I was ready to return because ' + GAP('why') + '.');
  }
  dated.forEach((x) => { const m = monthsBetween(x.s, x.t); if (m !== null && m < 12 && !isCurrent(x.e)) add(S4, 'short', 'story', 'story:short-' + slug(x.e.company), 'Why was your time at ' + label(x.e) + ' short?', 'I joined ' + label(x.e) + ' to ' + GAP('why you joined') + '. After ' + m + ' months ' + GAP('a neutral reason it changed') + '. What I took from it was ' + GAP('lesson') + '.'); });
  if (jobs.length > 1) add(S4, 'progress', 'story', 'story:progress', 'How has your career progressed?', 'I started as ' + (jobs[jobs.length - 1].role ? article(jobs[jobs.length - 1].role) : GAP('first role')) + ' and I am now ' + (jobs[0].role ? article(jobs[0].role) : GAP('current role')) + '. The scope grew from ' + GAP('what you owned then') + ' to ' + GAP('what you own now') + '.');
  return out;
}

// ---------- JD cards ----------
export function buildJdCards(jd, resume, match, jdKey) {
  const out = [];
  if (!jd) return out;
  const company = jd.company || 'the company';
  const title = jd.title || 'this role';
  const SEC = { key: 'jd:' + (jdKey || 'current'), title: 'For this job: ' + title + (jd.company ? ' at ' + jd.company : ''), kind: 'jd', order: 100 };
  const add = (tid, key, q, a) => out.push({ key: SEC.key + ':' + key, sec: SEC, cat: 'jd', tid, q, a, seconds: (COACH[tid] || GENERIC_COACH).seconds });
  add('whyCompany', 'why-company', 'Why do you want to work at ' + company + '?', 'What attracted me to ' + company + ' is ' + GAP('something specific you found about them') + '. It connects to my work on ' + GAP('your relevant experience') + '. I would add ' + GAP('what you would bring') + '.');
  add('whyRole', 'why-role', 'Why are you interested in the ' + title + ' role?', 'The description stood out to me because ' + GAP('what attracted you') + '. I have done similar work: ' + GAP('closest example from your resume') + '. Next I want to ' + GAP('what you want to grow into') + '.');
  const rows = (match && match.rows) || [];
  rows.filter((r) => !r.optional && r.status !== 'alt').slice(0, 10).forEach((r) => {
    if (r.status === 'shown') {
      add('skillShown', 'skill-' + r.id, 'The role asks for ' + r.label + '. Tell me about your strongest example.', (r.evidence[0] ? sayBullet(r.evidence[0].text) + ' (' + r.evidence[0].where + '). ' : '') + GAP('the situation, what you personally did, and the result'));
    } else if (r.status === 'listed') {
      add('skillListed', 'skill-' + r.id, 'You list ' + r.label + '. Where have you used it?', 'I used ' + r.label + ' ' + GAP('where, for what, and how deep'));
    } else {
      add('skillGap', 'skill-' + r.id, 'The role asks for ' + r.label + ', and your resume does not show it. How would you approach that?', 'I have not used ' + r.label + ' in a job yet. The closest thing I have done is ' + GAP('your closest experience') + '. To close the gap I would ' + GAP('a concrete plan with a timeline') + '. For example, I learned ' + GAP('something you learned quickly') + ' by ' + GAP('how') + '.');
    }
  });
  (jd.responsibilities || []).slice(0, 3).forEach((t) => add('respHow', 'resp-' + hash(t), 'This role involves: “' + trunc(t, 120) + '”. How have you done this before?', 'The closest thing I have done is ' + GAP('your example') + '. What was similar was ' + GAP('what was similar') + ', and what would be new is ' + GAP('what would be new') + '.'));
  if (jd.seniority === 'senior' || jd.seniority === 'lead') add('leading', 'mentor', 'How do you raise the standard of analysis across a team?', GAP('how you review work, share methods and coach people') + '. For example ' + GAP('a real case') + '.');
  add('first90', 'first-90', 'What would you do in your first 90 days in this role?', 'In the first month I would listen and learn ' + GAP('the data, the main stakeholders and how decisions are made') + '. By day sixty I would ' + GAP('a first useful piece of work') + '. By day ninety I would ' + GAP('what you would own'));
  add('ask', 'ask-them', 'What questions do you have about ' + company + '?', '1. ' + GAP('a question about the data and tools used by the team') + '\n2. ' + GAP('a question about how analysis changes decisions') + '\n3. What does success look like in the first year?');
  return out;
}

// ---------- collected questions ----------
const TOPIC_RULES = [
  ['sql', /\b(sql|join|group by|window function|query|index|cte|subquery|stored procedure|normali[sz]ation|primary key|database)\b/i],
  ['python', /\b(python|pandas|numpy|dataframe|list comprehension|decorator|lambda|pyspark)\b/i],
  ['bi', /\b(power bi|dax|tableau|dashboard|power query|looker|measure|semantic model|data model|report)\b/i],
  ['excel', /\b(excel|vlookup|xlookup|pivot|spreadsheet|macro|vba)\b/i],
  ['stats', /\b(statistic|p-value|hypothesis|regression|a\/b|probability|standard deviation|correlation|confidence interval|bias|variance)\b/i],
  ['leadership', /\b(lead|mentor|manage a team|delegate|coach)\b/i],
  ['hr', /\b(salary|notice period|relocat|visa|expected ctc|current ctc|notice|joining)\b/i],
  ['behavioural', /\b(tell me about a time|describe a situation|conflict|strength|weakness|why do you want|why should we|yourself|failure|mistake|disagree|challenge|proud)\b/i],
];
export function categorise(q) {
  for (const [t, rx] of TOPIC_RULES) if (rx.test(q)) return t;
  return 'general';
}
export const TOPIC_LABEL = { sql: 'SQL', python: 'Python', bi: 'BI and modelling', excel: 'Excel', stats: 'Statistics', behavioural: 'Behavioural', leadership: 'Leadership', hr: 'HR and terms', general: 'General' };

export function scaffoldFor(topic) {
  const g = (s) => '[add: ' + s + ']';
  switch (topic) {
    case 'sql': return g('a one-line definition') + '\n' + g('a small example query') + '\n' + g('when it is slow or goes wrong');
    case 'python': return g('the idea in plain words') + '\n' + g('a short code example') + '\n' + g('a trade-off');
    case 'bi': return g('the concept and where you used it') + '\n' + g('a real example') + '\n' + g('a common mistake');
    case 'stats': return g('the idea in plain words') + '\n' + g('a concrete example') + '\n' + g('a pitfall');
    case 'behavioural': case 'leadership': return 'Situation: ' + g('what was happening') + '\nWhat I did: ' + g('your actions') + '\nResult: ' + g('outcome with a number') + '\nWhat I learned: ' + g('lesson');
    case 'hr': return g('a short, honest answer');
    default: return g('your answer');
  }
}
