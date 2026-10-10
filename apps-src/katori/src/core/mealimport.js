// Reads "MEAL v1" blocks pasted from a chat. Tolerant of chat formatting (bold marks, leading pipes, ~ signs, comma decimals).
// Returns the meals it found, and warnings the preview should show. Never throws on odd input.
import { norm, num } from './base.js';
import { mealTotals, consistent, impliedKcal } from './nutri.js';

const START = /={2,}\s*MEAL\s*v(\d+)\s*={2,}/i;
const END = /={2,}\s*END\s*={2,}/i;

function cleanLine(l) {
  return String(l).replace(/ | /g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/−|–|—/g, '-')
    .replace(/\*\*|__|`/g, '').replace(/^\s*>+\s?/, '').replace(/\s+$/, '');
}
const TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Finds every block in the text. Each: { raw, version }. */
export function findBlocks(text) {
  const lines = String(text || '').split(/\r?\n/).map(cleanLine);
  const blocks = []; let cur = null;
  for (const l of lines) {
    if (START.test(l)) { if (cur) blocks.push(cur); cur = { version: +START.exec(l)[1], lines: [] }; continue; }
    if (cur && END.test(l)) { blocks.push(cur); cur = null; continue; }
    if (cur) cur.lines.push(l);
  }
  if (cur) blocks.push(Object.assign(cur, { unterminated: true }));
  return blocks;
}

function cells(line) {
  let t = line.trim(); if (t.startsWith('|')) t = t.slice(1); if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => norm(c));
}

function statedTotals(line) {
  const out = {}; const m = (re) => { const x = re.exec(line); return x ? num(x[1]) : null; };
  out.k = m(/kcal\s*[:=]?\s*([~\d.,]+)/i); out.p = m(/protein\s*[:=]?\s*([~\d.,]+)/i); out.c = m(/carbs?\s*[:=]?\s*([~\d.,]+)/i); out.f = m(/fat\s*[:=]?\s*([~\d.,]+)/i); out.fi = m(/fibre|fiber/i.test(line) ? /fib(?:re|er)\s*[:=]?\s*([~\d.,]+)/i : /$^/);
  return out;
}

function parseBlock(b, index) {
  const warnings = []; const meal = { name: '', type: 'any', servings: 1, potG: null, vesselG: null, tags: [], estimate: true, items: [], steps: [], notes: '', stated: null, statedServing: null, source: 'import' };
  let section = '';
  for (const l of b.lines) {
    const t = l.trim(); if (!t) continue;
    let m;
    if ((m = /^name\s*:\s*(.+)$/i.exec(t))) { meal.name = norm(m[1]); section = ''; continue; }
    if ((m = /^type\s*:\s*(.+)$/i.exec(t))) { const v = norm(m[1]).toLowerCase(); meal.type = TYPES.includes(v) ? v : 'any'; section = ''; continue; }
    if ((m = /^servings\s*:\s*(.+)$/i.exec(t))) { const v = num(m[1]); if (v && v > 0) meal.servings = v; else warnings.push('Servings is missing or not a number. Using 1.'); section = ''; continue; }
    if ((m = /^cooked_weight_g\s*:\s*(.+)$/i.exec(t))) { const v = num(m[1]); meal.potG = v && v > 0 ? v : null; section = ''; continue; }
    if ((m = /^tags\s*:\s*(.*)$/i.exec(t))) { meal.tags = m[1].split(/[,;]/).map((x) => norm(x)).filter(Boolean); section = ''; continue; }
    if ((m = /^estimate\s*:\s*(.+)$/i.exec(t))) { meal.estimate = !/^no/i.test(norm(m[1])); section = ''; continue; }
    if (/^ingredients\b/i.test(t)) { section = 'ing'; continue; }
    if (/^steps\s*:?\s*$/i.test(t)) { section = 'steps'; continue; }
    if ((m = /^notes?\s*:\s*(.*)$/i.exec(t))) { meal.notes = norm(m[1]); section = 'notes'; continue; }
    if (/^totals?\s*:/i.test(t)) { meal.stated = statedTotals(t); section = ''; continue; }
    if (/^per\s+serving\s*:/i.test(t)) { meal.statedServing = statedTotals(t); section = ''; continue; }
    if (section === 'ing' && t.includes('|')) {
      const c = cells(t);
      if (/^[-: ]+$/.test(c.join('')) || /^ingredient$/i.test(c[0])) continue;
      const g = num(c[1]);
      const n = { k: num(c[3]), p: num(c[4]), c: num(c[5]), f: num(c[6]), fi: c[7] === undefined ? 0 : num(c[7]) };
      const name = c[0];
      if (!name) continue;
      const bad = [];
      if (g == null || g <= 0) bad.push('weight');
      ['k', 'p', 'c', 'f'].forEach((x) => { if (n[x] == null) bad.push(x === 'k' ? 'kcal' : x === 'p' ? 'protein' : x === 'c' ? 'carbs' : 'fat'); });
      if (bad.length) warnings.push(name + ': missing or unreadable ' + bad.join(', ') + '. Fix it in the preview.');
      const state = /cook|boil|fried|roast/i.test(c[2] || '') ? 'cooked' : 'raw';
      const nn = { k: n.k || 0, p: n.p || 0, c: n.c || 0, f: n.f || 0, fi: n.fi || 0 };
      if (!bad.length && !consistent(nn)) warnings.push(name + ': calories (' + Math.round(nn.k) + ') do not match its macros (about ' + Math.round(impliedKcal(nn)) + '). Check the values.');
      meal.items.push({ name, g: g && g > 0 ? g : 0, state, n: nn });
      continue;
    }
    if (section === 'steps' && (m = /^\d+[.)]\s*(.+)$/.exec(t))) { meal.steps.push(norm(m[1])); continue; }
    if (section === 'notes') meal.notes = (meal.notes + ' ' + t).trim();
  }
  const label = 'Meal ' + (index + 1) + (meal.name ? ' (' + meal.name + ')' : '');
  if (!meal.name) { meal.name = 'Imported meal ' + (index + 1); warnings.push('The block has no name. Please name it.'); }
  if (!meal.items.length) warnings.push('No ingredient rows were found.');
  if (b.unterminated) warnings.push('The block has no "=== END ===" line. It may be cut off.');
  if (b.version !== 1) warnings.push('This block is version ' + b.version + '. This app reads version 1, so check the result.');
  if (!meal.potG) warnings.push('No cooked weight yet. Weigh the finished dish and enter it later to log by grams.');
  if (meal.items.length) {
    const t = mealTotals(meal);
    if (meal.stated && meal.stated.k != null && meal.stated.k > 0 && Math.abs(meal.stated.k - t.k) > 0.05 * t.k + 5) warnings.push('The stated total (' + Math.round(meal.stated.k) + ' kcal) differs from the ingredient table (' + Math.round(t.k) + ' kcal). The app uses the table.');
  }
  return { label, meal, warnings };
}

/** { meals: [{ meal, warnings, label }], problems: [text] } */
export function parseMealText(text) {
  const blocks = findBlocks(text);
  if (!blocks.length) return { meals: [], problems: ['No "=== MEAL v1 ===" block was found in the pasted text.'] };
  return { meals: blocks.map(parseBlock), problems: [] };
}
