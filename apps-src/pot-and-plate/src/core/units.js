// Quantities and quick-log text such as "rice 180g, dal 230 g, 2 roti, 1.5 katori curd".
import { num, norm, words, similarity } from './base.js';

const MASS = { g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, ml: null, l: null, litre: null, liter: null };
export const isMassWord = (w) => Object.prototype.hasOwnProperty.call(MASS, w);

/** Fractions like "1/2" or "1 1/2" are read as numbers. */
function amountOf(s) {
  s = norm(s);
  const m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s); if (m) return +m[1] + +m[2] / +m[3];
  const f = /^(\d+)\/(\d+)$/.exec(s); if (f) return +f[1] / +f[2];
  return num(s);
}

/** Grams for `count` of a unit of a food ("roti", "katori"), or for ml when the food has a density. null if unknown. */
export function gramsFor(food, unit, count) {
  if (!food) return null;
  const u = String(unit || 'g').toLowerCase();
  if (u === 'g') return count;
  if (u === 'kg') return count * 1000;
  if (u === 'ml') return food.density ? count * food.density : null;
  if (u === 'l') return food.density ? count * 1000 * food.density : null;
  const hit = (food.units || []).find((x) => x.name.toLowerCase() === u);
  return hit ? hit.g * count : null;
}

/** One chunk of text -> { text, qty, unit, name } where qty may be null. */
export function splitChunk(chunk) {
  let t = norm(chunk).replace(/^[-*•]\s*/, '');
  if (!t) return null;
  const qtyRe = '(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)';
  let m = new RegExp('^' + qtyRe + '\\s*([a-zA-Z]+)?\\s+(.+)$').exec(t); // "2 roti", "150 g rice"
  if (m) {
    const qty = amountOf(m[1]); const first = (m[2] || '').toLowerCase();
    if (first && isMassWord(first)) return { text: t, qty, unit: first, name: m[3] };
    // "2 roti": the word after the number is part of the name; the unit is whatever the food calls its unit
    return { text: t, qty, unit: null, name: ((m[2] ? m[2] + ' ' : '') + m[3]).trim() };
  }
  m = new RegExp('^(.+?)\\s+' + qtyRe + '\\s*([a-zA-Z]+)?$').exec(t); // "rice 180g", "dal 230 g", "curd 1.5 katori"
  if (m) { const unit = (m[3] || '').toLowerCase(); return { text: t, qty: amountOf(m[2]), unit: unit || null, name: m[1] }; }
  m = new RegExp('^' + qtyRe + '\\s*([a-zA-Z]+)$').exec(t); // "2roti"
  if (m) return { text: t, qty: amountOf(m[1]), unit: null, name: m[2] };
  return { text: t, qty: null, unit: null, name: t };
}

const rankOf = (f) => (f.source === 'starter' ? (f.rank === undefined ? 1e6 : f.rank) : -1);
/** Best food for a name. Honours "raw" and "cooked" words. foods: [{ id, name, state }]. */
export function matchFood(name, foods) {
  const w = words(name); const wantsRaw = w.includes('raw'), wantsCooked = w.includes('cooked') || w.includes('boiled');
  let best = null, bestScore = 0;
  for (const f of foods) {
    let s = similarity(name, f.name + ' ' + (f.state || ''));
    s = Math.max(s, similarity(name, f.name) * 0.95);
    if (wantsRaw && f.state === 'raw') s += 0.08;
    if (wantsCooked && f.state === 'cooked') s += 0.08;
    if (!wantsRaw && !wantsCooked && f.state === 'cooked') s += 0.01;
    if (words(f.name)[0] && words(name)[0] && words(f.name)[0] === words(name)[0]) s += 0.04;
    if (f.fav) s += 0.01;
    // on a tie your own foods win, then the more common starter food (earlier in the list)
    const better = best && Math.abs(s - bestScore) < 1e-9 && rankOf(f) < rankOf(best);
    if (s > bestScore + 1e-9 || better) { best = f; bestScore = Math.max(s, bestScore); }
  }
  return bestScore >= 0.5 ? { food: best, score: bestScore } : null;
}

/** Parses "rice 180g, dal 230 g, 2 roti" into rows. Each row has the chosen food and grams, or says what is missing. */
export function parseQuickLog(text, foods) {
  const chunks = String(text || '').split(/[,\n;+]|\band\b/i).map((x) => x).filter((x) => norm(x));
  return chunks.map((c) => {
    const s = splitChunk(c); if (!s) return null;
    const mt = matchFood(s.name, foods);
    const row = { text: s.text, name: s.name, qty: s.qty, unit: s.unit, food: mt ? mt.food : null, g: null, problem: '' };
    if (!row.food) { row.problem = 'No matching food. Add it to My foods or pick one.'; return row; }
    if (s.qty == null) { row.problem = 'No amount found.'; return row; }
    let unit = s.unit;
    if (!unit) { // "2 roti": use the food's own unit named after the food, else its first unit
      const own = (row.food.units || []).find((u) => similarity(u.name, s.name) > 0.5 || words(row.food.name).some((w) => w === u.name.toLowerCase()));
      unit = own ? own.name.toLowerCase() : (row.food.units && row.food.units[0] ? row.food.units[0].name.toLowerCase() : 'g');
    }
    const g = gramsFor(row.food, unit, s.qty);
    if (g == null) { row.problem = 'Unit "' + unit + '" is not set for ' + row.food.name + '.'; return row; }
    row.unit = unit; row.g = g; return row;
  }).filter(Boolean);
}
