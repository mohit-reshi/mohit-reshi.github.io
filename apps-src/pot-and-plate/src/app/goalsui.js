// Settings: the diet choice, the default goal, and up to three dated goal periods that replace it while they run.
import { esc, norm, num, fmt0, dateShort, daysBetween } from '../core/base.js';

const FIELDS = [['k', 'Calories'], ['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g'], ['fi', 'Fibre g'], ['water', 'Water ml']];
const dietOptions = (cur) => DIETS.map((d) => '<option value="' + d.id + '"' + (d.id === cur ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('');
const splitText = (g) => { const s = splitOf(g); return s ? 'Calories split: protein ' + s.p + '%, carbs ' + s.c + '%, fat ' + s.f + '%' : ''; };

function statusChip(g, isDefault, today, activeId) {
  if (isDefault) return activeId === 'default' ? '<span class="chip on">Active now</span>' : '<span class="chip">Applies when no goal period is running</span>';
  const st = statusOf(g, today);
  return st === 'active' ? '<span class="chip on">Active now</span>' : st === 'upcoming' ? '<span class="chip">Starts in ' + daysBetween(today, g.start) + ' day' + (daysBetween(today, g.start) === 1 ? '' : 's') + '</span>' : '<span class="chip">Ended</span>';
}
function cardHtml(g, isDefault, today, activeId) {
  const id = isDefault ? 'default' : g.id; const active = activeId === id; const n = (k) => (g[k] === undefined || g[k] === null ? '' : g[k]);
  const lim = isDefault ? null : dateLimits(S.periods, g); const blocked = isDefault ? [] : blockedFor(S.periods, g.id);
  return '<section class="card goalcard' + (active ? ' active' : '') + '" data-goal="' + esc(id) + '" aria-labelledby="gh-' + esc(id) + '">' +
    '<header class="slot-head"><h3 id="gh-' + esc(id) + '">' + (isDefault ? 'Default goal' : '<label class="sr" for="gn-' + esc(id) + '">Goal name</label><input class="gname" id="gn-' + esc(id) + '" data-gf="name" value="' + esc(g.name) + '" maxlength="40" autocomplete="off">') + '</h3>' + statusChip(g, isDefault, today, activeId) + '</header>' +
    (isDefault ? '' : '<div class="qrow"><label class="field"><span>Starts</span><input type="date" data-gf="start" value="' + esc(g.start || '') + '"' + (lim && lim.startMin ? ' min="' + lim.startMin + '"' : '') + '></label><label class="field"><span>Ends</span><input type="date" data-gf="end" value="' + esc(g.end || '') + '"' + (g.start ? ' min="' + g.start + '"' : '') + (lim && lim.endMax ? ' max="' + lim.endMax + '"' : '') + '></label></div>' +
      '<p class="muted blocked">' + (blocked.length ? 'Dates used by other goals, which cannot be chosen: ' + blocked.map((b) => esc(dateShort(b.start) + ' to ' + dateShort(b.end) + ' (' + b.name + ')')).join('; ') + '.' : 'No other goal uses any dates yet.') + '</p>') +
    '<label class="field"><span>Diet</span><select data-gf="diet" id="gd-' + esc(id) + '">' + dietOptions(g.diet || 'custom') + '</select></label>' +
    '<div class="qrow">' + FIELDS.map(([k, l]) => '<label class="field"><span>' + l + '</span><input type="text" inputmode="decimal" autocomplete="off" data-gf="' + k + '"' + (isDefault ? ' id="goal-' + k + '"' : '') + ' value="' + esc(n(k)) + '"></label>').join('') + '</div>' +
    '<p class="muted split" aria-live="polite">' + esc(splitText(g)) + '</p><div class="errs warn" role="alert"></div>' +
    '<div class="row end">' + (isDefault ? '' : '<button class="btn danger" data-action="period-del" data-goal="' + esc(id) + '">Delete this goal</button>') + '<button class="btn primary" data-action="' + (isDefault ? 'save-goals' : 'period-save') + '" data-goal="' + esc(id) + '">' + (isDefault ? 'Save goals' : 'Save this goal') + '</button></div></section>';
}

function goalsHtml() {
  const today = todayKey(); const act = goalFor(today); const d = dietById(act.diet);
  const periods = S.periods.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return '<section class="card" aria-labelledby="diet-h"><h2 id="diet-h">Diet</h2><label class="field"><span>Diet for your active goal: <b>' + esc(act.name) + '</b></span><select id="diet-sel">' + dietOptions(act.diet) + '</select></label><p class="muted" id="diet-note">' + esc(d.note) + '</p><p class="muted">Choosing a diet recalculates protein, carbs and fat from the calories of the active goal. Your other goals keep their own diet. These are common starting splits, not medical advice.</p></section>' +
    '<h2 class="sect">My goals</h2><p class="muted">Your own numbers. The default goal applies on every day that no goal period covers.</p>' + cardHtml(Object.assign({}, S.goals, { name: 'Default' }), true, today, act.id) +
    '<h2 class="sect">Goal periods</h2><p class="muted">Set a different goal for a stretch of dates, for example 1,500 calories for January. While a period runs it replaces the default goal. You can have up to ' + MAX_PERIODS + ', and two periods cannot share a date.</p>' +
    (periods.length ? periods.map((p) => cardHtml(p, false, today, act.id)).join('') : '<p class="muted">No goal periods yet.</p>') +
    '<div class="row"><button class="btn primary" data-action="period-add"' + (S.periods.length >= MAX_PERIODS ? ' disabled' : '') + '>Add a goal period</button><span class="muted">' + S.periods.length + ' of ' + MAX_PERIODS + ' used</span></div>';
}

// ---------- reading and showing one card ----------
const cardOf = (el) => el.closest('.goalcard');
const gf = (card, k) => card.querySelector('[data-gf="' + k + '"]');
function readCard(card) {
  const g = { id: card.dataset.goal };
  FIELDS.forEach(([k]) => { g[k] = num(gf(card, k).value); }); g.diet = gf(card, 'diet').value;
  if (card.dataset.goal !== 'default') { g.name = norm(gf(card, 'name').value); g.start = gf(card, 'start').value; g.end = gf(card, 'end').value; }
  return g;
}
function showSplit(card) { const g = readCard(card); card.querySelector('.split').textContent = splitText(g); }
function fillMacros(card) { const m = macrosFor(gf(card, 'diet').value, num(gf(card, 'k').value)); if (!m) return; gf(card, 'p').value = m.p; gf(card, 'c').value = m.c; gf(card, 'f').value = m.f; showSplit(card); }
function saveCard(card) {
  const g = readCard(card); const err = card.querySelector('.errs');
  const errs = [];
  if (!(g.k > 0)) errs.push('Calories must be a number above 0.');
  ['p', 'c', 'f', 'fi', 'water'].forEach((k) => { if (g[k] === null || g[k] < 0) errs.push('Check the ' + FIELDS.find((x) => x[0] === k)[1].toLowerCase() + ' value.'); });
  if (card.dataset.goal !== 'default') validatePeriod(S.periods, g).forEach((e) => { if (errs.indexOf(e) < 0) errs.push(e); });
  if (errs.length) { err.innerHTML = errs.map(esc).join('<br>'); return false; }
  err.textContent = '';
  if (card.dataset.goal === 'default') saveDefaultGoal({ k: g.k, p: g.p, c: g.c, f: g.f, fi: g.fi, water: g.water, diet: g.diet }); else savePeriod(g);
  return true;
}

/** Returns true when the click was one of ours. */
function goalsAction(a, t) {
  if (a === 'save-goals' || a === 'period-save') { const card = cardOf(t); if (saveCard(card)) { toast(a === 'save-goals' ? 'Goals saved' : 'Goal saved'); render(); } return true; }
  if (a === 'period-add') { if (addPeriod(todayKey()) === null) toast('You can have up to ' + MAX_PERIODS + ' goal periods.'); render(); return true; }
  if (a === 'period-del') { const p = S.periods.find((x) => x.id === t.dataset.goal); if (p) askDialog('Delete "' + p.name + '"?', { text: 'The default goal applies on its dates from then on.', ok: 'Delete' }, () => { deletePeriod(p.id); render(); }); return true; }
  if (a === 'dismiss-notice') { dismissNotice(t.dataset.id); render(); return true; }
  return false;
}
/** Live updates inside a goal card: calories refill the macros of a diet; editing a macro switches to "my own split". */
function goalsInput(el) {
  const card = cardOf(el); if (!card || !el.dataset.gf) return false; const f = el.dataset.gf;
  if (f === 'k' && gf(card, 'diet').value !== 'custom') fillMacros(card);
  else if (f === 'p' || f === 'c' || f === 'f') { gf(card, 'diet').value = 'custom'; showSplit(card); }
  else if (f === 'k') showSplit(card);
  return true;
}
function goalsChange(el) {
  if (el.id === 'diet-sel') { // the dropdown above: applies to the active goal and saves it
    const card = document.querySelector('.goalcard.active'); if (!card) return true;
    gf(card, 'diet').value = el.value; fillMacros(card); const ok = saveCard(card); if (ok) { toast('Diet applied to ' + (card.dataset.goal === 'default' ? 'the default goal' : 'the active goal')); render(); } return true;
  }
  const card = cardOf(el); if (!card || !el.dataset.gf) return false; const f = el.dataset.gf;
  if (f === 'diet') { fillMacros(card); showSplit(card); return true; }
  if (f === 'start' || f === 'end') {
    const g = readCard(card); const errs = (g.start && g.end) ? validatePeriod(S.periods, g) : [];
    card.querySelector('.errs').innerHTML = errs.map(esc).join('<br>');
    const end = gf(card, 'end'); if (g.start) end.min = g.start; return true;
  }
  return true;
}
