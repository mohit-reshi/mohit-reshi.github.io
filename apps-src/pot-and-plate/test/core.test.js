import test from 'node:test';
import assert from 'node:assert/strict';
import { num, dayKeyFor, addDays, dayKey, similarity, fmt0, fmt1, daysBetween, dateLabel } from '../src/core/base.js';
import { scale, sum, mealTotals, perServing, portionOfMeal, netCooked, per100Cooked, gramsPerServing, consistent, impliedKcal, dayTotals, waterTotal, snap } from '../src/core/nutri.js';
import { gramsFor, splitChunk, matchFood, parseQuickLog } from '../src/core/units.js';
import { starterFoods, STARTER_COUNT } from '../src/core/starter.js';
import { parseMealText, findBlocks } from '../src/core/mealimport.js';
import { parseCsv, foodsFromCsv, foodsToCsv, csvTemplate } from '../src/core/csv.js';
import { series, averages, weightTrend, weekdayPattern, topFoods, loggedSpan } from '../src/core/stats.js';
import { SESSION_PROMPT } from '../src/core/prompt.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' vs ' + b);
const RICE = { k: 349, p: 7.5, c: 77, f: 0.6, fi: 1.3 }, DAL = { k: 348, p: 24, c: 59, f: 1.2, fi: 16 }, GHEE = { k: 900, p: 0, c: 0, f: 100, fi: 0 }, ONION = { k: 40, p: 1.1, c: 9.3, f: 0.1, fi: 1.7 };
const pot = () => ({ servings: 4, potG: 1500, vesselG: 50, items: [{ g: 150, n: RICE }, { g: 100, n: DAL }, { g: 15, n: GHEE }, { g: 80, n: ONION }] });

test('num reads messy numbers and refuses text', () => {
  assert.equal(num('350'), 350); assert.equal(num('~1,000'), 1000); assert.equal(num('12,5'), 12.5); assert.equal(num('350 kcal'), 350); assert.equal(num('−2'), -2); assert.equal(num('1,234.5'), 1234.5);
  assert.equal(num('[MEASURE]'), null); assert.equal(num(''), null); assert.equal(num('abc'), null); assert.equal(num(null), null); assert.equal(num('0.5'), 0.5); assert.equal(num('.5'), 0.5);
});
test('formatting is locale independent', () => { assert.equal(fmt0(1234567.4), '1,234,567'); assert.equal(fmt1(2), '2'); assert.equal(fmt1(2.25), '2.3'); assert.equal(fmt1(0.04), '0'); });
test('a day starts at the chosen hour: 01:30 still counts for the evening before', () => {
  assert.equal(dayKeyFor(new Date(2026, 9, 10, 1, 30), 4), '2026-10-09');
  assert.equal(dayKeyFor(new Date(2026, 9, 10, 4, 0), 4), '2026-10-10');
  assert.equal(dayKeyFor(new Date(2026, 9, 10, 1, 30), 0), '2026-10-10');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28'); assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(daysBetween('2026-10-01', '2026-10-10'), 9);
  assert.equal(dateLabel('2026-10-10'), 'Sat 10 Oct');
});
test('similarity ignores order, plurals and filler words', () => {
  assert.ok(similarity('Basmati rice', 'rice basmati') > 0.9); assert.ok(similarity('eggs', 'Egg, whole') > 0.4); assert.ok(similarity('paneer', 'Chicken breast') === 0);
});

test('scale and sum', () => {
  const a = scale(RICE, 150); near(a.k, 523.5); near(a.p, 11.25); near(a.fi, 1.95);
  const t = sum([scale(RICE, 100), scale(DAL, 100)]); near(t.k, 697);
});
test('meal totals come from each ingredient and do not change with other foods', () => {
  const t = mealTotals(pot()); near(t.k, 523.5 + 348 + 135 + 32); near(t.p, 11.25 + 24 + 0 + 0.88); near(t.f, 0.9 + 1.2 + 15 + 0.08);
  near(perServing(pot()).k, t.k / 4);
});
test('the pot method: weigh the cooked pot, then log any grams from it', () => {
  const m = pot(); assert.equal(netCooked(m), 1450); near(gramsPerServing(m), 362.5);
  const total = mealTotals(m); const eaten = portionOfMeal(m, 'grams', 290);
  near(eaten.k, total.k * 290 / 1450); near(eaten.k, portionOfMeal(m, 'servings', 0.8).k, 0.01); // 290 g is 0.8 of a 362.5 g serving
  const c = per100Cooked(m); near(c.k, total.k / 14.5);
  assert.equal(portionOfMeal({ servings: 2, items: m.items }, 'grams', 100), null, 'no pot weight, no grams');
  near(portionOfMeal(m, 'servings', 2).k, total.k / 2);
});
test('pot weight rules: vessel is subtracted, impossible values are ignored', () => {
  assert.equal(netCooked({ potG: 1000, vesselG: 400 }), 600); assert.equal(netCooked({ potG: 300, vesselG: 400 }), null); assert.equal(netCooked({ potG: 0 }), null); assert.equal(netCooked({}), null);
});
test('consistency check catches typos and allows normal rounding', () => {
  assert.ok(consistent(RICE)); assert.ok(consistent(GHEE)); assert.ok(consistent({ k: 18, p: 0.9, c: 3.9, f: 0.2, fi: 1.2 }));
  assert.ok(!consistent({ k: 35, p: 24, c: 59, f: 1.2 }), 'a missing zero'); near(impliedKcal({ p: 10, c: 10, f: 10 }), 170);
});
test('day totals use the stored entry values and ignore empty days', () => {
  assert.deepEqual(dayTotals(null), { k: 0, p: 0, c: 0, f: 0, fi: 0 });
  near(dayTotals({ entries: [{ k: 100, p: 5 }, { k: 50.5, p: 1, f: 2 }] }).k, 150.5); assert.equal(waterTotal({ water: [{ ml: 250 }, { ml: 500 }] }), 750); assert.equal(waterTotal(null), 0);
  assert.deepEqual(snap({ k: 10.123, p: 1.2345, c: 0, f: 0, fi: 0 }), { k: 10.1, p: 1.23, c: 0, f: 0, fi: 0 });
});

test('starter foods: unique ids, sensible values, internally consistent', () => {
  const f = starterFoods(); assert.equal(f.length, STARTER_COUNT); assert.ok(f.length >= 130);
  assert.equal(new Set(f.map((x) => x.id)).size, f.length);
  f.forEach((x) => { assert.ok(x.k >= 0 && x.k <= 900, x.name); assert.ok(x.p + x.c + x.f <= 100.5, x.name + ' macros over 100 g'); assert.ok(consistent(x), x.name + ' calories do not match macros'); assert.equal(x.source, 'starter'); assert.equal(x.verified, false); });
  const rice = f.find((x) => x.id === 's:rice-white-cooked'); assert.deepEqual(rice.units.map((u) => u.name), ['katori', 'cup']);
  const milk = f.find((x) => x.name === 'Milk, toned'); assert.equal(milk.density, 1.03); assert.equal(milk.state, '');
});

test('units: grams for units and ml', () => {
  const roti = { units: [{ name: 'roti', g: 40 }] }, milk = { density: 1.03, units: [] };
  assert.equal(gramsFor(roti, 'roti', 2), 80); assert.equal(gramsFor(roti, 'g', 50), 50); assert.equal(gramsFor(roti, 'kg', 1), 1000); assert.equal(gramsFor(roti, 'ml', 10), null);
  near(gramsFor(milk, 'ml', 200), 206); assert.equal(gramsFor(roti, 'spoon', 1), null);
});
test('quick log text is split into amounts and names', () => {
  assert.deepEqual(splitChunk('rice 180g'), { text: 'rice 180g', qty: 180, unit: 'g', name: 'rice' });
  assert.equal(splitChunk('180 g rice').name, 'rice'); assert.equal(splitChunk('2 roti').qty, 2); assert.equal(splitChunk('1/2 apple').qty, 0.5); assert.equal(splitChunk('1 1/2 katori dal').qty, 1.5); assert.equal(splitChunk('chai').qty, null);
});
test('quick log matches foods, raw and cooked words, household units', () => {
  const foods = starterFoods(); const rows = parseQuickLog('rice 180g, dal 230 g, 2 roti, 1 egg, raw rice 50g, unicorn 10g, banana', foods);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].food.id, 's:rice-white-cooked'); assert.equal(rows[0].g, 180);
  assert.equal(rows[1].food.name, 'Dal, plain'); assert.equal(rows[2].food.name, 'Roti'); assert.equal(rows[2].g, 80);
  assert.equal(rows[3].food.name, 'Egg, whole'); assert.equal(rows[3].g, 50);
  assert.equal(rows[4].food.state, 'raw'); assert.equal(rows[4].g, 50);
  assert.equal(rows[5].food, null); assert.ok(rows[5].problem); assert.equal(rows[6].g, null); assert.match(rows[6].problem, /amount/i);
});

const BLOCK = `Here is the recipe. Method: pressure cook.

\`\`\`
=== MEAL v1 ===
name: Moong dal khichdi
type: lunch
servings: 4
cooked_weight_g: [MEASURE]
tags: one-pot, high-protein
estimate: yes

ingredients (raw grams, per-100g values)
| ingredient | g | state | kcal | protein | carbs | fat | fibre |
|---|---|---|---|---|---|---|---|
| Basmati rice | 150 | raw | 349 | 7.5 | 77 | 0.6 | 1.3 |
| Moong dal, split | 100 | raw | 348 | 24 | 59 | 1.2 | 16 |
| Ghee | 15 | raw | 900 | 0 | 0 | 100 | 0 |
| Onion | 80 | raw | 40 | 1.1 | 9.3 | 0.1 | 1.7 |

totals: kcal 1,040 | protein 37 g | carbs 150 g | fat 17 g | fibre 20 g
per serving: kcal 260 | protein 9 g | carbs 37 g | fat 4 g | fibre 5 g

steps:
1. Wash and soak.
2. Cook for 3 whistles.

notes: Weigh the cooked pot.
=== END ===
\`\`\`
Enjoy!`;
test('meal import: finds the block inside chat text and reads every part', () => {
  const r = parseMealText(BLOCK); assert.equal(r.problems.length, 0); assert.equal(r.meals.length, 1);
  const m = r.meals[0].meal; assert.equal(m.name, 'Moong dal khichdi'); assert.equal(m.type, 'lunch'); assert.equal(m.servings, 4); assert.equal(m.potG, null); assert.deepEqual(m.tags, ['one-pot', 'high-protein']); assert.equal(m.estimate, true);
  assert.equal(m.items.length, 4); assert.equal(m.items[1].name, 'Moong dal, split'); assert.equal(m.items[1].g, 100); assert.equal(m.items[2].n.f, 100); assert.equal(m.steps.length, 2); assert.equal(m.notes, 'Weigh the cooked pot.'); assert.equal(m.stated.k, 1040);
  near(mealTotals(m).k, 1038.5);
  const w = r.meals[0].warnings.join(' | '); assert.match(w, /No cooked weight/); assert.doesNotMatch(w, /differs/);
});
test('meal import: survives chat formatting (bold, no leading pipes, ~ signs, comma decimals, fancy dashes)', () => {
  const messy = '**=== MEAL v1 ===**\nname: **Dal**\nservings: 2\ncooked_weight_g: 800\nestimate: no\ningredients\ningredient | g | state | kcal | protein | carbs | fat | fibre\nToor dal | ~100 | raw | 335 | 22,3 | 58 | 1,7 | 15\nOil | 10 | raw | 900 | 0 | 0 | 100 | 0\n=== END ===';
  const m = parseMealText(messy).meals[0].meal; assert.equal(m.name, 'Dal'); assert.equal(m.potG, 800); assert.equal(m.estimate, false); assert.equal(m.items[0].g, 100); near(m.items[0].n.p, 22.3); near(m.items[0].n.f, 1.7); assert.equal(m.items.length, 2);
});
test('meal import: reports problems instead of failing', () => {
  assert.match(parseMealText('just a recipe, no block').problems[0], /No "=== MEAL v1 ===" block/); assert.equal(parseMealText('').meals.length, 0);
  const bad = parseMealText('=== MEAL v1 ===\nservings: many\ningredients\n| ingredient | g | state | kcal | protein | carbs | fat | fibre |\n| Mystery | x | raw | 100 | 1 | 1 | 1 | 0 |\n| Butter | 20 | raw | 71 | 0.9 | 0.1 | 81 | 0 |');
  const w = bad.meals[0].warnings.join(' | '); assert.match(w, /no name/i); assert.match(w, /Servings/); assert.match(w, /Mystery: missing or unreadable weight/); assert.match(w, /Butter: calories \(71\) do not match/); assert.match(w, /no "=== END ===" line/);
  assert.equal(bad.meals[0].meal.servings, 1);
});
test('meal import: several blocks, and totals that disagree are flagged but the table wins', () => {
  const two = BLOCK + '\n\n' + BLOCK.replace('Moong dal khichdi', 'Second').replace('kcal 1,040', 'kcal 2,000');
  const r = parseMealText(two); assert.equal(r.meals.length, 2); assert.equal(r.meals[1].meal.name, 'Second'); assert.match(r.meals[1].warnings.join(' '), /stated total \(2000 kcal\) differs/);
  assert.equal(findBlocks(two).length, 2);
});
test('the session prompt contains the exact block layout the parser reads', () => {
  const m = /=== MEAL v1 ===[\s\S]*?=== END ===/.exec(SESSION_PROMPT)[0];
  assert.match(m, /\| ingredient \| g \| state \| kcal \| protein \| carbs \| fat \| fibre \|/); assert.match(SESSION_PROMPT, /\[MEASURE\]/); assert.doesNotMatch(SESSION_PROMPT, /[—–]/);
});

test('csv: quoted fields, delimiters, template round trip', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]); assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]); assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  const r = foodsFromCsv(csvTemplate()); assert.equal(r.foods.length, 2); assert.equal(r.problems.length, 0); assert.deepEqual(r.foods[0].units, [{ name: 'roti', g: 40 }]); assert.equal(r.foods[1].density, 1.03);
  const out = foodsFromCsv(foodsToCsv(r.foods)); assert.deepEqual(out.foods.map((f) => [f.name, f.state, f.k, f.density]), r.foods.map((f) => [f.name, f.state, f.k, f.density]));
});
test('csv: missing columns and bad rows are explained', () => {
  assert.match(foodsFromCsv('name,kcal\nRice,350').problems[0], /Missing column/); assert.match(foodsFromCsv('name').problems[0], /header row/);
  const r = foodsFromCsv('name,kcal,protein,carbs,fat\n,100,1,1,1\nRice,abc,1,1,1\nOk,100,5,15,2\nTypo,35,24,59,1');
  assert.equal(r.foods.length, 2); assert.ok(r.problems.some((p) => /Row 2: no name/.test(p))); assert.ok(r.problems.some((p) => /Row 3 \(Rice\)/.test(p))); assert.ok(r.problems.some((p) => /Typo/.test(p)));
});

test('stats: logged days only, weight trend, weekday pattern, top foods', () => {
  const e = (k) => ({ entries: [{ name: 'Rice', k, p: 10, c: 0, f: 0, fi: 0 }], water: [{ ml: 500 }], weight: null, note: '' });
  const log = { '2026-10-08': e(1000), '2026-10-09': e(2000), '2026-10-10': Object.assign(e(0), { entries: [], water: [] }) };
  const days = series(log, '2026-10-10', 4); assert.deepEqual(days.map((d) => d.logged), [false, true, true, false]);
  const a = averages(days); assert.equal(a.logged, 2); near(a.k, 1500); assert.equal(a.of, 4); near(a.water, 500);
  const wdays = [{ weight: 80 }, { weight: null }, { weight: 79 }, { weight: 78 }]; const t = weightTrend(wdays, 7); near(t[0], 80); assert.equal(t[1], null); near(t[2], 79.5); near(t[3], 79);
  const wp = weekdayPattern(days); assert.equal(wp.length, 7); near(wp[3], 1000); near(wp[4], 2000); assert.equal(wp[0], null);
  assert.deepEqual(topFoods(log, ['2026-10-08', '2026-10-09'], 3), [{ name: 'Rice', k: 3000, n: 2 }]); assert.equal(loggedSpan(log), 2);
});
