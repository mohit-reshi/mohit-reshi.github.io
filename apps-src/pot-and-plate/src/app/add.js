// Adding to the diary: the Add sheet (foods, meals, plate, quick calories), logging a meal, and editing an entry.
import { esc, norm, num, fmt0, fmt1, r1, timeLabel } from '../core/base.js';
import { scale, snap, portionOfMeal, mealTotals, perServing, netCooked, gramsPerServing, itemNutrition, sum, zero } from '../core/nutri.js';
import { gramsFor, parseQuickLog } from '../core/units.js';

const curKey = () => UI.day || todayKey();

function unitOptions(food) {
  const opts = [['g', 'g']]; if (food.density) opts.push(['ml', 'ml']);
  (food.units || []).forEach((u) => opts.push([u.name, u.name + ' (' + fmt1(u.g) + ' g)']));
  return opts;
}
const nutriLine = (n) => '<b>' + fmt0(n.k) + ' kcal</b> · ' + macroLine(n);
const slotSelect = (id, val) => '<label class="field"><span>Meal</span><select id="' + id + '">' + SLOTS.map(([v, l]) => '<option value="' + v + '"' + (v === val ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';

export function openAdd(slot) {
  const sh = openSheet('Add to ' + slotName(slot).toLowerCase(), '<div class="tabs" role="tablist">' + [['foods', 'Foods'], ['meals', 'My meals'], ['plate', 'Plate'], ['quick', 'Quick']].map(([id, l], i) => '<button role="tab" class="tab' + (i ? '' : ' on') + '" data-tab="' + id + '" aria-selected="' + (i === 0) + '">' + l + '</button>').join('') + '</div>' +
    '<div class="panel" data-panel="foods"></div><div class="panel" data-panel="meals" hidden></div><div class="panel" data-panel="plate" hidden></div><div class="panel" data-panel="quick" hidden></div>', { wide: true, onClose: () => render() });
  const P = (id) => $('[data-panel="' + id + '"]', sh.el);
  const state = { slot };
  const added = (name) => { toast('Added ' + name); render(); };

  // --- foods ---
  const foodsHost = P('foods');
  const showPicker = () => { foodsHost.innerHTML = '<div class="pk-host"></div><p class="muted"><button class="linkbtn" data-newfood>Add a food that is not listed</button></p>'; const pk = foodPicker($('.pk-host', foodsHost), showQty, { allowNew: true }); pk.focus(); $('[data-newfood]', foodsHost).addEventListener('click', () => openFoodEditor(null, (id) => { const f = getFood(id); if (f) showQty(f); })); };
  const showQty = (food) => {
    const last = lastAmount(food.id) || 100; const opts = unitOptions(food);
    foodsHost.innerHTML = '<button class="btn small" data-back>← Back</button><h3>' + esc(foodLabel(food)) + '</h3><p class="muted">' + fmt0(food.k) + ' kcal · P ' + fmt1(food.p) + ' · C ' + fmt1(food.c) + ' · F ' + fmt1(food.f) + ' per 100 g' + (food.source === 'starter' && !food.verified ? ' · approximate starter value' : '') + '</p>' +
      '<div class="qrow"><label class="field"><span>Amount</span>' + numIn('q-amt', last) + '</label><label class="field"><span>Unit</span><select id="q-unit">' + opts.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('') + '</select></label></div>' + slotSelect('q-slot', state.slot) +
      '<p id="q-prev" class="preview" aria-live="polite"></p><div class="row end"><button class="btn primary" data-add>Add</button></div>';
    const amt = $('#q-amt', foodsHost), unit = $('#q-unit', foodsHost), prev = $('#q-prev', foodsHost);
    const calc = () => { const a = num(amt.value); const g = a && a > 0 ? gramsFor(food, unit.value, a) : null; if (g == null) { prev.textContent = 'Enter an amount.'; return null; } prev.innerHTML = nutriLine(scale(food, g)) + (unit.value !== 'g' ? ' <span class="muted">(' + fmt1(g) + ' g)</span>' : ''); return { g, a }; };
    amt.addEventListener('input', calc); unit.addEventListener('change', calc); calc(); amt.select();
    $('[data-back]', foodsHost).addEventListener('click', showPicker);
    $('[data-add]', foodsHost).addEventListener('click', () => {
      const r = calc(); if (!r) return; state.slot = $('#q-slot', foodsHost).value;
      addEntry(curKey(), Object.assign({ kind: 'food', ref: food.id, name: foodLabel(food), amt: Math.round(r.g * 10) / 10, unit: 'g', meal: state.slot, qty: unit.value === 'g' ? '' : fmt1(r.a) + ' ' + unit.value + ' · ' + fmt1(r.g) + ' g' }, scale(food, r.g)));
      added(foodLabel(food)); showPicker();
    });
  };
  showPicker();

  // --- my meals ---
  const paintMeals = () => {
    const ms = mealList();
    P('meals').innerHTML = ms.length ? '<ul class="pk-list">' + ms.map((m) => { const ps = perServing(m); return '<li><button class="pk-row" data-meal="' + esc(m.id) + '"><span class="pk-name">' + esc(m.name) + (m.fav ? ' ★' : '') + '</span><span class="pk-sub">' + fmt0(ps.k) + ' kcal per serving · P ' + fmt1(ps.p) + ' · ' + fmt1(m.servings) + ' servings' + (netCooked(m) ? ' · pot weighed' : '') + '</span></button></li>'; }).join('') + '</ul>' : '<p class="muted">No saved meals yet. Build one on the Plate tab, or on the Meals screen.</p>';
  };
  paintMeals();
  P('meals').addEventListener('click', (e) => { const b = e.target.closest('[data-meal]'); if (b) openLogMeal(S.meals[b.dataset.meal], state.slot, () => { added(S.meals[b.dataset.meal].name); }); });

  // --- plate ---
  const plate = UI.plate;
  const paintPlate = () => {
    const host = $('.plate-rows', P('plate')); if (!host) return;
    host.innerHTML = plate.length ? plate.map((r, i) => '<li class="prow"><span class="prow-n">' + esc(foodLabel(r.food)) + (r.problem ? '<small class="warn"> ' + esc(r.problem) + '</small>' : '') + '</span><label class="sr" for="pg' + i + '">Grams of ' + esc(foodLabel(r.food)) + '</label>' + numIn('pg' + i, r.g, 'data-i="' + i + '"') + '<span>g</span><button class="btn small" data-rm="' + i + '" aria-label="Remove ' + esc(foodLabel(r.food)) + '">Remove</button></li>').join('') : '<li class="muted">Nothing on the plate yet.</li>';
    const tot = sum(plate.map((r) => scale(r.food, num(r.g) || 0)));
    $('.plate-tot', P('plate')).innerHTML = plate.length ? nutriLine(tot) : '';
    $$('[data-plate-act]', P('plate')).forEach((b) => { b.disabled = !plate.length; });
  };
  P('plate').innerHTML = '<label class="field"><span>Type what you ate</span><textarea class="pl-text" rows="2" placeholder="rice 180g, dal 230g, 2 roti"></textarea></label><div class="row"><button class="btn" data-read>Read it</button><span class="muted pl-msg" aria-live="polite"></span></div><div class="pk-host"></div><h3>On the plate</h3><ul class="plate-rows"></ul><p class="plate-tot preview" aria-live="polite"></p>' + slotSelect('pl-slot', slot) + '<div class="row end"><button class="btn" data-plate-act data-clear>Clear</button><button class="btn" data-plate-act data-savemeal>Save as a meal</button><button class="btn primary" data-plate-act data-addplate>Add to my day</button></div>';
  foodPicker($('.pk-host', P('plate')), (f) => { plate.push({ food: f, g: 100 }); paintPlate(); const l = $$('.plate-rows input', P('plate')).pop(); if (l) { l.focus(); l.select(); } }, { placeholder: 'Add a food to the plate' });
  paintPlate();
  $('[data-read]', P('plate')).addEventListener('click', () => {
    const rows = parseQuickLog($('.pl-text', P('plate')).value, foodList()); let n = 0, bad = 0;
    rows.forEach((r) => { if (r.food && r.g != null) { plate.push({ food: r.food, g: Math.round(r.g * 10) / 10 }); n++; } else bad++; });
    $('.pl-msg', P('plate')).textContent = n + ' added' + (bad ? ', ' + bad + ' not understood: ' + rows.filter((r) => !r.food || r.g == null).map((r) => '"' + r.text + '" (' + r.problem + ')').join(' ') : '.');
    if (n) $('.pl-text', P('plate')).value = ''; paintPlate();
  });
  P('plate').addEventListener('input', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i !== undefined && plate[i]) { plate[i].g = e.target.value; paintPlate2(); } });
  const paintPlate2 = () => { const tot = sum(plate.map((r) => scale(r.food, num(r.g) || 0))); $('.plate-tot', P('plate')).innerHTML = plate.length ? nutriLine(tot) : ''; };
  P('plate').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { plate.splice(+rm.dataset.rm, 1); paintPlate(); return; }
    if (e.target.closest('[data-clear]')) { plate.length = 0; paintPlate(); return; }
    if (e.target.closest('[data-addplate]')) {
      const sl = $('#pl-slot', P('plate')).value; let n = 0;
      plate.forEach((r) => { const g = num(r.g); if (g && g > 0) { addEntry(curKey(), Object.assign({ kind: 'food', ref: r.food.id, name: foodLabel(r.food), amt: g, unit: 'g', meal: sl }, scale(r.food, g))); n++; } });
      plate.length = 0; paintPlate(); added(n + ' item' + (n === 1 ? '' : 's')); return;
    }
    if (e.target.closest('[data-savemeal]')) {
      const items = plate.filter((r) => num(r.g) > 0).map((r) => ({ name: foodLabel(r.food), g: num(r.g), state: r.food.state || 'raw', n: { k: r.food.k, p: r.food.p, c: r.food.c, f: r.food.f, fi: r.food.fi || 0 } }));
      openMealEditor({ name: '', type: 'any', servings: 1, items, steps: [], tags: [], source: 'made' }, () => { toast('Meal saved'); paintMeals(); });
    }
  });

  // --- quick ---
  P('quick').innerHTML = '<label class="field"><span>What was it?</span><input id="qk-name" autocomplete="off" placeholder="For example: restaurant thali"></label><div class="qrow"><label class="field"><span>Calories</span>' + numIn('qk-k', '') + '</label><label class="field"><span>Protein g</span>' + numIn('qk-p', '') + '</label><label class="field"><span>Carbs g</span>' + numIn('qk-c', '') + '</label><label class="field"><span>Fat g</span>' + numIn('qk-f', '') + '</label></div>' + slotSelect('qk-slot', slot) + '<p class="muted">Only calories are needed. Leave the rest empty if you do not know them.</p><div class="row end"><button class="btn primary" data-qk>Add</button></div>';
  $('[data-qk]', P('quick')).addEventListener('click', () => {
    const k = num($('#qk-k', P('quick')).value); if (!k || k < 0) { toast('Enter the calories.'); return; }
    addEntry(curKey(), { kind: 'quick', name: norm($('#qk-name', P('quick')).value) || 'Quick calories', k, p: num($('#qk-p', P('quick')).value) || 0, c: num($('#qk-c', P('quick')).value) || 0, f: num($('#qk-f', P('quick')).value) || 0, fi: 0, meal: $('#qk-slot', P('quick')).value, qty: 'quick add' });
    $$('input', P('quick')).forEach((i) => { i.value = ''; }); added('quick calories');
  });

  // --- tabs ---
  $$('.tab', sh.el).forEach((t) => t.addEventListener('click', () => { $$('.tab', sh.el).forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); }); $$('.panel', sh.el).forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; }); if (t.dataset.tab === 'meals') paintMeals(); if (t.dataset.tab === 'foods') showPicker(); }));
  return sh;
}

/** Log a saved meal: by servings, or by grams from the weighed pot. */
export function openLogMeal(meal, slot, done) {
  if (!meal) return;
  const pot = netCooked(meal); const gps = gramsPerServing(meal);
  const sh = openSheet('Log ' + meal.name, '<p class="muted">' + fmt1(meal.servings) + ' servings · ' + fmt0(mealTotals(meal).k) + ' kcal in total' + (pot ? ' · ' + fmt0(pot) + ' g cooked (about ' + fmt0(gps) + ' g per serving)' : '') + '</p>' +
    '<div class="seg" role="group" aria-label="How to log it"><button class="seg-btn" data-mode="serv" aria-pressed="true">By servings</button><button class="seg-btn" data-mode="grams" aria-pressed="false"' + (pot ? '' : ' disabled title="Weigh the cooked dish first: edit the meal and enter the pot weight"') + '>By grams from the pot</button></div>' + (pot ? '' : '<p class="muted">To log by grams, weigh the finished dish and enter the pot weight in the meal.</p>') +
    '<div class="slicer-row">' + slicerHtml(1 / Math.max(0.01, num(meal.servings) || 1)) + '<div class="slicer-side"><label class="field"><span id="lm-label">Servings eaten</span>' + numIn('lm-amt', 1) + '</label><input type="range" id="lm-range" aria-label="Slide to change your portion" min="0.25" max="' + Math.max(1, num(meal.servings) || 1) + '" step="0.25" value="1"><p class="muted">Drag across the pot, or use the slider, to cut your portion.</p></div></div>' + slotSelect('lm-slot', slot) + '<p id="lm-prev" class="preview" aria-live="polite"></p><div class="row end"><button class="btn primary" data-go>Add to my day</button></div>');
  let mode = 'serv'; const amt = $('#lm-amt', sh.el), prev = $('#lm-prev', sh.el);
  const calc = () => { const a = num(amt.value); if (!a || a <= 0) { prev.textContent = 'Enter an amount.'; return null; } const n = portionOfMeal(meal, mode === 'grams' ? 'grams' : 'servings', a); if (!n) { prev.textContent = 'This meal has no cooked weight yet.'; return null; } prev.innerHTML = nutriLine(n) + (mode === 'serv' && gps ? ' <span class="muted">(about ' + fmt0(gps * a) + ' g)</span>' : mode === 'grams' ? ' <span class="muted">(' + fmt1(a / gps) + (r1(a / gps) === 1 ? ' serving' : ' servings') + ')</span>' : ''); return { a, n }; };
  $$('.seg-btn', sh.el).forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; mode = b.dataset.mode; $$('.seg-btn', sh.el).forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#lm-label', sh.el).textContent = mode === 'grams' ? 'Grams eaten' : 'Servings eaten'; amt.value = mode === 'grams' ? Math.round(gps) : 1; calc(); syncSlicer(); }));
  const range = $('#lm-range', sh.el), slicer = $('[data-slicer]', sh.el), wedge = $('.sl-wedge', sh.el);
  const maxAmt = () => (mode === 'grams' ? pot : Math.max(1, num(meal.servings) || 1)); const step = () => (mode === 'grams' ? 5 : 0.25);
  const syncSlicer = () => { const a = num(amt.value) || 0; range.max = maxAmt(); range.step = mode === 'grams' ? 1 : 0.25; range.min = step(); range.value = a; wedge.setAttribute('d', wedgePath(Math.min(1, a / maxAmt()))); $('.sl-cut', sh.el).setAttribute('d', cutPath(Math.min(1, a / maxAmt()))); };
  range.addEventListener('input', () => { amt.value = mode === 'grams' ? Math.round(+range.value) : +range.value; calc(); syncSlicer(); });
  const fromPointer = (e) => { const r = slicer.getBoundingClientRect(); const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); let f = Math.atan2(x, -y) / (2 * Math.PI); if (f < 0) f += 1; const st = step(); const v = Math.max(st, Math.round(f * maxAmt() / st) * st); amt.value = mode === 'grams' ? Math.round(v) : v; calc(); syncSlicer(); };
  let dragging = false; slicer.addEventListener('pointerdown', (e) => { dragging = true; try { slicer.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } fromPointer(e); }); slicer.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); }); slicer.addEventListener('pointerup', () => { dragging = false; }); slicer.addEventListener('pointercancel', () => { dragging = false; });
  amt.addEventListener('input', () => { calc(); syncSlicer(); }); calc(); syncSlicer();
  $('[data-go]', sh.el).addEventListener('click', () => {
    const r = calc(); if (!r) return;
    addEntry(curKey(), Object.assign({ kind: 'meal', ref: meal.id, name: meal.name, amt: r.a, unit: mode === 'grams' ? 'g' : 'serv', meal: $('#lm-slot', sh.el).value }, r.n));
    meal.uses = (meal.uses || 0) + 1; meal.lastUsed = Date.now(); save(); sh.close(); if (done) done();
  });
  amt.select();
}

/** Edit or delete a logged entry. */
export function openEntry(id) {
  const key = curKey(); const rec = dayRec(key); const e = rec && rec.entries.find((x) => x.id === id); if (!e) return;
  const unitLabel = e.unit === 'serv' ? 'Servings' : 'Grams';
  const fields = e.kind === 'quick'
    ? '<label class="field"><span>Name</span><input id="en-name" value="' + esc(e.name) + '" autocomplete="off"></label><div class="qrow"><label class="field"><span>Calories</span>' + numIn('en-k', e.k) + '</label><label class="field"><span>Protein g</span>' + numIn('en-p', e.p) + '</label><label class="field"><span>Carbs g</span>' + numIn('en-c', e.c) + '</label><label class="field"><span>Fat g</span>' + numIn('en-f', e.f) + '</label></div>'
    : '<label class="field"><span>' + unitLabel + '</span>' + numIn('en-amt', e.amt) + '</label>';
  const sh = openSheet(e.name, fields + '<div class="qrow">' + slotSelect('en-slot', e.meal) + '<label class="field"><span>Time</span><input id="en-time" type="time" value="' + timeLabel(e.t) + '"></label></div><p id="en-prev" class="preview" aria-live="polite">' + nutriLine(e) + '</p><div class="row end"><button class="btn danger" data-del>Delete</button>' + (key !== todayKey() ? '<button class="btn" data-copy>Copy to today</button>' : '') + '<button class="btn primary" data-save>Save</button></div>');
  const amt = $('#en-amt', sh.el);
  if (amt) amt.addEventListener('input', () => { const a = num(amt.value); if (a > 0 && e.amt > 0) { const r = a / e.amt; $('#en-prev', sh.el).innerHTML = nutriLine({ k: e.k * r, p: e.p * r, c: e.c * r, f: e.f * r, fi: e.fi * r }); } });
  $('[data-save]', sh.el).addEventListener('click', () => {
    const [hh, mm] = ($('#en-time', sh.el).value || '00:00').split(':').map(Number); const patch = { meal: $('#en-slot', sh.el).value, t: (hh || 0) * 60 + (mm || 0) };
    if (e.kind === 'quick') Object.assign(patch, { name: norm($('#en-name', sh.el).value) || e.name, k: num($('#en-k', sh.el).value) || 0, p: num($('#en-p', sh.el).value) || 0, c: num($('#en-c', sh.el).value) || 0, f: num($('#en-f', sh.el).value) || 0 });
    else { const a = num(amt.value); if (a && a > 0) { patch.amt = a; if (e.qty) patch.qty = ''; } }
    updateEntry(key, id, patch); sh.close(); render();
  });
  $('[data-del]', sh.el).addEventListener('click', () => { const copy = Object.assign({}, e); removeEntry(key, id); sh.close(); render(); toast('Deleted ' + e.name, () => { addEntry(key, Object.assign({}, copy, { id: undefined })); render(); }); });
  const cp = $('[data-copy]', sh.el); if (cp) cp.addEventListener('click', () => { addEntry(todayKey(), Object.assign({}, e, { id: undefined, t: undefined, meal: $('#en-slot', sh.el).value })); sh.close(); toast('Copied to today'); render(); });
}
