// Browser checks for Pot and Plate. Run: node apps-src/pot-and-plate/test/ui.test.mjs  (after build.mjs and make-app-packages.mjs)
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
const PORT = 4991;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = createServer((q, r) => { let p = join(root, 'site', 'public', decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(PORT);
const URL0 = `http://localhost:${PORT}/apps-hosted/pot-and-plate/`;
let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log('PASS ' + name); else { failed++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); } };
const BLOCK = `Here you go.
=== MEAL v1 ===
name: Moong dal khichdi
type: lunch
servings: 4
cooked_weight_g: [MEASURE]
estimate: yes

ingredients (raw grams, per-100g values)
| ingredient | g | state | kcal | protein | carbs | fat | fibre |
| Basmati rice | 150 | raw | 349 | 7.5 | 77 | 0.6 | 1.3 |
| Moong dal, split | 100 | raw | 348 | 24 | 59 | 1.2 | 16 |
| Ghee | 15 | raw | 900 | 0 | 0 | 100 | 0 |
| Onion | 80 | raw | 40 | 1.1 | 9.3 | 0.1 | 1.7 |
| Fancy masala | 10 | raw | 500 | 10 | 50 | 5 | 20 |

totals: kcal 1,100 | protein 38 g | carbs 150 g | fat 17 g | fibre 20 g
steps:
1. Cook it.
=== END ===`;

const sandboxChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {});
const mk = async (opts = {}) => {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 420, height: 900 }, acceptDownloads: true }, opts));
  await ctx.route('https://portfolio-app-sync.mohitreshi.workers.dev/**', (route) => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '{}' }));
  const page = await ctx.newPage(); const errs = []; const outside = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://localhost:' + PORT) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
  return { ctx, page, errs, outside };
};
const settle = (page, ms) => page.waitForTimeout(ms || 250);
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pot-and-plate-v1')));
const text = (page, sel) => page.locator(sel).first().innerText();
const addFood = async (page, slot, query, amount, unit) => {
  await page.click(`[data-action=add][data-slot=${slot}]`); await page.fill('.pk-q', query); await page.locator('.pk-row').first().click();
  if (unit) await page.selectOption('#q-unit', unit);
  await page.fill('#q-amt', String(amount)); const prev = await text(page, '#q-prev'); await page.click('[data-add]'); await settle(page, 200);
  await page.click('[data-sheet-close]'); await settle(page, 200); return prev;
};
const owner = async (ctx) => ctx.addInitScript(() => { try { localStorage.setItem('app-chrome:owner-key', 'test'); } catch (e) { /* ignore */ } });

try {
  // ---------- visitor: example data, nothing stored, no outside requests ----------
  {
    const { ctx, page, errs, outside } = await mk();
    await page.goto(URL0); await settle(page, 700);
    ok('visitor: five tabs', (await page.locator('.nav-a').allInnerTexts()).join('|') === 'Today|Meals|Foods|Progress|Settings');
    ok('visitor: example data banner and a calorie ring', (await page.locator('.notice').first().innerText()).includes('Example data') && (await text(page, '.ring-mid b')).length > 0);
    ok('visitor: example data is not stored', await page.evaluate(() => localStorage.getItem('pot-and-plate-v1')) === null);
    await page.goto(URL0 + '#/meals'); await settle(page);
    ok('visitor: no import button and no admin pill', (await page.locator('[data-action=meal-import]').count()) === 0 && (await page.locator('#admin-pill:not([hidden])').count()) === 0);
    ok('visitor: the example meal is listed', (await page.locator('.meal h3').allInnerTexts()).join('').includes('khichdi'));
    await page.goto(URL0 + '#/foods'); await settle(page);
    ok('foods: starter list is shown, marked approximate', (await page.locator('.food-row').count()) > 100 && (await page.locator('.chip.warn', { hasText: 'approx' }).count()) > 50);
    ok('visitor: the page made no outside requests', outside.length === 0, outside);
    ok('visitor: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- own diary: goals, adding foods, units, plate, quick, water, weight ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 600);
    await page.click('[data-action=start-own]'); await settle(page, 300);
    ok('own: starts empty with a placeholder-goals note', (await text(page, '.notice')).includes('placeholders') && (await text(page, '.ring-mid b')) === '2,000');
    await page.click('[data-action=goto-settings]'); await settle(page, 200);
    await page.fill('#goal-k', '1800'); await page.fill('#goal-p', '90'); await page.fill('#goal-water', '3000'); await page.click('[data-action=save-goals]'); await settle(page, 500);
    ok('goals: saved and shown on Today', (await store(page)).goals.k === 1800 && (await store(page)).goalsSet === true);
    await page.goto(URL0 + '#/today'); await settle(page, 200);
    ok('goals: the placeholder note is gone and the ring uses the new goal', (await page.locator('.notice').count()) === 0 && (await text(page, '.ring-mid b')) === '1,800');
    let prev = await addFood(page, 'breakfast', 'paneer', 80);
    ok('add: live preview is exact (80 g paneer = 212 kcal)', prev.includes('212 kcal'), prev);
    ok('add: entry shows in the breakfast section and the ring updates', (await text(page, '#slot-breakfast + .slot-k')) === '212 kcal' && (await text(page, '.ring-mid b')) === '1,588', await text(page, '.ring-mid b'));
    prev = await addFood(page, 'lunch', 'roti', 2, 'roti');
    ok('units: 2 roti = 80 g = 240 kcal', prev.includes('240 kcal') && prev.includes('80 g'), prev);
    ok('units: the entry says 2 roti', (await page.locator('#slot-lunch').locator('xpath=../..').innerText()).includes('2 roti'));
    // milk in ml
    prev = await addFood(page, 'snack', 'milk toned', 200, 'ml');
    ok('units: 200 ml toned milk uses the density (206 g, 119 kcal)', prev.includes('119 kcal') && prev.includes('206 g'), prev);
    // plate with typed text
    await page.click('[data-action=add][data-slot=dinner]'); await page.click('[data-tab=plate]');
    await page.fill('.pl-text', 'rice 180g, dal 230 g, unicorn 10g'); await page.click('[data-read]'); await settle(page, 200);
    ok('plate: typed text is read into rows, unknown food is explained', (await page.locator('.prow').count()) === 2 && (await text(page, '.pl-msg')).includes('unicorn'));
    ok('plate: live total (180 g rice + 230 g dal = 476 kcal)', (await text(page, '.plate-tot')).includes('476 kcal'), await text(page, '.plate-tot'));
    await page.click('[data-savemeal]'); await settle(page, 300);
    await page.fill('#me-name', 'Dal chawal'); await page.fill('#me-serv', '2'); await page.fill('#me-pot', '460'); await page.fill('#me-ves', '50'); await settle(page, 200);
    ok('meal editor: totals, per serving and per 100 g cooked', (await text(page, '#me-tot')).includes('476 kcal') && (await text(page, '#me-tot')).includes('238 kcal') && (await text(page, '#me-tot')).includes('116 kcal per 100 g cooked'), await text(page, '#me-tot'));
    await page.click('[data-save]'); await settle(page, 400);
    ok('meal editor: saved meal is in the Meals tab of the Add sheet', (await page.locator('[data-panel=meals]').count()) === 1);
    await page.click('[data-tab=meals]'); await page.locator('[data-meal]').first().click(); await settle(page, 200);
    await page.click('[data-mode=grams]'); await page.fill('#lm-amt', '205'); await settle(page, 100);
    ok('log by grams from the pot: 205 g of a 410 g pot = half = 238 kcal', (await text(page, '#lm-prev')).includes('238 kcal'), await text(page, '#lm-prev'));
    await page.click('[data-go]'); await settle(page, 300); await page.click('[data-sheet-close]'); await settle(page, 200);
    ok('log by grams: entry added to dinner with the meal name', (await page.locator('#slot-dinner').locator('xpath=../..').innerText()).includes('Dal chawal'));
    const st = await (async () => { await settle(page, 400); return store(page); })();
    ok('meal logging counts uses', Object.values(st.meals)[0].uses === 1 && Object.values(st.meals)[0].potG === 460);
    // quick calories
    await page.click('[data-action=add][data-slot=snack]'); await page.click('[data-tab=quick]'); await page.fill('#qk-name', 'Restaurant thali'); await page.fill('#qk-k', '800'); await page.click('[data-qk]'); await settle(page, 200); await page.click('[data-sheet-close]');
    ok('quick: calories only', (await page.locator('.ent', { hasText: 'Restaurant thali' }).innerText()).includes('800'));
    // entry edit scales, delete + undo
    await page.locator('.ent', { hasText: 'Paneer' }).locator('.ent-main').click(); await page.fill('#en-amt', '160'); await settle(page, 100);
    ok('edit entry: preview doubles with the amount', (await text(page, '#en-prev')).includes('424 kcal'), await text(page, '#en-prev'));
    await page.click('[data-save]'); await settle(page, 300);
    ok('edit entry: saved and scaled', (await page.locator('.ent', { hasText: 'Paneer' }).innerText()).includes('424'));
    await page.locator('.ent', { hasText: 'Restaurant thali' }).locator('.ent-main').click(); await page.click('[data-del]'); await settle(page, 200);
    ok('delete: entry removed with an undo toast', (await page.locator('.ent', { hasText: 'Restaurant thali' }).count()) === 0 && (await page.locator('#toast .linkbtn').count()) === 1);
    await page.click('#toast .linkbtn'); await settle(page, 200);
    ok('delete: undo brings it back', (await page.locator('.ent', { hasText: 'Restaurant thali' }).count()) === 1);
    // water
    await page.click('[data-action=water][data-ml="500"]'); await page.click('[data-action=water][data-ml="250"]'); await settle(page, 150);
    ok('water: presets add up', (await text(page, '#water-h + .slot-k')) === '750 / 3,000 ml');
    await page.click('[data-action=water-undo]'); await settle(page, 150);
    ok('water: undo removes the last glass', (await text(page, '#water-h + .slot-k')) === '500 / 3,000 ml');
    await page.click('[data-action=water-other]'); await page.fill('#dlg-in', '330'); await page.click('dialog button.primary'); await settle(page, 150);
    ok('water: other amount', (await text(page, '#water-h + .slot-k')).startsWith('830'));
    // weight and note
    await page.fill('#weight-in', '72.4'); await page.locator('#weight-in').blur(); await page.fill('#note-in', 'ate out'); await settle(page, 500);
    await page.reload(); await settle(page, 600);
    ok('persist: everything survives a reload', (await page.locator('.ent').count()) >= 5 && (await page.inputValue('#weight-in')) === '72.4' && (await page.inputValue('#note-in')) === 'ate out' && (await text(page, '#water-h + .slot-k')).startsWith('830'));
    // day navigation and copy
    await page.click('[data-action=day-prev]'); await settle(page, 200);
    ok('days: yesterday is empty and says so', (await page.locator('.ent').count()) === 0 && (await text(page, '.daytitle b')) !== 'Today');
    await addFood(page, 'breakfast', 'oats', 50); await page.click('[data-action=day-today]'); await settle(page, 200);
    ok('days: back to today with the Today label', (await text(page, '.daytitle b')) === 'Today');
    ok('days: next is disabled on today', await page.locator('[data-action=day-next]').isDisabled());
    await page.locator('.ent', { hasText: 'Paneer' }).locator('.ent-main').click(); await page.selectOption('#en-slot', 'snack'); await page.click('[data-save]'); await settle(page, 200);
    ok('edit entry: moved to another meal', (await page.locator('#slot-snack').locator('xpath=../..').innerText()).includes('Paneer'));
    ok('own: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- data saved under the app's first name is picked up ----------
  {
    const { ctx, page, errs } = await mk();
    await page.addInitScript(() => { if (!localStorage.getItem('pot-and-plate-v1') && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('katori-v1', JSON.stringify({ v: 1, sample: false, goals: { k: 1700, p: 80, c: 200, f: 55, fi: 25, water: 2500 }, goalsSet: true, foods: {}, meals: {}, log: {} })); } });
    await page.goto(URL0); await settle(page, 700);
    ok('rename: data saved under the old name is loaded', (await text(page, '.ring-mid b')) === '1,700' && (await page.locator('.notice', { hasText: 'Example data' }).count()) === 0);
    ok('rename: and is copied to the new storage key', (await store(page)).goals.k === 1700);
    ok('rename: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- diets and goal periods ----------
  {
    const { ctx, page, errs } = await mk({ viewport: { width: 700, height: 1100 } });
    await page.clock.install({ time: new Date(2026, 11, 31, 12, 0) });
    await page.goto(URL0); await settle(page, 500); await page.click('[data-action=start-own]'); await page.goto(URL0 + '#/settings'); await settle(page, 300);
    const order = await page.evaluate(() => { const h = [...document.querySelectorAll('.settings h2')].map((x) => x.textContent); return [h.indexOf('Diet'), h.indexOf('My goals'), h.indexOf('Goal periods')]; });
    ok('goals: the diet dropdown sits above My goals, and Goal periods comes after', order[0] >= 0 && order[0] < order[1] && order[1] < order[2], order);
    ok('goals: the default goal is highlighted as active', (await page.locator('.goalcard.active').count()) === 1 && (await page.locator('.goalcard.active').getAttribute('data-goal')) === 'default' && (await text(page, '.goalcard.active .chip.on')).includes('Active now'));
    await page.fill('#goal-k', '1500'); await page.selectOption('#diet-sel', 'keto'); await settle(page, 400);
    let st = await store(page);
    ok('diet: keto on 1,500 kcal gives 75 g protein, 19 g carbs, 125 g fat, saved to the default goal', st.goals.diet === 'keto' && st.goals.p === 75 && st.goals.c === 19 && st.goals.f === 125 && st.goals.k === 1500, st.goals);
    ok('diet: the split is shown', (await text(page, '.goalcard.active .split')).includes('protein 20%') && (await text(page, '.goalcard.active .split')).includes('carbs 5%'));
    await page.fill('#goal-k', '1800'); await settle(page, 100);
    ok('diet: changing calories updates the macros live (1,800 keto = 90 / 23 / 150)', (await page.inputValue('#goal-p')) === '90' && (await page.inputValue('#goal-c')) === '23' && (await page.inputValue('#goal-f')) === '150');
    await page.fill('#goal-p', '120'); await settle(page, 100);
    ok('diet: editing a macro switches to my own split', (await page.locator('#gd-default').inputValue()) === 'custom');
    await page.click('[data-action=save-goals][data-goal=default]'); await settle(page, 500);
    ok('diet: the default goal keeps the typed macros', (await store(page)).goals.p === 120 && (await store(page)).goals.diet === 'custom');
    // add a period
    await page.click('[data-action=period-add]'); await settle(page, 300);
    let card = page.locator('.goalcard[data-goal]:not([data-goal=default])').first();
    ok('periods: a new period appears with a free name and dates', (await card.locator('[data-gf=name]').inputValue()) === 'Goal 1' && (await card.locator('[data-gf=start]').inputValue()) === '2026-12-31');
    await card.locator('[data-gf=name]').fill('January cut'); await card.locator('[data-gf=start]').fill('2027-01-01'); await card.locator('[data-gf=end]').fill('2027-01-10'); await card.locator('[data-gf=k]').fill('1500');
    await card.locator('[data-gf=diet]').selectOption('lowcarb'); await settle(page, 100);
    ok('periods: choosing a diet inside a goal fills its macros from its calories', (await card.locator('[data-gf=p]').inputValue()) === '113' && (await card.locator('[data-gf=c]').inputValue()) === '94' && (await card.locator('[data-gf=f]').inputValue()) === '75');
    await card.locator('[data-action=period-save]').click(); await settle(page, 500);
    st = await store(page); const jan = st.periods[0];
    ok('periods: saved with name, dates, calories and diet; the default goal is untouched', st.periods.length === 1 && jan.name === 'January cut' && jan.start === '2027-01-01' && jan.end === '2027-01-10' && jan.k === 1500 && jan.diet === 'lowcarb' && st.goals.k === 1800 && st.goals.diet === 'custom', jan);
    ok('periods: shows "Starts in 1 day" while the default is highlighted', (await page.locator('.goalcard[data-goal]:not([data-goal=default]) .chip', { hasText: 'Starts in 1 day' }).count()) === 1 && (await page.locator('.goalcard.active').getAttribute('data-goal')) === 'default');
    // reminder on Today the day before
    await page.goto(URL0 + '#/today'); await settle(page, 300);
    ok('reminder: the day before, Today says the custom goal starts tomorrow', (await text(page, '.goalnote')).includes('From tomorrow your goal "January cut" starts: 1,500 kcal'), await text(page, '.goalnote'));
    await page.click('[data-action=dismiss-notice]'); await settle(page, 400); await page.reload(); await settle(page, 500);
    ok('reminder: "Got it" dismisses it for good', (await page.locator('.goalnote').count()) === 0);
    // overlap and blocked dates
    await page.goto(URL0 + '#/settings'); await settle(page, 300); await page.click('[data-action=period-add]'); await settle(page, 300);
    card = page.locator('.goalcard:has([data-gf=name][value="Goal 1"])');
    ok('periods: the blocked dates of the other goal are listed', (await card.locator('.blocked').innerText()).includes('1 Jan 2027 to 10 Jan 2027 (January cut)'));
    await card.locator('[data-gf=start]').fill('2027-01-05'); await card.locator('[data-gf=end]').fill('2027-01-08'); await settle(page, 200);
    ok('periods: choosing blocked dates shows the clash straight away', (await card.locator('.errs').innerText()).includes('overlap "January cut"'));
    await card.locator('[data-action=period-save]').click(); await settle(page, 300);
    ok('periods: a clashing goal is refused and not saved', (await card.locator('.errs').innerText()).includes('overlap') && !(await store(page)).periods.some((p) => p.start === '2027-01-05'));
    await card.locator('[data-gf=start]').fill('2027-01-11'); await card.locator('[data-gf=end]').fill('2027-01-20'); await card.locator('[data-gf=name]').fill('Maintenance'); await card.locator('[data-gf=k]').fill('1900');
    await card.locator('[data-action=period-save]').click(); await settle(page, 400);
    ok('periods: the day after another goal ends is allowed', (await store(page)).periods.some((p) => p.name === 'Maintenance' && p.start === '2027-01-11'));
    await page.click('[data-action=period-add]'); await settle(page, 300); await page.click('[data-action=period-add]').catch(() => {}); await settle(page, 200);
    ok('periods: at most three, the add button is disabled and the count shows', (await page.locator('.goalcard[data-goal]:not([data-goal=default])').count()) === 3 && await page.locator('[data-action=period-add]').isDisabled() && (await text(page, '.settings')).includes('3 of 3 used'));
    // go to the start date
    await page.goto(URL0 + '#/today'); await page.clock.setSystemTime(new Date(2027, 0, 1, 12, 0)); await page.reload(); await settle(page, 600);
    ok('start day: the period goal replaces the default on Today', (await text(page, '.ring-mid b')) === '1,500' && (await text(page, '.goal-chip')).includes('January cut') && (await text(page, '.goal-chip')).includes('10 Jan 2027'), await text(page, '.summary'));
    ok('start day: no "starts tomorrow" reminder any more', (await page.locator('.goalnote').count()) === 0);
    await page.click('[data-action=day-prev]'); await settle(page, 200);
    ok('history: yesterday still uses the default goal of that day', (await text(page, '.ring-mid b')) === '1,800');
    await page.click('[data-action=day-today]'); await page.goto(URL0 + '#/settings'); await settle(page, 300);
    ok('start day: the active period is highlighted, the default is not', (await page.locator('.goalcard.active').count()) === 1 && (await page.locator('.goalcard.active [data-gf=name]').inputValue()) === 'January cut' && (await text(page, '[data-goal=default] .chip')).includes('Applies when no goal period'));
    ok('start day: the diet dropdown shows the active goal and its diet', (await page.inputValue('#diet-sel')) === 'lowcarb' && (await text(page, '#diet-h + label')).includes('January cut'));
    await page.selectOption('#diet-sel', 'highprotein'); await settle(page, 500); st = await store(page);
    ok('diet: with a period running, the dropdown changes only the period (1,500 kcal high protein = 131 / 150 / 42)', st.periods[0].diet === 'highprotein' && st.periods[0].p === 131 && st.periods[0].c === 150 && st.periods[0].f === 42 && st.goals.diet === 'custom' && st.goals.p === 120, st.periods[0]);
    // last day and end
    await page.clock.setSystemTime(new Date(2027, 0, 10, 12, 0)); await page.goto(URL0 + '#/today'); await page.reload(); await settle(page, 600);
    ok('last day: Today says the goal ends and what applies tomorrow', (await text(page, '.goalnote')).includes('last day of "January cut"') && (await text(page, '.goalnote')).includes('"Maintenance" applies again: 1,900 kcal'), await text(page, '.goalnote'));
    await page.clock.setSystemTime(new Date(2027, 0, 25, 12, 0)); await page.goto(URL0 + '#/today'); await page.reload(); await settle(page, 600);
    ok('after the periods: the default goal is back', (await text(page, '.ring-mid b')) === '1,800' && (await page.locator('.goal-chip').count()) === 0);
    await page.goto(URL0 + '#/settings'); await settle(page, 300);
    await page.locator('.goalcard[data-goal]:not([data-goal=default])').first().locator('[data-action=period-del]').click(); await page.click('dialog button.primary'); await settle(page, 400);
    ok('periods: deleting one frees its dates and its slot', (await store(page)).periods.length === 2 && (await text(page, '.settings')).includes('2 of 3 used'));
    ok('goals: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- food-themed motion ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 1500);
    ok('plate: wedges for protein, carbs and fat are drawn once the entrance has played', await page.evaluate(() => [...document.querySelectorAll('.wedge')].every((w) => /stroke-dasharray:\s*[1-9]/.test(w.getAttribute('style')))));
    ok('plate: the legend lists the shares as real text', (await text(page, '.legend')).includes('Protein') && /\d+%/.test(await text(page, '.legend')));
    await page.hover('.lg[data-hl=p]'); await settle(page, 300);
    ok('plate: hovering a macro lifts its wedge and shows its grams in the middle', (await page.locator('.plate-wrap.hl-p').count()) === 1 && (await text(page, '.ring-alt')).includes('protein') && (await page.evaluate(() => getComputedStyle(document.querySelector('.ring-mid')).opacity)) === '0');
    await page.mouse.move(2, 2); await settle(page, 300);
    ok('plate: moving away puts the calories back', (await page.locator('.plate-wrap.hl').count()) === 0);
    await page.focus('.lg[data-hl=c]'); await settle(page, 150);
    ok('plate: keyboard focus does the same', (await page.locator('.plate-wrap.hl-c').count()) === 1);
    ok('glass: the water glass is drawn with the level and an accessible label', (await page.locator('svg.glass').getAttribute('aria-label')).includes('millilitres') && (await page.locator('.glass .wave').count()) === 2);
    const raf = await page.evaluate(() => new Promise((res) => { let n = 0; const o = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { n++; return o(f); }; setTimeout(() => { window.requestAnimationFrame = o; res(n); }, 1500); }));
    ok('performance: nothing schedules animation frames while idle (the waves are CSS only)', raf === 0, raf);
    await page.goto(URL0 + '#/meals'); await settle(page, 400);
    ok('meals: a weighed pot has steam, an unweighed one does not', (await page.locator('.meal .steam').count()) === 1);
    await page.click('[data-action=meal-log]'); await settle(page, 300);
    const box = await page.locator('.slicer').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8); await settle(page, 200);
    ok('slicer: clicking the bottom of the pot cuts half of it (2 of 4 servings)', (await page.inputValue('#lm-amt')) === '2' && (await page.inputValue('#lm-range')) === '2' && (await text(page, '#lm-prev')).includes('kcal'), await page.inputValue('#lm-amt'));
    await page.fill('#lm-range', '3'); await page.locator('#lm-range').dispatchEvent('input'); await settle(page, 200);
    ok('slicer: the slider moves the wedge and the amount together', (await page.inputValue('#lm-amt')) === '3' && (await page.locator('.sl-wedge').getAttribute('d')).includes('A46 46 0 1 1'));
    await page.click('[data-mode=grams]'); await settle(page, 200);
    ok('slicer: by grams the slider runs up to the weighed pot', (await page.inputValue('#lm-range')) === (await page.inputValue('#lm-amt')) && (await page.locator('#lm-range').getAttribute('max')) === '1450');
    await page.click('[data-sheet-close]');
    ok('motion: no page errors', errs.length === 0, errs);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 500); await page.click('[data-action=start-own]'); await settle(page, 200);
    ok('plate: an empty day shows an empty plate with cutlery and no wedges', (await page.locator('.cutlery').count()) === 1 && (await page.locator('.legend').innerText()).includes('0%'));
    await page.goto(URL0 + '#/settings'); await settle(page, 200); await page.fill('#goal-p', '10'); await page.click('[data-action=save-goals][data-goal=default]'); await settle(page, 400); await page.goto(URL0 + '#/today'); await settle(page, 300);
    await page.click('[data-action=add][data-slot=lunch]'); await page.fill('.pk-q', 'chicken'); await page.locator('.pk-row').first().click(); await page.fill('#q-amt', '100'); await page.click('[data-add]'); await settle(page, 300);
    await page.click('[data-sheet-close]'); await settle(page, 250);
    ok('drops: closing the sheet drops food bits onto the plate, coloured by macro', (await page.locator('.drops .bit').count()) >= 3);
    ok('goals: reaching the protein goal says so', (await text(page, '#toast')).includes('Protein goal reached'), await text(page, '#toast'));
    ok('entries: the new row slides in', (await page.locator('.ent.new').count()) === 1);
    await page.click('[data-action=water][data-ml="250"]'); await settle(page, 200);
    ok('glass: bubbles rise when you add water', (await page.locator('.bubbles .bub').count()) >= 5);
    ok('motion: no page errors (own diary)', errs.length === 0, errs);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await mk({ reducedMotion: 'reduce' });
    await page.goto(URL0); await settle(page, 300);
    ok('reduced motion: the plate is drawn at once, with no entrance animation', await page.evaluate(() => [...document.querySelectorAll('.wedge')].every((w) => /stroke-dasharray:\s*[1-9]/.test(w.getAttribute('style')))));
    ok('reduced motion: waves and steam do not animate', (await page.evaluate(() => getComputedStyle(document.querySelector('.glass .wave')).animationName)) === 'none');
    await page.click('[data-action=start-own]'); await page.click('[data-action=add][data-slot=lunch]'); await page.fill('.pk-q', 'rice'); await page.locator('.pk-row').first().click(); await page.click('[data-add]'); await page.click('[data-sheet-close]'); await settle(page, 300);
    ok('reduced motion: no flying food or bubbles', (await page.locator('.bit, .bub').count()) === 0);
    ok('reduced motion: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- foods: label converter, consistency check, edit starter, CSV ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0 + '#/foods'); await settle(page, 600);
    await page.click('[data-action=food-new]'); await page.fill('#fe-name', 'Protein bar');
    await page.locator('details summary').click(); await page.fill('#lb-g', '30'); await page.fill('#lb-k', '120'); await page.fill('#lb-p', '4'); await page.fill('#lb-c', '20'); await page.fill('#lb-f', '3'); await page.click('[data-convert]');
    ok('label converter: per-serving values become per 100 g', (await page.inputValue('#fe-k')) === '400' && (await page.inputValue('#fe-p')) === '13.3' && (await page.inputValue('#fe-c')) === '66.7' && (await page.inputValue('#fe-f')) === '10');
    await page.fill('#fe-k', '40'); await settle(page, 100);
    ok('consistency: a calorie typo is flagged', (await text(page, '#fe-warn')).includes('do not match'));
    await page.fill('#fe-k', '400'); await page.fill('#fe-units', 'bar=30; half=15'); await page.check('#fe-ver'); await page.click('[data-save]'); await settle(page, 500);
    ok('foods: new food saved as mine and verified', (await page.locator('.food-row', { hasText: 'Protein bar' }).innerText()).includes('verified') && (await store(page)).sample === false);
    await page.fill('#food-q', 'protein bar'); await settle(page, 200);
    ok('foods: search finds it', (await page.locator('.food-row').count()) === 1);
    await page.fill('#food-q', 'ghee'); await settle(page, 200); await page.locator('.food-row').first().click(); await page.fill('#fe-k', '899'); await page.click('[data-save]'); await settle(page, 400);
    ok('foods: editing a starter food marks it edited', (await page.locator('.food-row', { hasText: 'Ghee' }).innerText()).includes('edited'));
    await page.locator('.food-row', { hasText: 'Ghee' }).click(); await page.click('[data-reset]'); await settle(page, 300);
    ok('foods: reset brings the starter value back', !(await page.locator('.food-row', { hasText: 'Ghee' }).innerText()).includes('edited') && (await page.locator('.food-row', { hasText: 'Ghee' }).innerText()).includes('900 kcal'));
    await page.locator('.food-row', { hasText: 'Ghee' }).click(); await page.click('[data-del]'); await page.click('dialog.dlg button.primary'); await settle(page, 300);
    ok('foods: a starter food can be hidden and brought back', (await page.locator('.food-row', { hasText: 'Ghee' }).count()) === 0);
    await page.goto(URL0 + '#/settings'); await settle(page, 200); await page.click('[data-action=unhide-starters]'); await settle(page, 200); await page.goto(URL0 + '#/foods'); await page.fill('#food-q', 'ghee'); await settle(page, 200);
    ok('foods: unhide restores it', (await page.locator('.food-row', { hasText: 'Ghee' }).count()) === 1);
    await page.fill('#food-q', ''); await page.click('[data-action=csv-open]');
    await page.fill('#csv-text', 'name,state,kcal,protein,carbs,fat,fibre,units\nHome roti,cooked,300,9.5,56,3.7,4,roti=45\nMy curd,,60,3.1,3,4,0,katori=150\nProtein bar,,410,13,67,10,0,bar=30\nBad,,abc,1,1,1,0');
    await page.click('[data-read]'); await settle(page, 200);
    ok('csv: preview counts new and replaced foods and explains the bad row', (await text(page, '#csv-out')).includes('3 foods ready') && (await text(page, '#csv-out')).includes('1 will replace') && (await text(page, '#csv-out')).includes('Row 5 (Bad)'), await text(page, '#csv-out'));
    await page.click('[data-apply]'); await settle(page, 400);
    const st = await store(page);
    ok('csv: imported foods are saved, the existing one updated', Object.values(st.foods).some((f) => f.name === 'Home roti' && f.units[0].g === 45) && Object.values(st.foods).find((f) => f.name === 'Protein bar').k === 410);
    ok('csv: the safety copy for undo exists', await page.evaluate(() => localStorage.getItem('pot-and-plate-prev') !== null));
    ok('foods: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- backup, restore, undo, clear ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 500); await page.click('[data-action=start-own]'); await settle(page, 200);
    await addFood(page, 'breakfast', 'banana', 100); await settle(page, 400);
    const dl = page.waitForEvent('download'); await page.goto(URL0 + '#/settings'); await settle(page, 200); await page.click('[data-action=backup]'); const file = await dl; const path = await file.path(); const backup = readFileSync(path, 'utf8');
    ok('backup: a Pot and Plate backup file with the diary', JSON.parse(backup).app === 'pot-and-plate' && Object.keys(JSON.parse(backup).log).length === 1);
    await settle(page, 300);
    ok('backup: the last-backup time is recorded', (await text(page, '.settings')).includes('Last backup: today'));
    await page.goto(URL0 + '#/today'); await settle(page, 200); await addFood(page, 'lunch', 'apple', 150); await settle(page, 400);
    await page.goto(URL0 + '#/settings'); await settle(page, 200);
    await page.setInputFiles('#backup-in', path); await settle(page, 500);
    ok('restore: the diary goes back to the backup', (await page.locator('.ent').count()) === 1);
    await page.goto(URL0 + '#/settings'); await settle(page, 200); await page.click('[data-action=undo-restore]'); await settle(page, 400); await page.goto(URL0 + '#/today'); await settle(page, 300);
    ok('restore: undo brings back the data from before the restore', (await page.locator('.ent').count()) === 2);
    await page.goto(URL0 + '#/settings'); await page.setInputFiles('#backup-in', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') }); await settle(page, 300);
    ok('restore: a wrong file is refused and nothing changes', (await text(page, '#toast')).includes('not a Pot and Plate backup') && (await store(page)).sample === false);
    const csvDl = page.waitForEvent('download'); await page.click('[data-action=export-log]'); const f2 = await csvDl; const csv = readFileSync(await f2.path(), 'utf8');
    ok('csv log export: header and rows', csv.startsWith('date,time,meal,item,amount,unit,kcal') && csv.includes('Banana (raw)'));
    await page.click('[data-action=erase]'); await page.click('dialog button.primary'); await settle(page, 400);
    ok('clear: data removed and the example is back', (await page.evaluate(() => localStorage.getItem('pot-and-plate-v1'))) === null && (await page.locator('.notice', { hasText: 'Example data' }).count()) === 1);
    ok('backup: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- owner: import a meal pasted from a chat ----------
  {
    const { ctx, page, errs } = await mk();
    await owner(ctx);
    await page.goto(URL0 + '#/meals'); await settle(page, 800);
    ok('owner: the import button and the admin pill are visible', (await page.locator('[data-action=meal-import]').count()) === 1 && (await page.locator('#admin-pill:not([hidden])').count()) === 1);
    await page.click('[data-action=meal-import]'); await page.fill('#imp-text', BLOCK); await page.click('[data-read]'); await settle(page, 300);
    const out = await text(page, '#imp-out');
    ok('import: shows the meal, per serving values and the problems found', out.includes('Moong dal khichdi') && out.includes('4 servings') && out.includes('Fancy masala') && /No cooked weight/.test(out) && /do not match its macros|differs/.test(out), out);
    await page.click('[data-review]'); await settle(page, 300);
    ok('import: review opens the editor with the ingredient table and warnings', (await page.locator('.ing tbody tr').count()) === 5 && (await page.locator('dialog.sheet').last().locator('.warnbox').count()) === 1);
    ok('import: ingredients that look like your foods offer to use yours', (await page.locator('[data-use]').count()) >= 3, await page.locator('[data-use]').count());
    await page.locator('[data-use]').first().click(); await settle(page, 200);
    await page.fill('#me-pot', '1450'); await settle(page, 100);
    ok('import: the editor recomputes the totals', (await text(page, '#me-tot')).includes('kcal per 100 g cooked'));
    await page.click('[data-save]'); await settle(page, 600);
    const st = await store(page); const meal = Object.values(st.meals).find((m) => m.name === 'Moong dal khichdi');
    ok('import: meal saved with its items, pot weight, source and estimate flag', meal && meal.items.length === 5 && meal.potG === 1450 && meal.source === 'import' && meal.estimate === true, meal && meal.potG);
    ok('import: unknown ingredients became "check me" foods, known ones were not duplicated', Object.values(st.foods).some((f) => f.name === 'Fancy masala' && f.source === 'import' && f.verified === false) && !Object.values(st.foods).some((f) => f.name === 'Onion'));
    await settle(page, 200);
    ok('import: the meal is in My meals', (await page.locator('.meal h3', { hasText: 'Moong dal khichdi' }).count()) === 1);
    await page.locator('.meal', { hasText: 'Moong dal khichdi' }).locator('[data-action=meal-log]').click(); await settle(page, 200);
    await page.fill('#lm-amt', '2'); await settle(page, 100);
    ok('log an imported meal: 2 servings', (await text(page, '#lm-prev')).includes('kcal'));
    await page.click('[data-go]'); await settle(page, 400);
    await page.goto(URL0 + '#/today'); await settle(page, 300);
    ok('log an imported meal: appears on Today with 2 servings', (await page.locator('.ent', { hasText: 'Moong dal khichdi' }).innerText()).includes('2 servings'));
    await page.goto(URL0 + '#/meals'); await settle(page, 200);
    await page.click('[data-action=meal-import]'); await page.fill('#imp-text', 'no block here'); await page.click('[data-read]'); await settle(page, 200);
    ok('import: text without a block gives a clear message', (await text(page, '#imp-out')).includes('No "=== MEAL v1 ===" block'));
    await page.fill('#imp-text', BLOCK.replace('Moong dal khichdi', 'Quick save one')); await page.click('[data-read]'); await page.click('[data-quick]'); await settle(page, 400);
    ok('import: save as it is works', Object.values((await store(page)).meals).some((m) => m.name === 'Quick save one'));
    await page.click('[data-sheet-close]'); await settle(page, 200);
    ok('owner: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- progress ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0 + '#/progress'); await settle(page, 600);
    ok('progress: example data shows stats, calorie chart, weight chart, weekday bars and top foods', (await page.locator('.stat').count()) === 4 && (await page.locator('svg.chart').count()) === 2 && (await page.locator('.wk-c').count()) === 7 && (await page.locator('.top li').count()) >= 3);
    ok('progress: 30 days of bars by default', (await page.locator('svg.chart').first().locator('rect.cb, rect.cb-none').count()) === 30);
    await page.click('[data-action=range][data-v="7"]'); await settle(page, 200);
    ok('progress: range switches to 7 days', (await page.locator('svg.chart').first().locator('rect.cb, rect.cb-none').count()) === 7);
    ok('progress: the numbers are available as a table', (await page.locator('details .tbl tbody tr').count()) === 7);
    await page.goto(URL0); await page.click('[data-action=start-own]'); await page.goto(URL0 + '#/progress'); await settle(page, 300);
    ok('progress: an empty diary is handled', (await text(page, '.stat')).includes('Days logged') && (await page.locator('.top li').count()) === 0);
    ok('progress: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- offline, saving problems, storage ----------
  {
    const { ctx, page, errs } = await mk();
    await page.goto(URL0); await settle(page, 500);
    const ready = await page.evaluate(async () => { try { const r = await navigator.serviceWorker.ready; return !!r.active; } catch (e) { return false; } });
    ok('offline: the service worker is active', ready);
    await page.reload(); await settle(page, 600); // let the worker take control and fill its cache
    await ctx.setOffline(true);
    await page.reload(); await settle(page, 800);
    ok('offline: the app opens with no connection', (await page.locator('.brand').count()) === 1 && (await page.locator('.ring').count()) === 1);
    await page.click('[data-action=start-own]'); await settle(page, 200); await addFood(page, 'breakfast', 'banana', 100); await settle(page, 400);
    ok('offline: logging works and saves', (await store(page)).log && Object.keys((await store(page)).log).length === 1);
    await ctx.setOffline(false);
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('quota'); }; });
    await page.click('[data-action=water][data-ml="250"]'); await settle(page, 600);
    ok('storage: a failed save shows a clear warning', await page.locator('#save-error:not([hidden])').count() === 1 && (await text(page, '#save-error')).includes('Download a backup'));
    ok('offline: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- day starts at 4 am; theme; hiding weight ----------
  {
    const { ctx, page, errs } = await mk();
    await page.clock.install({ time: new Date(2026, 9, 10, 1, 30) });
    await page.goto(URL0); await settle(page, 500); await page.click('[data-action=start-own]');
    ok('day start: at 01:30 the day is still the evening before', (await text(page, '.daytitle span')).includes('9 Oct'), await text(page, '.daytitle span'));
    await page.goto(URL0 + '#/settings'); await settle(page, 200); await page.selectOption('#day-start', '0'); await settle(page, 300); await page.goto(URL0 + '#/today'); await settle(page, 200);
    ok('day start: set to midnight and it is 10 Oct', (await text(page, '.daytitle span')).includes('10 Oct'), await text(page, '.daytitle span'));
    await page.goto(URL0 + '#/settings'); await page.check('#hide-weight'); await settle(page, 300); await page.goto(URL0 + '#/today'); await settle(page, 200);
    ok('hide weight: no weight box on Today and none on Progress', (await page.locator('#weight-in').count()) === 0);
    await page.goto(URL0 + '#/progress'); await settle(page, 200); ok('hide weight: no weight chart', (await page.locator('h2', { hasText: 'Weight' }).count()) === 0);
    await page.goto(URL0 + '#/settings'); await page.selectOption('#theme-sel', 'dark'); await settle(page, 300);
    ok('theme: dark is applied and remembered', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark' && (await store(page)).theme === 'dark');
    ok('day and display: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  // ---------- accessibility (axe, light and dark) and small screens ----------
  {
    const { AxeBuilder } = require('@axe-core/playwright');
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await mk({ colorScheme: scheme }); await owner(ctx);
      await page.goto(URL0); await settle(page, 600);
      const run = async (name) => { const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('.acx').analyze(); const bad = res.violations.map((v) => v.id + ' x' + v.nodes.length + ' [' + v.nodes[0].target.join(' ') + ']'); ok('a11y (' + scheme + '): ' + name, bad.length === 0, bad); };
      for (const h of ['today', 'meals', 'foods', 'progress', 'settings']) { await page.goto(URL0 + '#/' + h); await settle(page, 350); if (h === 'settings') { await page.click('[data-action=period-add]'); await settle(page, 300); } await run(h); }
      await page.goto(URL0 + '#/today'); await settle(page, 200);
      await page.click('[data-action=add][data-slot=lunch]'); await page.fill('.pk-q', 'rice'); await settle(page, 200); await run('add sheet: search'); await page.locator('.pk-row').first().click(); await settle(page, 200); await run('add sheet: amount');
      await page.click('[data-back]'); await page.click('[data-tab=plate]'); await settle(page, 200); await run('add sheet: plate'); await page.click('[data-tab=quick]'); await run('add sheet: quick'); await page.click('[data-sheet-close]');
      await page.goto(URL0 + '#/meals'); await settle(page, 200); await page.click('[data-action=meal-new]'); await settle(page, 200); await run('meal editor'); await page.click('[data-cancel]');
      await page.click('[data-action=meal-import]'); await page.fill('#imp-text', BLOCK); await page.click('[data-read]'); await settle(page, 200); await run('meal import preview'); await page.click('[data-sheet-close]');
      await page.goto(URL0 + '#/foods'); await settle(page, 200); await page.click('[data-action=food-new]'); await settle(page, 200); await run('food editor'); await page.click('[data-sheet-close]');
      await ctx.close();
    }
    const { ctx, page } = await mk({ viewport: { width: 360, height: 740 } });
    for (const h of ['today', 'meals', 'foods', 'progress', 'settings']) { await page.goto(URL0 + '#/' + h); await settle(page, 350); ok('small screen: no sideways scrolling on ' + h, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await page.evaluate(() => document.documentElement.scrollWidth)); }
    await ctx.close();
  }
} catch (e) { failed++; console.log('FAIL exception: ' + e.message.split('\n').slice(0, 4).join(' ')); }
await browser.close(); srv.close();
console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
