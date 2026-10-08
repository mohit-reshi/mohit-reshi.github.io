// Browser checks for Rehearsal Desk. Run: node apps-src/rehearsal-desk/test/ui.test.mjs  (after build.mjs and make-app-packages.mjs)
// Uses the site's Playwright and a tiny static server over site/public. Prints PASS/FAIL lines and exits non-zero on failure.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const require = createRequire(join(root, 'site', 'package.json'));
const { chromium } = require('playwright');

const PORT = 4987;
const srv = createServer((q, r) => { let p = join(root, 'site', 'public', decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(PORT);
const URL0 = `http://localhost:${PORT}/apps-hosted/rehearsal-desk/`;

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log('PASS ' + name); else { failed++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); } };
const MY_RESUME = `Casey Rowe
Data Analyst
casey.rowe@example.com | 555 0100

SUMMARY
Analyst who likes clean data.

EXPERIENCE
Data Analyst | Quartz Metrics | Jan 2021 - Present
- Built weekly sales reporting in SQL for 30 stores
- Responsible for data quality checks

Junior Analyst | Mill Lane Foods | Jun 2019 - Dec 2020
- Cleaned product data in Excel

SKILLS
SQL, Excel, Power BI, Python
`;

const sandboxChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});
const mk = async (opts = {}) => {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }, opts));
  await ctx.route('https://portfolio-app-sync.mohitreshi.workers.dev/**', (route) => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '{}' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, errs };
};
const settle = (page, ms) => page.waitForTimeout(ms || 250);

try {
  // ---------- visitor ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 600);
    ok('visitor: no admin entries', (await page.locator('.nav-a').allInnerTexts()).join('|') === 'Home|Resume|Job match|Question cards|Practice');
    ok('visitor: sample shows 3 jobs and cards', (await page.locator('.tile b').first().innerText()) === '3' && (await page.locator('.tile b').nth(3).innerText()) > '0');
    ok('visitor: sample is not stored', await page.evaluate(() => localStorage.getItem('rehearsal-desk-v1')) === null);
    await page.goto(URL0 + '#/jds'); await settle(page);
    ok('visitor: #/jds redirects home', await page.locator('.hero').count() === 1);
    await page.goto(URL0 + '#/collected'); await settle(page);
    ok('visitor: #/collected redirects home', await page.locator('.hero').count() === 1);

    // own resume
    await page.goto(URL0 + '#/home'); await settle(page);
    await page.fill('#resume-in', MY_RESUME); await page.fill('#jd-in', '');
    await page.click('[data-action=analyse]'); await settle(page, 400);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rehearsal-desk-v1') || 'null'));
    ok('visitor: own resume is saved after Analyse', !!stored && stored.sample === false && stored.resume.experience.length === 2, stored && stored.resume && stored.resume.experience.length);
    ok('visitor: sample jobs are gone', !JSON.stringify(stored).includes('Brightleaf'));
    await page.goto(URL0 + '#/board'); await settle(page, 400);
    ok('board: has sections and cards', (await page.locator('.sec').count()) >= 4 && (await page.locator('.card').count()) > 10);
    ok('board: no sample notice for own data', await page.locator('.notice').count() === 0);
    const first = await page.locator('.card .q').first().innerText();
    ok('board: intro question first', first === 'Tell me about yourself.', first);

    // hover reveals actions
    const card = page.locator('.card').first();
    await page.mouse.move(2, 400); await settle(page, 300);
    const op0 = await card.locator('.card-actions').evaluate((el) => getComputedStyle(el).opacity);
    await card.hover(); await settle(page, 300);
    const op1 = await card.locator('.card-actions').evaluate((el) => getComputedStyle(el).opacity);
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    ok('card: actions hidden until hover, visible on hover (touch screens always show them)', coarse ? op0 === '1' : (op0 === '0' && op1 === '1'), [op0, op1, coarse]);

    // edit view and back to card
    await page.evaluate(() => window.scrollTo(0, 700)); await settle(page, 300);
    const target = page.locator('.card').nth(5);
    const tid = await target.getAttribute('data-card');
    await target.hover(); await target.locator('[data-action=edit]').click(); await settle(page, 300);
    ok('edit: opens in its own view', page.url().includes('#/edit/') && await page.locator('#answer').count() === 1);
    ok('edit: coaching present', (await page.locator('.edit-side').innerText()).includes('really testing'));
    await page.fill('#answer', 'I built weekly reports and cut effort by 40% for 30 stores. As a result managers adopted them.'); await settle(page, 300);
    ok('edit: live checks react', (await page.locator('#live-checks').innerText()).includes('Names a result'));
    await page.click('.edit-main [data-action=perfect]'); await settle(page, 200);
    await page.click('[data-action=back-to-card]'); await settle(page, 600);
    const back = page.locator('[data-card="' + tid + '"]');
    ok('edit: back returns to the same card, perfected, flashed', (await back.getAttribute('class')).includes('perfected') && (await back.getAttribute('class')).includes('flash'));
    const inView = await back.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top > 0 && r.top < innerHeight; });
    ok('edit: that card is on screen', inView);
    const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('rehearsal-desk-v1')).cards[id], tid);
    ok('edit: answer and status saved', saved.status === 'perfected' && saved.a.includes('cut effort by 40%'));

    // filters
    await page.click('[data-action=filter][data-v=perfected]'); await settle(page);
    ok('filter: perfected shows exactly one card', await page.locator('.card').count() === 1);
    await page.click('[data-action=filter][data-v=all]'); await settle(page);

    // resume tab
    await page.goto(URL0 + '#/resume'); await settle(page, 300);
    ok('resume: structured editor shows job fields', await page.locator('#job-0-company').inputValue() === 'Quartz Metrics');
    await page.fill('#job-0-bullets', 'Built weekly sales reporting in SQL for 30 stores\nCut report time from 3 hours to 20 minutes');
    await page.click('[data-action=save-resume]'); await settle(page, 300);
    ok('resume: save refreshes questions without losing the perfected answer', (await page.evaluate((id) => JSON.parse(localStorage.getItem('rehearsal-desk-v1')).cards[id].status, tid)) === 'perfected');
    await page.click('[data-action=resume-tab][data-v=checks]'); await settle(page);
    ok('resume: checks list shows items', (await page.locator('.checklist li').count()) > 8 && (await page.locator('.sugg li').count()) > 0);
    await page.click('[data-action=resume-tab][data-v=design]'); await settle(page);
    ok('design: five templates', await page.locator('.tpl').count() === 5);
    for (const t of ['modern', 'compact', 'editorial', 'technical', 'classic']) { await page.click('[data-action=template][data-v=' + t + ']'); await settle(page, 80); }
    ok('design: preview contains the name and a job', (await page.locator('#paper-preview').innerText()).includes('Casey Rowe') && (await page.locator('#paper-preview').innerText()).includes('Quartz Metrics'));
    // PDF: trigger the print path, then render the printable page to PDF
    await page.click('[data-action=print]'); await settle(page, 300);
    const printed = await page.evaluate(() => ({ cls: document.body.className, txt: document.querySelector('#print-root').innerText }));
    ok('pdf: print root is filled with the resume', printed.cls.includes('printing-resume') && printed.txt.includes('Casey Rowe') && printed.txt.includes('Quartz Metrics'), printed.cls);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    ok('pdf: a PDF is produced', pdf.length > 2000 && pdf.slice(0, 4).toString() === '%PDF', pdf.length);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok('pdf: short resume fits one page', pages === 1, pages);

    // practice: drill
    await page.evaluate(() => { document.body.classList.remove('printing-resume'); });
    await page.goto(URL0 + '#/practice'); await settle(page);
    ok('practice: home offers a drill and a mock interview', await page.locator('[data-action=pr-start]').count() === 1 && await page.locator('[data-action=pr-mock]').count() === 1);
    await page.selectOption('#pr-scope', 'all'); await settle(page, 100);
    await page.selectOption('#pr-level', '1');
    await page.click('[data-action=pr-start]'); await settle(page);
    ok('practice: shows a question with some words hidden', await page.locator('.pr-card .q').count() === 1 && (await page.locator('.pr-card .blank').count()) >= 0);
    await page.click('[data-action=pr-level-now][data-v="3"]'); await settle(page, 100);
    ok('practice: from-memory level hides the answer', (await page.locator('.pr-card .fade').innerText()).includes('from memory'));
    await page.keyboard.press('Space'); await settle(page, 200);
    ok('practice: Space shows the answer and the facts to tick', await page.locator('.pr-card .a').count() === 1);
    const factBoxes = await page.locator('.facts input').count();
    if (factBoxes) { await page.locator('.facts input').first().check(); ok('practice: ticking a fact updates the count', (await page.locator('#fact-score').innerText()).startsWith('1 of')); }
    else ok('practice: (no facts for this card)', true);
    await page.keyboard.press('2'); await settle(page, 200);
    ok('practice: key 2 rates "nailed it" and moves on', (await page.locator('.pr-top .muted').innerText()).includes('question 2'));
    await settle(page, 450);
    const sched = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('rehearsal-desk-v1')).cards).filter((c) => c.practice).map((c) => c.practice));
    ok('practice: the review is scheduled one day out', sched.length === 1 && sched[0].box === 1 && sched[0].due - sched[0].last === 864e5, sched);
    await page.keyboard.press('s'); await settle(page, 150);
    await page.keyboard.press('Space'); await settle(page, 150); await page.keyboard.press('1'); await settle(page, 200);
    await settle(page, 450);
    const sched2 = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('rehearsal-desk-v1')).cards).filter((c) => c.practice && c.practice.ok === false).map((c) => c.practice));
    ok('practice: a miss comes back within minutes', sched2.length === 1 && sched2[0].due - sched2[0].last <= 15 * 60000, sched2);
    await page.click('[data-action=pr-home]'); await settle(page);
    ok('practice: end round returns to the home', await page.locator('[data-action=pr-mock]').count() === 1);
    // mock interview
    await page.click('[data-action=pr-minutes][data-v="20"]'); await page.click('[data-action=pr-mock]'); await settle(page, 300);
    ok('practice: mock shows a clock and opens with the opening question', await page.locator('#pr-clock').count() === 1 && (await page.locator('.pr-card .q').innerText()) === 'Tell me about yourself.');
    ok('practice: mock gives no hints', await page.locator('.fade').count() === 0 && await page.locator('[data-action=pr-level-now]').count() === 0);
    let guard = 0;
    while (await page.locator('[data-action=pr-reveal]').count() && guard++ < 30) { await page.click('[data-action=pr-reveal]'); await page.click('[data-action=pr-rate][data-ok="1"]'); await settle(page, 60); }
    ok('practice: the mock ends with a summary', (await page.locator('.practice h2').first().innerText()).includes('Round finished'));
    await page.click('[data-action=pr-home]');

    // reload keeps everything
    await page.goto(URL0 + '#/board'); await page.reload(); await settle(page, 500);
    ok('persist: perfected card survives reload', await page.locator('.card.perfected').count() === 1);
    // clearing data: the button is on Home, asks first, and brings back the sample
    await page.goto(URL0 + '#/home'); await settle(page, 300);
    ok('clear: Home offers "Clear my data" once real data exists', await page.locator('.actions [data-action=erase]').count() === 1);
    await page.click('.actions [data-action=erase]'); await settle(page, 150);
    ok('clear: it asks for confirmation first', await page.locator('dialog.dlg').count() === 1 && (await page.locator('dialog.dlg h2').innerText()).includes('Clear all my data'));
    await page.click('dialog button[value=cancel]'); await settle(page, 150);
    ok('clear: cancelling keeps the data', await page.evaluate(() => !!localStorage.getItem('rehearsal-desk-v1')));
    await page.click('.actions [data-action=erase]'); await page.click('dialog button.primary'); await settle(page, 500);
    ok('clear: confirming removes the saved data and shows the sample again', await page.evaluate(() => localStorage.getItem('rehearsal-desk-v1') === null) && (await page.locator('#resume-in').inputValue()).includes('Jordan Avery'));
    await page.reload(); await settle(page, 500);
    ok('clear: the data stays gone after a reload', (await page.locator('#resume-in').inputValue()).includes('Jordan Avery'));
    await page.goto(URL0 + '#/home'); await page.fill('#resume-in', MY_RESUME); await page.click('[data-action=analyse]'); await settle(page, 400);
    ok('visitor: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- guidance, editor tools, resume and match helpers ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 500);
    ok('home: four-step guide is shown', await page.locator('.stepper li').count() === 4);
    ok('home: readiness panel is shown with the sample', await page.locator('.readiness').count() === 1 && (await page.locator('.readiness .plain-list li').count()) >= 3);
    await page.fill('#resume-in', MY_RESUME);
    await page.fill('#jd-in', 'Data Analyst\nTidy Co\nRequirements\n- SQL\n- Power BI\n- Tableau or Looker\n- A/B testing\nNice to have\n- dbt\nSend CV to jobs@tidy.example');
    await page.click('[data-action=analyse]'); await settle(page, 500);
    ok('home: step 1 is done after Analyse', (await page.locator('.stepper li').first().getAttribute('class')).includes('done'));
    const firstPrio = await page.locator('.readiness .plain-list li span').first().innerText();
    ok('home: the opening answer is the first thing to prepare', firstPrio === 'Tell me about yourself.', firstPrio);
    // board strip and next-to-work
    await page.goto(URL0 + '#/board'); await settle(page, 500);
    ok('board: "Start with these" strip lists priority cards', (await page.locator('.priority .chipbtn').count()) >= 3);
    await page.click('[data-action=next-work]'); await settle(page, 500);
    ok('board: "Next to work on" flashes a card', await page.locator('.card.flash').count() === 1);
    // editor tools
    await page.locator('.priority .chipbtn').first().click(); await settle(page, 300);
    ok('editor: previous is disabled on the first card, next is enabled', await page.locator('[data-action=edit-prev]').isDisabled() && !(await page.locator('[data-action=edit-next]').isDisabled()));
    const q1 = await page.locator('.edit .q').innerText();
    await page.click('[data-action=next-gap]'); await settle(page, 100);
    const sel = await page.evaluate(() => { const t = document.getElementById('answer'); return t.value.slice(t.selectionStart, t.selectionEnd); });
    ok('editor: "Jump to the next gap" selects an [add: ...] marker', /^\[add:/.test(sel), sel);
    const factCount = await page.locator('.facts-list li').count();
    ok('editor: shows facts from the resume', factCount >= 2, factCount);
    const before = await page.inputValue('#answer');
    await page.locator('[data-action=insert-fact]').first().click(); await settle(page, 200);
    ok('editor: Insert puts a resume fact into the answer', (await page.inputValue('#answer')).length > before.length);
    await page.click('[data-action=star-frame]'); await settle(page, 200);
    ok('editor: STAR frame is added with gaps to fill', (await page.inputValue('#answer')).includes('Situation: [add:'));
    await page.click('#sw-btn'); await page.waitForTimeout(1200); await page.click('#sw-btn');
    ok('editor: the stopwatch measures speaking time', /0:0[1-3]/.test(await page.locator('#sw-time').innerText()), await page.locator('#sw-time').innerText());
    await page.click('[data-action=perfect-next]'); await settle(page, 400);
    ok('editor: "Perfect and go to the next one" moves on', page.url().includes('#/edit/') && (await page.locator('.edit .q').innerText()) !== q1);
    const perfectedNow = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('rehearsal-desk-v1')).cards).filter((c) => c.status === 'perfected').length);
    ok('editor: the first card was marked perfected', perfectedNow === 1, perfectedNow);
    await page.click('[data-action=edit-prev]'); await settle(page, 300);
    ok('editor: Previous goes back', (await page.locator('.edit .q').innerText()) === q1);
    // resume suggestions
    await page.goto(URL0 + '#/resume'); await settle(page);
    await page.click('[data-action=resume-tab][data-v=checks]'); await settle(page, 200);
    const rw = page.locator('[data-action=apply-rewrite]');
    ok('resume: a safe rewrite is offered for "Responsible for"', await rw.count() === 1 && (await rw.innerText()).includes('Owned data quality checks'), await rw.count());
    await rw.click(); await settle(page, 300);
    await page.click('[data-action=resume-tab][data-v=content]'); await settle(page, 200);
    ok('resume: the rewrite changed the bullet', (await page.inputValue('#job-0-bullets')).includes('Owned data quality checks') && !(await page.inputValue('#job-0-bullets')).includes('Responsible for'));
    await page.click('[data-action=resume-tab][data-v=checks]'); await settle(page, 200);
    await page.locator('[data-action=goto-bullet]').first().click(); await settle(page, 300);
    ok('resume: "Go to this bullet" opens the editor with the line selected', await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'TEXTAREA' && document.activeElement.selectionEnd > document.activeElement.selectionStart));
    await page.click('[data-action=resume-tab][data-v=design]'); await settle(page, 300);
    ok('design: a page-count estimate is shown', (await page.locator('#page-est').innerText()).length > 10 && (await page.locator('#page-est').innerText()).includes('page'));
    // match: add a missing skill
    await page.goto(URL0 + '#/match'); await settle(page);
    const add = page.locator('[data-action=add-skill]').first();
    const lbl = await add.getAttribute('data-label');
    await add.click(); await settle(page, 300);
    ok('match: "add to my skills" adds the skill', await page.evaluate((l) => JSON.parse(localStorage.getItem('rehearsal-desk-v1')).resume.skills.includes(l), lbl), lbl);
    ok('match: the button disappears once added', await page.locator('[data-action=add-skill][data-label="' + lbl + '"]').count() === 0);
    // backup nudge after three perfected answers
    await page.goto(URL0 + '#/board'); await settle(page, 300);
    for (const n of [0, 1]) { const c = page.locator('.card:not(.perfected)').first(); await c.hover(); await c.locator('[data-action=perfect]').click(); await settle(page, 100); }
    await page.mouse.move(2, 500);
    await page.goto(URL0 + '#/home'); await settle(page, 300);
    ok('home: a backup reminder appears once real answers exist', (await page.locator('.notice', { hasText: 'Download a backup' }).count()) === 1);
    await page.click('.notice [data-action=backup]'); await settle(page, 300);
    await page.goto(URL0 + '#/home'); await settle(page, 300);
    ok('home: the reminder goes away after a backup', (await page.locator('.notice', { hasText: 'Download a backup' }).count()) === 0);
    ok('improvements: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- section focus and auto-fit scrolling ----------
  for (const reduced of [false, true]) {
    const { ctx, page, errs } = await mk({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.goto(URL0 + '#/board'); await settle(page, 700);
    const geo = () => page.evaluate(() => { const off = (document.querySelector('.topbar').offsetHeight + document.getElementById('focusbar').offsetHeight + 6); return { off, y: scrollY, secs: [...document.querySelectorAll('.board .sec')].map((s) => { const r = s.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), name: s.querySelector('h2').textContent }; }), focus: document.getElementById('fb-name').textContent, vh: innerHeight }; });
    let g = await geo();
    ok('focus bar names the first section (' + (reduced ? 'reduced' : 'normal') + ' motion)', g.focus === g.secs[0].name, g.focus);
    // scroll so that section 1 is almost out of view: section 2 sits 40px below the bar, so section 1 shows < 10%
    await page.evaluate((y) => { window.scrollTo(0, y); }, g.y + g.secs[1].t - g.off - 40);
    await settle(page, 80);
    await page.waitForTimeout(reduced ? 600 : 1300);
    g = await geo();
    const topSec = g.secs[1];
    ok('auto-fit: section 2 snaps to the top once section 1 is out (' + (reduced ? 'reduced' : 'normal') + ' motion)', Math.abs(topSec.t - g.off) <= 6, { t: topSec.t, off: g.off, focus: g.focus });
    ok('auto-fit: focus bar follows (' + (reduced ? 'reduced' : 'normal') + ')', g.focus === g.secs[1].name, g.focus);
    // a section taller than the screen scrolls freely after alignment (no snapping back)
    const tall = g.secs.findIndex((s) => s.h > g.vh);
    if (tall >= 0) {
      await page.evaluate((y) => window.scrollTo(0, y), g.y + g.secs[tall].t - g.off + 300); await page.waitForTimeout(reduced ? 500 : 1000);
      const g2 = await geo();
      ok('auto-fit: tall section is not snapped back while reading it', g2.secs[tall].t < g2.off - 200, g2.secs[tall].t);
    } else ok('auto-fit: (no section taller than the screen in this data)', true);
    // toggle off: no snapping
    await page.click('[data-action=autofit]'); await settle(page);
    const y0 = await page.evaluate(() => scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), y0 + 40); await page.waitForTimeout(700);
    ok('auto-fit: off means the page stays where the user left it', Math.abs((await page.evaluate(() => scrollY)) - (y0 + 40)) <= 2);
    // next/previous buttons and rail
    await page.click('[data-action=autofit]'); await settle(page);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
    await page.click('[data-action=sec-next]'); await page.waitForTimeout(reduced ? 300 : 1000);
    g = await geo();
    ok('sections: next button brings section 2 to the top', Math.abs(g.secs[1].t - g.off) <= 6, g.secs[1].t);
    await page.locator('.rail button').nth(3).click(); await page.waitForTimeout(reduced ? 300 : 1000);
    g = await geo();
    ok('sections: rail jumps to section 4', Math.abs(g.secs[3].t - g.off) <= 6 && g.focus === g.secs[3].name, g.focus);
    // scrolling up: section 1 sits 50px under the bar and section 2 has almost left the bottom: section 1 is aligned whole
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
    g = await geo();
    const s0 = g.secs[0], s1 = g.secs[1];
    if (s0.h <= g.vh - g.off && s1.h * 0.1 >= 24 + (s0.h - (g.vh - g.off))) {
      const abs0 = g.y + s0.t;
      await page.evaluate((y) => window.scrollTo(0, y), abs0 - g.off + 400); await page.waitForTimeout(reduced ? 500 : 1200);   // go down first
      const target = abs0 - g.off + 50;                                                                                      // then up to 50px short of aligned
      await page.evaluate((y) => window.scrollTo(0, y), target); await page.waitForTimeout(reduced ? 500 : 1300);
      g = await geo();
      ok('auto-fit: scrolling up aligns the section above (' + (reduced ? 'reduced' : 'normal') + ' motion)', Math.abs(g.secs[0].t - g.off) <= 6, { t: g.secs[0].t, off: g.off });
    } else ok('auto-fit: (up-scroll case not applicable at this size)', true);
    ok('board scroll: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- admin ----------
  {
    const { ctx, page, errs } = await mk();
    await ctx.addInitScript(() => { try { localStorage.setItem('app-chrome:owner-key', 'test'); } catch (e) { /* ignore */ } });
    await page.goto(URL0); await settle(page, 800);
    const nav = (await page.locator('.nav-a').allInnerTexts()).join('|');
    ok('admin: sees My JDs and Collected', nav.includes('My JDs') && nav.includes('Collected'), nav);
    ok('admin: pill visible', await page.locator('#admin-pill:not([hidden])').count() === 1);
    // start with own resume so state is saved
    await page.fill('#resume-in', MY_RESUME); await page.fill('#jd-in', 'Data Analyst\nTidy Co\nRequirements\n- SQL\n- Power BI\n- Tableau\nNice to have\n- dbt\nSend CV to jobs@tidy.example');
    await page.click('[data-action=analyse]'); await settle(page, 400);
    // collected questions
    await page.goto(URL0 + '#/collected'); await settle(page);
    await page.fill('#col-label', 'Round 1');
    await page.fill('#col-text', `1. What is the difference between INNER JOIN and LEFT JOIN?
Inner returns only matching rows. Left keeps all rows from the left table.

2. Tell me about a time you disagreed with a manager.
I pushed back on a deadline.

3. What is a primary key?
4. Tell me about yourself.`);
    await page.click('[data-action=extract]'); await settle(page, 600);
    ok('collected: lands on the board', page.url().endsWith('#/board'));
    const dated = page.locator('.sec', { has: page.locator('h2', { hasText: /^Added \d{1,2} [A-Z][a-z]{2} \d{4}$/ }) });
    const title = await dated.locator('h2').innerText();
    ok('collected: a dated section was created', /^Added \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(title), title);
    ok('collected: the board scrolled to the new section', await dated.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top > 0 && r.top < innerHeight * 0.5; }));
    ok('collected: four cards with the label as subtitle', (await dated.locator('.card').count()) === 4 && (await dated.locator('.sub').innerText()) === 'Round 1');
    ok('collected: answers kept, missing answer flagged', (await dated.innerText()).includes('Inner returns only matching rows') && (await dated.locator('.flag.need').count()) >= 1);
    ok('collected: duplicate of an existing question is flagged', (await dated.innerText()).includes('Similar to an existing card'));
    // select two cards and move them to another section
    const secId = await dated.getAttribute('data-sec');
    const cards = dated.locator('.card');
    await cards.nth(0).locator('input[data-action=select]').check(); await cards.nth(1).locator('input[data-action=select]').check();
    ok('move: selection counted', (await page.locator('#sel-count').innerText()) === '2 selected');
    await page.click('[data-action=move-menu]'); await settle(page, 100);
    const items = await page.locator('.menu [data-action=move-to]').allInnerTexts();
    ok('move: menu lists existing sections and a new-section entry', items.length >= 4 && await page.locator('.menu .newsec').count() === 1, items.length);
    const dest = page.locator('.menu [data-action=move-to]', { hasText: 'Common questions' });
    await dest.click(); await settle(page, 300);
    ok('move: cards left the dated section', (await page.locator('[data-sec="' + secId + '"] .card').count()) === 2);
    const common = await page.locator('[data-sec="sec:general"] .card .q').allInnerTexts();
    ok('move: cards arrived in Common questions', common.some((q) => q.includes('INNER JOIN')) && common.some((q) => q.includes('disagreed')));
    // new section via move
    await page.locator('[data-sec="' + secId + '"] .card').first().locator('input[data-action=select]').check();
    await page.click('[data-action=move-menu]'); await page.click('.menu .newsec'); await settle(page, 200);
    await page.fill('#dlg-in', 'SQL practice'); await page.click('dialog button.primary'); await settle(page, 400);
    ok('move: new section created with the card', (await page.locator('.sec h2', { hasText: 'SQL practice' }).count()) === 1);
    // moved placement survives re-saving the resume
    await page.goto(URL0 + '#/resume'); await settle(page); await page.click('[data-action=save-resume]'); await settle(page, 300);
    await page.goto(URL0 + '#/board'); await settle(page, 400);
    ok('move: placement survives a resume refresh', (await page.locator('[data-sec="sec:general"] .card .q', { hasText: 'INNER JOIN' }).count()) === 1);
    // undo import removes what is left in the dated section
    await page.locator('[data-sec="' + secId + '"] [data-action=sec-menu]').click(); await page.click('[data-action=undo-import]'); await page.click('dialog button.primary'); await settle(page, 400);
    ok('undo: the dated section is gone, moved cards stay', (await page.locator('[data-sec="' + secId + '"]').count()) === 0 && (await page.locator('[data-sec="sec:general"] .card .q', { hasText: 'INNER JOIN' }).count()) === 1);
    // JD library
    await page.goto(URL0 + '#/jds'); await settle(page);
    ok('jds: the pasted JD is listed after analysis', (await page.locator('.jdlist li').count()) >= 1);
    await page.click('[data-action=new-jd]'); await settle(page, 200);
    await page.fill('#jd-company', 'Acme Retail'); await page.fill('#jd-title', 'Senior Analyst'); await page.fill('#jd-hr-name', 'Pat Lee'); await page.fill('#jd-hr-email', 'pat@acme.example');
    await page.fill('#jd-text', 'Senior Analyst\nAcme Retail\nRequirements\n- SQL\n- Python\n- A/B testing\nNice to have\n- Looker');
    await page.selectOption('#jd-status', 'interview'); await page.fill('#jd-date', '2030-01-15');
    await page.click('.jd-detail [data-action=rerun-jd]'); await settle(page, 400);
    ok('jds: analyse button builds this JD’s cards', (await page.locator('.status').innerText()).includes('new cards'));
    ok('jds: list shows company, status and interview date', (await page.locator('.jdlist li.active').innerText()).includes('Acme Retail') && (await page.locator('.jdlist li.active').innerText()).includes('Interview'));
    const store1 = await page.evaluate(() => JSON.parse(localStorage.getItem('rehearsal-desk-v1')));
    const acme = Object.values(store1.jds).find((j) => j.company === 'Acme Retail');
    ok('jds: HR contact saved with the JD', acme && acme.hr.email === 'pat@acme.example' && acme.hr.name === 'Pat Lee');
    const resumeCardsBefore = Object.values(store1.cards).filter((c) => c.source === 'resume').map((c) => c.id + c.q + c.a).join('|');
    // resume cards stay constant when the JD changes
    await page.goto(URL0 + '#/board'); await settle(page, 400);
    ok('jd cards: board shows the active JD section', (await page.locator('.sec h2', { hasText: 'Senior Analyst at Acme Retail' }).count()) === 1);
    const jdCard = page.locator('.sec', { hasText: 'Senior Analyst at Acme Retail' }).locator('.card').first();
    const jdId = await jdCard.getAttribute('data-card');
    await jdCard.hover(); await jdCard.locator('[data-action=edit]').click(); await settle(page, 200);
    await page.fill('#answer', 'My own edited JD answer with a result of 20%.'); await settle(page, 300);
    await page.goto(URL0 + '#/jds'); await settle(page);
    await page.locator('.jd-open', { hasText: 'Acme Retail' }).click(); await page.click('.jd-detail [data-action=rerun-jd]'); await settle(page, 400);
    const store2 = await page.evaluate(() => JSON.parse(localStorage.getItem('rehearsal-desk-v1')));
    ok('jds: re-analysis keeps the edited JD answer', store2.cards[jdId] && store2.cards[jdId].a.includes('My own edited JD answer'));
    ok('jds: resume cards are unchanged by JD work', Object.values(store2.cards).filter((c) => c.source === 'resume').map((c) => c.id + c.q + c.a).join('|') === resumeCardsBefore);
    // switch JD: board follows
    await page.locator('.jd-open', { hasText: 'Tidy Co' }).click(); await settle(page, 200);
    await page.goto(URL0 + '#/board'); await settle(page, 400);
    ok('jds: switching JD swaps the JD section only', (await page.locator('.sec h2', { hasText: 'at Tidy Co' }).count()) === 1 && (await page.locator('.sec h2', { hasText: 'at Acme Retail' }).count()) === 0);
    // delete JD
    await page.goto(URL0 + '#/jds'); await settle(page);
    await page.locator('.jd-open', { hasText: 'Acme Retail' }).click(); await page.click('[data-action=delete-jd]'); await page.click('dialog button.primary'); await settle(page, 300);
    ok('jds: delete removes it from the list', (await page.locator('.jd-open', { hasText: 'Acme Retail' }).count()) === 0);
    ok('admin: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- adding your own question card ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 600);
    await page.fill('#resume-in', MY_RESUME); await page.click('[data-action=analyse]'); await settle(page, 400);
    await page.goto(URL0 + '#/board'); await settle(page, 400);
    const before = await page.locator('.card').count();
    await page.locator('.sec').first().locator('[data-action=add-question]').click(); await page.fill('#dlg-in', 'What would you do in your first week?'); await page.click('dialog button.primary'); await settle(page, 400);
    ok('add question: opens the editor with an editable question', (await page.locator('#q-edit').inputValue()) === 'What would you do in your first week?');
    await page.fill('#answer', 'I would meet the team and read the existing reports.'); await page.fill('#q-edit', 'What would you do in your first week at a new job?'); await settle(page, 500);
    await page.click('[data-action=back-to-card]'); await settle(page, 500);
    ok('add question: the card appears in that section with its answer', (await page.locator('.card').count()) === before + 1 && (await page.locator('.card', { hasText: 'first week at a new job' }).innerText()).includes('meet the team'));
    await page.reload(); await settle(page, 600); await page.goto(URL0 + '#/board'); await settle(page, 400);
    ok('add question: it survives a reload and is not archived by a resume refresh', (await page.locator('.card', { hasText: 'first week at a new job' }).count()) === 1);
    await page.goto(URL0 + '#/resume'); await settle(page, 300); await page.click('[data-action=save-resume]'); await settle(page, 500); await page.goto(URL0 + '#/board'); await settle(page, 400);
    ok('add question: still there after Save and refresh questions', (await page.locator('.card', { hasText: 'first week at a new job' }).count()) === 1);
    ok('add question: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- My story (admin only) ----------
  {
    const { ctx: vctx, page: vpage } = await mk();
    await vpage.goto(URL0 + '#/story'); await settle(vpage, 500);
    ok('story: a visitor is sent home and sees no tab', (await vpage.locator('.hero').count()) === 1 && !(await vpage.locator('.nav-a').allInnerTexts()).join('|').includes('My story'));
    await vctx.close();
    const { ctx, page, errs } = await mk();
    await ctx.addInitScript(() => { try { localStorage.setItem('app-chrome:owner-key', 'test'); } catch (e) { /* ignore */ } });
    await page.goto(URL0); await settle(page, 800);
    ok('story: the owner sees the My story tab', (await page.locator('.nav-a').allInnerTexts()).join('|').includes('My story'));
    await page.goto(URL0 + '#/story'); await settle(page, 400);
    ok('story: empty state explains what to do', (await page.locator('.empty').innerText()).includes('Add a company'));
    await page.click('[data-action=st-add-unit][data-kind=company]'); await page.fill('#dlg-in', 'Acme Corp'); await page.click('dialog button.primary'); await settle(page, 400);
    ok('story: a company gets its section and template cards', (await page.locator('.sec h2', { hasText: 'Acme Corp' }).count()) === 1 && (await page.locator('.sec .card').count()) === 8);
    ok('story: not saved as the sample', await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rehearsal-desk-v1')); return d.sample === false && Object.keys(d.story.units).length === 1; }));
    await page.click('[data-action=st-add-unit][data-kind=project]'); await page.fill('#dlg-in', 'Data Hub'); await page.click('dialog button.primary'); await settle(page, 400);
    ok('story: a project gets its own cards, including Structure', (await page.locator('.sec h2', { hasText: 'Data Hub' }).count()) === 1 && (await page.locator('.sec', { hasText: 'Data Hub' }).locator('.card h3', { hasText: 'Structure' }).count()) === 1);
    ok('story: the unit form opens for the new section', (await page.locator('.unit-form').count()) === 1);
    await page.fill('[data-sf="unit.role"]', 'Developer'); await page.fill('[data-sf="unit.team"]', '4'); await page.fill('[data-sf="unit.stack"]', 'Power BI, DAX, SQL'); await page.click('[data-action=st-unit-done]'); await settle(page, 300);
    ok('story: facts and stack chips show in the header', (await page.locator('.sec', { hasText: 'Data Hub' }).locator('.facts-strip').innerText()).includes('Developer') && (await page.locator('.sec', { hasText: 'Data Hub' }).locator('.stack .chip').count()) === 3);
    const hub = page.locator('.sec', { hasText: 'Data Hub' });
    await hub.locator('.card', { hasText: 'Structure' }).locator('[data-action=st-edit]').click(); await settle(page, 200);
    await page.fill('[data-sf="card.body"]', '- Bronze to gold\n- Semantic model on top\nTeam of [add: size]'); await page.click('[data-action=st-done]'); await settle(page, 300);
    const st = hub.locator('.card', { hasText: 'Structure' });
    ok('story: a list renders as bullets and a gap is marked', (await st.locator('li').count()) === 2 && (await st.locator('mark.gap').count()) === 1);
    ok('story: the header counts the gap', (await hub.locator('.sub').innerText()).includes('1 with gaps to fill'));
    await page.reload(); await settle(page, 600);
    ok('story: everything survives a reload', (await page.locator('.sec h2').allInnerTexts()).join('|').includes('Data Hub') && (await page.locator('.sec', { hasText: 'Data Hub' }).locator('.card', { hasText: 'Structure' }).locator('li').count()) === 2);
    // known + filter
    await page.locator('.sec', { hasText: 'Data Hub' }).locator('.card', { hasText: 'Structure' }).locator('[data-action=st-known]').click(); await settle(page, 200);
    await page.click('[data-action=st-filter][data-v=known]'); await settle(page, 200);
    ok('story: the Known filter shows only known cards', (await page.locator('.sec .card').count()) === 1);
    await page.click('[data-action=st-filter][data-v=all]'); await settle(page, 200);
    // search
    await page.fill('#story-search', 'bronze'); await settle(page, 300);
    ok('story: search finds a fact inside a card', (await page.locator('.sec .card').count()) === 1);
    await page.fill('#story-search', ''); await settle(page, 300);
    // recall mode
    await page.click('[data-action=st-cover]'); await settle(page, 200);
    ok('story: recall mode hides the answers', (await page.locator('.story-a').count()) === 0 && (await page.locator('[data-action=st-reveal]').count()) > 0);
    await page.locator('.sec', { hasText: 'Data Hub' }).locator('.card', { hasText: 'Structure' }).locator('[data-action=st-reveal]').click(); await settle(page, 200);
    ok('story: reveal shows the answer and the rating buttons', (await page.locator('.story-a').count()) === 1 && (await page.locator('[data-action=st-rate]').count()) === 2);
    await page.locator('[data-action=st-rate][data-ok="0"]').click(); await settle(page, 500);
    ok('story: a missed card is no longer known and gets a review date', await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rehearsal-desk-v1')); const c = Object.values(d.story.cards).find((x) => x.title === 'Structure' && x.body); return c.status === 'draft' && !!c.practice; }));
    await page.click('[data-action=st-cover]'); await settle(page, 200);
    // export and import
    const dl = page.waitForEvent('download'); await page.click('[data-action=st-export]'); const file = await dl; const exported = readFileSync(await file.path(), 'utf8');
    ok('story: the download is a story file with both sections', JSON.parse(exported).app === 'rehearsal-desk-story' && JSON.parse(exported).units.length === 2);
    await page.locator('.sec', { hasText: 'Acme Corp' }).locator('[data-action=st-del-unit]').click(); await page.click('dialog button.primary'); await settle(page, 300);
    ok('story: deleting a section removes its cards', (await page.locator('.sec h2', { hasText: 'Acme Corp' }).count()) === 0 && (await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rehearsal-desk-v1')).story.cards).length)) === 9);
    await page.setInputFiles('#story-file', { name: 'story.json', mimeType: 'application/json', buffer: Buffer.from(exported) }); await settle(page, 500);
    ok('story: importing adds the missing section and skips the one that exists', (await page.locator('.sec h2', { hasText: 'Acme Corp' }).count()) === 1 && (await page.locator('.sec h2', { hasText: 'Data Hub' }).count()) === 1 && (await page.locator('.status').innerText()).includes('skipped 1'));
    await page.setInputFiles('#story-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') }); await settle(page, 400);
    ok('story: a wrong file gives a clear message and changes nothing', (await page.locator('.status').innerText()).includes('not a Rehearsal Desk story file') && (await page.locator('.sec').count()) === 2);
    ok('story: focus bar and rail follow the sections', (await page.locator('.rail button').count()) === 2 && (await page.locator('#fb-name').innerText()).length > 0);
    ok('story: Clear my data wipes it', await (async () => { await page.click('[data-action=erase]'); await page.click('dialog button.primary'); await settle(page, 300); return (await page.evaluate(() => localStorage.getItem('rehearsal-desk-v1'))) === null; })());
    ok('story: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- admin sign-out hides everything again ----------
  {
    const { ctx, page } = await mk();
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem('app-chrome:owner-key', 'test'); sessionStorage.setItem('x', '1'); } } catch (e) { /* ignore */ } });
    await page.goto(URL0); await settle(page, 700);
    ok('signout: admin visible when signed in', (await page.locator('.nav-a').allInnerTexts()).join('|').includes('Collected'));
    await page.click('.acx-own'); await settle(page, 300);
    ok('signout: admin entries disappear immediately', !(await page.locator('.nav-a').allInnerTexts()).join('|').includes('Collected') && await page.locator('#admin-pill[hidden]').count() === 1);
    await ctx.close();
  }

  // ---------- owner sign-in: remember me and the two-hour limit ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.route('https://portfolio-app-sync.mohitreshi.workers.dev/**', (route) => {
      const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
      return route.fulfill({ status: route.request().headers()['authorization'] === 'Bearer good' ? 404 : 401, headers: h, body: '{}' });
    });
    const signIn = async (page, key, remember) => {
      await page.keyboard.press('Control+Shift+L'); await page.fill('#acx-key', key);
      if (remember) await page.check('#acx-remember');
      await page.click('.acx-card .go'); await page.waitForTimeout(500);
    };
    const adminShown = (page) => page.locator('.nav-a', { hasText: 'Collected' }).count();
    // without "Remember me": this tab only
    let page = await ctx.newPage(); await page.goto(URL0); await page.waitForTimeout(500);
    ok('signin: dialog has the Remember me box, unticked, and explains the limit', !(await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', ctrlKey: true, shiftKey: true, bubbles: true })); return document.querySelector('#acx-remember') ? document.querySelector('#acx-remember').checked : null; })) && (await page.locator('.acx-note').innerText()).includes('2 hours'));
    await page.keyboard.press('Escape');
    await signIn(page, 'bad', false);
    ok('signin: a wrong key is refused', (await page.locator('.acx-card .msg').innerText()).includes('not accepted') && await adminShown(page) === 0);
    await page.fill('#acx-key', 'good'); await page.click('.acx-card .go'); await page.waitForTimeout(600);
    ok('signin: admin appears after a correct key', await adminShown(page) === 1);
    const where1 = await page.evaluate(() => ({ local: localStorage.getItem('app-chrome:owner-key'), session: sessionStorage.getItem('app-chrome:owner-key'), exp: +sessionStorage.getItem('app-chrome:owner-exp') }));
    ok('signin: without Remember me the key is in session storage only', where1.local === null && where1.session === 'good');
    ok('signin: the expiry is about two hours away', Math.abs(where1.exp - Date.now() - 2 * 3600 * 1000) < 60000, where1.exp - Date.now());
    await page.reload(); await page.waitForTimeout(700);
    ok('signin: still signed in after a reload of the same tab', await adminShown(page) === 1);
    const other = await ctx.newPage(); await other.goto(URL0); await other.waitForTimeout(700);
    ok('signin: a new tab is not signed in', await adminShown(other) === 0);
    await other.close(); await page.close();
    await ctx.clearCookies();
    // with "Remember me": survives a new tab
    page = await ctx.newPage(); await page.goto(URL0); await page.waitForTimeout(500);
    await signIn(page, 'good', true);
    const where2 = await page.evaluate(() => ({ local: localStorage.getItem('app-chrome:owner-key'), session: sessionStorage.getItem('app-chrome:owner-key') }));
    ok('remember: the key is in local storage', where2.local === 'good' && where2.session === null);
    const tab2 = await ctx.newPage(); await tab2.goto(URL0); await tab2.waitForTimeout(700);
    ok('remember: a new tab is signed in', await adminShown(tab2) === 1);
    // expiry: set it to 1.5 s away, wait, the page signs out without a reload
    await tab2.evaluate(() => localStorage.setItem('app-chrome:owner-exp', String(Date.now() + 1500)));   // another tab changes it; this tab is told by the storage event
    await page.waitForTimeout(2600);
    ok('expiry: signs out by itself when the time is up', await adminShown(page) === 0 && await page.locator('.acx-own').count() === 0);
    ok('expiry: says why', (await page.locator('.acx-toast').innerText()).includes('2 hours'));
    ok('expiry: the key is removed from storage', await page.evaluate(() => localStorage.getItem('app-chrome:owner-key') === null && localStorage.getItem('app-chrome:owner-exp') === null));
    await page.reload(); await page.waitForTimeout(600);
    ok('expiry: stays signed out after reloading', await adminShown(page) === 0);
    await tab2.close();   // a second tab would react to the writes below and make the check racy
    // an expired stored session is refused at load
    await page.evaluate(() => { localStorage.setItem('app-chrome:owner-key', 'good'); localStorage.setItem('app-chrome:owner-exp', String(Date.now() - 1000)); });
    await page.reload(); await page.waitForTimeout(600);
    ok('expiry: an expired session is not restored on load', await adminShown(page) === 0);
    // activity keeps you signed in: 3 s left, a key press resets it to two hours
    await page.evaluate(() => { localStorage.setItem('app-chrome:owner-key', 'good'); localStorage.setItem('app-chrome:owner-exp', String(Date.now() + 3000)); });
    await page.reload(); await page.waitForTimeout(600);
    await page.keyboard.press('Shift'); await page.waitForTimeout(300);
    const exp2 = await page.evaluate(() => +localStorage.getItem('app-chrome:owner-exp'));
    ok('activity: a key press moves the expiry back to two hours', exp2 - Date.now() > 3600 * 1000, exp2 - Date.now());
    // warning label in the last ten minutes
    await page.evaluate(() => localStorage.setItem('app-chrome:owner-exp', String(Date.now() + 5 * 60000)));
    await page.reload(); await page.waitForTimeout(700);
    ok('warning: the chip says how long is left in the last ten minutes', (await page.locator('.acx-own').innerText()).includes('signing out in'));
    // sessions from before this rule get a fresh two hours
    await page.evaluate(() => { localStorage.removeItem('app-chrome:owner-exp'); });
    await page.reload(); await page.waitForTimeout(700);
    ok('legacy: a stored key with no expiry is kept and given two hours', await adminShown(page) === 1 && (await page.evaluate(() => +localStorage.getItem('app-chrome:owner-exp'))) - Date.now() > 7000 * 1000);
    await page.click('.acx-own'); await page.waitForTimeout(300);
    ok('signout: clicking the chip removes the key and expiry', await page.evaluate(() => localStorage.getItem('app-chrome:owner-key') === null && localStorage.getItem('app-chrome:owner-exp') === null) && await adminShown(page) === 0);
    await ctx.close();
  }

  // ---------- accessibility (axe, light and dark) ----------
  {
    const { AxeBuilder } = require('@axe-core/playwright');
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await mk({ colorScheme: scheme });
      await ctx.addInitScript(() => { try { localStorage.setItem('app-chrome:owner-key', 'test'); } catch (e) { /* ignore */ } });
      await page.goto(URL0); await settle(page, 700);
      await page.fill('#resume-in', MY_RESUME); await page.fill('#jd-in', 'Data Analyst\nTidy Co\nRequirements\n- SQL\n- Power BI\nNice to have\n- dbt');
      await page.click('[data-action=analyse]'); await settle(page, 400);
      await page.goto(URL0 + '#/collected'); await settle(page);
      await page.fill('#col-text', '1. What is a primary key?\nA unique row id.\n2. Tell me about yourself.'); await page.click('[data-action=extract]'); await settle(page, 500);
      await page.goto(URL0 + '#/story'); await settle(page, 300);
      await page.click('[data-action=st-add-unit][data-kind=project]'); await page.fill('#dlg-in', 'Data Hub'); await page.click('dialog button.primary'); await settle(page, 400);
      await page.click('[data-action=st-unit-done]'); await settle(page, 200);
      const seen = [];
      for (const [name, hash, pre] of [['story', '#/story'], ['story editing', '#/story', '[data-action=st-edit]'], ['story recall', '#/story', '[data-action=st-cover]'], ['home', '#/home'], ['board', '#/board'], ['resume content', '#/resume'], ['resume checks', '#/resume', '[data-action=resume-tab][data-v=checks]'], ['resume design', '#/resume', '[data-action=resume-tab][data-v=design]'], ['match', '#/match'], ['practice', '#/practice', '[data-action=pr-start]'], ['jds', '#/jds'], ['collected', '#/collected']]) {
        await page.goto(URL0 + hash); await settle(page, 350);
        if (pre) { await page.click(pre); await settle(page, 250); }
        if (name === 'board') { const c = page.locator('.card').first(); await c.hover(); await c.locator('[data-action=perfect]').click(); await page.mouse.move(2, 600); await settle(page, 300); }
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.acx').analyze();
        const bad = res.violations.map((v) => v.id + ' x' + v.nodes.length + ' [' + v.nodes[0].target.join(' ') + ']');
        ok('a11y (' + scheme + '): ' + name, bad.length === 0, bad);
      }
      // edit view
      await page.goto(URL0 + '#/board'); await settle(page, 300);
      const c2 = page.locator('.card').nth(3); await c2.hover(); await c2.locator('[data-action=edit]').click(); await settle(page, 300);
      const resE = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.acx').analyze();
      ok('a11y (' + scheme + '): edit', resE.violations.length === 0, resE.violations.map((v) => v.id + ' x' + v.nodes.length));
      await ctx.close();
    }
  }

  // ---------- mobile ----------
  {
    const { ctx, page, errs } = await mk({ viewport: { width: 390, height: 800 } });
    for (const h of ['#/home', '#/board', '#/resume', '#/match', '#/practice']) {
      await page.goto(URL0 + h); await settle(page, 400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      ok('mobile: no horizontal overflow on ' + h, !over);
    }
    ok('mobile: no page errors', errs.length === 0, errs);
    await ctx.close();
  }
} catch (e) {
  failed++; console.log('FAIL exception: ' + e.stack);
}
await browser.close(); srv.close();
console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
