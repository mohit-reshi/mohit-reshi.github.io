// Goals: a default goal, up to three dated goal periods that replace it while they run, and diet presets that
// turn a calorie limit into protein, carbs and fat. Pure functions; dates are YYYY-MM-DD keys.
import { addDays, norm, num } from './base.js';

export const MAX_PERIODS = 3;

/** Typical macro splits as a percentage of calories. They are common starting points, not medical advice. */
export const DIETS = [
  { id: 'custom', name: 'My own split', note: 'You set protein, carbs and fat yourself. Changing a macro always switches to this.' },
  { id: 'balanced', name: 'Balanced', p: 20, c: 50, f: 30, note: 'About half the calories from carbs, a fifth from protein, the rest from fat.' },
  { id: 'highprotein', name: 'High protein', p: 35, c: 40, f: 25, note: 'More protein, for people building or keeping muscle.' },
  { id: 'lowcarb', name: 'Low carb', p: 30, c: 25, f: 45, note: 'Carbs cut to about a quarter of calories.' },
  { id: 'keto', name: 'Keto', p: 20, c: 5, f: 75, note: 'Very low carb, high fat. Ask a doctor or dietitian before following it for long, or if you have a health condition.' },
  { id: 'mediterranean', name: 'Mediterranean', p: 18, c: 45, f: 37, note: 'Moderate carbs and plenty of unsaturated fat.' },
  { id: 'lowfat', name: 'Low fat', p: 20, c: 60, f: 20, note: 'Fat kept to a fifth of calories, more carbs.' },
  { id: 'zone', name: 'Zone (40/30/30)', p: 30, c: 40, f: 30, note: 'Calories split 40% carbs, 30% protein, 30% fat.' },
];
export const dietById = (id) => DIETS.find((d) => d.id === id) || DIETS[0];

/** Grams of protein, carbs and fat for a calorie limit and a diet. null for "my own split". */
export function macrosFor(dietId, kcal) {
  const d = dietById(dietId); const k = num(kcal);
  if (d.p === undefined || !k || k <= 0) return null;
  return { p: Math.round(k * d.p / 100 / 4), c: Math.round(k * d.c / 100 / 4), f: Math.round(k * d.f / 100 / 9) };
}
/** The split a goal's grams really give, as whole percentages of its calories. */
export function splitOf(goal) {
  const k = num(goal.k); if (!k || k <= 0) return null;
  const pct = (g, per) => Math.round((num(g) || 0) * per / k * 100);
  return { p: pct(goal.p, 4), c: pct(goal.c, 4), f: pct(goal.f, 9) };
}

// ---------- periods ----------
export const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;
export const statusOf = (g, today) => (g.start <= today && today <= g.end ? 'active' : g.start > today ? 'upcoming' : 'ended');
/** The period running on `key`, or null. */
export const periodOn = (periods, key) => (periods || []).find((p) => p.start && p.end && p.start <= key && key <= p.end) || null;
/** The goal that applies on a day: { id, name, period, ...numbers }. */
export function goalOn(def, periods, key) {
  const p = periodOn(periods, key);
  const src = p || def;
  return { id: p ? p.id : 'default', name: p ? p.name : 'Default', isDefault: !p, period: p, k: src.k, p: src.p, c: src.c, f: src.f, fi: src.fi, water: src.water, diet: src.diet || 'custom' };
}
/** Dates other periods already use, for showing as blocked. */
export const blockedFor = (periods, exceptId) => (periods || []).filter((p) => p.id !== exceptId && p.start && p.end).sort((a, b) => a.start.localeCompare(b.start));
/** Limits for the date pickers of one period, so blocked dates cannot be chosen: start cannot be before the previous period ended, end cannot pass the next period's start. */
export function dateLimits(periods, g) {
  const others = blockedFor(periods, g.id);
  const before = others.filter((o) => o.end < (g.start || '9999')).pop(); const after = others.find((o) => o.start > (g.end || g.start || '0000'));
  return { startMin: before ? addDays(before.end, 1) : '', endMax: after ? addDays(after.start, -1) : '' };
}
/** Problems with a period, as short messages. Empty when it is fine. */
export function validatePeriod(periods, g) {
  const errs = [];
  if (!norm(g.name)) errs.push('Give the goal a name.');
  if (!g.start || !g.end) errs.push('Choose a start date and an end date.');
  else if (g.end < g.start) errs.push('The end date cannot be before the start date.');
  else blockedFor(periods, g.id).forEach((o) => { if (overlaps(g, o)) errs.push('These dates overlap "' + o.name + '" (' + o.start + ' to ' + o.end + '). Each date can belong to one goal only.'); });
  if (!(num(g.k) > 0)) errs.push('Calories must be a number above 0.');
  return errs;
}
/** Where a new period can start: the first free day from today, ending up to four weeks later but before the next period. */
export function suggestPeriod(periods, today) {
  const ranges = (periods || []).filter((p) => p.start && p.end).sort((a, b) => a.start.localeCompare(b.start));
  let start = today; let moved = true;
  while (moved) { moved = false; for (const r of ranges) if (r.start <= start && start <= r.end) { start = addDays(r.end, 1); moved = true; } }
  let end = addDays(start, 27); const next = ranges.find((r) => r.start > start); if (next && next.start <= end) end = addDays(next.start, -1);
  return { start, end };
}
/** Reminders for Today: the day before a period starts, and its last day. Dismissed ones are left out. */
export function notices(periods, today, dismissed) {
  const out = []; const seen = dismissed || {};
  (periods || []).forEach((p) => {
    if (!p.start || !p.end) return;
    if (today === addDays(p.start, -1) && !seen[p.id + ':' + p.start + ':pre']) out.push({ id: p.id + ':' + p.start + ':pre', kind: 'pre', period: p });
    if (today === p.end && !seen[p.id + ':' + p.end + ':last']) out.push({ id: p.id + ':' + p.end + ':last', kind: 'last', period: p });
  });
  return out;
}
