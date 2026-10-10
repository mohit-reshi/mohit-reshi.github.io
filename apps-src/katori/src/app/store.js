// State, saving and everything that changes data. One localStorage key holds it all, so a backup is a single file
// and the owner sync (when signed in as owner) copies one document. Example data is held in memory only and never saved.
import { uid, norm, num, dayKeyFor, minutesOf, addDays, slug, similarity } from '../core/base.js';
import { starterFoods } from '../core/starter.js';
import { clean, snap, scale, times, dayTotals } from '../core/nutri.js';

const KEY = 'katori-v1';
const PREV = 'katori-prev';
const VERSION = 1;
let S = null;
const UI = { tab: 'today', day: null, notice: '', saveError: '', foodQ: '', foodFilter: 'all', mealQ: '', range: 30, plate: [] };

const blank = () => ({ v: VERSION, sample: false, seq: 0, lastBackup: 0, createdAt: Date.now(), goals: { k: 2000, p: 60, c: 250, f: 65, fi: 25, water: 2500 }, goalsSet: false, waterPresets: [250, 500, 750], dayStart: 4, hideWeight: false, theme: '', foods: {}, removed: {}, meals: {}, log: {} });

function migrate(s) {
  const out = Object.assign(blank(), s || {});
  out.goals = Object.assign(blank().goals, out.goals || {});
  out.foods = out.foods || {}; out.removed = out.removed || {}; out.meals = out.meals || {}; out.log = out.log || {};
  out.waterPresets = Array.isArray(out.waterPresets) && out.waterPresets.length ? out.waterPresets : [250, 500, 750];
  out.v = VERSION; return out;
}
export function isAdmin() { try { return !!(window.appChrome && window.appChrome.isOwner()); } catch (e) { return false; } }
export const state = () => S;
export const ui = () => UI;

// ---------- saving ----------
let saveTimer = null;
function persistNow() {
  if (!S || S.sample) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); UI.saveError = ''; requestPersist(); }
  catch (e) { UI.saveError = 'Could not save on this device (storage is full or blocked). Download a backup now.'; const b = document.getElementById('save-error'); if (b) { b.textContent = UI.saveError; b.hidden = false; } }
}
export function save() { if (!S || S.sample) return; foodsRev++; clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 250); }
export function flush() { clearTimeout(saveTimer); persistNow(); }
let asked = false;
function requestPersist() { if (asked) return; asked = true; try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ } }
export function storageBytes() { try { return (localStorage.getItem(KEY) || '').length * 2; } catch (e) { return 0; } }
export function stashPrev() { try { if (S && !S.sample) localStorage.setItem(PREV, JSON.stringify(S)); } catch (e) { /* ignore */ } }
export function hasPrev() { try { return !!localStorage.getItem(PREV); } catch (e) { return false; } }
export function restorePrev() { try { const raw = localStorage.getItem(PREV); if (!raw) return false; const cur = JSON.stringify(S); S = migrate(JSON.parse(raw)); S.sample = false; localStorage.setItem(PREV, cur); foodsRev++; flush(); return true; } catch (e) { return false; } }

export function load(now) {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (raw) { try { S = migrate(JSON.parse(raw)); foodsRev++; return S; } catch (e) { /* fall through */ } }
  S = blank(); S.sample = true; fillDemo(S, now || new Date()); foodsRev++;
  return S;
}
export function startOwn() { S = blank(); UI.plate = []; foodsRev++; flush(); return S; }
export function resetAll() { try { localStorage.removeItem(KEY); localStorage.removeItem(PREV); } catch (e) { /* ignore */ } UI.plate = []; S = null; load(new Date()); return S; }
export const todayKey = (now) => dayKeyFor(now || new Date(), S ? S.dayStart : 4);

// ---------- foods: starter foods are read-only until edited; an edit is stored as an override with the same id ----------
let foodsRev = 0, cache = { rev: -1, list: [], map: new Map() };
const STARTER = starterFoods();
function foodCache() {
  if (cache.rev === foodsRev) return cache;
  const map = new Map();
  STARTER.forEach((f) => { if (!S.removed[f.id]) map.set(f.id, f); });
  Object.values(S.foods).forEach((f) => map.set(f.id, f));
  const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || String(a.state).localeCompare(String(b.state)));
  cache = { rev: foodsRev, list, map };
  return cache;
}
export const foodList = () => foodCache().list;
export const getFood = (id) => foodCache().map.get(id) || null;
export const foodLabel = (f) => f.name + (f.state && f.name.toLowerCase().indexOf(f.state) < 0 ? ' (' + f.state + ')' : '');
export const isStarterId = (id) => String(id).indexOf('s:') === 0;
export function saveFood(food) {
  ensureOwn();
  const f = Object.assign({ units: [], source: 'mine', verified: false }, food);
  if (!f.id) f.id = 'f:' + uid('x');
  const n = clean(f); Object.assign(f, n, { name: norm(f.name) || 'Unnamed food' });
  S.foods[f.id] = f; delete S.removed[f.id]; save(); return f.id;
}
export function deleteFood(id) { if (isStarterId(id)) { S.removed[id] = true; delete S.foods[id]; } else delete S.foods[id]; save(); }
export function resetStarter(id) { delete S.foods[id]; delete S.removed[id]; save(); }
export const isOverride = (id) => isStarterId(id) && !!S.foods[id];
export function hiddenStarters() { return STARTER.filter((f) => S.removed[f.id]); }
export function findSimilarFood(name, state) {
  let best = null, bs = 0;
  foodList().forEach((f) => { const s = similarity(name, f.name) + (state && f.state === state ? 0.05 : 0); if (s > bs) { bs = s; best = f; } });
  return bs >= 0.6 ? { food: best, score: bs } : null;
}
/** Adds foods from a CSV import. Same id replaces the food. Returns { added, updated }. */
export function addImportedFoods(list) {
  let added = 0, updated = 0;
  list.forEach((f) => {
    const hit = foodList().find((x) => slug(x.name + ' ' + (x.state || '')) === slug(f.name + ' ' + (f.state || '')));
    if (hit) { saveFood(Object.assign({}, hit, f, { id: hit.id, source: hit.source === 'starter' ? 'mine' : hit.source, verified: false })); updated++; }
    else { saveFood(Object.assign({}, f, { id: null })); added++; }
  });
  return { added, updated };
}

// ---------- meals ----------
export const mealList = () => Object.values(S.meals).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name));
export function saveMeal(meal) {
  ensureOwn();
  const m = Object.assign({ servings: 1, items: [], steps: [], tags: [], notes: '', type: 'any', uses: 0, createdAt: Date.now() }, meal);
  if (!m.id) m.id = uid('m');
  m.name = norm(m.name) || 'Meal';
  S.meals[m.id] = m; save(); return m.id;
}
export function deleteMeal(id) { delete S.meals[id]; save(); }

// ---------- the diary ----------
export function dayRec(key, create) {
  let d = S.log[key];
  if (!d && create) d = S.log[key] = { entries: [], water: [], weight: null, note: '' };
  return d || null;
}
export const defaultSlot = (now, start) => { const m = minutesOf(now); const h = (m / 60 - (start || 0) + 24) % 24; return h < 10.5 ? 'breakfast' : h < 15.5 ? 'lunch' : h < 18.5 ? 'snack' : 'dinner'; };
export const SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner', 'Dinner']];

export function ensureOwn() { if (S && S.sample) startOwn(); }
export function addEntry(key, e) {
  ensureOwn();
  const d = dayRec(key, true);
  const n = snap(clean(e));
  const entry = Object.assign({ kind: 'quick', ref: null, name: 'Food', amt: 0, unit: '' }, e, n);
  if (!entry.id) entry.id = uid('e'); if (entry.t == null) entry.t = minutesOf(new Date()); if (!entry.meal) entry.meal = defaultSlot(new Date(), S.dayStart);
  d.entries.push(entry); save(); return entry.id;
}
export function updateEntry(key, id, patch) {
  const d = dayRec(key); if (!d) return;
  const e = d.entries.find((x) => x.id === id); if (!e) return;
  if (patch.amt !== undefined && e.amt > 0 && patch.amt > 0 && e.kind !== 'quick') { const r = patch.amt / e.amt; Object.assign(e, snap(times(clean(e), r))); }
  Object.assign(e, patch); save();
}
export function removeEntry(key, id) { const d = dayRec(key); if (!d) return; d.entries = d.entries.filter((x) => x.id !== id); cleanDay(key); save(); }
function cleanDay(key) { const d = S.log[key]; if (d && !d.entries.length && !d.water.length && d.weight == null && !d.note) delete S.log[key]; }
export function copyDay(fromKey, toKey, slot) {
  const src = dayRec(fromKey); if (!src) return 0; let n = 0;
  src.entries.filter((e) => !slot || e.meal === slot).forEach((e) => { addEntry(toKey, Object.assign({}, e, { id: undefined, t: e.t })); n++; });
  return n;
}
export function addWater(key, ml) { ensureOwn(); const d = dayRec(key, true); d.water.push({ t: minutesOf(new Date()), ml }); save(); }
export function undoWater(key) { const d = dayRec(key); if (!d || !d.water.length) return 0; const w = d.water.pop(); cleanDay(key); save(); return w.ml; }
export function setWeight(key, kg) { ensureOwn(); const d = dayRec(key, kg != null); if (!d) return; d.weight = kg; cleanDay(key); save(); }
export function setNote(key, text) { ensureOwn(); const d = dayRec(key, !!norm(text)); if (!d) return; d.note = text; cleanDay(key); save(); }
export function setGoals(g) { ensureOwn(); S.goals = Object.assign(S.goals, g); S.goalsSet = true; save(); }
export function setSettings(p) { ensureOwn(); Object.assign(S, p); save(); }

/** Foods you logged lately, newest first, then the most used. For the Recent tab. */
export function recentRefs(limit) {
  const keys = Object.keys(S.log).sort().reverse().slice(0, 60); const seen = new Map();
  keys.forEach((k) => S.log[k].entries.slice().reverse().forEach((e) => { if (e.kind === 'food' && e.ref && !seen.has(e.ref)) seen.set(e.ref, { ref: e.ref, last: e.amt, n: 0 }); if (e.kind === 'food' && e.ref && seen.has(e.ref)) seen.get(e.ref).n++; }));
  return [...seen.values()].slice(0, limit || 30);
}
export const lastAmount = (ref) => { const r = recentRefs(200).find((x) => x.ref === ref); return r ? r.last : 0; };

// ---------- backup ----------
export function markBackup() { S.lastBackup = Date.now(); save(); }
export function exportJson() { return JSON.stringify(Object.assign({ app: 'katori' }, S), null, 1); }
export function importJson(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'katori' || typeof d.log !== 'object') throw new Error('bad');
  stashPrev(); delete d.app; S = migrate(d); S.sample = false; foodsRev++; flush(); return S;
}
export function logCsv() {
  const rows = [['date', 'time', 'meal', 'item', 'amount', 'unit', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g']];
  Object.keys(S.log).sort().forEach((k) => S.log[k].entries.forEach((e) => rows.push([k, String(Math.floor(e.t / 60)).padStart(2, '0') + ':' + String(e.t % 60).padStart(2, '0'), e.meal, e.name, e.amt || '', e.unit || '', e.k, e.p, e.c, e.f, e.fi])));
  const q = (s) => { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const water = [['date', 'water_ml', 'weight_kg']]; Object.keys(S.log).sort().forEach((k) => { const d = S.log[k]; water.push([k, d.water.reduce((t, w) => t + w.ml, 0), d.weight == null ? '' : d.weight]); });
  return { entries: rows.map((r) => r.map(q).join(',')).join('\n') + '\n', days: water.map((r) => r.join(',')).join('\n') + '\n' };
}

// ---------- example data (memory only) ----------
function fillDemo(s, now) {
  const today = dayKeyFor(now, s.dayStart);
  const F = (name, state) => starterFoods().find((f) => f.name === name && (f.state === state));
  const mk = (k, slot, t, f, g) => { const n = snap(scale(f, g)); const d = s.log[k] || (s.log[k] = { entries: [], water: [], weight: null, note: '' }); d.entries.push(Object.assign({ id: uid('e'), t, meal: slot, kind: 'food', ref: f.id, name: f.name + (f.state ? ' (' + f.state + ')' : ''), amt: g, unit: 'g' }, n)); };
  const oats = F('Oats, rolled', 'raw'), milk = F('Milk, toned', ''), banana = F('Banana', 'raw'), rice = F('Rice, white', 'cooked'), dal = F('Dal, plain', 'cooked'), roti = F('Roti', 'cooked'), paneer = F('Paneer', 'raw'), curd = F('Curd (dahi), full fat', 'raw'), egg = F('Egg, whole', 'raw'), almonds = F('Almonds', 'raw'), chick = F('Chicken breast', 'raw'), oil = F('Oil (cooking)', '');
  for (let i = 13; i >= 0; i--) {
    const k = addDays(today, -i); const w = (i % 3) * 20;
    mk(k, 'breakfast', 480, oats, 50); mk(k, 'breakfast', 482, milk, 200 + w); mk(k, 'breakfast', 485, banana, 100);
    mk(k, 'lunch', 780, rice, 180); mk(k, 'lunch', 785, dal, 200); mk(k, 'lunch', 790, i % 2 ? paneer : chick, i % 2 ? 80 : 120);
    mk(k, 'snack', 1000, almonds, 20 + (i % 4) * 5); if (i % 2) mk(k, 'snack', 1010, egg, 100);
    mk(k, 'dinner', 1200, roti, 80 + w); mk(k, 'dinner', 1205, curd, 150); if (i % 3 === 0) mk(k, 'dinner', 1210, oil, 10);
    const d = s.log[k]; d.water = [{ t: 500, ml: 500 }, { t: 800, ml: 500 }, { t: 1100, ml: 750 }].slice(0, 2 + (i % 2)); d.weight = i % 2 ? null : Math.round((74.2 - (13 - i) * 0.05 + (i % 4) * 0.1) * 10) / 10;
  }
  s.meals['m-demo'] = { id: 'm-demo', name: 'Moong dal khichdi (example)', type: 'lunch', servings: 4, potG: 1450, vesselG: 0, tags: ['one-pot'], estimate: true, uses: 0, createdAt: Date.now(), source: 'made', steps: [], notes: 'Example only.', items: [{ name: 'Rice, white (raw)', g: 150, state: 'raw', n: clean(starterFoods().find((f) => f.id === 's:rice-white-raw')) }, { name: 'Moong dal (split) (raw)', g: 100, state: 'raw', n: clean(starterFoods().find((f) => f.id === 's:moong-dal-split-raw')) }, { name: 'Ghee (raw)', g: 15, state: 'raw', n: clean(starterFoods().find((f) => f.id === 's:ghee-raw')) }] };
  s.goalsSet = true;
}
