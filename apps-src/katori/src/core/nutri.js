// Nutrition maths. Values per 100 g are k (kcal), p (protein), c (carbs), f (fat), fi (fibre), all in grams except k.
import { num } from './base.js';

export const zero = () => ({ k: 0, p: 0, c: 0, f: 0, fi: 0 });
export const add = (a, b) => ({ k: a.k + b.k, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f, fi: a.fi + b.fi });
export const sum = (list) => list.reduce((t, x) => add(t, x), zero());
export const scale = (n, g) => { const r = g / 100; return { k: n.k * r, p: n.p * r, c: n.c * r, f: n.f * r, fi: (n.fi || 0) * r }; };
export const times = (t, x) => ({ k: t.k * x, p: t.p * x, c: t.c * x, f: t.f * x, fi: t.fi * x });
export const clean = (n) => ({ k: num(n && n.k) || 0, p: num(n && n.p) || 0, c: num(n && n.c) || 0, f: num(n && n.f) || 0, fi: num(n && n.fi) || 0 });

/** Calories a macro breakdown implies (protein and carbs 4 per g, fat 9). Fibre is already inside carbs. */
export const impliedKcal = (n) => 4 * n.p + 4 * n.c + 9 * n.f;
/** True when stated calories and macros roughly agree. Catches typos in a label or a pasted recipe. */
export function consistent(n, tolerance) {
  const exp = impliedKcal(n), diff = Math.abs(n.k - exp);
  return diff <= Math.max(15, (tolerance || 0.18) * Math.max(n.k, exp));
}

/** Nutrition of one recipe item: it keeps its own per-100 g values, so a recipe never changes when a food is edited later. */
export const itemNutrition = (it) => scale(clean(it.n), Math.max(0, num(it.g) || 0));
export const mealTotals = (meal) => sum((meal.items || []).map(itemNutrition));
export const itemsWeight = (meal) => (meal.items || []).reduce((t, it) => t + Math.max(0, num(it.g) || 0), 0);

/** Cooked weight of the food only: the full pot minus the empty vessel (or the net weight if no vessel was weighed). */
export function netCooked(meal) {
  const pot = num(meal.potG), vessel = num(meal.vesselG) || 0;
  if (!pot || pot <= 0) return null;
  const net = pot - vessel;
  return net > 0 ? net : null;
}
export const hasPot = (meal) => netCooked(meal) !== null;
/** Per 100 g of the finished dish. Uses the cooked weight, so it already includes water gained or lost in cooking. */
export function per100Cooked(meal) { const w = netCooked(meal); return w ? scale(mealTotals(meal), 100 * 100 / w) : null; }
export const perServing = (meal) => { const s = Math.max(0.01, num(meal.servings) || 1); return times(mealTotals(meal), 1 / s); };

/** What you ate when you log `amount` of a meal. mode "servings": a number of portions. mode "grams": grams from the pot. */
export function portionOfMeal(meal, mode, amount) {
  const total = mealTotals(meal);
  if (mode === 'grams') { const w = netCooked(meal); if (!w) return null; return times(total, amount / w); }
  const s = Math.max(0.01, num(meal.servings) || 1);
  return times(total, amount / s);
}
/** Grams in one portion, when the pot was weighed. */
export const gramsPerServing = (meal) => { const w = netCooked(meal); return w ? w / Math.max(0.01, num(meal.servings) || 1) : null; };

/** Entry snapshot fields (rounded for storage; sums are taken from these stored values). */
export const snap = (n) => ({ k: Math.round(n.k * 10) / 10, p: Math.round(n.p * 100) / 100, c: Math.round(n.c * 100) / 100, f: Math.round(n.f * 100) / 100, fi: Math.round(n.fi * 100) / 100 });
export const dayTotals = (day) => sum(((day && day.entries) || []).map((e) => clean(e)));
export const waterTotal = (day) => ((day && day.water) || []).reduce((t, w) => t + (num(w.ml) || 0), 0);
