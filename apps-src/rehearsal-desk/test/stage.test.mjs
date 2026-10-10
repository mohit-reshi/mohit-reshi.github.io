// Browser checks for the stage layer of Rehearsal Desk. Run: node apps-src/rehearsal-desk/test/stage.test.mjs (after build.mjs)
// Covers: reduced motion, the section curtain (plays on completion, not on load, skippable), idle cost, 360px, no outside requests, axe.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const require = createRequire(join(root, 'site', 'package.json'));
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const PORT = 4988;
const srv = createServer((q, r) => { let p = join(root, 'site', 'public', decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(PORT);
const U = `http://localhost:${PORT}/apps-hosted/rehearsal-desk/`;
let failed = 0;
const ok = (n, c, x) => { if (c) console.log('PASS ' + n); else { failed++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); } };
const sandbox = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(sandbox) ? { executablePath: sandbox } : {});
async function mk(o) {
  const ctx = await browser.newContext(o);
  await ctx.addInitScript(() => { window.__raf = 0; const f = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__raf++; return f(cb); }; });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('request', (r) => { if (!r.url().startsWith('http://localhost')) errs.push('external ' + r.url()); });
  return { ctx, page, errs };
}
const perfectSection = async (page, via) => { const c = page.locator('.sec').first().locator('.card'); const n = await c.count(); for (let i = 0; i < n; i++) { const b = c.nth(i).locator('[data-action=perfect]'); if (via === 'key') { await b.focus(); await page.keyboard.press('Enter'); } else await b.click({ force: true }); } };
try {
  { // normal motion
    const { ctx, page, errs } = await mk({ viewport: { width: 1280, height: 800 } });
    await page.goto(U + '#/board'); await page.waitForTimeout(1500);
    ok('no curtain on load', await page.locator('.curtain').count() === 0);
    const r0 = await page.evaluate(() => window.__raf); await page.waitForTimeout(1500);
    ok('board is idle: no animation frames requested', (await page.evaluate(() => window.__raf)) === r0);
    await perfectSection(page, 'key'); await page.waitForTimeout(250);
    ok('curtain plays when the last card of a section is perfected', await page.locator('.curtain').count() === 1);
    ok('curtain is announced as text', /Section perfected/.test(await page.locator('#stage-live').innerText()));
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    ok('Escape skips the curtain', await page.locator('.curtain').count() === 0);
    ok('first section ring reads 3 of 3', await page.locator('.sec').first().locator('.ring').getAttribute('aria-label') === '3 of 3 perfected');
    ok('no errors or outside requests', errs.length === 0, errs); await ctx.close();
  }
  { // reduced motion
    const { ctx, page, errs } = await mk({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await page.goto(U + '#/board'); await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ fan: document.querySelector('.board').classList.contains('fan'), tf: getComputedStyle(document.querySelector('.card')).transform }));
    ok('reduced motion: no fan-out and no card transform', !st.fan && st.tf === 'none', st);
    await perfectSection(page); await page.waitForTimeout(300);
    const cur = await page.evaluate(() => { const e = document.querySelector('.curtain'); return e && { quiet: e.classList.contains('quiet'), cur: e.querySelectorAll('.cur').length, sparks: e.querySelectorAll('.sparks i').length }; });
    ok('reduced motion: the curtain call is a calm fade', cur && cur.quiet && cur.cur === 0 && cur.sparks === 0, cur);
    await page.goto(U + '#/practice'); await page.selectOption('#pr-scope', 'all'); await page.click('[data-action=pr-start]'); await page.click('[data-action=pr-reveal]'); await page.waitForTimeout(400);
    const an = await page.evaluate(() => getComputedStyle(document.querySelector('.pr-card')).animationName);
    ok('reduced motion: reveal is a fade', an === 'none' || an === 'calmfade', an);
    ok('reduced motion: no errors', errs.length === 0, errs); await ctx.close();
  }
  for (const scheme of ['light', 'dark']) { // 360px and axe
    const { ctx, page, errs } = await mk({ viewport: { width: 360, height: 740 }, colorScheme: scheme });
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const axe = async (name) => { const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.acx').analyze(); ok(`axe (${scheme}): ${name}`, r.violations.length === 0, r.violations.map((v) => v.id + ' ' + v.nodes[0].target.join(' '))); };
    for (const h of ['#/home', '#/board', '#/practice']) { await page.goto(U + h); await page.waitForTimeout(900); ok(`360 (${scheme}): no sideways scroll on ${h}`, !(await wide())); }
    await axe('practice home'); await page.goto(U + '#/board'); await page.waitForTimeout(250); await axe('board during fan-out');
    await page.goto(U + '#/practice'); await page.selectOption('#pr-scope', 'all'); await page.click('[data-action=pr-start]'); await page.waitForTimeout(800);
    ok(`360 (${scheme}): no sideways scroll in a round`, !(await wide())); await axe('practice question');
    await page.click('[data-action=pr-reveal]'); await page.waitForTimeout(800); await axe('practice answer');
    ok(`no errors (${scheme})`, errs.length === 0, errs); await ctx.close();
  }
} catch (e) { failed++; console.log('FAIL exception: ' + e.stack); }
await browser.close(); srv.close();
console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
