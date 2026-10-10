// Numbers for the Progress screen: daily series, averages, weight trend, top foods, weekday pattern.
import { addDays, dowOf, daysBetween, num } from './base.js';
import { dayTotals, waterTotal } from './nutri.js';

/** Last `n` days ending at `end`, oldest first: [{ key, logged, k, p, c, f, fi, water, weight }]. */
export function series(log, end, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addDays(end, -i); const d = log[key]; const t = dayTotals(d);
    out.push({ key, logged: !!(d && d.entries && d.entries.length), k: t.k, p: t.p, c: t.c, f: t.f, fi: t.fi, water: waterTotal(d), weight: d && num(d.weight) ? num(d.weight) : null });
  }
  return out;
}
const avg = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);
/** Averages over days that have food logged (an unlogged day is not a zero-calorie day). */
export function averages(days) {
  const l = days.filter((d) => d.logged);
  return { logged: l.length, of: days.length, k: avg(l.map((d) => d.k)), p: avg(l.map((d) => d.p)), c: avg(l.map((d) => d.c)), f: avg(l.map((d) => d.f)), fi: avg(l.map((d) => d.fi)), water: avg(days.filter((d) => d.water > 0).map((d) => d.water)) };
}
/** Weight trend: the mean of the weights in the previous 7 days (calendar window), for each day that has a weight. */
export function weightTrend(days, window) {
  const w = window || 7;
  return days.map((d, i) => {
    if (d.weight == null) return null;
    const near = days.slice(Math.max(0, i - w + 1), i + 1).filter((x) => x.weight != null);
    return near.reduce((t, x) => t + x.weight, 0) / near.length;
  });
}
/** Average calories per weekday (Mon..Sun order), over logged days only. */
export function weekdayPattern(days) {
  const sums = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
  days.forEach((d) => { if (d.logged) { const i = (dowOf(d.key) + 6) % 7; sums[i].s += d.k; sums[i].n++; } });
  return sums.map((x) => (x.n ? x.s / x.n : null));
}
/** Foods that supplied the most calories over the days. */
export function topFoods(log, keys, count) {
  const m = new Map();
  keys.forEach((k) => ((log[k] && log[k].entries) || []).forEach((e) => { const cur = m.get(e.name) || { name: e.name, k: 0, n: 0 }; cur.k += e.k || 0; cur.n++; m.set(e.name, cur); }));
  return [...m.values()].sort((a, b) => b.k - a.k).slice(0, count || 5);
}
/** Days between the first and last logged day, for "show this once there is enough data" rules. */
export function loggedSpan(log) {
  const keys = Object.keys(log).filter((k) => log[k].entries && log[k].entries.length).sort();
  return keys.length ? daysBetween(keys[0], keys[keys.length - 1]) + 1 : 0;
}
