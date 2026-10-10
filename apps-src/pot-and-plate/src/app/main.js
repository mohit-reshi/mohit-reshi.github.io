// Router, events and boot.
const TABS = [['today', 'Today'], ['meals', 'Meals'], ['foods', 'Foods'], ['progress', 'Progress'], ['settings', 'Settings']];
let lastAdmin = false;

function routeFromHash() { const h = (location.hash || '#/today').replace(/^#\/?/, '').split('?')[0]; return TABS.some((t) => t[0] === h) ? h : 'today'; }
function applyTheme() { const t = S.theme; if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }

function renderNav() {
  $('#nav').innerHTML = TABS.map(([id, l]) => '<a href="#/' + id + '" class="nav-a' + (UI.tab === id ? ' on' : '') + '"' + (UI.tab === id ? ' aria-current="page"' : '') + '>' + l + '</a>').join('');
  $('#admin-pill').hidden = !isAdmin();
}
function render() {
  const route = routeFromHash(); const prev = UI.tab; UI.tab = route; applyTheme(); renderNav();
  const main = $('#main'); const y = window.scrollY;
  main.innerHTML = route === 'today' ? renderToday() : route === 'meals' ? renderMeals() : route === 'foods' ? renderFoods() : route === 'progress' ? renderProgress() : renderSettings();
  main.className = 'main route-' + route; document.title = 'Pot and Plate';
  window.scrollTo(0, prev === route ? y : 0);
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
function download(name, text, type) { const b = new Blob([text], { type: type || 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); }
const curDay = () => UI.day || todayKey();

function onClick(e) {
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action; const id = t.dataset.id;
  switch (a) {
    case 'start-own': startOwn(); toast('Your own diary is ready.'); render(); break;
    case 'goto-settings': go('#/settings'); break;
    case 'backup': download('pot-and-plate-backup.json', exportJson()); markBackup(); toast('Backup downloaded'); render(); break;
    case 'day-prev': UI.day = addDays(curDay(), -1); render(); break;
    case 'day-next': { const n = addDays(curDay(), 1); UI.day = n >= todayKey() ? null : n; render(); break; }
    case 'day-today': UI.day = null; render(); break;
    case 'add': openAdd(t.dataset.slot); break;
    case 'copy-slot': { const n = copyDay(addDays(curDay(), -1), curDay(), t.dataset.slot); toast('Copied ' + n + ' item' + (n === 1 ? '' : 's')); render(); break; }
    case 'edit-entry': openEntry(id); break;
    case 'water': addWater(curDay(), +t.dataset.ml); render(); break;
    case 'water-other': askDialog('How many ml?', { value: '', ok: 'Add', type: 'text' }, (v) => { const n = num(v); if (n && n > 0 && n < 5000) { addWater(curDay(), n); render(); } }); break;
    case 'water-undo': { const ml = undoWater(curDay()); render(); if (ml) toast('Removed ' + ml + ' ml', () => { addWater(curDay(), ml); render(); }); break; }
    case 'toast-undo': if (UI.undo) { const f = UI.undo; UI.undo = null; f(); $('#toast').className = ''; } break;
    case 'meal-new': openMealEditor({ name: '', type: 'any', servings: 1, items: [], steps: [], tags: [], source: 'made' }, () => { toast('Meal saved'); render(); }); break;
    case 'meal-log': openLogMeal(S.meals[id], defaultSlot(new Date(), S.dayStart), () => { toast('Logged ' + S.meals[id].name); render(); }); break;
    case 'meal-edit': openMealEditor(S.meals[id], () => { toast('Meal saved'); render(); }); break;
    case 'meal-dup': { const m = S.meals[id]; if (m) { saveMeal(Object.assign({}, JSON.parse(JSON.stringify(m)), { id: null, name: m.name + ' (copy)', uses: 0, lastUsed: 0, fav: false })); render(); } break; }
    case 'meal-fav': { const m = S.meals[id]; if (m) { m.fav = !m.fav; save(); render(); } break; }
    case 'meal-del': { const m = S.meals[id]; if (m) askDialog('Delete ' + m.name + '?', { text: 'Diary entries that already used it are not changed.', ok: 'Delete' }, () => { deleteMeal(id); render(); }); break; }
    case 'meal-import': if (isAdmin()) openImport(); break;
    case 'food-new': openFoodEditor(null); break;
    case 'food-edit': openFoodEditor(getFood(id)); break;
    case 'food-filter': UI.foodFilter = t.dataset.v; render(); break;
    case 'csv-open': openCsv(); break;
    case 'range': UI.range = +t.dataset.v; render(); break;
    case 'save-water': { const list = $('#water-presets').value.split(/[,;\s]+/).map(num).filter((n) => n && n > 0 && n <= 3000); if (list.length) { setSettings({ waterPresets: list.slice(0, 6) }); toast('Water buttons saved'); } else toast('Enter at least one size in ml.'); render(); break; }
    case 'export-log': { const c = logCsv(); download('pot-and-plate-diary.csv', c.entries, 'text/csv'); download('pot-and-plate-days.csv', c.days, 'text/csv'); break; }
    case 'undo-restore': if (restorePrev()) { toast('Restored the earlier data'); render(); } break;
    case 'unhide-starters': hiddenStarters().forEach((f) => resetStarter(f.id)); render(); break;
    case 'erase': askDialog('Clear all my data?', { text: 'This removes your diary, foods, meals and settings from this browser and shows the example data again. Download a backup first if you may want them back.', ok: 'Clear my data' }, () => { resetAll(); UI.day = null; go('#/today'); render(); toast('Data cleared'); }); break;
    default: goalsAction(a, t); break;
  }
}
function onChange(e) {
  const el = e.target;
  if (el.id === 'diet-sel' || (el.closest && el.closest('.goalcard'))) { if (goalsChange(el)) return; }
  if (el.id === 'day-in') { const v = el.value; if (v) { UI.day = v >= todayKey() ? null : v; render(); } return; }
  if (el.id === 'weight-in') { const v = num(el.value); setWeight(curDay(), v && v > 20 && v < 400 ? v : null); return; }
  if (el.id === 'day-start') { setSettings({ dayStart: +el.value }); render(); return; }
  if (el.id === 'hide-weight') { setSettings({ hideWeight: el.checked }); render(); return; }
  if (el.id === 'theme-sel') { setSettings({ theme: el.value }); render(); return; }
  if (el.id === 'backup-in' && el.files && el.files[0]) { el.files[0].text().then((t) => { try { importJson(t); toast('Backup restored'); UI.day = null; go('#/today'); render(); } catch (x) { toast('That file is not a Pot and Plate backup.'); } }); el.value = ''; }
}
function onInput(e) {
  const el = e.target;
  if (el.closest && el.closest('.goalcard') && goalsInput(el)) return;
  if (el.id === 'note-in') { setNote(curDay(), el.value); return; }
  if (el.id === 'meal-q') { UI.mealQ = el.value; const pos = el.selectionStart; render(); const n = $('#meal-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } return; }
  if (el.id === 'food-q') { UI.foodQ = el.value; const pos = el.selectionStart; render(); const n = $('#food-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }
}

function boot() {
  load(new Date()); lastAdmin = isAdmin();
  document.addEventListener('click', onClick); document.addEventListener('change', onChange); document.addEventListener('input', onInput);
  window.addEventListener('hashchange', render); window.addEventListener('pagehide', flush);
  window.addEventListener('appchrome:owner', () => { const now = isAdmin(); if (now !== lastAdmin) { lastAdmin = now; render(); } });
  window.addEventListener('storage', (e) => { if (e.key === 'pot-and-plate-v1' && !S.sample) { load(new Date()); render(); } });
  render();
  try { if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch (e) { /* ignore */ }
}
boot();
