// Small shared helpers: escaping, ids, tolerant number reading, local-date keys and name matching.

export function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
export function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
export function norm(s) { return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t  ]+/g, ' ').trim(); }
export const r1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
export const r0 = (n) => Math.round(n);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/** 1234.5 -> "1,235": always the same format, whatever the browser locale is. */
export const fmt0 = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmt1 = (n) => { const v = r1(n); return String(Number.isInteger(v) ? v : v.toFixed(1)); };

/** Reads a number from messy text: "~1,000", "12,5", "350 kcal", "−2". Returns null when there is no usable number. */
export function num(s) {
  if (typeof s === 'number') return isFinite(s) ? s : null;
  let t = String(s == null ? '' : s).replace(/[  \s]/g, '').replace(/^[~≈]+/, '').replace(/−/g, '-');
  if (!t || /\[/.test(t)) return null;
  t = t.replace(/[a-zA-Z%]+$/, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ''); else t = t.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
}

// ---------- dates (always local time, as YYYY-MM-DD keys) ----------
const p2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); };
/** The day an eating moment belongs to. With a 4 am day start, 01:30 still counts for the evening before. */
export const dayKeyFor = (now, startHour) => dayKey(new Date(now.getTime() - (startHour || 0) * 3600e3));
export const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
export const timeLabel = (m) => p2(Math.floor(m / 60)) + ':' + p2(m % 60);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dowOf = (k) => parseKey(k).getDay();
export const dowName = (i) => DOW[i];
export const dateLabel = (k) => { const d = parseKey(k); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
export const dateLong = (k) => { const d = parseKey(k); return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
export const dateShort = (k) => { const d = parseKey(k); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);

// ---------- names ----------
export const slug = (s) => norm(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'x';
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'in', 'to', 'fresh', 'whole', 'plain']);
export const words = (s) => norm(s).toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
/** 0..1: how well two names match. Handles word order, plurals and a missing "raw"/"cooked". */
export function similarity(a, b) {
  const wa = words(a).map(stem), wb = words(b).map(stem);
  if (!wa.length || !wb.length) return 0;
  const sa = new Set(wa), sb = new Set(wb);
  let hit = 0; sa.forEach((w) => { if (sb.has(w)) hit++; });
  const j = hit / (sa.size + sb.size - hit);
  const contain = hit / Math.min(sa.size, sb.size);
  return Math.max(j, contain * 0.85);
}
const stem = (w) => w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
