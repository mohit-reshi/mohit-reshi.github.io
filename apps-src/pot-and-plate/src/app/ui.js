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

const REDUCED = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const PIE_R = 25, PIE_C = 2 * Math.PI * PIE_R;
/** Dash settings for the three macro wedges, from calories eaten as protein, carbs and fat. */
function pieDash(t) {
  const kp = 4 * t.p, kc = 4 * t.c, kf = 9 * t.f, sum = kp + kc + kf;
  if (sum <= 0) return [[0, 0], [0, 0], [0, 0]];
  let at = 0;
  return [kp, kc, kf].map((x) => { const len = x / sum * PIE_C; const d = [Math.max(0, len - (len > 2 ? 1.2 : 0)), at]; at += len; return d; });
}
const dashStyle = (d) => 'stroke-dasharray:' + d[0].toFixed(2) + ' ' + PIE_C.toFixed(2) + ';stroke-dashoffset:' + (-d[1]).toFixed(2);
/** The calorie plate: the rim is calories against the goal, the plate holds what you ate as protein, carbs and fat. */
function ringHtml(eaten, goal, macros) {
  const r = 72, c = 2 * Math.PI * r; const pct = goal > 0 ? Math.min(1, eaten / goal) : 0; const over = goal > 0 && eaten > goal; const left = goal - eaten;
  const t = macros || { p: 0, c: 0, f: 0 }; const to = pieDash(t); const empty = to.every((d) => d[0] === 0);
  const enter = UI.enter && !REDUCED(); const prevP = UI.platePrev; const from = enter ? [[0, 0], [0, 0], [0, 0]] : (prevP ? prevP.d : to); const rimFrom = enter ? 0 : (prevP ? prevP.rim : c * pct); UI.platePrev = { d: to, rim: c * pct };
  const sum = 4 * t.p + 4 * t.c + 9 * t.f; const share = (x) => (sum ? Math.round(x / sum * 100) : 0);
  const wedge = (i, cls, stroke) => '<circle class="wedge ' + cls + '" cx="80" cy="80" r="' + PIE_R + '" fill="none" stroke="' + stroke + '" stroke-width="50" style="' + dashStyle(from[i]) + '" data-to="' + dashStyle(to[i]) + '" transform="rotate(-90 80 80)"/>';
  return '<div class="ring-wrap plate-wrap"><svg class="ring plate" viewBox="0 0 160 160" role="img" aria-label="' + fmt0(eaten) + ' of ' + fmt0(goal) + ' calories eaten. Protein ' + share(4 * t.p) + ' percent, carbs ' + share(4 * t.c) + ' percent, fat ' + share(9 * t.f) + ' percent of what you ate.">' +
    '<defs><pattern id="pt-p" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="var(--c-protein)"/><rect width="2" height="6" fill="rgba(255,255,255,.28)"/></pattern>' +
    '<pattern id="pt-c" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="var(--c-carb)"/><circle cx="2" cy="2" r="1.1" fill="rgba(255,255,255,.4)"/><circle cx="5.4" cy="5.2" r="1.1" fill="rgba(120,80,0,.25)"/></pattern>' +
    '<pattern id="pt-f" width="10" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="var(--c-fat)"/><path d="M0 3 Q2.5 0 5 3 T10 3" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/></pattern></defs>' +
    '<circle cx="80" cy="80" r="' + r + '" class="ring-bg"/><circle cx="80" cy="80" r="' + r + '" class="ring-fg' + (over ? ' over' : '') + '" stroke-dasharray="' + rimFrom.toFixed(1) + ' ' + c.toFixed(1) + '" data-dash="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 80 80)"/>' +
    '<circle cx="80" cy="80" r="62" class="plate-face"/><circle cx="80" cy="80" r="53" class="plate-ring"/>' +
    (empty ? '<g class="cutlery sway" aria-hidden="true"><path d="M58 52v20M54 52v14q0 6 4 6t4-6V52M58 78v28" /><path d="M104 52c-7 4-8 22 0 28v26M104 52v54"/></g>' : '') +
    wedge(0, 'w-p', 'url(#pt-p)') + wedge(1, 'w-c', 'url(#pt-c)') + wedge(2, 'w-f', 'url(#pt-f)') + '</svg>' +
    '<div class="drops" aria-hidden="true"></div><div class="ring-alt" aria-hidden="true"></div><div class="ring-mid"><b>' + fmt0(Math.abs(left)) + '</b><span>' + (over ? 'kcal over' : 'kcal left') + '</span></div></div>' +
    '<ul class="legend" aria-label="What you ate, by macro"><li><button type="button" class="lg" data-hl="p" data-g="' + fmt0(t.p) + ' g protein"><i class="sw sw-p"></i>Protein ' + share(4 * t.p) + '%</button></li><li><button type="button" class="lg" data-hl="c" data-g="' + fmt0(t.c) + ' g carbs"><i class="sw sw-c"></i>Carbs ' + share(4 * t.c) + '%</button></li><li><button type="button" class="lg" data-hl="f" data-g="' + fmt0(t.f) + ' g fat"><i class="sw sw-f"></i>Fat ' + share(9 * t.f) + '%</button></li></ul>';
}
/** A glass that fills with water. Level eases up; two slow waves move on the surface. */
function glassHtml(ml, goal) {
  const pct = goal > 0 ? Math.min(1, ml / goal) : 0; const top = 112 - 100 * pct; // glass interior spans y 12..112
  const enter = UI.enter && !REDUCED(); const y0 = enter ? 118 : (UI.glassPrev !== undefined ? UI.glassPrev : top); UI.glassPrev = top;
  return '<div class="glass-wrap"><svg class="glass" viewBox="0 0 90 124" role="img" aria-label="Water glass: ' + fmt0(ml) + ' of ' + fmt0(goal) + ' millilitres"><defs><clipPath id="gl-clip"><path d="M14 10h62l-6 100q-1 8-9 8H29q-8 0-9-8z"/></clipPath><linearGradient id="gl-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-water1)"/><stop offset="1" stop-color="var(--c-water2)"/></linearGradient></defs>' +
    '<g clip-path="url(#gl-clip)"><g class="level" style="transform:translateY(' + y0.toFixed(1) + 'px)" data-to="' + top.toFixed(1) + '"><g class="wave w1"><path d="M-90 4q11-7 22 0t22 0 22 0 22 0 22 0 22 0 22 0 22 0 22 0V130H-90z" fill="url(#gl-w)" opacity=".55"/></g><g class="wave w2"><path d="M-90 5q11 6 22 0t22 0 22 0 22 0 22 0 22 0 22 0 22 0 22 0V130H-90z" fill="url(#gl-w)"/></g></g><g class="bubbles"></g></g>' +
    '<g class="ticks" aria-hidden="true"><path d="M63 36h8M65 62h6M67 87h4"/></g><path d="M14 10h62l-6 100q-1 8-9 8H29q-8 0-9-8z" class="glass-edge" fill="none"/><path d="M22 18l4 86" class="glass-shine"/></svg></div>';
}
function barHtml(label, value, goal, unit, kind) { // kind: floor (aim to reach), ceiling (aim to stay under), plain
  const pct = goal > 0 ? Math.min(100, Math.round(value / goal * 100)) : 0; const over = goal > 0 && value > goal;
  return '<div class="mbar"><div class="mbar-top"><span>' + esc(label) + '</span><span><b>' + fmt0(value) + '</b> / ' + fmt0(goal) + ' ' + unit + '</span></div><div class="track" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="' + Math.round(goal) + '" aria-valuenow="' + Math.round(value) + '"><span class="fill ' + (over && kind === 'ceiling' ? 'over' : '') + '" style="width:' + (UI.enter && !REDUCED() ? 0 : pct) + '%" data-w="' + pct + '"></span></div></div>';
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

/** A small cooking pot. With `steam` three wisps rise from it. */
function potSvg(steam) {
  return '<svg class="pot" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + (steam ? '<g class="steam"><path d="M17 15q-3-4 0-8t0-6" /><path d="M24 15q-3-4 0-8t0-6" /><path d="M31 15q-3-4 0-8t0-6" /></g>' : '') + '<path d="M9 22h30v10q0 8-8 8H17q-8 0-8-8z" class="pot-body"/><path d="M6 22h36" class="pot-lip"/><path d="M9 26H5M39 26h4" class="pot-handle"/></svg>';
}
/** Top view of a pot of food with the part you will eat as a wedge. fraction 0..1. */
function slicerHtml(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  return '<div class="slicer" data-slicer><svg class="slice-svg" viewBox="0 0 120 120" role="img" aria-label="The pot. The highlighted wedge is your portion." focusable="false"><defs><radialGradient id="sl-g" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="var(--c-carb)" stop-opacity=".55"/><stop offset="1" stop-color="var(--c-carb)" stop-opacity=".95"/></radialGradient><pattern id="sl-p" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="rgba(110,70,0,.35)"/><circle cx="6.5" cy="5.5" r="1.4" fill="rgba(255,255,255,.45)"/><circle cx="4" cy="8" r="0.9" fill="rgba(120,60,0,.3)"/></pattern></defs>' +
    '<path d="M2 52h9v16H2zM109 52h9v16h-9z" class="sl-ear"/><circle cx="60" cy="60" r="56" class="sl-pot"/><circle cx="60" cy="60" r="49" class="sl-rim"/><circle cx="60" cy="60" r="46" fill="url(#sl-g)"/><circle cx="60" cy="60" r="46" fill="url(#sl-p)"/>' +
    '<path class="sl-wedge" d="' + wedgePath(f) + '"/><path class="sl-cut" d="' + cutPath(f) + '"/></svg></div>';
}
function cutPath(f) { if (f <= 0 || f >= 0.999) return ''; const a = f * 2 * Math.PI; return 'M60 60V14M60 60L' + (60 + 46 * Math.sin(a)).toFixed(2) + ' ' + (60 - 46 * Math.cos(a)).toFixed(2); }
function wedgePath(f) {
  if (f <= 0) return ''; if (f >= 0.999) return 'M60 14a46 46 0 1 1 -0.01 0z';
  const a = f * 2 * Math.PI; const x = 60 + 46 * Math.sin(a), y = 60 - 46 * Math.cos(a);
  return 'M60 60V14A46 46 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + 'Z';
}
