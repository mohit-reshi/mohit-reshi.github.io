// Router, events and boot. Uses the shared state (S, UI) from store.js.

const $ = (sel, root) => (root || document).querySelector(sel);
const NAV = [['home', 'Home'], ['resume', 'Resume'], ['match', 'Job match'], ['board', 'Question cards'], ['practice', 'Practice']];
const NAV_ADMIN = [['jds', 'My JDs'], ['collected', 'Collected']];
let lastAdmin = false;
let editStart = '';

// ---------- small dialogs (window.prompt and confirm are blocked in some embedded pages) ----------
function askDialog(title, opts, done) {
  const dlg = document.createElement('dialog'); dlg.className = 'dlg';
  const input = opts.value !== undefined;
  dlg.innerHTML = '<form method="dialog"><h2>' + esc(title) + '</h2>' + (opts.text ? '<p>' + esc(opts.text) + '</p>' : '') + (input ? '<label class="field"><span class="sr">' + esc(title) + '</span><input id="dlg-in" value="' + esc(opts.value) + '" autocomplete="off"></label>' : '') + '<div class="row end"><button class="btn" value="cancel" type="button" data-x>Cancel</button><button class="btn primary" value="ok">' + esc(opts.ok || 'OK') + '</button></div></form>';
  document.body.appendChild(dlg);
  const close = () => { try { dlg.close(); } catch (e) { /* ignore */ } dlg.remove(); };
  dlg.querySelector('[data-x]').addEventListener('click', close);
  dlg.addEventListener('cancel', () => { dlg.remove(); });
  dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const v = input ? dlg.querySelector('#dlg-in').value : true; close(); done(v); });
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  const f = dlg.querySelector('input'); if (f) { f.focus(); f.select(); }
}

// ---------- reading files ----------
async function readDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; } }
  if (end < 0) throw new Error('This does not look like a .docx file.');
  const count = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true);
  let entry = null;
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    if (name === 'word/document.xml') { entry = { method, csize, off }; break; }
    p += 46 + nlen + xlen + clen;
  }
  if (!entry) throw new Error('No document text was found in this file.');
  const nlen = dv.getUint16(entry.off + 26, true), xlen = dv.getUint16(entry.off + 28, true);
  const start = entry.off + 30 + nlen + xlen;
  const data = buf.subarray(start, start + entry.csize);
  let xml;
  if (entry.method === 0) xml = new TextDecoder().decode(data);
  else {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .docx files. Paste the text instead.');
    xml = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = [];
  doc.querySelectorAll('w\\:p, p').forEach((para) => {
    let line = '';
    para.querySelectorAll('w\\:t, w\\:tab, w\\:br, t, tab, br').forEach((n) => { const ln = n.localName; line += ln === 't' ? n.textContent : ln === 'tab' ? '\t' : '\n'; });
    const listed = para.querySelector('w\\:numPr, numPr');
    if (line.trim()) out.push((listed ? '- ' : '') + line.replace(/[ \t]+$/, ''));
  });
  return out.join('\n');
}
async function readFileText(file) {
  const n = (file.name || '').toLowerCase();
  if (n.endsWith('.docx')) return readDocx(file);
  if (n.endsWith('.pdf')) throw new Error('PDF files cannot be read here. Open the PDF, copy its text and paste it into the box.');
  return file.text();
}

// ---------- shell ----------
function renderNav() {
  const admin = isAdmin();
  const items = NAV.concat(admin ? NAV_ADMIN : []);
  $('#nav').innerHTML = items.map(([id, l]) => '<a href="#/' + id + '" class="nav-a' + (UI.route === id || (id === 'board' && UI.route === 'edit') ? ' on' : '') + '"' + ((UI.route === id) ? ' aria-current="page"' : '') + '>' + l + '</a>').join('');
  $('#admin-pill').hidden = !admin;
}
function routeFromHash() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0];
  const [r, id] = h.split('/');
  const ok = NAV.concat(NAV_ADMIN).map((x) => x[0]).concat(['edit']);
  let route = ok.includes(r) ? r : 'home';
  if ((route === 'jds' || route === 'collected') && !isAdmin()) route = 'home';
  return { route, id };
}

function render() {
  const { route, id } = routeFromHash();
  const prev = UI.route;
  if (prev === 'edit' && route !== 'edit') leaveEditor();
  UI.route = route; UI.editId = id;
  renderNav();
  const main = $('#main');
  const html = route === 'home' ? renderHome() : route === 'resume' ? renderResume() : route === 'match' ? renderMatch() : route === 'board' ? renderBoard() : route === 'edit' ? renderEdit(id) : route === 'practice' ? renderPractice() : route === 'jds' ? renderJds() : renderCollected();
  main.innerHTML = html;
  main.className = 'main route-' + route;
  document.title = 'Rehearsal Desk';
  if (route === 'board') {
    bindBoardScroll();
    const y = UI.ret ? UI.ret.y : 0;
    requestAnimationFrame(() => {
      if (UI.focusCard) { const ok = flashCard(UI.focusCard); UI.focusCard = null; if (!ok && y) window.scrollTo(0, y); }
      else if (UI.scrollSec) { const el = document.getElementById(UI.scrollSec.replace(/[^a-z0-9]/gi, '_')); UI.scrollSec = null; if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offsetTopSafe(), behavior: 'auto' }); }
      updateFocus();
    });
  } else if (prev !== route) window.scrollTo(0, 0);
  if (route === 'practice') startTimer();
  if (route === 'edit') { const c = getCard(id); editStart = c ? c.a : ''; }
}
const offsetTopSafe = () => { const h = $('.topbar'), f = $('#focusbar'); return (h ? h.offsetHeight : 0) + (f ? f.offsetHeight : 0) + 8; };

function leaveEditor() { const c = getCard(UI.editId); if (c) commitVersion(c.id, editStart); flush(); }

let timerHandle = null;
function startTimer() {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    const el = $('#pr-timer'); if (!el) { clearInterval(timerHandle); return; }
    const t0 = +el.dataset.t0; if (!t0) return;
    const s = Math.floor((Date.now() - t0) / 1000), tg = +el.dataset.target;
    el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' / ' + Math.floor(tg / 60) + ':' + String(tg % 60).padStart(2, '0');
    el.classList.toggle('over', s > tg);
  }, 500);
}

// ---------- actions ----------
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
function pageSizeCss() { let st = $('#page-style'); if (!st) { st = document.createElement('style'); st.id = 'page-style'; document.head.appendChild(st); } st.textContent = '@page{size:' + (S.ui.paper === 'letter' ? 'Letter' : 'A4') + ';margin:0}'; }
function fillPrint() {
  if (!S.resume) return;
  pageSizeCss();
  $('#print-root').innerHTML = '<table class="pt"><thead><tr><td><div class="pad"></div></td></tr></thead><tbody><tr><td class="pc">' + resumeHtml(S.resume, S.ui.template, S.ui.include) + '</td></tr></tbody><tfoot><tr><td><div class="pad"></div></td></tr></tfoot></table>';
}
function doPrint() { document.body.classList.add('printing-resume'); fillPrint(); setTimeout(() => window.print(), 50); }
window.addEventListener('afterprint', () => document.body.classList.remove('printing-resume'));
window.addEventListener('beforeprint', () => { if (UI.route === 'resume' && UI.resumeTab === 'design') document.body.classList.add('printing-resume'); fillPrint(); });

function entryList(kind) { return kind === 'job' ? S.resume.experience : kind === 'project' ? S.resume.projects : S.resume.personal; }

async function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) { if (UI.openMenu && !e.target.closest('.menu-wrap')) { UI.openMenu = null; if (UI.route === 'board') rerenderBoardKeepScroll(); } return; }
  const a = t.dataset.action;
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return; // handled by change
  const id = t.dataset.id;
  switch (a) {
    case 'analyse': {
      const r = $('#resume-in').value, j = $('#jd-in').value;
      if (!norm(r)) { UI.notice = 'Paste your resume first.'; render(); break; }
      const res = analyse({ resumeText: r, jdText: j, now: new Date() });
      UI.notice = res.sample ? 'This is the sample text, so nothing was saved. Replace it with your own to start.' : 'Done. ' + Object.values(S.cards).filter((c) => !c.archived).length + ' question cards are ready.';
      render(); window.scrollTo({ top: 0 }); break;
    }
    case 'clear-resume': $('#resume-in').value = ''; $('#resume-in').focus(); break;
    case 'clear-jd': $('#jd-in').value = ''; $('#jd-in').focus(); break;
    case 'use-sample': askDialog('Replace your data with the sample?', { text: 'This clears what is saved in this browser. Download a backup first if you want to keep it.', ok: 'Use the sample' }, () => { resetAll(); UI.notice = ''; render(); }); break;
    case 'save-jd-lib': {
      const text = $('#jd-in').value; if (!norm(text)) { UI.notice = 'Paste a job description first.'; render(); break; }
      if (S.sample) { analyse({ resumeText: S.resumeText, jdText: text, now: new Date() }); }
      const cur = S.jds[S.activeJd];
      if (!cur || cur.text !== text) analyseJdInto(S.activeJd && S.jds[S.activeJd] ? S.activeJd : 'current', text);
      const jid = saveJdToLibrary({ text, company: S.jds[S.activeJd].company, title: S.jds[S.activeJd].title });
      UI.notice = 'Saved to your JD library.'; go('#/jds'); break;
    }
    case 'resume-tab': UI.resumeTab = t.dataset.v; render(); break;
    case 'add-entry': { const k = t.dataset.kind; const list = entryList(k); list.push(k === 'job' ? { kind: 'job', company: '', role: '', start: '', end: '', location: '', bullets: [], confidence: 'high' } : { kind: k, name: '', tech: '', bullets: [], confidence: 'medium' }); save(); render(); break; }
    case 'del-entry': { entryList(t.dataset.kind).splice(+t.dataset.i, 1); save(); render(); break; }
    case 'save-resume': {
      const r = saveResumeChanges();
      UI.notice = 'Saved. Questions refreshed: ' + r.added.length + ' new, ' + r.archived.length + ' archived. Your answers for unchanged facts were kept.';
      UI.resumeTab = 'content'; render();
      const d = $('#resume-dirty'); if (d) d.textContent = UI.notice; break;
    }
    case 'template': setUi({ template: t.dataset.v }); render(); break;
    case 'paper': setUi({ paper: t.dataset.v }); render(); break;
    case 'print': doPrint(); break;
    case 'rerun-jd': { const r = rerunJd(id); UI.notice = r ? 'Analysed and saved. ' + r.added.length + ' new cards, ' + r.kept.length + ' kept (your edits and perfected answers are untouched).' : 'Add the job description text first.'; render(); break; }
    case 'open-jd': setActiveJd(id); UI.notice = ''; render(); break;
    case 'new-jd': newJdDraft(); UI.notice = ''; render(); setTimeout(() => { const f = $('#jd-company'); if (f) f.focus(); }, 0); break;
    case 'delete-jd': askDialog('Delete this job description?', { text: 'Its cards are removed too. This cannot be undone.', ok: 'Delete' }, () => { deleteJd(id); UI.notice = ''; render(); }); break;
    case 'extract': {
      const txt = $('#col-text').value; const res = importCollected(txt, $('#col-label').value, new Date());
      if (!res) { UI.notice = 'No questions were found. Questions end with a question mark, or start with words like "Tell me" or "Explain".'; render(); break; }
      UI.notice = ''; UI.scrollSec = res.secId; UI.lastImport = res;
      render(); go('#/board'); break;
    }
    case 'filter': UI.filter = t.dataset.v; rerenderBoardKeepScroll(); break;
    case 'edit': UI.ret = { y: window.scrollY }; UI.focusCard = null; go('#/edit/' + id); break;
    case 'back-to-card': UI.focusCard = id; go('#/board'); break;
    case 'perfect': { togglePerfected(id); if (UI.route === 'board') rerenderBoardKeepScroll(); else render(); break; }
    case 'reset-answer': resetToStarter(id); render(); break;
    case 'restore': restoreVersion(id, +t.dataset.i); render(); break;
    case 'delete-card': askDialog('Delete this card?', { text: 'This cannot be undone.', ok: 'Delete' }, () => { deleteCard(id); go('#/board'); }); break;
    case 'autofit': setUi({ autofit: !S.ui.autofit }); rerenderBoardKeepScroll(); break;
    case 'sec-prev': stepSection(-1); break;
    case 'sec-next': stepSection(1); break;
    case 'jump': { const el = document.getElementById(t.dataset.sec.replace(/[^a-z0-9]/gi, '_')); if (el) { const i = Array.prototype.indexOf.call(document.querySelectorAll('.board .sec'), el); scrollToSection(i); } break; }
    case 'move-menu': UI.openMenu = UI.openMenu === 'move' ? null : 'move'; rerenderBoardKeepScroll(); break;
    case 'move-to': { moveCards([...UI.selected], t.dataset.sec); UI.openMenu = null; rerenderBoardKeepScroll(); break; }
    case 'move-new': askDialog('Name the new section', { value: '', ok: 'Create and move' }, (v) => { const sid = createSection(v); moveCards([...UI.selected], sid); UI.openMenu = null; UI.scrollSec = sid; render(); }); break;
    case 'new-section': askDialog('Name the new section', { value: '', ok: 'Create' }, (v) => { const sid = createSection(v); UI.scrollSec = sid; render(); }); break;
    case 'clear-sel': UI.selected.clear(); rerenderBoardKeepScroll(); break;
    case 'sec-menu': UI.openMenu = UI.openMenu === t.dataset.sec ? null : t.dataset.sec; rerenderBoardKeepScroll(); break;
    case 'sec-rename': { const s = S.sections[t.dataset.sec]; UI.openMenu = null; askDialog('Rename section', { value: s.title, ok: 'Rename' }, (v) => { renameSection(s.id, v); rerenderBoardKeepScroll(); }); break; }
    case 'sec-up': moveSection(t.dataset.sec, -1); UI.openMenu = null; rerenderBoardKeepScroll(); break;
    case 'sec-down': moveSection(t.dataset.sec, 1); UI.openMenu = null; rerenderBoardKeepScroll(); break;
    case 'sec-select': cardsIn(t.dataset.sec).forEach((c) => UI.selected.add(c.id)); UI.openMenu = null; rerenderBoardKeepScroll(); break;
    case 'sec-delete': { UI.openMenu = null; const ok = deleteSection(t.dataset.sec); if (!ok) UI.notice = 'Only empty sections can be deleted. Move the cards first.'; rerenderBoardKeepScroll(); break; }
    case 'undo-import': askDialog('Undo this import?', { text: 'The cards from it that are still in this section are removed.', ok: 'Undo import' }, () => { undoImport(t.dataset.batch); UI.openMenu = null; rerenderBoardKeepScroll(); }); break;
    case 'merge-dup': mergeCardInto(id); rerenderBoardKeepScroll(); break;
    case 'merge-next': if (!mergeNext(id)) UI.notice = 'There is no next card to join.'; rerenderBoardKeepScroll(); break;
    case 'split-card': if (!splitCard(id)) UI.notice = 'Nothing to split: the answer has no blank line.'; rerenderBoardKeepScroll(); break;
    case 'pr-start': { const pool = practicePool(); const p = UI.practice; p.scope = $('#pr-scope') ? $('#pr-scope').value : p.scope; const deck = practicePool().map((c) => c.id); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } p.deck = deck.slice(0, 25); p.i = 0; p.reveal = false; p.t0 = Date.now(); render(); break; }
    case 'pr-reveal': UI.practice.reveal = true; render(); break;
    case 'pr-skip': UI.practice.i++; UI.practice.reveal = false; UI.practice.t0 = Date.now(); render(); break;
    case 'pr-rate': { const p = UI.practice; rateCard(p.deck[p.i], t.dataset.ok === '1'); p.i++; p.reveal = false; p.t0 = Date.now(); render(); break; }
    case 'backup': { const blob = new Blob([exportJson()], { type: 'application/json' }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'rehearsal-desk-backup.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); break; }
    case 'erase': askDialog('Erase all my data?', { text: 'This removes your resume, answers and settings from this browser.', ok: 'Erase everything' }, () => { resetAll(); UI.notice = ''; go('#/home'); render(); }); break;
    default: break;
  }
}
function rerenderBoardKeepScroll() {
  const y = window.scrollY; const keep = UI.focusCard;
  const main = $('#main'); main.innerHTML = renderBoard(); renderNav();
  window.scrollTo(0, y); updateFocus();
}

// ---------- inputs ----------
function onInput(e) {
  const el = e.target;
  if (el.id === 'board-search') { UI.search = el.value; const pos = el.selectionStart; rerenderBoardKeepScroll(); const n = $('#board-search'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } return; }
  if (el.id === 'jd-search') { UI.jdSearch = el.value; const pos = el.selectionStart; render(); const n = $('#jd-search'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } return; }
  if (el.id === 'answer') {
    const c = getCard(el.dataset.id); if (!c) return;
    setAnswer(c.id, el.value);
    $('#live-checks').innerHTML = liveChecks(analyseAnswer(el.value, coachFor(c).seconds || c.seconds), coachFor(c));
    const ss = $('#save-state'); if (ss) ss.textContent = S.sample ? 'Sample: not saved' : 'Saved';
    return;
  }
  if (el.closest('.editor') && S.resume) { editResumeField(el); return; }
  if (el.closest('.jd-detail') && el.dataset.f) {
    const d = el.closest('.jd-detail'); const f = el.dataset.f; const jid = d.dataset.id;
    updateJdFields(jid, f.startsWith('hr.') ? { hr: { [f.slice(3)]: el.value } } : { [f]: el.value });
    return;
  }
}
function onChange(e) {
  const el = e.target;
  if (el.dataset.action === 'select') { if (el.checked) UI.selected.add(el.dataset.id); else UI.selected.delete(el.dataset.id); const sc = $('#sel-count'); if (sc) sc.textContent = UI.selected.size + ' selected'; const card = el.closest('.card'); if (card) card.classList.toggle('selected', el.checked); document.querySelectorAll('[data-action=move-menu],[data-action=clear-sel]').forEach((b) => { b.disabled = !UI.selected.size; }); return; }
  if (el.dataset.action === 'include') { const inc = Object.assign({}, S.ui.include, { [el.dataset.k]: el.checked }); setUi({ include: inc }); render(); return; }
  if (el.id === 'pr-scope') { UI.practice.scope = el.value; return; }
  if (el.closest('.jd-detail') && el.dataset.f === 'status') { updateJdFields(el.closest('.jd-detail').dataset.id, { status: el.value }); render(); return; }
  if (el.closest('.jd-detail') && el.dataset.f === 'interviewDate') { updateJdFields(el.closest('.jd-detail').dataset.id, { interviewDate: el.value }); return; }
  if (el.type === 'file' && el.files && el.files[0]) {
    const file = el.files[0]; const target = el.id;
    readFileText(file).then((text) => {
      if (target === 'resume-file') $('#resume-in').value = text;
      else if (target === 'jd-file') $('#jd-in').value = text;
      else if (target === 'col-file') $('#col-text').value = text;
      UI.notice = 'Loaded ' + file.name + '. Check the text, then press the button.';
      const st = $('.status'); if (st) st.textContent = UI.notice;
    }).catch((err) => { UI.notice = err.message; render(); });
    el.value = '';
  }
}
function editResumeField(el) {
  const r = S.resume; const f = el.dataset.f; if (!f) return;
  const lines = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);
  const entry = el.closest('.entry');
  if (entry) {
    const item = entryList(entry.dataset.kind)[+entry.dataset.i]; if (!item) return;
    item[f] = f === 'bullets' ? lines(el.value) : el.value;
    if (f === 'company' || f === 'role') item.confidence = 'high';
  } else if (el.id.indexOf('c-') === 0) r.contact[f] = f === 'links' ? lines(el.value) : el.value;
  else if (f === 'skills') r.skills = el.value.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  else if (f === 'education' || f === 'certifications') r[f] = lines(el.value);
  else if (f === 'summary') r.summary = el.value;
  save();
  const d = $('#resume-dirty'); if (d) d.textContent = S.sample ? 'Sample: changes are not saved.' : 'Unsaved changes: press Save and refresh questions to update your cards.';
}
function onFocusOut(e) { if (e.target.id === 'answer') { const c = getCard(e.target.dataset.id); if (c) { commitVersion(c.id, editStart); editStart = c.a; flush(); } } }

function onKey(e) {
  if (e.key === 'Escape' && UI.openMenu) { UI.openMenu = null; if (UI.route === 'board') rerenderBoardKeepScroll(); }
}

// ---------- boot ----------
function boot() {
  load(new Date());
  lastAdmin = isAdmin();
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { render(); });
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('appchrome:owner', () => { const now = isAdmin(); if (now !== lastAdmin) { lastAdmin = now; render(); } });
  $('#theme-btn').addEventListener('click', () => { const cur = document.documentElement.getAttribute('data-theme'); const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark'; if (next) document.documentElement.setAttribute('data-theme', next); else document.documentElement.removeAttribute('data-theme'); $('#theme-btn').textContent = 'Theme: ' + (next || 'system'); });
  $('#backup-in').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { importJson(t); UI.notice = 'Backup imported.'; go('#/home'); render(); } catch (x) { UI.notice = 'That file is not a Rehearsal Desk backup.'; render(); } }); e.target.value = ''; });
  render();
}
boot();
