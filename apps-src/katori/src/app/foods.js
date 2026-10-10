// Foods: your list (starter foods plus your own), the food editor with a pack-label converter, and CSV import and export.
import { esc, norm, num, fmt0, fmt1, r1 } from '../core/base.js';
import { consistent, impliedKcal } from '../core/nutri.js';
import { foodsFromCsv, foodsToCsv, csvTemplate, unitsText } from '../core/csv.js';

function foodRow(f) {
  const tags = (f.source === 'starter' && !f.verified ? '<span class="chip warn">approx</span>' : '') + (f.verified ? '<span class="chip ok">verified</span>' : '') + (f.source === 'import' && !f.verified ? '<span class="chip warn">check me</span>' : '') + (f.fav ? '<span class="chip">★</span>' : '') + (isOverride(f.id) ? '<span class="chip">edited</span>' : '') + (f.source !== 'starter' && f.source !== 'import' ? '<span class="chip">mine</span>' : '');
  return '<li><button class="food-row" data-action="food-edit" data-id="' + esc(f.id) + '"><span class="pk-name">' + esc(foodLabel(f)) + '</span><span class="pk-sub">' + fmt0(f.k) + ' kcal · P ' + fmt1(f.p) + ' · C ' + fmt1(f.c) + ' · F ' + fmt1(f.f) + ' · Fibre ' + fmt1(f.fi || 0) + '</span><span class="tags">' + tags + '</span></button></li>';
}
function renderFoods() {
  const q = norm(UI.foodQ).toLowerCase(); const flt = UI.foodFilter;
  let list = foodList().filter((f) => (flt === 'all') || (flt === 'mine' && f.source !== 'starter') || (flt === 'starter' && f.source === 'starter') || (flt === 'check' && !f.verified));
  if (q) list = list.filter((f) => foodLabel(f).toLowerCase().includes(q));
  const shown = list.slice(0, 150);
  return '<div class="foods"><div class="toolbar"><h1>Foods</h1><button class="btn primary" data-action="food-new">Add a food</button><button class="btn" data-action="csv-open">Import or export CSV</button></div>' +
    '<p class="muted">Values are per 100 g. The starter foods are approximate: tick "verified" once you have checked a food against a pack label or a source you trust.</p>' +
    '<div class="toolbar"><div class="seg" role="group" aria-label="Show">' + [['all', 'All'], ['mine', 'Mine'], ['starter', 'Starter'], ['check', 'Not verified']].map(([v, l]) => '<button class="seg-btn" data-action="food-filter" data-v="' + v + '" aria-pressed="' + (flt === v) + '">' + l + '</button>').join('') + '</div><label class="field grow"><span class="sr">Search foods</span><input type="search" id="food-q" placeholder="Search foods" value="' + esc(UI.foodQ) + '" autocomplete="off"></label></div>' +
    '<ul class="food-list">' + (shown.length ? shown.map(foodRow).join('') : '<li class="muted">No foods match.</li>') + '</ul>' + (list.length > shown.length ? '<p class="muted">Showing the first ' + shown.length + ' of ' + list.length + '. Search to narrow it down.</p>' : '') + '</div>';
}

function parseUnits(text) { return String(text || '').split(/[;,]/).map((u) => { const [a, b] = u.split('='); const g = num(b); return norm(a) && g && g > 0 ? { name: norm(a).toLowerCase(), g } : null; }).filter(Boolean); }

function openFoodEditor(food, onSaved) {
  const isNew = !food; const f = food ? Object.assign({}, food) : { id: null, name: '', state: '', k: '', p: '', c: '', f: '', fi: '', units: [], source: 'mine', verified: false };
  const sh = openSheet(isNew ? 'Add a food' : 'Edit ' + foodLabel(f), '<label class="field"><span>Name</span><input id="fe-name" value="' + esc(f.name) + '" autocomplete="off"></label><div class="qrow"><label class="field"><span>State</span><select id="fe-state">' + [['', 'not applicable'], ['raw', 'raw'], ['cooked', 'cooked']].map(([v, l]) => '<option value="' + v + '"' + ((f.state || '') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
    '<h3>Per 100 g</h3><div class="qrow"><label class="field"><span>Calories</span>' + numIn('fe-k', f.k) + '</label><label class="field"><span>Protein g</span>' + numIn('fe-p', f.p) + '</label><label class="field"><span>Carbs g</span>' + numIn('fe-c', f.c) + '</label><label class="field"><span>Fat g</span>' + numIn('fe-f', f.f) + '</label><label class="field"><span>Fibre g</span>' + numIn('fe-fi', f.fi) + '</label></div><p id="fe-warn" class="warn" aria-live="polite"></p>' +
    '<details><summary>Fill from a pack label</summary><p class="muted">Type the values printed per serving and the serving weight. The app converts them to per 100 g.</p><div class="qrow"><label class="field"><span>Serving weight g</span>' + numIn('lb-g', '') + '</label><label class="field"><span>Calories</span>' + numIn('lb-k', '') + '</label><label class="field"><span>Protein</span>' + numIn('lb-p', '') + '</label><label class="field"><span>Carbs</span>' + numIn('lb-c', '') + '</label><label class="field"><span>Fat</span>' + numIn('lb-f', '') + '</label><label class="field"><span>Fibre</span>' + numIn('lb-fi', '') + '</label></div><button class="btn small" data-convert>Convert to per 100 g</button></details>' +
    '<label class="field"><span>Household units (name=grams, separated by semicolons)</span><input id="fe-units" value="' + esc(unitsText(f)) + '" placeholder="roti=40; katori=150" autocomplete="off"></label><label class="field"><span>For liquids: grams per ml (water is 1, milk about 1.03). Leave empty for solids.</span>' + numIn('fe-dens', f.density || '') + '</label>' +
    '<label class="check"><input type="checkbox" id="fe-fav"' + (f.fav ? ' checked' : '') + '> Favourite</label><label class="check"><input type="checkbox" id="fe-ver"' + (f.verified ? ' checked' : '') + '> Verified (I checked these numbers)</label>' +
    '<div class="row end">' + (!isNew ? '<button class="btn danger" data-del>' + (isStarterId(f.id) ? 'Hide' : 'Delete') + '</button>' : '') + (!isNew && isOverride(f.id) ? '<button class="btn" data-reset>Reset to starter value</button>' : '') + '<button class="btn primary" data-save>Save</button></div>', { wide: true });
  const g = (id) => num($('#' + id, sh.el).value);
  const warn = () => { const n = { k: g('fe-k'), p: g('fe-p'), c: g('fe-c'), f: g('fe-f') }; const el = $('#fe-warn', sh.el); if ([n.k, n.p, n.c, n.f].some((v) => v == null)) { el.textContent = ''; return; } el.textContent = consistent(n) ? '' : 'These calories do not match the macros (about ' + fmt0(impliedKcal(n)) + ' kcal). Check for a typo.'; };
  $$('input', sh.el).forEach((i) => i.addEventListener('input', warn)); warn();
  $('[data-convert]', sh.el).addEventListener('click', () => { const w = g('lb-g'); if (!w || w <= 0) { toast('Enter the serving weight.'); return; } const m = 100 / w; [['k', 'lb-k'], ['p', 'lb-p'], ['c', 'lb-c'], ['f', 'lb-f'], ['fi', 'lb-fi']].forEach(([a, b]) => { const v = g(b); $('#fe-' + a, sh.el).value = v == null ? (a === 'fi' ? 0 : '') : r1(v * m); }); warn(); });
  $('[data-save]', sh.el).addEventListener('click', () => {
    const name = norm($('#fe-name', sh.el).value); const n = { k: g('fe-k'), p: g('fe-p'), c: g('fe-c'), f: g('fe-f'), fi: g('fe-fi') || 0 };
    if (!name) { toast('Give the food a name.'); return; } if ([n.k, n.p, n.c, n.f].some((v) => v == null || v < 0)) { toast('Calories, protein, carbs and fat must be numbers.'); return; }
    if (S.sample) startOwn();
    const dens = g('fe-dens');
    const id = saveFood(Object.assign({}, f, n, { name, state: $('#fe-state', sh.el).value, units: parseUnits($('#fe-units', sh.el).value), density: dens && dens > 0 ? dens : undefined, fav: $('#fe-fav', sh.el).checked, verified: $('#fe-ver', sh.el).checked, source: f.source === 'starter' ? 'starter' : (f.source || 'mine') }));
    sh.close(); if (onSaved) onSaved(id); else render();
  });
  const del = $('[data-del]', sh.el); if (del) del.addEventListener('click', () => askDialog((isStarterId(f.id) ? 'Hide ' : 'Delete ') + foodLabel(f) + '?', { text: 'Meals and diary entries that already use it are not changed.' + (isStarterId(f.id) ? ' You can bring hidden starter foods back in Settings.' : ''), ok: isStarterId(f.id) ? 'Hide' : 'Delete' }, () => { deleteFood(f.id); sh.close(); render(); }));
  const rs = $('[data-reset]', sh.el); if (rs) rs.addEventListener('click', () => { resetStarter(f.id); sh.close(); render(); });
  $('#fe-name', sh.el).focus();
}

function openCsv() {
  const sh = openSheet('Import or export foods (CSV)', '<p class="muted">Keep your food list in a spreadsheet if you like. Columns: name, state, kcal, protein, carbs, fat, fibre, units, ml_density. Values are per 100 g.</p><div class="row"><button class="btn" data-template>Download the CSV template</button><button class="btn" data-export>Export my foods</button><button class="btn" data-export-all>Export all foods</button></div><h3>Import</h3><label class="field"><span>Choose a CSV file, or paste the text</span><input type="file" id="csv-file" accept=".csv,.txt,text/csv"></label><label class="field"><span class="sr">CSV text</span><textarea id="csv-text" rows="6" placeholder="name,state,kcal,protein,carbs,fat,fibre,units"></textarea></label><div class="row"><button class="btn primary" data-read>Check it</button></div><div id="csv-out"></div>', { wide: true });
  const out = $('#csv-out', sh.el); let foods = [];
  const dl = (name, text) => { const b = new Blob([text], { type: 'text/csv' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); };
  $('[data-template]', sh.el).addEventListener('click', () => dl('katori-foods-template.csv', csvTemplate()));
  $('[data-export]', sh.el).addEventListener('click', () => dl('katori-my-foods.csv', foodsToCsv(foodList().filter((f) => f.source !== 'starter' || isOverride(f.id)))));
  $('[data-export-all]', sh.el).addEventListener('click', () => dl('katori-all-foods.csv', foodsToCsv(foodList())));
  $('#csv-file', sh.el).addEventListener('change', (e) => { const f = e.target.files[0]; if (f) f.text().then((t) => { $('#csv-text', sh.el).value = t; }); });
  $('[data-read]', sh.el).addEventListener('click', () => {
    const r = foodsFromCsv($('#csv-text', sh.el).value); foods = r.foods;
    const dup = foods.filter((f) => foodList().some((x) => slug(x.name + ' ' + (x.state || '')) === slug(f.name + ' ' + (f.state || '')))).length;
    out.innerHTML = '<p><b>' + foods.length + '</b> food' + (foods.length === 1 ? '' : 's') + ' ready: ' + (foods.length - dup) + ' new, ' + dup + ' will replace a food you already have.</p>' + (r.problems.length ? '<div class="notice warnbox"><ul>' + r.problems.slice(0, 12).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' + (r.problems.length > 12 ? '<p>and ' + (r.problems.length - 12) + ' more</p>' : '') + '</div>' : '') + (foods.length ? '<div class="row end"><button class="btn primary" data-apply>Import ' + foods.length + ' food' + (foods.length === 1 ? '' : 's') + '</button></div>' : '');
  });
  out.addEventListener('click', (e) => { if (!e.target.closest('[data-apply]')) return; if (S.sample) startOwn(); stashPrev(); const r = addImportedFoods(foods); sh.close(); toast('Imported: ' + r.added + ' new, ' + r.updated + ' updated'); render(); });
}
