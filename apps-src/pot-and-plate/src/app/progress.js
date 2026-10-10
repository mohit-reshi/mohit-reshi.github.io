// Progress: calories against the goal, averages, weight trend, water, weekday pattern and the foods that add the most.
import { esc, fmt0, fmt1, dateLabel, dowName, addDays } from '../core/base.js';
import { series, averages, weightTrend, weekdayPattern, topFoods } from '../core/stats.js';

function barChart(days, goal) {
  const W = 640, H = 190, pl = 34, pb = 22, pt = 8; const max = Math.max(goal * 1.25, ...days.map((d) => d.k), 1);
  const bw = (W - pl) / days.length; const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const bars = days.map((d, i) => d.logged ? '<rect x="' + (pl + i * bw + bw * 0.12).toFixed(1) + '" y="' + y(d.k).toFixed(1) + '" width="' + (bw * 0.76).toFixed(1) + '" height="' + (H - pb - y(d.k)).toFixed(1) + '" rx="2" class="cb"><title>' + esc(dateLabel(d.key) + ': ' + fmt0(d.k) + ' kcal') + '</title></rect>' : '<rect x="' + (pl + i * bw + bw * 0.12).toFixed(1) + '" y="' + (H - pb - 3) + '" width="' + (bw * 0.76).toFixed(1) + '" height="3" class="cb-none"><title>' + esc(dateLabel(d.key) + ': not logged') + '</title></rect>').join('');
  const lab = days.map((d, i) => (days.length <= 14 || i % Math.ceil(days.length / 8) === 0) ? '<text x="' + (pl + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="ct">' + d.key.slice(8) + '</text>' : '').join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="Calories per day for the last ' + days.length + ' days, with the goal of ' + fmt0(goal) + '. Days not logged are shown as a thin line."><line x1="' + pl + '" x2="' + W + '" y1="' + y(goal).toFixed(1) + '" y2="' + y(goal).toFixed(1) + '" class="cg"/><text x="2" y="' + (y(goal) + 4).toFixed(1) + '" class="ct">' + fmt0(goal) + '</text>' + bars + lab + '</svg>';
}
function weightChart(days, trend) {
  const pts = days.map((d, i) => ({ i, w: d.weight, t: trend[i] })).filter((p) => p.w != null); if (pts.length < 2) return '<p class="muted">Enter your weight on a few days to see a trend. The line smooths daily ups and downs.</p>';
  const W = 640, H = 170, pl = 40, pb = 20, pt = 8; const all = pts.flatMap((p) => [p.w, p.t]); const lo = Math.min(...all) - 0.3, hi = Math.max(...all) + 0.3; const x = (i) => pl + (W - pl - 6) * (days.length === 1 ? 0 : i / (days.length - 1)); const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1));
  const dots = pts.map((p) => '<circle cx="' + x(p.i).toFixed(1) + '" cy="' + y(p.w).toFixed(1) + '" r="3" class="wd"><title>' + esc(dateLabel(days[p.i].key) + ': ' + fmt1(p.w) + ' kg') + '</title></circle>').join('');
  const line = pts.map((p, n) => (n ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.t).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="Weight from ' + fmt1(pts[0].w) + ' to ' + fmt1(pts[pts.length - 1].w) + ' kilograms. The line is the 7-day average."><text x="2" y="' + (pt + 8) + '" class="ct">' + fmt1(hi) + '</text><text x="2" y="' + (H - pb) + '" class="ct">' + fmt1(lo) + '</text>' + dots + '<path d="' + line + '" class="wl"/></svg>';
}
function renderProgress() {
  const end = todayKey(); const n = UI.range; const days = series(S.log, end, n); const a = averages(days); const g = S.goals; const trend = weightTrend(days, 7);
  const wk = weekdayPattern(days); const maxw = Math.max(...wk.map((v) => v || 0), 1); const top = topFoods(S.log, days.filter((d) => d.logged).map((d) => d.key), 6);
  const ws = days.filter((d) => d.weight != null); const change = ws.length >= 2 ? ws[ws.length - 1].weight - ws[0].weight : null;
  const stat = (label, v, sub) => '<div class="stat"><span>' + esc(label) + '</span><b>' + v + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  return '<div class="progress"><div class="toolbar"><h1>Progress</h1><div class="seg" role="group" aria-label="Range">' + [7, 30, 90].map((r) => '<button class="seg-btn" data-action="range" data-v="' + r + '" aria-pressed="' + (UI.range === r) + '">' + r + ' days</button>').join('') + '</div></div>' +
    (S.sample ? '<div class="notice">Example data.</div>' : '') +
    '<div class="stats">' + stat('Days logged', a.logged + ' of ' + a.of) + stat('Average calories', a.logged ? fmt0(a.k) : '–', 'goal ' + fmt0(g.k)) + stat('Average protein', a.logged ? fmt0(a.p) + ' g' : '–', 'goal ' + fmt0(g.p) + ' g') + stat('Average water', a.water ? fmt0(a.water) + ' ml' : '–', 'goal ' + fmt0(g.water) + ' ml') + '</div>' +
    '<section class="card"><h2>Calories per day</h2>' + barChart(days, g.k) + '<p class="muted">Days you did not log are not counted as zero. Averages use logged days only.</p><details><summary>Show the numbers</summary><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">kcal</th><th scope="col">Protein g</th><th scope="col">Water ml</th></tr></thead><tbody>' + days.slice().reverse().map((d) => '<tr><td>' + esc(dateLabel(d.key)) + '</td><td>' + (d.logged ? fmt0(d.k) : 'not logged') + '</td><td>' + (d.logged ? fmt0(d.p) : '') + '</td><td>' + (d.water ? fmt0(d.water) : '') + '</td></tr>').join('') + '</tbody></table></details></section>' +
    (S.hideWeight ? '' : '<section class="card"><h2>Weight</h2>' + weightChart(days, trend) + (change !== null ? '<p>' + fmt1(Math.abs(change)) + ' kg ' + (change < 0 ? 'down' : change > 0 ? 'up' : 'unchanged') + ' between the first and last weight in this range.</p>' : '') + '</section>') +
    '<section class="card"><h2>By weekday</h2><div class="wk">' + wk.map((v, i) => '<div class="wk-c"><div class="wk-b" style="height:' + (v ? Math.max(6, Math.round(v / maxw * 90)) : 0) + 'px" title="' + (v ? fmt0(v) + ' kcal' : 'no data') + '"></div><span>' + dowName((i + 1) % 7) + '</span><small>' + (v ? fmt0(v) : '–') + '</small></div>').join('') + '</div><p class="muted">Average calories on logged days.</p></section>' +
    '<section class="card"><h2>Foods that add the most calories</h2>' + (top.length ? '<ol class="top">' + top.map((t) => '<li><span>' + esc(t.name) + '</span><b>' + fmt0(t.k) + ' kcal</b><small>' + t.n + ' time' + (t.n === 1 ? '' : 's') + '</small></li>').join('') + '</ol>' : '<p class="muted">Log a few days to see this.</p>') + '</section></div>';
}
