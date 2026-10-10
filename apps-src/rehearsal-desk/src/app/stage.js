// Stage and spotlight layer: pointer tilt on cards, the fan-out, ring sweeps, the section curtain call,
// the timer ring, and small stage graphics for first-run and empty states.
// Everything here is finite or event driven: nothing loops, so an idle page costs no frames.
// With reduced motion the same information appears with fades or not at all.

const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const hasHover = () => !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

// ---------- pointer tilt and moving light on cards ----------
let tiltEl = null, tiltRaf = 0, tiltPt = null;
function tiltClear(el) {
  if (!el) return;
  el.classList.remove('tilting');
  ['--rx', '--ry', '--mx', '--my', '--sx', '--sy'].forEach((k) => el.style.removeProperty(k));
}
function tiltApply() {
  tiltRaf = 0;
  const el = tiltEl, e = tiltPt; if (!el || !e || !el.isConnected) return;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
  const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  el.classList.add('tilting');
  el.style.setProperty('--ry', ((px - 0.5) * 3.6).toFixed(2) + 'deg');
  el.style.setProperty('--rx', ((0.5 - py) * 2.6).toFixed(2) + 'deg');
  el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
  el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
  el.style.setProperty('--sx', ((0.5 - px) * 18).toFixed(1) + 'px');
  el.style.setProperty('--sy', ((0.5 - py) * 12).toFixed(1) + 'px');
}
function onTiltMove(e) {
  if (e.pointerType === 'touch' || calm()) return;
  const t = e.target; if (!t || !t.closest) return;
  const card = t.closest('.cards .card');
  if (card !== tiltEl) { tiltClear(tiltEl); tiltEl = card; }
  if (!card) return;
  // Hold still over controls so a click never lands on a moving target.
  if (t.closest('button, a, input, label, textarea, select')) return;
  tiltPt = e;
  if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltApply);
}
function bindStage() {
  if (!hasHover()) return;
  document.addEventListener('pointermove', onTiltMove, { passive: true });
  document.addEventListener('pointerleave', () => { tiltClear(tiltEl); tiltEl = null; });
  window.addEventListener('blur', () => { tiltClear(tiltEl); tiltEl = null; });
  // The hero light follows the pointer a little.
  document.addEventListener('pointermove', (e) => {
    if (calm()) return;
    const art = e.target && e.target.closest ? e.target.closest('.stage-art') : null; if (!art) return;
    const r = art.getBoundingClientRect();
    art.style.setProperty('--lx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(2));
  }, { passive: true });
}

// ---------- fan-out when the board opens ----------
export function stageFan() {
  const board = document.querySelector('.board'); if (!board || calm()) return;
  let n = 0;
  board.querySelectorAll('.sec').forEach((sec, si) => {
    const cs = Array.prototype.slice.call(sec.querySelectorAll('.cards > .card')); if (!cs.length) return;
    const r0 = cs[0].getBoundingClientRect();
    cs.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--dx', Math.round(r0.left - r.left + Math.min(i, 5) * 5) + 'px');
      c.style.setProperty('--dy', Math.round(r0.top - r.top + Math.min(i, 5) * 4) + 'px');
      c.style.setProperty('--d', Math.min(i, 7) * 50 + Math.min(si, 2) * 80 + 'ms');
      c.style.setProperty('--fx', (i % 2 ? 1 : -1) * (2 + Math.min(i, 4)) + 'deg');
      n++;
    });
  });
  if (n) { board.classList.add('fan'); setTimeout(() => board.classList.remove('fan'), 1300); }
}

// ---------- progress rings sweep to their value ----------
export function ringSnapshot() {
  const m = {};
  document.querySelectorAll('.sec[data-sec] .ring > span').forEach((s) => { m[s.closest('.sec').dataset.sec] = parseFloat(s.style.getPropertyValue('--p')) || 0; });
  return m;
}
export function ringSweep(snap, pulseSec) {
  if (calm()) return;
  const jobs = [];
  document.querySelectorAll('.ring > span').forEach((s) => {
    const to = parseFloat(s.style.getPropertyValue('--p')) || 0;
    const sec = s.closest('.sec');
    const from = snap ? (sec && snap[sec.dataset.sec] !== undefined ? snap[sec.dataset.sec] : to) : 0;
    if (from !== to) jobs.push([s, from, to, !!(sec && sec.dataset.sec === pulseSec)]);
  });
  if (!jobs.length) return;
  jobs.forEach(([s, from]) => { s.classList.add('nt'); s.style.setProperty('--p', from); });
  void document.body.offsetWidth;
  requestAnimationFrame(() => {
    jobs.forEach(([s, from, to, pulse]) => {
      s.classList.remove('nt'); s.style.setProperty('--p', to);
      if (pulse) { const ring = s.parentNode; ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); setTimeout(() => ring.classList.remove('pulse'), 900); }
    });
  });
}

// ---------- stamp on a freshly perfected card ----------
export function stageSlam(id) {
  const el = document.querySelector('[data-card="' + CSS.escape(id) + '"]'); if (!el) return;
  el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
  setTimeout(() => el.classList.remove('slam'), 1400);
}

// ---------- curtain call when a whole section is perfected ----------
let curtain = null, curtainTimer = 0;
function endCurtain() {
  clearTimeout(curtainTimer);
  if (curtain) { curtain.remove(); curtain = null; }
}
function liveSay(text) {
  let live = document.getElementById('stage-live');
  if (!live) { live = document.createElement('div'); live.id = 'stage-live'; live.className = 'sr'; live.setAttribute('role', 'status'); document.body.appendChild(live); }
  live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30);
}
export function stageCurtain(title, n, everySection) {
  endCurtain();
  const line = everySection ? 'Every section is perfected' : 'Section perfected';
  const sub = title + ' · ' + n + ' of ' + n + ' answers';
  liveSay(line + '. ' + sub + '.');
  const quiet = calm();
  const el = document.createElement('div');
  el.className = 'curtain' + (quiet ? ' quiet' : '');
  el.setAttribute('aria-hidden', 'true');
  let sparks = '';
  if (!quiet) for (let i = 0; i < 14; i++) sparks += '<i style="--a:' + (i * 25.7 + (i % 3) * 7).toFixed(0) + 'deg;--r:' + (70 + (i * 37) % 70) + 'px;--w:' + (i * 31 % 140) + 'ms"></i>';
  el.innerHTML = (quiet ? '' : '<span class="cur l"></span><span class="cur r"></span>') + '<span class="beam"></span><div class="plaque"><b>' + esc(line) + '</b><span>' + esc(sub) + '</span></div><div class="sparks">' + sparks + '</div>';
  document.body.appendChild(el);
  curtain = el;
  curtainTimer = setTimeout(endCurtain, quiet ? 1800 : 1500);
}
document.addEventListener('keydown', (e) => { if (curtain && e.key === 'Escape') endCurtain(); });
document.addEventListener('pointerdown', () => { if (curtain) endCurtain(); }, true);

/** Call after a card was toggled to perfected. Plays the curtain only when it completes its section. */
export function stageAfterPerfect(id) {
  const c = getCard(id); if (!c || c.status !== 'perfected') return;
  const all = cardsIn(c.secId); if (!all.length || !all.every((x) => x.status === 'perfected')) return;
  const secs = sectionsInOrder().filter((x) => x.cards.length);
  const every = secs.length > 1 && secs.every((x) => x.cards.every((y) => y.status === 'perfected'));
  const s = S.sections[c.secId];
  stageCurtain(s ? s.title : 'This section', all.length, every);
}

// ---------- practice: spotlight and timer ring ----------
const TR = 19, TC = 2 * Math.PI * TR;
const zoneOf = (s, tg) => (s < tg * 0.5 ? 0 : s <= tg * 1.4 ? 1 : 2);
const ZONE_LIVE = ['Keep going', 'Good length', 'Running long'];
const ZONE_DONE = ['Too short', 'Good length', 'Long'];
function arc(a, b, cls) {
  const len = (b - a) * TC;
  return '<circle class="' + cls + '" cx="24" cy="24" r="' + TR + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (TC - len + 1).toFixed(2) + '" stroke-dashoffset="' + (-a * TC).toFixed(2) + '"/>';
}
export function timerRingHtml(spoken, target, frozen) {
  const tg = Math.max(10, target), M = tg * 1.8, z = zoneOf(spoken, tg), f = Math.min(1, spoken / M);
  return '<span class="tring z' + z + (frozen ? ' frozen' : '') + '" id="pr-ring" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48">' +
    arc(0, 0.5 / 1.8, 'zone zs') + arc(0.5 / 1.8, 1.4 / 1.8, 'zone zg') + arc(1.4 / 1.8, 1, 'zone zl') +
    '<circle class="prog" cx="24" cy="24" r="' + TR + '" stroke-dasharray="' + (f * TC).toFixed(2) + ' ' + TC.toFixed(2) + '"/></svg></span>' +
    '<span class="tzone z' + z + '" id="pr-zone">' + (frozen ? ZONE_DONE : ZONE_LIVE)[z] + '</span>';
}
export function stageTimer(s, target) {
  const ring = document.getElementById('pr-ring'); if (!ring) return;
  const tg = Math.max(10, target), M = tg * 1.8, z = zoneOf(s, tg), f = Math.min(1, s / M);
  const prog = ring.querySelector('.prog'); if (prog) prog.setAttribute('stroke-dasharray', (f * TC).toFixed(2) + ' ' + TC.toFixed(2));
  ring.className = 'tring z' + z;
  const zl = document.getElementById('pr-zone');
  if (zl) { zl.className = 'tzone z' + z; if (zl.textContent !== ZONE_LIVE[z]) zl.textContent = ZONE_LIVE[z]; }
}
/** Centre the spotlight on the question card and light it up (once per round, not on every card). */
export function stageSpot(held) {
  const sec = document.querySelector('.practice.live'); if (!sec) return;
  const card = sec.querySelector('.pr-card');
  if (card) { const r = card.getBoundingClientRect(); const y = Math.max(28, Math.min(62, ((r.top + r.height / 2) / window.innerHeight) * 100)); sec.style.setProperty('--spot-y', y.toFixed(0) + '%'); }
  if (held) sec.classList.add('held');
}

// ---------- stage graphics ----------
let spotN = 0;
export function spotSvg(cls) {
  const gid = 'sg' + (++spotN);
  return '<span class="' + (cls || 'spot') + '" aria-hidden="true"><svg viewBox="0 0 160 120" width="160" height="120" focusable="false">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient></defs>' +
    '<g class="cone"><path d="M72 4h16l34 100H38z" fill="url(#' + gid + ')"/></g>' +
    '<ellipse class="pool" cx="80" cy="104" rx="46" ry="9"/>' +
    '<rect class="lamp" x="68" y="0" width="24" height="9" rx="3"/>' +
    '<g class="stool"><rect x="72" y="86" width="16" height="3" rx="1.5"/><path d="M75 89l-4 14M85 89l4 14M80 89v14" stroke-width="2" fill="none"/></g></svg></span>';
}
export function heroStage() {
  return '<div class="stage-art" aria-hidden="true">' + spotSvg('spot big') + '<p class="stage-cue">Paste your resume to step into the light.</p></div>';
}

/** A short burst of sparks above the round summary when every answer was a hit. */
export function stageApplause() {
  const panel = document.querySelector('.summary.applause'); if (!panel || calm()) return;
  let h = '<div class="applause-sparks" aria-hidden="true">';
  for (let i = 0; i < 16; i++) h += '<i style="--a:' + (i * 22.5 + (i % 2) * 9).toFixed(0) + 'deg;--r:' + (50 + (i * 29) % 70) + 'px;--w:' + (i * 23 % 120) + 'ms"></i>';
  panel.insertAdjacentHTML('afterbegin', h + '</div>');
  setTimeout(() => { const el = panel.querySelector('.applause-sparks'); if (el) el.remove(); }, 1600);
}

bindStage();
