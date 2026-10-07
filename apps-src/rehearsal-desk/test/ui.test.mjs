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

    // practice
    await page.evaluate(() => { document.body.classList.remove('printing-resume'); });
    await page.goto(URL0 + '#/practice'); await settle(page);
    await page.click('[data-action=pr-start]'); await settle(page);
    ok('practice: shows a question', await page.locator('.pr-card .q').count() === 1);
    await page.click('[data-action=pr-reveal]'); await settle(page);
    await page.click('[data-action=pr-rate][data-ok="1"]'); await settle(page);
    ok('practice: rating moves on', (await page.locator('.pr-card .muted').first().innerText()).includes('Question 2'));

    // reload keeps everything
    await page.goto(URL0 + '#/board'); await page.reload(); await settle(page, 500);
    ok('persist: perfected card survives reload', await page.locator('.card.perfected').count() === 1);
    ok('visitor: no page errors', errs.length === 0, errs);
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
      const seen = [];
      for (const [name, hash, pre] of [['home', '#/home'], ['board', '#/board'], ['resume content', '#/resume'], ['resume checks', '#/resume', '[data-action=resume-tab][data-v=checks]'], ['resume design', '#/resume', '[data-action=resume-tab][data-v=design]'], ['match', '#/match'], ['practice', '#/practice', '[data-action=pr-start]'], ['jds', '#/jds'], ['collected', '#/collected']]) {
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
