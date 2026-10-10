// CSV for foods: read (quoted fields, commas inside quotes, semicolons or tabs) and write.
import { norm, num, slug } from './base.js';
import { consistent } from './nutri.js';

export function parseCsv(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const delim = (first.match(/\t/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => norm(c)));
}
const q = (s) => { s = String(s == null ? '' : s); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const CSV_HEADER = ['name', 'state', 'kcal', 'protein', 'carbs', 'fat', 'fibre', 'units', 'ml_density'];
export const unitsText = (f) => (f.units || []).map((u) => u.name + '=' + u.g).join(';');
export const foodsToCsv = (foods) => [CSV_HEADER.join(',')].concat(foods.map((f) => [f.name, f.state || '', f.k, f.p, f.c, f.f, f.fi || 0, unitsText(f), f.density || ''].map(q).join(','))).join('\n') + '\n';
export const csvTemplate = () => CSV_HEADER.join(',') + '\nRoti (plain),cooked,300,9.5,56,3.7,4,roti=40,\nMilk (my brand),,62,3.2,4.8,3.4,0,glass=250,1.03\n';
const HEAD = { name: ['name', 'food', 'item'], state: ['state', 'form'], k: ['kcal', 'calories', 'energy', 'cal'], p: ['protein', 'proteins'], c: ['carbs', 'carbohydrate', 'carbohydrates'], f: ['fat', 'fats'], fi: ['fibre', 'fiber'], units: ['units', 'unit'], density: ['ml_density', 'density'] };

/** Foods from CSV text. Returns { foods, problems }, with one problem per skipped row. Values are per 100 g. */
export function foodsFromCsv(text) {
  const rows = parseCsv(text); const problems = [];
  if (rows.length < 2) return { foods: [], problems: ['The file needs a header row and at least one food.'] };
  const head = rows[0].map((h) => norm(h).toLowerCase());
  const col = {}; Object.keys(HEAD).forEach((k) => { const i = head.findIndex((h) => HEAD[k].includes(h)); if (i >= 0) col[k] = i; });
  const need = ['name', 'k', 'p', 'c', 'f'].filter((k) => col[k] === undefined);
  if (need.length) return { foods: [], problems: ['Missing column(s): ' + need.map((k) => HEAD[k][0]).join(', ') + '. Use "Download the CSV template" for the layout.'] };
  const foods = [];
  rows.slice(1).forEach((r, i) => {
    const name = norm(r[col.name]); const line = i + 2;
    if (!name) { problems.push('Row ' + line + ': no name.'); return; }
    const n = { k: num(r[col.k]), p: num(r[col.p]), c: num(r[col.c]), f: num(r[col.f]), fi: col.fi === undefined ? 0 : (num(r[col.fi]) || 0) };
    if ([n.k, n.p, n.c, n.f].some((v) => v == null || v < 0)) { problems.push('Row ' + line + ' (' + name + '): calories, protein, carbs and fat must be numbers.'); return; }
    const state = col.state === undefined ? '' : norm(r[col.state]).toLowerCase().replace(/[^a-z]/g, '');
    const units = [];
    if (col.units !== undefined) String(r[col.units] || '').split(/[;|]/).forEach((u) => { const [a, b] = u.split('='); const g = num(b); if (norm(a) && g && g > 0) units.push({ name: norm(a).toLowerCase(), g }); });
    const food = { id: 'f:' + slug(name + ' ' + state), name, state: state === 'raw' || state === 'cooked' ? state : '', k: n.k, p: n.p, c: n.c, f: n.f, fi: n.fi, units, source: 'import', verified: false };
    const d = col.density === undefined ? null : num(r[col.density]); if (d && d > 0) food.density = d;
    if (!consistent(n)) problems.push('Row ' + line + ' (' + name + '): calories do not match the macros. Imported anyway, please check.');
    foods.push(food);
  });
  return { foods, problems };
}
