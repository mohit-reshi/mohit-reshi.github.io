// Small text helpers shared by the parser, the question builder and the UI. No dependencies.

export const STOP = new Set('a an and are as at be but by for from has have in is it its of on or that the this to was were will with you your we our their they them i my me about into over under more most than then also can per via using use used'.split(' '));

export function norm(s) { return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').trim(); }
export function slug(s) { return norm(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x'; }
export function hash(s) { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
export function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
export function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
export function words(s) { return (String(s || '').match(/[A-Za-z0-9][A-Za-z0-9'’+#./-]*/g) || []); }
export function wordCount(s) { return words(s).length; }
export function tokens(s) { return words(s).map((w) => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w)); }
export function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((t) => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}
export function trunc(s, n) { s = norm(s); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; }
export function lcFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
export function ucFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
export function stripBullet(s) { return String(s || '').replace(/^\s*(?:[•▪●◦‣⁃■○·*\-–—]|\d{1,2}[.)])\s+/, '').trim(); }
export function isBullet(s) { return /^\s*(?:[•▪●◦‣⁃■○·*–—-]|\d{1,2}[.)])\s+\S/.test(s); }
export function speakSeconds(text) { return Math.round(wordCount(text) / 130 * 60); }
export function fmtSeconds(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m ? m + ' min ' + (s ? s + ' s' : '') : s + ' s'; }

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Mar 2021", "03/2021", "2021", "Present" -> { y, m } (m defaults to 1, or 12 for an end date). */
export function parseDate(str, asEnd, now) {
  const s = norm(str).toLowerCase();
  const today = now || new Date();
  if (/^(present|current|now|till date|to date|ongoing)$/.test(s)) return { y: today.getFullYear(), m: today.getMonth() + 1, present: true };
  let m = /^([a-z]{3})[a-z]*\.?\s*,?\s*(\d{4})$/.exec(s);
  if (m && MONTHS[m[1]]) return { y: +m[2], m: MONTHS[m[1]] };
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { y: +m[2], m: +m[1] };
  m = /^(\d{4})$/.exec(s);
  if (m) return { y: +m[1], m: asEnd ? 12 : 1 };
  return null;
}
export function monthIndex(d) { return d ? d.y * 12 + (d.m - 1) : null; }
export function monthsBetween(a, b) { return a && b ? monthIndex(b) - monthIndex(a) : null; }
export function fmtYM(d) { if (!d) return ''; if (d.present) return 'Present'; const n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return n[d.m - 1] + ' ' + d.y; }
