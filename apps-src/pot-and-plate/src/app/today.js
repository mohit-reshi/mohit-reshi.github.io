// The Today screen: calorie ring, macros, meal sections, water, weight and a note.
import { esc, fmt0, fmt1, dayKey, addDays, dateLong, dateLabel, dateShort, timeLabel, norm } from '../core/base.js';
import { dayTotals, waterTotal } from '../core/nutri.js';

const slotName = (id) => (SLOTS.find((s) => s[0] === id) || [id, id])[1];

function entryRow(e) {
  const qty = e.qty || (e.amt ? fmt1(e.amt) + (e.unit === 'serv' ? (e.amt === 1 ? ' serving' : ' servings') : ' g') : '');
  return '<li class="ent"><button type="button" class="ent-main" data-action="edit-entry" data-id="' + esc(e.id) + '" aria-label="Edit ' + esc(e.name) + '"><span class="ent-name">' + esc(e.name) + '</span><span class="ent-sub">' + esc(qty) + ' · ' + timeLabel(e.t) + '</span></button><span class="ent-k">' + fmt0(e.k) + '<small> kcal</small></span></li>';
}

function renderToday() {
  const now = new Date(); const today = todayKey(now); const key = UI.day || today; const rec = dayRec(key); const tot = dayTotals(rec); const g = goalFor(key);
  const yest = addDays(key, -1); const yrec = dayRec(yest);
  const entries = rec ? rec.entries.slice().sort((a, b) => a.t - b.t) : [];
  const days = Math.floor((Date.now() - (S.lastBackup || 0)) / 864e5);
  const hasData = Object.keys(S.log).length > 0;
  let h = '<div class="today">';
  if (S.sample) h += '<div class="notice"><b>Example data.</b> Nothing here is saved. <button class="btn small primary" data-action="start-own">Start my own</button></div>';
  else if (!S.goalsSet) h += '<div class="notice">These goals are placeholders. <button class="btn small" data-action="goto-settings">Set my own goals</button></div>';
  if (!S.sample && key === today) notices(S.periods, today, S.dismissed).forEach((n) => {
    const p = n.period; const tomorrow = goalFor(addDays(today, 1));
    const txt = n.kind === 'pre'
      ? 'From tomorrow your goal "' + p.name + '" starts: ' + fmt0(p.k) + ' kcal a day, protein ' + fmt0(p.p) + ' g, carbs ' + fmt0(p.c) + ' g, fat ' + fmt0(p.f) + ' g, until ' + dateShort(p.end) + '. Get ready for it.'
      : 'Today is the last day of "' + p.name + '". From tomorrow ' + (tomorrow.isDefault ? 'your default goal' : 'the goal "' + tomorrow.name + '"') + ' applies again: ' + fmt0(tomorrow.k) + ' kcal a day.';
    h += '<div class="notice goalnote" role="status"><span>' + esc(txt) + '</span><button class="btn small" data-action="dismiss-notice" data-id="' + esc(n.id) + '">Got it</button></div>';
  });
  if (!S.sample && hasData && days >= 7) h += '<div class="notice soft">' + (S.lastBackup ? 'Your last backup was ' + days + ' days ago.' : 'You have not downloaded a backup yet.') + ' <button class="btn small" data-action="backup">Download a backup</button></div>';
  h += '<div class="daynav"><button class="btn" data-action="day-prev" aria-label="Previous day">←</button><label class="daypick"><span class="sr">Pick a date</span><input type="date" id="day-in" value="' + key + '" max="' + today + '"></label><div class="daytitle"><b>' + esc(key === today ? 'Today' : dateLabel(key)) + '</b><span>' + esc(dateLong(key)) + '</span></div><button class="btn" data-action="day-next" aria-label="Next day"' + (key >= today ? ' disabled' : '') + '>→</button>' + (key !== today ? '<button class="btn small" data-action="day-today">Today</button>' : '') + '</div>';
  h += '<section class="card summary" aria-label="Day summary">' + ringHtml(tot.k, g.k) + '<div class="summary-side">' + (g.isDefault ? '' : '<p class="goal-chip">Goal: <b>' + esc(g.name) + '</b> until ' + esc(dateShort(g.period.end)) + '</p>') + '<div class="sum-line"><span>Eaten</span><b>' + fmt0(tot.k) + '</b></div><div class="sum-line"><span>Goal</span><b>' + fmt0(g.k) + '</b></div>' + barHtml('Protein', tot.p, g.p, 'g', 'floor') + barHtml('Carbs', tot.c, g.c, 'g', 'plain') + barHtml('Fat', tot.f, g.f, 'g', 'ceiling') + barHtml('Fibre', tot.fi, g.fi, 'g', 'floor') + '</div></section>';
  SLOTS.forEach(([id, label]) => {
    const list = entries.filter((e) => e.meal === id); const sk = list.reduce((t, e) => t + e.k, 0);
    const canCopy = !list.length && yrec && yrec.entries.some((e) => e.meal === id);
    h += '<section class="card slot" aria-labelledby="slot-' + id + '"><header class="slot-head"><h2 id="slot-' + id + '">' + label + '</h2><span class="slot-k">' + (list.length ? fmt0(sk) + ' kcal' : '') + '</span><button class="btn small primary" data-action="add" data-slot="' + id + '" aria-label="Add food to ' + label + '">Add</button></header>' +
      (list.length ? '<ul class="ents">' + list.map(entryRow).join('') + '</ul>' : '<p class="muted">Nothing logged.' + (canCopy ? ' <button class="linkbtn" data-action="copy-slot" data-slot="' + id + '">Copy ' + (yest === addDays(today, -1) && key === today ? 'yesterday' : 'the day before') + '\'s ' + label.toLowerCase() + '</button>' : '') + '</p>') + '</section>';
  });
  const wt = waterTotal(rec);
  h += '<section class="card" aria-labelledby="water-h"><header class="slot-head"><h2 id="water-h">Water</h2><span class="slot-k">' + fmt0(wt) + ' / ' + fmt0(g.water) + ' ml</span></header>' + barHtml('Water', wt, g.water, 'ml', 'floor').replace('class="mbar-top"', 'class="mbar-top sr"') +
    '<div class="chips">' + S.waterPresets.map((ml) => '<button class="btn" data-action="water" data-ml="' + ml + '">+ ' + ml + ' ml</button>').join('') + '<button class="btn" data-action="water-other">Other</button>' + (rec && rec.water.length ? '<button class="btn ghost" data-action="water-undo">Undo last</button>' : '') + '</div></section>';
  h += '<section class="card" aria-labelledby="body-h"><h2 id="body-h">' + (S.hideWeight ? 'Note' : 'Weight and note') + '</h2><div class="body-row">' + (S.hideWeight ? '' : '<label class="field"><span>Weight (kg)</span>' + numIn('weight-in', rec && rec.weight != null ? rec.weight : '', 'aria-label="Weight in kilograms"') + '</label>') + '<label class="field grow"><span>Note for the day</span><textarea id="note-in" rows="2" placeholder="For example: ate out, travelling">' + esc(rec ? rec.note : '') + '</textarea></label></div></section>';
  return h + '</div>';
}
