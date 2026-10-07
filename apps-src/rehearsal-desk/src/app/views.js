// Views other than the board: Home, Resume (content, checks, design), Match, Editor, Practice, and the admin views.
// Uses the shared state (S, UI) from store.js and helpers from core/.

const LEVEL_TXT = { pass: 'Pass', warn: 'Check', fail: 'Fix', info: 'Note' };
const STATUS_LABEL = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', closed: 'Closed' };

const fld = (id, label, val, attrs) => '<label class="field"><span>' + esc(label) + '</span><input id="' + id + '" value="' + esc(val || '') + '" ' + (attrs || '') + '></label>';
const area = (id, label, val, rows, attrs) => '<label class="field"><span>' + esc(label) + '</span><textarea id="' + id + '" rows="' + (rows || 4) + '" ' + (attrs || '') + '>' + esc(val || '') + '</textarea></label>';

// ---------- Home ----------
export function renderHome() {
  const admin = isAdmin();
  const jd = S.jds[S.activeJd];
  const r = S.resume;
  const cardsN = Object.values(S.cards).filter((c) => !c.archived).length;
  const ch = r ? checks() : null;
  const tiles = r ? '<div class="tiles">' +
    '<div class="tile"><b>' + (r.experience || []).length + '</b><span>jobs found</span></div>' +
    '<div class="tile"><b>' + ((r.projects || []).length + (r.personal || []).length) + '</b><span>projects found</span></div>' +
    '<div class="tile"><b>' + (r.skills || []).length + '</b><span>skills found</span></div>' +
    '<div class="tile"><b>' + cardsN + '</b><span>question cards</span></div>' +
    '<div class="tile"><b>' + (ch ? ch.passed + '/' + ch.total : '-') + '</b><span>readability checks passed</span></div></div>' : '';
  return '<section class="home">' +
    '<div class="hero"><h1>Rehearse the answers you will actually give.</h1>' +
    '<p>Paste your resume. Rehearsal Desk finds your jobs and projects, writes starter answers from your own facts, and turns them into cards you can edit, perfect and practise. Add a job description for questions about that role.</p>' +
    '<p class="privacy"><strong>Private by design.</strong> Your resume and answers stay in this browser. Nothing is uploaded.</p></div>' +
    (S.sample ? '<div class="notice">Showing a fictional sample (Jordan Avery, a senior data analyst). Replace the text below with your own and press Analyse. Nothing here is saved until then.</div>' : '') +
    '<div class="two">' +
    '<div class="panel"><h2>Your resume</h2><textarea id="resume-in" rows="16" spellcheck="false" aria-label="Resume text">' + esc(S.resumeText) + '</textarea>' +
    '<div class="row"><label class="btn small file">Upload .docx, .txt or .md<input type="file" id="resume-file" accept=".docx,.txt,.md,.text" hidden></label><button class="btn small" data-action="clear-resume">Clear</button></div>' +
    '<p class="hint">For a PDF, copy its text and paste it here. Re-reading the text replaces the changes you made on the Resume tab, but answers you wrote for unchanged facts are kept.</p></div>' +
    '<div class="panel"><h2>Job description <span class="opt">optional</span></h2><textarea id="jd-in" rows="16" spellcheck="false" aria-label="Job description text">' + esc(jd ? jd.text : '') + '</textarea>' +
    '<div class="row"><label class="btn small file">Upload .docx, .txt or .md<input type="file" id="jd-file" accept=".docx,.txt,.md,.text" hidden></label><button class="btn small" data-action="clear-jd">Clear</button>' +
    (admin ? '<button class="btn small" data-action="save-jd-lib">Save to my JD library</button>' : '') + '</div></div></div>' +
    '<div class="row actions"><button class="btn primary big" data-action="analyse">Analyse resume and job description</button>' +
    (S.sample ? '' : '<button class="btn" data-action="use-sample">Use the sample again</button>') + '</div>' +
    (UI.notice ? '<p class="status" role="status">' + esc(UI.notice) + '</p>' : '') + tiles +
    (r && r.warnings && r.warnings.length ? '<div class="warns"><strong>Please check:</strong><ul>' + r.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul><a class="btn small" href="#/resume">Review what was found</a></div>' : '') +
    (r ? '<div class="row"><a class="btn" href="#/resume">What we found in your resume</a><a class="btn" href="#/board">Open the question cards</a>' + (jd && jd.analysis ? '<a class="btn" href="#/match">Resume and job match</a>' : '') + '</div>' : '') +
    '</section>';
}

// ---------- Resume ----------
function jobEditor(e, i) {
  return '<div class="entry" data-kind="job" data-i="' + i + '"><div class="entry-head"><h4>' + esc(e.role || 'Role') + ' at ' + esc(e.company || 'company') + '</h4>' + (e.confidence === 'low' ? '<span class="flag">Please check</span>' : '') + '<button class="btn small" data-action="del-entry" data-kind="job" data-i="' + i + '">Remove</button></div>' +
    '<div class="grid2">' + fld('job-' + i + '-role', 'Role', e.role, 'data-f="role"') + fld('job-' + i + '-company', 'Company', e.company, 'data-f="company"') + fld('job-' + i + '-start', 'Start', e.start, 'data-f="start"') + fld('job-' + i + '-end', 'End', e.end, 'data-f="end"') + '</div>' +
    area('job-' + i + '-bullets', 'Bullets (one per line)', (e.bullets || []).join('\n'), 6, 'data-f="bullets"') + '</div>';
}
function projEditor(p, i, kind) {
  return '<div class="entry" data-kind="' + kind + '" data-i="' + i + '"><div class="entry-head"><h4>' + esc(p.name || 'Project') + '</h4><button class="btn small" data-action="del-entry" data-kind="' + kind + '" data-i="' + i + '">Remove</button></div>' +
    '<div class="grid2">' + fld(kind + '-' + i + '-name', 'Name', p.name, 'data-f="name"') + fld(kind + '-' + i + '-tech', 'Tools', p.tech, 'data-f="tech"') + '</div>' +
    area(kind + '-' + i + '-bullets', 'Bullets (one per line)', (p.bullets || []).join('\n'), 4, 'data-f="bullets"') + '</div>';
}
export function renderResumeContent() {
  const r = S.resume; const c = r.contact || {};
  return '<div class="editor">' +
    (r.warnings && r.warnings.length ? '<div class="warns"><strong>Please check:</strong><ul>' + r.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '') +
    '<fieldset><legend>Contact</legend><div class="grid2">' + fld('c-name', 'Name', c.name, 'data-f="name"') + fld('c-headline', 'Headline', c.headline, 'data-f="headline"') + fld('c-email', 'Email', c.email, 'data-f="email"') + fld('c-phone', 'Phone', c.phone, 'data-f="phone"') + fld('c-location', 'Location', c.location, 'data-f="location"') + '</div>' +
    area('c-links', 'Links (one per line)', (c.links || []).join('\n'), 2, 'data-f="links"') + '</fieldset>' +
    '<fieldset><legend>Summary</legend>' + area('r-summary', 'Summary', r.summary, 4, 'data-f="summary"') + '</fieldset>' +
    '<fieldset><legend>Experience</legend>' + (r.experience || []).map(jobEditor).join('') + '<button class="btn small" data-action="add-entry" data-kind="job">Add a job</button></fieldset>' +
    '<fieldset><legend>Projects</legend>' + (r.projects || []).map((p, i) => projEditor(p, i, 'project')).join('') + '<button class="btn small" data-action="add-entry" data-kind="project">Add a project</button></fieldset>' +
    '<fieldset><legend>Personal projects</legend>' + (r.personal || []).map((p, i) => projEditor(p, i, 'personal')).join('') + '<button class="btn small" data-action="add-entry" data-kind="personal">Add a personal project</button></fieldset>' +
    '<fieldset><legend>Skills, education and certifications</legend>' + area('r-skills', 'Skills (separate with commas)', (r.skills || []).join(', '), 3, 'data-f="skills"') + area('r-education', 'Education (one per line)', (r.education || []).join('\n'), 3, 'data-f="education"') + area('r-certs', 'Certifications (one per line)', (r.certifications || []).join('\n'), 2, 'data-f="certifications"') + '</fieldset>' +
    '<div class="sticky-actions"><button class="btn primary" data-action="save-resume">Save and refresh questions</button><span class="muted" id="resume-dirty"></span></div></div>';
}
export function renderResumeChecks() {
  const ch = checks();
  const areas = [...new Set(ch.items.map((i) => i.area))];
  return '<div class="checks"><p class="hint">These are readability checks, the things an automated reader or a quick skim trips on. They are not a real ATS score, and every employer’s system differs.</p>' +
    '<div class="meter-line"><strong>' + ch.passed + ' of ' + ch.total + '</strong> checks passed</div>' +
    areas.map((a) => '<section><h3>' + esc(a) + '</h3><ul class="checklist">' + ch.items.filter((i) => i.area === a).map((i) => '<li class="lvl-' + i.level + '"><span class="lvl">' + LEVEL_TXT[i.level] + '</span><div><strong>' + esc(i.title) + '</strong>' + (i.detail ? '<p>' + esc(i.detail) + '</p>' : '') + '</div></li>').join('') + '</ul></section>').join('') +
    '<section><h3>Suggestions for your bullets</h3>' + (ch.suggestions.length ? '<ul class="sugg">' + ch.suggestions.map((s) => '<li><span class="chip">' + esc(s.where) + '</span><q>' + esc(trunc(s.bullet, 140)) + '</q><p>' + esc(s.text) + '</p></li>').join('') + '</ul>' : '<p class="muted">Nothing to suggest.</p>') + '</section></div>';
}

// ---------- Resume print templates ----------
export const TEMPLATES = [
  { id: 'classic', name: 'Classic', note: 'Serif, single column, thin rules. Safest for ATS.', ats: true },
  { id: 'modern', name: 'Modern', note: 'Clean sans-serif with a coloured name bar.', ats: true },
  { id: 'compact', name: 'Compact', note: 'Dense, fits more on one page.', ats: true },
  { id: 'editorial', name: 'Editorial', note: 'Large name, generous spacing.', ats: true },
  { id: 'technical', name: 'Technical', note: 'Skills grid up front, for analyst and engineering roles.', ats: true },
];
export function resumeHtml(r, tpl, inc) {
  const c = r.contact || {};
  inc = inc || {};
  const contact = [c.email, c.phone, c.location].concat(c.links || []).filter(Boolean).map((x) => '<span>' + esc(x) + '</span>').join('');
  const job = (e) => '<div class="r-entry"><div class="r-head"><strong>' + esc(e.role || '') + '</strong>' + (e.company ? '<span class="r-co">' + esc(e.company) + (e.location ? ', ' + esc(e.location) : '') + '</span>' : '') + '<span class="r-date">' + esc([e.start, e.end].filter(Boolean).join(' – ')) + '</span></div>' + ((e.bullets || []).length ? '<ul>' + e.bullets.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '') + '</div>';
  const proj = (p) => '<div class="r-entry"><div class="r-head"><strong>' + esc(p.name || '') + '</strong>' + (p.tech ? '<span class="r-co">' + esc(p.tech) + '</span>' : '') + '</div>' + ((p.bullets || []).length ? '<ul>' + p.bullets.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '') + '</div>';
  const skills = (r.skills || []).length ? '<section class="r-sec r-skills"><h2>Skills</h2>' + (tpl === 'technical' ? '<ul class="r-grid">' + r.skills.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '<p>' + r.skills.map(esc).join(' · ') + '</p>') + '</section>' : '';
  return '<div class="resume tpl-' + tpl + '"><header class="r-top"><h1>' + esc(c.name || '') + '</h1>' + (c.headline ? '<p class="r-headline">' + esc(c.headline) + '</p>' : '') + '<p class="r-contact">' + contact + '</p></header>' +
    (r.summary ? '<section class="r-sec"><h2>Summary</h2><p>' + esc(r.summary) + '</p></section>' : '') +
    (tpl === 'technical' ? skills : '') +
    ((r.experience || []).length ? '<section class="r-sec"><h2>Experience</h2>' + r.experience.map(job).join('') + '</section>' : '') +
    (inc.projects !== false && (r.projects || []).length ? '<section class="r-sec"><h2>Projects</h2>' + r.projects.map(proj).join('') + '</section>' : '') +
    (inc.personal !== false && (r.personal || []).length ? '<section class="r-sec"><h2>Personal projects</h2>' + r.personal.map(proj).join('') + '</section>' : '') +
    (tpl !== 'technical' ? skills : '') +
    (inc.education !== false && (r.education || []).length ? '<section class="r-sec"><h2>Education</h2><ul class="plain">' + r.education.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>' : '') +
    (inc.certifications !== false && (r.certifications || []).length ? '<section class="r-sec"><h2>Certifications</h2><ul class="plain">' + r.certifications.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>' : '') + '</div>';
}
export function renderResumeDesign() {
  const t = S.ui.template; const inc = S.ui.include;
  return '<div class="design"><div class="design-side"><h3>Style</h3><div class="tpls" role="radiogroup" aria-label="Resume style">' +
    TEMPLATES.map((x) => '<button class="tpl" role="radio" aria-checked="' + (t === x.id) + '" data-action="template" data-v="' + x.id + '"><strong>' + x.name + '</strong><span>' + esc(x.note) + '</span><em>ATS-friendly: single column, real text</em></button>').join('') + '</div>' +
    '<h3>Page</h3><div class="seg" role="group" aria-label="Paper size"><button class="seg-btn" data-action="paper" data-v="a4" aria-pressed="' + (S.ui.paper === 'a4') + '">A4</button><button class="seg-btn" data-action="paper" data-v="letter" aria-pressed="' + (S.ui.paper === 'letter') + '">Letter</button></div>' +
    '<h3>Include</h3>' + [['projects', 'Projects'], ['personal', 'Personal projects'], ['education', 'Education'], ['certifications', 'Certifications']].map(([k, l]) => '<label class="check"><input type="checkbox" data-action="include" data-k="' + k + '"' + (inc[k] ? ' checked' : '') + '> ' + l + '</label>').join('') +
    '<button class="btn primary big" data-action="print">Download as PDF</button><p class="hint">This opens your browser’s print window. Choose "Save as PDF" as the destination and turn off "Headers and footers" for a clean page. The PDF keeps real, selectable text.</p></div>' +
    '<div class="design-view"><div class="paper-wrap"><div class="paper ' + S.ui.paper + '" id="paper-preview">' + resumeHtml(S.resume, t, inc) + '</div></div></div></div>';
}
export function renderResume() {
  if (!S.resume) return '<div class="empty"><strong>No resume yet.</strong><p>Paste one on <a href="#/home">Home</a>.</p></div>';
  const tabs = [['content', 'What we found'], ['checks', 'Checks and suggestions'], ['design', 'Design and PDF']];
  return '<section class="resume-view"><div class="tabs2" role="tablist">' + tabs.map(([v, l]) => '<button role="tab" class="tab2" aria-selected="' + (UI.resumeTab === v) + '" data-action="resume-tab" data-v="' + v + '">' + l + '</button>').join('') + '</div>' +
    (S.sample ? '<div class="notice">Sample resume: changes are not saved.</div>' : '') +
    (UI.resumeTab === 'content' ? renderResumeContent() : UI.resumeTab === 'checks' ? renderResumeChecks() : renderResumeDesign()) + '</section>';
}

// ---------- Match ----------
export function renderMatch() {
  const jd = S.jds[S.activeJd];
  if (!jd || !jd.analysis) return '<div class="empty"><strong>No job description yet.</strong><p>Paste one on <a href="#/home">Home</a>' + (isAdmin() ? ' or choose one in <a href="#/jds">My JDs</a>' : '') + '.</p></div>';
  const m = matchFor(jd.id); const a = jd.analysis;
  const lab = { shown: 'Shown in your resume', listed: 'Only in your skills list', missing: 'Not found', alt: 'Covered by an alternative' };
  return '<section class="match">' + (S.sample ? '<div class="notice">Fictional sample job. Changes are not saved.</div>' : '') +
    '<div class="match-head"><div><h2>' + esc(jd.title || a.title || 'Job') + '</h2><p class="sub">' + esc([jd.company || a.company, a.location, a.seniority ? a.seniority + ' level' : '', a.years ? a.years + '+ years asked' : ''].filter(Boolean).join(' · ')) + '</p></div>' +
    (m && m.score !== null ? '<div class="score"><b>' + m.score + '%</b><span>of required skills shown</span></div>' : '') + '</div>' +
    (isAdmin() ? '<div class="row"><button class="btn primary" data-action="rerun-jd" data-id="' + esc(jd.id) + '">Analyse this JD again</button><span class="muted">Re-reads the text, updates this JD’s cards and saves. Cards you edited or perfected are kept.</span></div>' + (UI.notice ? '<p class="status" role="status">' + esc(UI.notice) + '</p>' : '') : '') +
    '<div class="two"><div class="panel"><h3>Skills the job asks for</h3><table class="tbl"><thead><tr><th>Skill</th><th>Where you stand</th></tr></thead><tbody>' + m.rows.map((r) => '<tr class="st-' + r.status + '"><td>' + esc(r.label) + (r.optional ? ' <span class="chip">nice to have</span>' : '') + '</td><td><strong>' + lab[r.status] + '</strong>' + (r.altOf ? ' (' + esc(r.altOf) + ')' : '') + (r.evidence[0] ? '<br><span class="muted">' + esc(r.evidence[0].where) + ': ' + esc(trunc(r.evidence[0].text, 90)) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<div class="panel"><h3>What the recruiter is testing</h3><ul>' + (a.themes.length ? a.themes.map((t) => '<li>' + esc(t) + '</li>').join('') : '<li>Fit for the role and clear communication.</li>') + '</ul>' +
    '<h3>What to do about it</h3><ul>' + (m.suggestions.length ? m.suggestions.map((t) => '<li>' + esc(t) + '</li>').join('') : '<li>Your resume covers what the job asks for. Rehearse the examples.</li>') + '</ul>' +
    (m.extras.length ? '<h3>Your strengths the job did not mention</h3><p>' + m.extras.map(esc).join(', ') + '</p>' : '') + '</div></div>' +
    (a.responsibilities.length ? '<div class="panel"><h3>Main responsibilities</h3><ul>' + a.responsibilities.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>' : '') +
    '<div class="row"><a class="btn" href="#/board">See the questions for this job</a></div></section>';
}

// ---------- Editor ----------
export function renderEdit(id) {
  const c = getCard(id);
  if (!c) return '<div class="empty"><strong>That card no longer exists.</strong><p><a href="#/board">Back to the cards</a></p></div>';
  const coach = coachFor(c); const an = analyseAnswer(c.a, coach.seconds || c.seconds);
  const sec = S.sections[c.secId];
  const done = c.status === 'perfected';
  return '<section class="edit hue-' + (HUE_OF[c.cat] || 'slate') + '"><div class="edit-top"><button class="btn" data-action="back-to-card" data-id="' + esc(c.id) + '">← Back to the card</button><span class="muted">' + esc(sec ? sec.title : '') + '</span><span id="save-state" class="muted" role="status"></span></div>' +
    (S.sample ? '<div class="notice">Sample card: edits are not saved. Add your own resume on Home to start saving.</div>' : '') +
    '<div class="edit-grid"><div class="edit-main"><h1 class="q">' + esc(c.q) + '</h1>' +
    '<label class="field"><span>Your answer</span><textarea id="answer" rows="14" data-id="' + esc(c.id) + '" aria-describedby="live-checks">' + esc(c.a) + '</textarea></label>' +
    '<p class="hint">Replace each <mark class="gap">[add: ...]</mark> with your own fact. Starter answers use only what your resume says.</p>' +
    '<div class="row"><button class="btn primary' + (done ? ' on' : '') + '" data-action="perfect" data-id="' + esc(c.id) + '" aria-pressed="' + done + '">' + (done ? 'Perfected. Click to reopen' : 'Mark as perfected') + '</button><button class="btn" data-action="reset-answer" data-id="' + esc(c.id) + '">Reset to the starter answer</button>' + (isAdmin() ? '<button class="btn" data-action="delete-card" data-id="' + esc(c.id) + '">Delete card</button>' : '') + '</div></div>' +
    '<aside class="edit-side"><div class="panel" id="live-checks">' + liveChecks(an, coach) + '</div>' +
    '<div class="panel"><h3>What they are really testing</h3><p>' + esc(coach.test) + '</p><h3>A good answer includes</h3><ul>' + coach.include.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul><h3>Avoid</h3><ul>' + coach.avoid.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' + (coach.followups.length ? '<h3>Likely follow-ups</h3><ul>' + coach.followups.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>' +
    '<div class="panel"><h3>Earlier versions</h3>' + (c.history.length ? '<ul class="hist">' + c.history.map((h, i) => '<li><span class="muted">' + new Date(h.at).toLocaleString() + '</span><p>' + esc(trunc(h.a, 160)) + '</p><button class="btn small" data-action="restore" data-id="' + esc(c.id) + '" data-i="' + i + '">Restore</button></li>').join('') + '</ul>' : '<p class="muted">Earlier versions appear here when you change an answer.</p>') + '</div></aside></div></section>';
}
const HUE_OF = { intro: 'blue', role: 'yellow', project: 'green', personal: 'purple', story: 'orange', general: 'slate', jd: 'pink', collected: 'teal' };
export function liveChecks(an, coach) {
  return '<h3>Checks as you write</h3><p class="stat"><b>' + an.words + '</b> words · about <b>' + an.seconds + ' s</b> spoken' + (coach.seconds ? ' (aim for about ' + coach.seconds + ' s)' : '') + '</p><ul class="checklist">' + an.checks.map((k) => '<li class="lvl-' + (k.ok ? 'pass' : 'warn') + '"><span class="lvl">' + (k.ok ? 'Pass' : 'Check') + '</span><div>' + esc(k.text) + '</div></li>').join('') + '</ul>' +
    '<p class="muted">Situation ' + (an.star.situation ? 'yes' : 'not yet') + ' · Task ' + (an.star.task ? 'yes' : 'not yet') + ' · Action ' + (an.star.action ? 'yes' : 'not yet') + ' · Result ' + (an.star.result ? 'yes' : 'not yet') + '</p>';
}

// ---------- Practice ----------
export function practicePool() {
  const sc = UI.practice && UI.practice.scope || 'draft';
  const all = sectionsInOrder().flatMap((x) => x.cards);
  const now = Date.now();
  return all.filter((c) => sc === 'all' ? true : sc === 'draft' ? c.status !== 'perfected' : sc === 'perfected' ? c.status === 'perfected' : sc === 'due' ? (!c.practice || now - c.practice.last > 7 * 864e5) : c.secId === sc);
}
export function renderPractice() {
  const p = UI.practice || (UI.practice = { scope: 'draft', deck: null, i: 0, reveal: false, t0: 0 });
  const secs = sectionsInOrder();
  const head = '<div class="row"><label class="field inline"><span>Practise</span><select id="pr-scope" data-action="pr-scope">' +
    [['draft', 'Answers that need work'], ['due', 'Not practised this week'], ['perfected', 'Perfected answers'], ['all', 'Everything']].map(([v, l]) => '<option value="' + v + '"' + (p.scope === v ? ' selected' : '') + '>' + l + '</option>').join('') +
    secs.map((x) => '<option value="' + esc(x.s.id) + '"' + (p.scope === x.s.id ? ' selected' : '') + '>' + esc(x.s.title) + '</option>').join('') + '</select></label><button class="btn primary" data-action="pr-start">Start</button></div>';
  if (!p.deck) return '<section class="practice">' + head + '<div class="empty"><strong>Choose what to practise and press Start.</strong><p>You see the question first. Answer out loud, then reveal your saved answer and rate yourself.</p></div></section>';
  const c = getCard(p.deck[p.i]);
  if (!c) return '<section class="practice">' + head + '<div class="empty"><strong>Round finished.</strong><p>' + p.deck.length + ' questions. <button class="btn small" data-action="pr-start">Go again</button></p></div></section>';
  const target = coachFor(c).seconds || c.seconds;
  return '<section class="practice">' + head + '<div class="pr-card card hue-' + (HUE_OF[c.cat] || 'slate') + '"><div class="card-top"><span class="cat">' + esc((CATS[c.cat] || {}).label || '') + '</span><span class="muted">Question ' + (p.i + 1) + ' of ' + p.deck.length + '</span><span class="timer" id="pr-timer" data-t0="' + p.t0 + '" data-target="' + target + '">0:00 / ' + Math.floor(target / 60) + ':' + String(target % 60).padStart(2, '0') + '</span></div>' +
    '<h2 class="q">' + esc(c.q) + '</h2>' +
    (p.reveal ? '<div class="a">' + (norm(c.a) ? markGaps(c.a) : '<span class="muted">No answer written yet.</span>') + '</div><div class="row"><button class="btn" data-action="pr-rate" data-ok="0">Needs work</button><button class="btn primary" data-action="pr-rate" data-ok="1">Nailed it</button><button class="btn small" data-action="edit" data-id="' + esc(c.id) + '">Edit this answer</button></div>'
      : '<p class="hint">Say your answer out loud first.</p><div class="row"><button class="btn primary" data-action="pr-reveal">Show my answer</button><button class="btn" data-action="pr-skip">Skip</button></div>') + '</div></section>';
}

// ---------- Admin: JD library ----------
export function renderJds() {
  const list = Object.values(S.jds).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const q = norm(UI.jdSearch || '').toLowerCase();
  const rows = list.filter((j) => !q || [j.company, j.title, j.hr && j.hr.name, j.hr && j.hr.email, j.notes].join(' ').toLowerCase().includes(q));
  const cur = S.jds[S.activeJd];
  return '<section class="jds"><div class="row"><h2>My job descriptions</h2><span class="pill">Admin</span><button class="btn" data-action="new-jd">New JD</button><label class="search"><span class="sr">Search JDs</span><input type="search" id="jd-search" placeholder="Search company, role, contact" value="' + esc(UI.jdSearch || '') + '"></label></div>' +
    (rows.length ? '<ul class="jdlist">' + rows.map((j) => '<li class="' + (j.id === S.activeJd ? 'active' : '') + '"><button class="jd-open" data-action="open-jd" data-id="' + esc(j.id) + '"><strong>' + esc(j.company || 'Company not set') + '</strong><span>' + esc(j.title || 'Role not set') + '</span><span class="chip st-' + esc(j.status) + '">' + esc(STATUS_LABEL[j.status] || j.status) + '</span>' + (j.interviewDate ? '<span class="chip">Interview ' + esc(j.interviewDate) + countdown(j.interviewDate) + '</span>' : '') + '</button></li>').join('') + '</ul>' : '<div class="empty"><strong>No job descriptions yet.</strong><p>Press New JD, or paste one on Home and choose "Save to my JD library".</p></div>') +
    (cur ? jdDetail(cur) : '') + '</section>';
}
function countdown(d) { const t = new Date(d + 'T00:00:00').getTime(); if (isNaN(t)) return ''; const n = Math.ceil((t - Date.now()) / 864e5); return n === 0 ? ' (today)' : n > 0 ? ' (in ' + n + ' d)' : ''; }
function jdDetail(j) {
  return '<div class="panel jd-detail" data-id="' + esc(j.id) + '"><h3>' + esc(j.company || 'New job description') + '</h3>' +
    '<div class="grid2">' + fld('jd-company', 'Company', j.company, 'data-f="company"') + fld('jd-title', 'Role', j.title, 'data-f="title"') + fld('jd-hr-name', 'HR or recruiter name', j.hr && j.hr.name, 'data-f="hr.name"') + fld('jd-hr-email', 'HR email', j.hr && j.hr.email, 'data-f="hr.email" type="email"') + fld('jd-hr-phone', 'HR phone', j.hr && j.hr.phone, 'data-f="hr.phone"') + fld('jd-link', 'Job link', j.link, 'data-f="link"') +
    '<label class="field"><span>Status</span><select id="jd-status" data-f="status">' + Object.keys(STATUS_LABEL).map((k) => '<option value="' + k + '"' + (j.status === k ? ' selected' : '') + '>' + STATUS_LABEL[k] + '</option>').join('') + '</select></label>' + fld('jd-date', 'Interview date', j.interviewDate, 'data-f="interviewDate" type="date"') + '</div>' +
    area('jd-notes', 'Notes', j.notes, 3, 'data-f="notes"') + area('jd-text', 'Job description text', j.text, 10, 'data-f="text"') +
    '<div class="row"><button class="btn primary" data-action="rerun-jd" data-id="' + esc(j.id) + '">Analyse this JD</button><a class="btn" href="#/match">See the match</a><a class="btn" href="#/board">See the cards</a><button class="btn danger" data-action="delete-jd" data-id="' + esc(j.id) + '">Delete this JD</button></div>' +
    (UI.notice ? '<p class="status" role="status">' + esc(UI.notice) + '</p>' : '') + (j.analysedAt ? '<p class="muted">Last analysed ' + new Date(j.analysedAt).toLocaleString() + '</p>' : '') + '</div>';
}

// ---------- Admin: collected questions ----------
export function renderCollected() {
  return '<section class="collected"><div class="row"><h2>Collected questions</h2><span class="pill">Admin</span></div>' +
    '<p class="hint">Paste questions you found yourself, with answers if you have them: notes, an email, a forum thread, a document. Press Extract. A new section named with today’s date is created, and you can move the cards to other sections yourself.</p>' +
    '<label class="field"><span>Label (optional), for example the company or the round</span><input id="col-label" placeholder="Round 1 notes" autocomplete="off"></label>' +
    '<label class="field"><span>Pasted text</span><textarea id="col-text" rows="14" placeholder="1. What is the difference between INNER JOIN and LEFT JOIN?&#10;Inner returns only matching rows...&#10;&#10;Q: How do you handle missing data?&#10;A: ..."></textarea></label>' +
    '<div class="row"><button class="btn primary" data-action="extract">Extract questions</button><label class="btn file">Load a .txt, .md or .docx<input type="file" id="col-file" accept=".docx,.txt,.md,.text" hidden></label></div>' +
    (UI.notice ? '<p class="status" role="status">' + esc(UI.notice) + '</p>' : '') +
    '<h3>Earlier imports</h3>' + (S.batches.length ? '<ul class="batches">' + S.batches.map((b) => '<li><strong>' + esc((S.sections[b.secId] || {}).title || 'Section moved or deleted') + '</strong>' + (b.label ? ' <span class="chip">' + esc(b.label) + '</span>' : '') + ' <span class="muted">' + b.count + ' questions</span></li>').join('') + '</ul>' : '<p class="muted">None yet.</p>') + '</section>';
}
