// Interface helpers: dialogs, the food picker, rings and bars, small formatters.
import { esc, norm, num, fmt0, fmt1 } from '../core/base.js';
import { matchFood } from '../core/units.js';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

// ---------- dialogs (window.prompt and confirm are blocked in some embedded pages) ----------
function askDialog(title, opts, done) {
  const dlg = document.createElement('dialog'); dlg.className = 'dlg';
  const input = opts.value !== undefined;
  dlg.innerHTML = '<form method="dialog"><h2>' + esc(title) + '</h2>' + (opts.text ? '<p>' + esc(opts.text) + '</p>' : '') + (input ? '<label class="field"><span class="sr">' + esc(title) + '</span><input id="dlg-in" value="' + esc(opts.value) + '" autocomplete="off"' + (opts.type ? ' type="' + opts.type + '" inputmode="decimal"' : '') + '></label>' : '') +
    '<div class="row end"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" value="ok">' + esc(opts.ok || 'OK') + '</button></div></form>';
  document.body.appendChild(dlg);
  const close = () => { try { dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); };
  dlg.querySelector('[data-x]').addEventListener('click', close);
  dlg.addEventListener('cancel', () => { dlg.remove(); });
  dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const v = input ? dlg.querySelector('#dlg-in').value : true; close(); done(v); });
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  const f = dlg.querySelector('input'); if (f) { f.focus(); f.select(); }
}

/** A larger dialog ("sheet"). Returns { el, close }. `html` is the inside of the sheet. */
function openSheet(title, html, opts) {
  const dlg = document.createElement('dialog'); dlg.className = 'sheet' + (opts && opts.wide ? ' wide' : '');
  dlg.setAttribute('aria-label', title);
  dlg.innerHTML = '<div class="sheet-head"><h2>' + esc(title) + '</h2><button class="btn small" type="button" data-sheet-close aria-label="Close">Close</button></div><div class="sheet-body">' + html + '</div>';
  document.body.appendChild(dlg);
  const api = { el: dlg, body: dlg.querySelector('.sheet-body'), close: () => { try { dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); if (opts && opts.onClose) opts.onClose(); } };
  dlg.querySelector('[data-sheet-close]').addEventListener('click', api.close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); api.close(); });
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  return api;
}
function toast(msg, undo) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = esc(msg) + (undo ? ' <button class="linkbtn" data-action="toast-undo">Undo</button>' : ''); t.className = 'show'; UI.undo = undo || null;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.className = ''; UI.undo = null; }, undo ? 6000 : 2600);
}

// ---------- small formatters ----------
const kcalText = (n) => fmt0(n) + ' kcal';
const macroLine = (n) => 'P ' + fmt1(n.p) + ' g · C ' + fmt1(n.c) + ' g · F ' + fmt1(n.f) + ' g';
const numIn = (id, value, attrs) => '<input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(value === null || value === undefined ? '' : value) + '" ' + (attrs || '') + '>';

/** Calorie ring. Over the goal it turns amber and says how many over, in neutral wording. */
function ringHtml(eaten, goal) {
  const r = 52, c = 2 * Math.PI * r; const pct = goal > 0 ? Math.min(1, eaten / goal) : 0; const over = goal > 0 && eaten > goal;
  const left = goal - eaten;
  return '<div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120" role="img" aria-label="' + fmt0(eaten) + ' of ' + fmt0(goal) + ' calories eaten"><circle cx="60" cy="60" r="' + r + '" class="ring-bg"/><circle cx="60" cy="60" r="' + r + '" class="ring-fg' + (over ? ' over' : '') + '" stroke-dasharray="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>' +
    '<div class="ring-mid"><b>' + fmt0(Math.abs(left)) + '</b><span>' + (over ? 'kcal over' : 'kcal left') + '</span></div></div>';
}
function barHtml(label, value, goal, unit, kind) { // kind: floor (aim to reach), ceiling (aim to stay under), plain
  const pct = goal > 0 ? Math.min(100, Math.round(value / goal * 100)) : 0; const over = goal > 0 && value > goal;
  return '<div class="mbar"><div class="mbar-top"><span>' + esc(label) + '</span><span><b>' + fmt0(value) + '</b> / ' + fmt0(goal) + ' ' + unit + '</span></div><div class="track" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="' + Math.round(goal) + '" aria-valuenow="' + Math.round(value) + '"><span class="fill ' + (over && kind === 'ceiling' ? 'over' : '') + '" style="width:' + pct + '%"></span></div></div>';
}

// ---------- food picker: search box + results (Recent and favourites when empty) ----------
/** Fills `host` with a search box and a list. Calls onPick(food) when a row is chosen. */
function foodPicker(host, onPick, opts) {
  const o = opts || {};
  host.innerHTML = '<label class="field"><span class="sr">Search foods</span><input type="search" class="pk-q" placeholder="' + esc(o.placeholder || 'Search foods, for example rice or paneer') + '" autocomplete="off"></label><ul class="pk-list" role="list"></ul>';
  const q = $('.pk-q', host), list = $('.pk-list', host);
  const row = (f) => '<li><button type="button" class="pk-row" data-pick="' + esc(f.id) + '"><span class="pk-name">' + esc(foodLabel(f)) + '</span><span class="pk-sub">' + fmt0(f.k) + ' kcal · P ' + fmt1(f.p) + ' · per 100 g' + (f.source === 'starter' && !f.verified ? ' · approx' : '') + '</span></button></li>';
  const paint = () => {
    const text = norm(q.value); let items;
    if (!text) {
      const rec = recentRefs(12).map((r) => getFood(r.ref)).filter(Boolean);
      const favs = foodList().filter((f) => f.fav && !rec.includes(f));
      items = rec.concat(favs).slice(0, 14);
      list.innerHTML = items.length ? '<li class="pk-head">Recent and favourites</li>' + items.map(row).join('') : '<li class="pk-head">Type to search ' + foodList().length + ' foods</li>';
    } else {
      const m = text.toLowerCase(); const scored = foodList().map((f) => { const n = (foodLabel(f)).toLowerCase(); const s = n.startsWith(m) ? 3 : n.includes(m) ? 2 : similarityTo(text, f) ; return { f, s }; }).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length).slice(0, 40);
      list.innerHTML = scored.length ? scored.map((x) => row(x.f)).join('') : '<li class="pk-head">No match. ' + (o.allowNew ? 'Use "Add a food" to create it.' : 'Add it on the Foods tab.') + '</li>';
    }
  };
  const similarityTo = (text, f) => { const mt = matchFood(text, [f]); return mt ? mt.score : 0; };
  q.addEventListener('input', paint);
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; const f = getFood(b.dataset.pick); if (f) onPick(f); });
  paint();
  return { focus: () => q.focus(), paint };
}
