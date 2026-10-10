// My meals: saved recipes and meals you can log again, the meal editor, and (owner only) importing a recipe pasted from a chat.
import { esc, norm, num, fmt0, fmt1, uid } from '../core/base.js';
import { mealTotals, perServing, per100Cooked, netCooked, gramsPerServing, scale, consistent } from '../core/nutri.js';
import { parseMealText } from '../core/mealimport.js';
import { SESSION_PROMPT } from '../core/prompt.js';

function mealCard(m) {
  const ps = perServing(m); const pot = netCooked(m); const c = per100Cooked(m);
  return '<li class="card meal"><header class="slot-head"><h3>' + esc(m.name) + (m.fav ? ' <span title="Favourite">★</span>' : '') + '</h3><span class="chip">' + esc(m.type && m.type !== 'any' ? m.type : 'any meal') + '</span>' + (m.estimate && m.source === 'import' ? '<span class="chip warn">estimate</span>' : '') + '</header>' +
    '<p><b>' + fmt0(ps.k) + ' kcal</b> per serving · P ' + fmt1(ps.p) + ' · C ' + fmt1(ps.c) + ' · F ' + fmt1(ps.f) + '</p>' +
    '<p class="muted">' + fmt1(m.servings) + ' servings · ' + (m.items || []).length + ' ingredients · ' + (pot ? 'pot weighed: ' + fmt0(pot) + ' g (' + fmt0(gramsPerServing(m)) + ' g per serving, ' + fmt0(c.k) + ' kcal per 100 g)' : 'pot not weighed yet') + (m.uses ? ' · logged ' + m.uses + ' time' + (m.uses === 1 ? '' : 's') : '') + '</p>' +
    '<div class="chips"><button class="btn primary small" data-action="meal-log" data-id="' + esc(m.id) + '">Log</button><button class="btn small" data-action="meal-edit" data-id="' + esc(m.id) + '">Edit</button><button class="btn small" data-action="meal-dup" data-id="' + esc(m.id) + '">Duplicate</button><button class="btn small" data-action="meal-fav" data-id="' + esc(m.id) + '" aria-pressed="' + !!m.fav + '">' + (m.fav ? 'Unfavourite' : 'Favourite') + '</button><button class="btn small danger" data-action="meal-del" data-id="' + esc(m.id) + '">Delete</button></div></li>';
}
function renderMeals() {
  const q = norm(UI.mealQ).toLowerCase(); const list = mealList().filter((m) => !q || (m.name + ' ' + (m.tags || []).join(' ')).toLowerCase().includes(q));
  return '<div class="meals"><div class="toolbar"><h1>My meals</h1><button class="btn primary" data-action="meal-new">New meal</button>' + (isAdmin() ? '<button class="btn" data-action="meal-import">Import from chat</button><span class="pill">Admin</span>' : '') + '</div>' +
    '<label class="field"><span class="sr">Search meals</span><input type="search" id="meal-q" placeholder="Search my meals" value="' + esc(UI.mealQ) + '" autocomplete="off"></label>' +
    (S.sample ? '<div class="notice">Example data: meals you save are not stored until you <button class="btn small primary" data-action="start-own">start your own</button>.</div>' : '') +
    (list.length ? '<ul class="grid">' + list.map(mealCard).join('') + '</ul>' : '<div class="empty"><strong>' + (q ? 'No meals match.' : 'No saved meals yet.') + '</strong><p>Build a meal from ingredients with their weights. Weigh the cooked pot once and you can log any portion of it later.</p></div>') + '</div>';
}

/** The meal editor. `meal` may be a saved meal, a new one, or a parsed import. onSave(id) runs after saving. */
function openMealEditor(meal, onSave, extra) {
  const x = extra || {}; const isNew = !meal.id;
  const items = (meal.items || []).map((it) => Object.assign({}, it, { n: Object.assign({}, it.n) }));
  const sh = openSheet(isNew ? (x.fromImport ? 'Review the imported meal' : 'New meal') : 'Edit ' + meal.name, '<div class="meal-form"></div>', { wide: true });
  const root = $('.meal-form', sh.el);
  const nf = (id, v, extraAttr) => numIn(id, v === 0 ? 0 : v, extraAttr);
  const paint = () => {
    root.innerHTML = (x.warnings && x.warnings.length ? '<div class="notice warnbox"><b>Check these</b><ul>' + x.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="qrow"><label class="field grow"><span>Name</span><input id="me-name" value="' + esc(meal.name) + '" autocomplete="off"></label><label class="field"><span>Type</span><select id="me-type">' + ['any', 'breakfast', 'lunch', 'snack', 'dinner'].map((t) => '<option' + (meal.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label><label class="field"><span>Servings</span>' + nf('me-serv', meal.servings) + '</label></div>' +
      '<div class="qrow"><label class="field"><span>Pot with food (g)</span>' + nf('me-pot', meal.potG || '') + '</label><label class="field"><span>Empty pot (g), optional</span>' + nf('me-ves', meal.vesselG || '') + '</label><p class="muted grow">Weigh the finished dish to log any portion by grams. The weights above are raw ingredients; cooking changes the total, which is why the finished weight matters.</p></div>' +
      '<h3>Ingredients (nutrition per 100 g)</h3><div class="ing-wrap" tabindex="0" role="region" aria-label="Ingredient table, scrolls sideways"><table class="ing"><thead><tr><th scope="col">Ingredient</th><th scope="col">g</th><th scope="col">kcal</th><th scope="col">P</th><th scope="col">C</th><th scope="col">F</th><th scope="col">Fibre</th><th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' +
      items.map((it, i) => { const sim = x.fromImport && !it.food ? findSimilarFood(it.name, it.state) : null; return '<tr><td><input class="ing-name" data-i="' + i + '" data-f="name" value="' + esc(it.name) + '" aria-label="Ingredient ' + (i + 1) + ' name" autocomplete="off">' + (sim ? '<button class="linkbtn" data-use="' + i + '" data-food="' + esc(sim.food.id) + '">Use my "' + esc(foodLabel(sim.food)) + '"</button>' : '') + '</td>' +
        ['g', 'k', 'p', 'c', 'f', 'fi'].map((f) => '<td><input class="ing-num" data-i="' + i + '" data-f="' + f + '" type="text" inputmode="decimal" value="' + esc(f === 'g' ? it.g : it.n[f]) + '" aria-label="' + esc(it.name + ' ' + ({ g: 'grams', k: 'kcal per 100 g', p: 'protein', c: 'carbs', f: 'fat', fi: 'fibre' })[f]) + '"></td>').join('') + '<td><button class="btn small" data-rm="' + i + '" aria-label="Remove ' + esc(it.name) + '">Remove</button></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="pk-host"></div><div class="row"><button class="btn small" data-blank>Add a blank row</button></div><p id="me-tot" class="preview" aria-live="polite"></p>' +
      '<label class="field"><span>Steps (one per line)</span><textarea id="me-steps" rows="3">' + esc((meal.steps || []).join('\n')) + '</textarea></label><label class="field"><span>Notes</span><input id="me-notes" value="' + esc(meal.notes || '') + '" autocomplete="off"></label><label class="field"><span>Tags (comma separated)</span><input id="me-tags" value="' + esc((meal.tags || []).join(', ')) + '" autocomplete="off"></label>' +
      '<label class="check"><input type="checkbox" id="me-est"' + (meal.estimate ? ' checked' : '') + '> Values are estimates</label>' + (isNew ? '<label class="check"><input type="checkbox" id="me-foods"' + (x.fromImport ? ' checked' : '') + '> Also add new ingredients to My foods (marked "check me")</label>' : '') +
      '<div class="row end"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save meal</button></div>';
    foodPicker($('.pk-host', root), (f) => { items.push({ name: foodLabel(f), g: 100, state: f.state || 'raw', food: f.id, n: { k: f.k, p: f.p, c: f.c, f: f.f, fi: f.fi || 0 } }); sync(); paint(); const last = $$('.ing-num[data-f="g"]', root).pop(); if (last) { last.focus(); last.select(); } }, { placeholder: 'Add an ingredient from my foods' });
    totals();
  };
  const sync = () => { meal.name = $('#me-name', root) ? $('#me-name', root).value : meal.name; if ($('#me-type', root)) { meal.type = $('#me-type', root).value; meal.servings = num($('#me-serv', root).value) || 1; meal.potG = num($('#me-pot', root).value) || null; meal.vesselG = num($('#me-ves', root).value) || 0; meal.steps = $('#me-steps', root).value.split('\n').map(norm).filter(Boolean); meal.notes = $('#me-notes', root).value; meal.tags = $('#me-tags', root).value.split(',').map(norm).filter(Boolean); meal.estimate = $('#me-est', root).checked; } };
  const totals = () => { const m = { items: items.map((it) => ({ g: num(it.g) || 0, n: it.n })), servings: num($('#me-serv', root).value) || 1, potG: num($('#me-pot', root).value) || null, vesselG: num($('#me-ves', root).value) || 0 }; const t = mealTotals(m); const ps = perServing(m); const c = per100Cooked(m); $('#me-tot', root).innerHTML = '<b>' + fmt0(t.k) + ' kcal</b> in total · <b>' + fmt0(ps.k) + ' kcal</b> per serving · ' + macroLine(ps) + (c ? ' · ' + fmt0(c.k) + ' kcal per 100 g cooked' : ''); };
  root.addEventListener('input', (e) => { const el = e.target; if (el.dataset && el.dataset.i !== undefined) { const it = items[el.dataset.i]; if (el.dataset.f === 'name') it.name = el.value; else if (el.dataset.f === 'g') it.g = el.value; else it.n[el.dataset.f] = el.value; } if (el.id && el.id.indexOf('me-') === 0 || (el.dataset && el.dataset.i !== undefined)) totals(); });
  root.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { sync(); items.splice(+rm.dataset.rm, 1); paint(); return; }
    const use = e.target.closest('[data-use]'); if (use) { const f = getFood(use.dataset.food); const it = items[+use.dataset.use]; if (f && it) { it.n = { k: f.k, p: f.p, c: f.c, f: f.f, fi: f.fi || 0 }; it.food = f.id; sync(); paint(); } return; }
    if (e.target.closest('[data-blank]')) { sync(); items.push({ name: '', g: '', state: 'raw', n: { k: '', p: '', c: '', f: '', fi: '' } }); paint(); const l = $$('.ing-name', root).pop(); if (l) l.focus(); return; }
    if (e.target.closest('[data-cancel]')) { sh.close(); return; }
    if (e.target.closest('[data-save]')) {
      sync();
      const rows = items.map((it) => ({ name: norm(it.name), g: num(it.g) || 0, state: it.state, food: it.food, n: { k: num(it.n.k) || 0, p: num(it.n.p) || 0, c: num(it.n.c) || 0, f: num(it.n.f) || 0, fi: num(it.n.fi) || 0 } })).filter((it) => it.name && it.g > 0);
      if (!norm(meal.name)) { toast('Give the meal a name.'); $('#me-name', root).focus(); return; }
      if (!rows.length) { toast('Add at least one ingredient with a weight.'); return; }
      if (S.sample) startOwn();
      if ($('#me-foods', root) && $('#me-foods', root).checked) rows.forEach((it) => { if (!it.food && !findSimilarFood(it.name, it.state)) { it.food = saveFood({ id: null, name: it.name, state: it.state, k: it.n.k, p: it.n.p, c: it.n.c, f: it.n.f, fi: it.n.fi, units: [], source: 'import', verified: false }); } });
      const id = saveMeal(Object.assign({}, meal, { items: rows, source: meal.source || 'made' }));
      sh.close(); if (onSave) onSave(id);
    }
  });
  paint();
}

function openImport() {
  const sh = openSheet('Import meals from chat', '<p class="muted">Paste the whole reply from your chat session. The app finds each "=== MEAL v1 ===" block, reads it, and shows what it understood before anything is saved.</p><label class="field"><span>Pasted text</span><textarea id="imp-text" rows="9" placeholder="=== MEAL v1 ===&#10;name: ...&#10;..."></textarea></label><div class="row"><button class="btn primary" data-read>Read it</button><button class="btn" data-copyprompt>Copy the prompt for my session</button><span class="muted" id="imp-msg" aria-live="polite"></span></div><div id="imp-out"></div>', { wide: true });
  const out = $('#imp-out', sh.el); let parsed = [];
  $('[data-copyprompt]', sh.el).addEventListener('click', () => { copyText(SESSION_PROMPT).then((ok) => { $('#imp-msg', sh.el).textContent = ok ? 'Prompt copied. Paste it into your session.' : 'Copy failed. Select the text in the box below instead.'; if (!ok) out.innerHTML = '<label class="field"><span>The prompt</span><textarea rows="12" readonly>' + esc(SESSION_PROMPT) + '</textarea></label>'; }); });
  $('[data-read]', sh.el).addEventListener('click', () => {
    const r = parseMealText($('#imp-text', sh.el).value); parsed = r.meals;
    if (!r.meals.length) { out.innerHTML = '<div class="notice warnbox">' + r.problems.map(esc).join(' ') + '</div>'; return; }
    out.innerHTML = r.meals.map((p, i) => { const t = mealTotals(p.meal), ps = perServing(p.meal); return '<section class="card"><h3>' + esc(p.meal.name) + '</h3><p><b>' + fmt0(ps.k) + ' kcal</b> per serving · ' + macroLine(ps) + ' · ' + fmt1(p.meal.servings) + ' servings · ' + fmt0(t.k) + ' kcal in total</p><p class="muted">' + p.meal.items.map((it) => esc(it.name) + ' ' + fmt0(it.g) + ' g').join(', ') + '</p>' + (p.warnings.length ? '<div class="notice warnbox"><ul>' + p.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '<p class="muted">No problems found.</p>') + '<div class="chips"><button class="btn primary small" data-review="' + i + '">Review and save</button><button class="btn small" data-quick="' + i + '">Save as it is</button></div></section>'; }).join('');
  });
  out.addEventListener('click', (e) => {
    const rv = e.target.closest('[data-review]'), qs = e.target.closest('[data-quick]'); const i = rv ? +rv.dataset.review : qs ? +qs.dataset.quick : -1; if (i < 0) return;
    const p = parsed[i];
    if (rv) openMealEditor(Object.assign({}, p.meal), (id) => { toast('Saved ' + S.meals[id].name); sh.close(); render(); }, { fromImport: true, warnings: p.warnings });
    else { if (S.sample) startOwn(); p.meal.items.forEach((it) => { if (!findSimilarFood(it.name, it.state)) saveFood({ id: null, name: it.name, state: it.state, k: it.n.k, p: it.n.p, c: it.n.c, f: it.n.f, fi: it.n.fi, units: [], source: 'import', verified: false }); }); const id = saveMeal(Object.assign({}, p.meal)); toast('Saved ' + S.meals[id].name); qs.disabled = true; qs.textContent = 'Saved'; render(); }
  });
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) { try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; } }
