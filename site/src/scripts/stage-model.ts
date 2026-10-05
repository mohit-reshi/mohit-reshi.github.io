/**
 * Model View: the portfolio as a living relationship diagram.
 * Inline SVG draws the relationship lines, real DOM <article> cards are the tables (focusable, draggable).
 * Everything is created in mount() and removed again in its cleanup, so the layout switcher and view transitions leave nothing behind.
 */
import '@fontsource-variable/big-shoulders-display/wght';
import { onLayout } from './layout';
import { $, $$, on, reducedMotion, type Cleanup, type Init } from './util';
import { bounds, buildModel, layoutModel, propagate, routeEdges, type MEdge, type MNode, type Model, type ModelConfig, type Rect, type Route } from '../lib/model-graph';
import type { ExplorerData } from '../lib/explorer';

const SVGNS = 'http://www.w3.org/2000/svg';
const MAX_K = 2.6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const s = <K extends keyof SVGElementTagNameMap>(tag: K, cls?: string) => { const n = document.createElementNS(SVGNS, tag); if (cls) n.setAttribute('class', cls); return n; };

interface Cam { x: number; y: number; k: number }
interface Spring { x: number; y: number; vx: number; vy: number; tx: number; ty: number; held: boolean }
interface Ptr { id: number; x: number; y: number; sx: number; sy: number; card: HTMLElement | null; cardOk: boolean; mode: 'wait' | 'pan' | 'card' | 'pinch'; gx: number; gy: number }

let dataCache: ExplorerData | null = null;
const readData = (): ExplorerData | null => {
  if (dataCache) return dataCache;
  try { dataCache = JSON.parse(document.getElementById('explorer-data')?.textContent || 'null'); } catch { dataCache = null; }
  return dataCache;
};

function mount(root: HTMLElement): Cleanup {
  const data0 = readData();
  const viewport0 = $('[data-mv-viewport]', root);
  const world0 = $('[data-mv-world]', root);
  const stage0 = $('[data-mv-stage]', root);
  if (!data0 || !viewport0 || !world0 || !stage0 || !data0.projects) return () => {};
  const data: ExplorerData = data0, viewport: HTMLElement = viewport0, world: HTMLElement = world0;
  let cfg: ModelConfig;
  try { cfg = JSON.parse(root.dataset.config || '{}'); } catch { return () => {}; }

  const off: Cleanup[] = [];
  const model: Model = buildModel(data, cfg);
  const { nodes, edges, byId } = model;
  const search = $<HTMLInputElement>('[data-mv-search]', root);
  const count = $('[data-mv-count]', root);
  const flowHud = $('[data-mv-flow]', root);
  const live = $('[data-mv-live]', root);
  const miniHost = $('[data-mv-mini]', root);
  const drawer = $('[data-mv-drawer]', root);
  const thesis = $('[data-mv-thesis]', root);
  const mobileMq = matchMedia('(max-width: 759.98px)');
  const motionOff = () => reducedMotion();

  /* ---------------------------------------------------------------- build the cards and the lines */
  const cards = new Map<string, HTMLElement>();
  const rowEls = new Map<string, HTMLElement[]>();
  const tagLabel = (k: string) => data.tags.find((t) => t.key === k)?.label ?? k;

  function buildCard(n: MNode): HTMLElement {
    const a = h('article', `mc mc--${n.type}`);
    a.dataset.node = n.id; a.dataset.type = n.type; a.tabIndex = 0;
    a.style.width = `${n.w}px`; a.style.height = `${n.h}px`;
    const related = edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => byId.get(e.from === n.id ? e.to : e.from)!.title);
    const label = n.type === 'fact' ? `${n.title}. Fact table, ${n.meta}. Filtered by ${related.length} dimensions.`
      : n.type === 'dim' ? `${n.title}. Dimension table, ${n.meta}. Filters ${related.length} reports.`
      : n.type === 'sec' ? 'Live Lab. Security table with persona rows. Use the Persona buttons in the toolbar to apply a row-level security filter to the reports.'
      : `${n.title}. Disconnected table.`;
    a.setAttribute('aria-label', label);
    const head = h('header', 'mc__head'); head.style.height = `${n.head}px`;
    const top = h('div', 'mc__top');
    top.append(h('span', 'mc__kicker mono', n.kicker), h('span', 'mc__meta mono', n.meta));
    const title = h('h2', 'mc__title');
    if (n.href) {
      const l = h('a', 'mc__link', n.title); l.href = n.href; l.tabIndex = -1; l.draggable = false; l.title = n.title;
      if (n.slug) l.dataset.caseOpen = n.slug;
      title.append(l);
    } else { title.textContent = n.title; title.title = n.title; }
    head.append(top, title);
    const ul = h('ul', 'mc__rows');
    const els: HTMLElement[] = [];
    for (const r of n.rows) {
      const li = h('li', 'mc__row');
      li.dataset.q = `${r.k} ${r.v}`.toLowerCase();
      if (r.fk && n.project) li.dataset.q += ' ' + n.project.tags.filter((t) => data.tags.find((x) => x.key === t)?.group === r.fk).map((t) => `${t} ${tagLabel(t)}`).join(' ').toLowerCase();
      if (r.persona) {
        // pointer shortcut only: the accessible persona buttons live in the toolbar (and the mobile drawer), so these rows stay out of the tab order
        const b = h('div', 'mc__persona'); b.dataset.persona = r.persona;
        b.append(h('span', 'mc__k mono', r.k), h('span', 'mc__pv mono', 'off'));
        li.append(b); li.classList.add('mc__row--persona'); li.setAttribute('aria-hidden', 'true');
      } else if (r.href) {
        const l = h('a', 'mc__rowlink'); l.href = r.href; l.draggable = false; l.tabIndex = -1; // pointer shortcut: Enter on the card activates its title link, the list view has every link if (r.external) { l.target = '_blank'; l.rel = 'noopener noreferrer'; }
        l.append(h('span', 'mc__k mono', r.k), h('span', 'mc__v mono', r.v)); li.append(l);
      } else {
        li.append(h('span', 'mc__k mono', r.k));
        const v = h('span', `mc__v mono${r.live ? ' mc__v--live' : ''}`, r.v); li.append(v);
      }
      if (r.fk) li.dataset.fk = r.fk;
      ul.append(li); els.push(li);
    }
    rowEls.set(n.id, els);
    a.append(head, ul);
    if (n.note) a.append(h('p', 'mc__note', n.note));
    a.dataset.q = [n.title, n.kicker, n.meta, n.tag ?? '', ...n.rows.map((r) => `${r.k} ${r.v}`), ...(n.project ? n.project.tags.flatMap((t) => [t, tagLabel(t)]) : [])].join(' ').toLowerCase();
    if (n.portal) a.dataset.portal = '1';
    return a;
  }
  // tab order: reports, dimensions, then the Live Lab, About and Contact
  const order = [...nodes].sort((p, q) => rank(p) - rank(q));
  function rank(n: MNode) { return n.type === 'fact' ? 0 : n.type === 'dim' ? 1 : n.type === 'sec' ? 2 : n.type === 'about' ? 3 : 4; }

  const svg = s('svg', 'mv__edges'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '1'); svg.setAttribute('height', '1');
  interface EdgeEls { g: SVGGElement; path: SVGPathElement; chevs: SVGPathElement[]; a: SVGTextElement; b: SVGTextElement; lab: SVGTextElement | null }
  const edgeEls = new Map<string, EdgeEls>();
  for (const e of edges) {
    const g = s('g', `mv-edge mv-edge--${e.kind}${e.inactive ? ' is-inactive' : ''}${e.bidi ? ' is-bidi' : ''}`); g.dataset.edge = e.id;
    const path = s('path', 'mv-edge__line'); path.setAttribute('vector-effect', 'non-scaling-stroke');
    const chevs = (e.bidi ? [0, 1] : [0]).map(() => { const c = s('path', 'mv-edge__chev'); c.setAttribute('d', 'M-4 -5L3 0L-4 5'); c.setAttribute('vector-effect', 'non-scaling-stroke'); return c; });
    const ta = s('text', 'mv-edge__mark'); ta.textContent = e.a; const tb = s('text', 'mv-edge__mark'); tb.textContent = e.b;
    let lab: SVGTextElement | null = null;
    if (e.label) { lab = s('text', 'mv-edge__label'); lab.textContent = e.label; }
    g.append(path, ...chevs, ta, tb); if (lab) g.append(lab);
    svg.append(g); edgeEls.set(e.id, { g, path, chevs, a: ta, b: tb, lab });
  }
  world.append(svg);
  for (const n of order) { const c = buildCard(n); cards.set(n.id, c); world.append(c); }
  root.dataset.ready = '1';

  /* ---------------------------------------------------------------- layout, camera */
  const springs = new Map<string, Spring>();
  const cam: Cam = { x: 0, y: 0, k: 1 };
  let goal: Cam | null = null;
  let obstacles: Rect[] = [];
  let userMoved = false;
  let vw = 0, vh = 0;
  let minK = 0.1;
  let bucket = '';
  const isMobile = () => mobileMq.matches;

  const place = (n: MNode) => { const c = cards.get(n.id); if (c) c.style.transform = `translate3d(${n.x}px,${n.y}px,0)`; };
  const measure = () => { vw = viewport.clientWidth; vh = viewport.clientHeight; };
  const bucketOf = () => `${isMobile() ? 'm' : 'd'}${Math.round((vw / Math.max(1, vh)) * 4)}`;

  function relayout() {
    measure();
    const mobile = isMobile();
    const fw = vw || 1280, fh = vh || 720;
    const hud = !mobile && thesis ? { w: thesis.offsetWidth || 380, h: thesis.offsetHeight || 200 } : null;
    const mini = !mobile && miniHost ? { w: 176, h: 112 } : null;
    const r = layoutModel(model, { vw: fw, vh: fh, hud, mini, maxCols: mobile ? 2 : 5 });
    obstacles = [r.frame];
    for (const n of nodes) { place(n); }
    springs.clear();
    bucket = bucketOf();
    reroute();
    buildMini();
  }

  function fitCam(): Cam {
    const b = bounds(nodes, obstacles);
    const mobile = isMobile();
    const pad = mobile ? { t: 14, r: 14, b: 66, l: 14 } : { t: 18, r: 18, b: 18, l: 18 };
    const aw = Math.max(40, vw - pad.l - pad.r), ah = Math.max(40, vh - pad.t - pad.b);
    const k = clamp(Math.min(aw / b.w, ah / b.h), 0.05, 1.15);
    return { k, x: pad.l + (aw - b.w * k) / 2 - b.x * k, y: pad.t + (ah - b.h * k) / 2 - b.y * k };
  }
  function updateMinK() { minK = Math.max(0.06, fitCam().k * 0.5); }

  function applyCam() {
    world.style.transform = `translate(${cam.x.toFixed(2)}px,${cam.y.toFixed(2)}px) scale(${cam.k.toFixed(4)})`;
    let gs = 32 * cam.k; while (gs < 14) gs *= 2; while (gs > 64) gs /= 2;
    viewport.style.setProperty('--gs', `${gs.toFixed(2)}px`);
    viewport.style.setProperty('--gx', `${(((cam.x % gs) + gs) % gs).toFixed(2)}px`);
    viewport.style.setProperty('--gy', `${(((cam.y % gs) + gs) % gs).toFixed(2)}px`);
    viewport.style.setProperty('--gx4', `${(((cam.x % (gs * 4)) + gs * 4) % (gs * 4)).toFixed(2)}px`);
    viewport.style.setProperty('--gy4', `${(((cam.y % (gs * 4)) + gs * 4) % (gs * 4)).toFixed(2)}px`);
    root.dataset.zoom = cam.k.toFixed(2);
    drawMiniView();
  }
  function setGoal(g: Cam, instant = false) {
    g = { ...g, k: clamp(g.k, minK, MAX_K) };
    if (instant || motionOff()) { cam.x = g.x; cam.y = g.y; cam.k = g.k; goal = null; applyCam(); } else { goal = g; wake(); }
  }
  function fit(instant = false) { updateMinK(); setGoal(fitCam(), instant); userMoved = false; }
  function zoomAt(cx: number, cy: number, k2: number, base: Cam = cam): Cam {
    const k = clamp(k2, minK, MAX_K);
    return { k, x: cx - ((cx - base.x) / base.k) * k, y: cy - ((cy - base.y) / base.k) * k };
  }
  function frame(r: Rect, maxK = 1.1, padding = 60) {
    const mobile = isMobile();
    const bottom = mobile ? 70 : 0;
    const aw = Math.max(40, vw - padding * 2), ah = Math.max(40, vh - padding * 2 - bottom);
    const k = clamp(Math.min(aw / r.w, ah / r.h), minK, maxK);
    userMoved = true;
    setGoal({ k, x: vw / 2 - (r.x + r.w / 2) * k, y: (vh - bottom) / 2 - (r.y + r.h / 2) * k });
  }
  function centerOn(n: MNode, minZoom: number) {
    const mobile = isMobile();
    const k = clamp(Math.max(cam.k, minZoom), minK, MAX_K);
    userMoved = true;
    setGoal({ k, x: vw / 2 - (n.x + n.w / 2) * k, y: (mobile ? (vh - 70) / 2 : vh / 2) - (n.y + n.h / 2) * k });
  }
  function ensureVisible(n: MNode) {
    const k = cam.k, m = 36, bottom = isMobile() ? 70 : 0;
    const l = n.x * k + cam.x, t = n.y * k + cam.y, r = l + n.w * k, b = t + n.h * k;
    if (l >= m && t >= m && r <= vw - m && b <= vh - m - bottom && k >= 0.45) return;
    centerOn(n, 0.55);
  }
  const worldPt = (cx: number, cy: number) => { const r = viewport.getBoundingClientRect(); return { x: (cx - r.left - cam.x) / cam.k, y: (cy - r.top - cam.y) / cam.k }; };

  /* ---------------------------------------------------------------- routing */
  let routes: Map<string, Route> = new Map();
  let dirty = false;
  function reroute() {
    routes = routeEdges(model);
    for (const e of edges) {
      const r = routes.get(e.id)!, el = edgeEls.get(e.id)!;
      el.path.setAttribute('d', r.d); el.path.dataset.pts = r.pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
      el.chevs.forEach((c, i) => { const p = r.chev[i]; c.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${((p.ang * 180) / Math.PI).toFixed(1)})`); });
      el.a.setAttribute('x', r.markA.x.toFixed(1)); el.a.setAttribute('y', r.markA.y.toFixed(1));
      el.b.setAttribute('x', r.markB.x.toFixed(1)); el.b.setAttribute('y', r.markB.y.toFixed(1));
      if (el.lab) { el.lab.setAttribute('x', r.label.x.toFixed(1)); el.lab.setAttribute('y', r.label.y.toFixed(1)); }
    }
    dirty = false;
    updateMiniRects();
  }

  /** animate every card that was dragged off the grid back to its tidy slot */
  function tidyUp() {
    let any = false;
    for (const n of nodes) {
      if (Math.abs(n.x - n.hx) < 0.5 && Math.abs(n.y - n.hy) < 0.5 && !springs.has(n.id)) continue;
      any = true;
      if (motionOff()) { springs.delete(n.id); n.x = n.hx; n.y = n.hy; place(n); cards.get(n.id)?.removeAttribute('data-dragging'); continue; }
      const sp = springs.get(n.id);
      if (sp) { sp.tx = n.hx; sp.ty = n.hy; sp.held = false; } else springs.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0, tx: n.hx, ty: n.hy, held: false });
    }
    if (!any) return;
    if (motionOff()) reroute(); else wake();
    if (live) live.textContent = 'Tables tidied up.';
  }

  /* ---------------------------------------------------------------- minimap */
  let miniScale = 1, miniOx = 0, miniOy = 0, miniRects = new Map<string, SVGRectElement>(), miniVp: SVGRectElement | null = null, miniSvg: SVGSVGElement | null = null;
  function buildMini() {
    if (!miniHost) return;
    miniHost.replaceChildren(); miniRects = new Map(); miniVp = null; miniSvg = null;
    if (isMobile()) return;
    const mw = 176, mh = 112;
    const b = bounds(nodes, obstacles);
    miniScale = Math.min((mw - 8) / b.w, (mh - 8) / b.h);
    miniOx = (mw - b.w * miniScale) / 2 - b.x * miniScale; miniOy = (mh - b.h * miniScale) / 2 - b.y * miniScale;
    const sv = s('svg', 'mini__svg'); sv.setAttribute('viewBox', `0 0 ${mw} ${mh}`); sv.setAttribute('width', String(mw)); sv.setAttribute('height', String(mh));
    for (const n of nodes) { const r = s('rect', `mini__r mini__r--${n.type}`); sv.append(r); miniRects.set(n.id, r); }
    const vp = s('rect', 'mini__vp'); sv.append(vp); miniVp = vp; miniSvg = sv;
    miniHost.append(sv);
    updateMiniRects(); drawMiniView();
  }
  function updateMiniRects() {
    for (const n of nodes) { const r = miniRects.get(n.id); if (!r) continue; r.setAttribute('x', (n.x * miniScale + miniOx).toFixed(1)); r.setAttribute('y', (n.y * miniScale + miniOy).toFixed(1)); r.setAttribute('width', Math.max(2, n.w * miniScale).toFixed(1)); r.setAttribute('height', Math.max(2, n.h * miniScale).toFixed(1)); }
  }
  function drawMiniView() {
    if (!miniVp) return;
    const x = (-cam.x / cam.k) * miniScale + miniOx, y = (-cam.y / cam.k) * miniScale + miniOy;
    miniVp.setAttribute('x', x.toFixed(1)); miniVp.setAttribute('y', y.toFixed(1));
    miniVp.setAttribute('width', ((vw / cam.k) * miniScale).toFixed(1)); miniVp.setAttribute('height', ((vh / cam.k) * miniScale).toFixed(1));
  }
  if (miniHost) {
    const goTo = (e: PointerEvent) => {
      const r = miniHost.getBoundingClientRect();
      const wx = ((e.clientX - r.left) - miniOx) / miniScale, wy = ((e.clientY - r.top) - miniOy) / miniScale;
      userMoved = true; goal = null;
      cam.x = vw / 2 - wx * cam.k; cam.y = vh / 2 - wy * cam.k; applyCam();
    };
    let down = false;
    off.push(on(miniHost, 'pointerdown', (e: PointerEvent) => { down = true; miniHost.setPointerCapture(e.pointerId); goTo(e); e.preventDefault(); }));
    off.push(on(miniHost, 'pointermove', (e: PointerEvent) => { if (down) goTo(e); }));
    off.push(on(miniHost, 'pointerup', () => { down = false; }));
    off.push(on(miniHost, 'pointercancel', () => { down = false; }));
  }

  /* ---------------------------------------------------------------- animation loop (camera ease + card springs) */
  let raf = 0, last = 0;
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(t: number) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000)); last = t;
    let busy = false;
    if (goal) {
      const a = 1 - Math.exp(-dt * 9);
      cam.x += (goal.x - cam.x) * a; cam.y += (goal.y - cam.y) * a; cam.k += (goal.k - cam.k) * a;
      if (Math.abs(goal.x - cam.x) < 0.3 && Math.abs(goal.y - cam.y) < 0.3 && Math.abs(goal.k - cam.k) < 0.0008) { cam.x = goal.x; cam.y = goal.y; cam.k = goal.k; goal = null; } else busy = true;
      applyCam();
    }
    for (const [id, sp] of springs) {
      const n = byId.get(id)!;
      const K = 360, C = 22;
      sp.vx += (K * (sp.tx - sp.x) - C * sp.vx) * dt; sp.vy += (K * (sp.ty - sp.y) - C * sp.vy) * dt;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      const settled = !sp.held && Math.abs(sp.tx - sp.x) < 0.2 && Math.abs(sp.ty - sp.y) < 0.2 && Math.abs(sp.vx) < 2 && Math.abs(sp.vy) < 2;
      if (settled) { sp.x = sp.tx; sp.y = sp.ty; sp.vx = sp.vy = 0; }
      n.x = sp.x; n.y = sp.y; place(n); dirty = true;
      if (settled) { n.x = Math.round(n.x); n.y = Math.round(n.y); place(n); springs.delete(id); cards.get(id)?.removeAttribute('data-dragging'); } else busy = true;
    }
    if (dirty) reroute();
    if (busy) wake();
  }

  /* ---------------------------------------------------------------- highlight: filter propagation */
  let hoverId: string | null = null, focusId: string | null = null, dragId: string | null = null, curHl: string | null = null;
  function applyHighlight(id: string | null) {
    if (id === curHl) return;
    curHl = id;
    for (const c of cards.values()) c.removeAttribute('data-flow');
    for (const el of edgeEls.values()) el.g.classList.remove('is-lit');
    if (!id || !byId.has(id)) { world.removeAttribute('data-active'); return; }
    const hl = propagate(id, edges);
    world.dataset.active = '1';
    for (const [nid, f] of hl.nodes) cards.get(nid)?.setAttribute('data-flow', f);
    for (const eid of hl.edges) edgeEls.get(eid)?.g.classList.add('is-lit');
  }
  const refreshHl = () => applyHighlight(dragId ?? hoverId ?? focusId);
  const cardOf = (t: EventTarget | null) => ((t as Element | null)?.closest('.mc') as HTMLElement | null) ?? null;
  off.push(on(viewport, 'mouseover', (e: MouseEvent) => { hoverId = cardOf(e.target)?.dataset.node ?? null; refreshHl(); }));
  off.push(on(viewport, 'mouseleave', () => { hoverId = null; refreshHl(); }));
  off.push(on(viewport, 'focusin', (e: FocusEvent) => {
    const c = cardOf(e.target);
    focusId = c?.dataset.node ?? null; refreshHl();
    if (c && (e.target as HTMLElement).matches(':focus-visible')) { const n = byId.get(c.dataset.node!); if (n) ensureVisible(n); }
  }));
  off.push(on(viewport, 'focusout', (e: FocusEvent) => { if (!viewport.contains(e.relatedTarget as Node | null) || !cardOf(e.relatedTarget)) { focusId = null; refreshHl(); } else focusId = cardOf(e.relatedTarget)!.dataset.node ?? null; }));

  /* ---------------------------------------------------------------- pointer: pan, pinch, drag cards */
  const ptrs = new Map<number, Ptr>();
  let suppressUntil = 0;
  let pinchPrev: { d: number; cx: number; cy: number } | null = null;
  const pinchState = () => { const [a, b] = [...ptrs.values()]; const r = viewport.getBoundingClientRect(); return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top }; };
  function endCardDrag(p: Ptr) {
    const id = p.card?.dataset.node; if (!id) return;
    const sp = springs.get(id); if (sp) { sp.held = false; wake(); }
    dragId = null; refreshHl();
  }
  off.push(on(viewport, 'pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest('button, input, textarea, select')) return;
    const card = cardOf(t);
    const p: Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, card, cardOk: !!card && (e.pointerType !== 'touch' || !!t.closest('.mc__head')), mode: 'wait', gx: 0, gy: 0 };
    if (card) { const n = byId.get(card.dataset.node!)!; const w = worldPt(e.clientX, e.clientY); p.gx = w.x - n.x; p.gy = w.y - n.y; }
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      for (const q of ptrs.values()) { if (q.mode === 'card') endCardDrag(q); q.mode = 'pinch'; }
      pinchPrev = pinchState(); goal = null;
      try { viewport.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }));
  off.push(on(viewport, 'pointermove', (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (p.mode === 'pinch') {
      if (ptrs.size < 2 || !pinchPrev) return;
      const now = pinchState();
      const z = zoomAt(now.cx, now.cy, cam.k * (now.d / pinchPrev.d));
      cam.k = z.k; cam.x = z.x + (now.cx - pinchPrev.cx); cam.y = z.y + (now.cy - pinchPrev.cy);
      pinchPrev = now; userMoved = true; goal = null; applyCam(); return;
    }
    if (p.mode === 'wait') {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) return;
      p.mode = p.cardOk ? 'card' : 'pan';
      try { viewport.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      suppressUntil = Infinity; goal = null;
      if (p.mode === 'card') {
        const id = p.card!.dataset.node!, n = byId.get(id)!;
        springs.set(id, { x: n.x, y: n.y, vx: 0, vy: 0, tx: n.x, ty: n.y, held: true });
        p.card!.dataset.dragging = '1'; dragId = id; refreshHl(); p.card!.focus({ preventScroll: true });
      } else viewport.classList.add('is-panning');
    }
    if (p.mode === 'pan') { cam.x += dx; cam.y += dy; userMoved = true; applyCam(); }
    else if (p.mode === 'card') {
      const sp = springs.get(p.card!.dataset.node!); if (!sp) return;
      const w = worldPt(e.clientX, e.clientY);
      sp.tx = w.x - p.gx; sp.ty = w.y - p.gy;
      if (motionOff()) { sp.x = sp.tx; sp.y = sp.ty; const n = byId.get(p.card!.dataset.node!)!; n.x = sp.x; n.y = sp.y; place(n); reroute(); } else wake();
    }
  }));
  const release = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.mode === 'card') { endCardDrag(p); if (motionOff()) { const id = p.card!.dataset.node!; springs.delete(id); p.card!.removeAttribute('data-dragging'); } }
    if (p.mode === 'card' || p.mode === 'pan') suppressUntil = performance.now() + 80;
    if (ptrs.size < 2) pinchPrev = null;
    if (ptrs.size === 0) viewport.classList.remove('is-panning');
    if (p.mode === 'pinch') { suppressUntil = performance.now() + 80; for (const q of ptrs.values()) q.mode = 'wait'; }
    try { viewport.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  off.push(on(viewport, 'pointerup', release));
  off.push(on(viewport, 'pointercancel', release));
  // A drag must never count as a click: window capture runs before the case panel's own capture listener on document.
  off.push(on(window, 'click', (e: MouseEvent) => {
    if (performance.now() < suppressUntil && viewport.contains(e.target as Node)) { e.preventDefault(); e.stopImmediatePropagation(); }
    suppressUntil = 0;
  }, { capture: true }));
  off.push(on(viewport, 'dragstart', (e) => e.preventDefault()));

  off.push(on(viewport, 'wheel', (e: WheelEvent) => {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    const f = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.011 : 0.0016));
    const k2 = clamp(cam.k * f, minK, MAX_K);
    if (Math.abs(k2 - cam.k) < 1e-6) return; // at a zoom limit: let the page scroll
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    const z = zoomAt(e.clientX - r.left, e.clientY - r.top, k2);
    cam.x = z.x; cam.y = z.y; cam.k = z.k; goal = null; userMoved = true; applyCam();
  }, { passive: false }));

  /* ---------------------------------------------------------------- keyboard and card activation */
  const openCase = (slug: string, from: HTMLElement) => document.dispatchEvent(new CustomEvent('case:open', { detail: { slug, from } }));
  off.push(on(viewport, 'keydown', (e: KeyboardEvent) => {
    if (e.target === viewport) {
      const step = e.shiftKey ? 240 : 90;
      const mv: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (mv[e.key]) { e.preventDefault(); userMoved = true; setGoal({ ...cam, x: (goal ?? cam).x + mv[e.key][0], y: (goal ?? cam).y + mv[e.key][1] }); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.3); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.3); return; }
      if (e.key === '0') { e.preventDefault(); fit(); return; }
    }
    const card = cardOf(e.target);
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
      const n = byId.get(card.dataset.node!)!;
      e.preventDefault();
      if (n.type === 'fact' && n.slug) openCase(n.slug, card);
      else if (n.type === 'dim' && search) { search.value = n.tag ?? n.title; applySearch(); }
      else (card.querySelector('.mc__link') as HTMLAnchorElement | null)?.click();
    }
    if (e.key === 'Escape' && search?.value) { search.value = ''; applySearch(); }
  }));
  off.push(on(viewport, 'click', (e: MouseEvent) => {
    // clicking the body of a report card opens it too (the title link handles itself via data-case-open)
    const t = e.target as Element; const card = cardOf(t);
    if (!card || t.closest('a, button')) return;
    const n = byId.get(card.dataset.node!);
    if (n?.type === 'fact' && n.slug) openCase(n.slug, card);
  }));
  off.push(on(document, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !search) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]') || root.dataset.mode === 'list') return;
    e.preventDefault(); search.focus(); search.select();
  }));

  function zoomBy(f: number) { const z = zoomAt(vw / 2, vh / 2, (goal ?? cam).k * f, goal ?? cam); userMoved = true; setGoal(z); }
  const btn = (sel: string, fn: () => void) => { const b = $(sel, root); if (b) off.push(on(b, 'click', fn)); };
  btn('[data-mv-zoom-in]', () => zoomBy(1.3));
  btn('[data-mv-zoom-out]', () => zoomBy(1 / 1.3));
  btn('[data-mv-tidy]', tidyUp);
  btn('[data-mv-fit]', () => { if (search) { search.value = ''; applySearch(false); } fit(); });

  /* ---------------------------------------------------------------- search fields */
  function applySearch(doFrame = true) {
    const tokens = (search?.value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const hits: MNode[] = [];
    for (const n of nodes) {
      const c = cards.get(n.id)!;
      const ok = tokens.length > 0 && tokens.every((t) => c.dataset.q!.includes(t));
      c.toggleAttribute('data-hit', ok);
      (rowEls.get(n.id) ?? []).forEach((r) => r.toggleAttribute('data-hit', ok && tokens.some((t) => r.dataset.q!.includes(t))));
      if (ok) hits.push(n);
    }
    world.toggleAttribute('data-search', tokens.length > 0);
    if (count) count.textContent = tokens.length ? `${hits.length} of ${nodes.length}` : '';
    if (tokens.length && doFrame && hits.length) frame(bounds(hits), 1.05, 70);
    else if (!tokens.length && doFrame && search && document.activeElement === search) fit();
    renderDrawer();
  }
  if (search) {
    off.push(on(search, 'input', () => applySearch()));
    off.push(on(search, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (search.value) { search.value = ''; applySearch(); } else viewport.focus({ preventScroll: true }); }
      if (e.key === 'Enter') { e.preventDefault(); const first = nodes.find((n) => cards.get(n.id)!.hasAttribute('data-hit')); if (first) cards.get(first.id)!.focus({ preventScroll: true }); }
    }));
    const form = search.closest('form'); if (form) off.push(on(form, 'submit', (e) => e.preventDefault()));
  }

  /* ---------------------------------------------------------------- persona (RLS demo) */
  let persona: string | null = null;
  const personaBtns: HTMLElement[] = [];
  function setPersona(p: string | null) {
    persona = p;
    const filtering = !!p && p !== 'admin' && model.portals.length > 0;
    if (p) world.dataset.persona = p; else world.removeAttribute('data-persona');
    let shown = 0;
    for (const n of nodes) if (n.type === 'fact') { const out = filtering && !n.portal; cards.get(n.id)!.toggleAttribute('data-persona-out', out); if (!out) shown++; }
    for (const e of edges) if (e.kind === 'sec') edgeEls.get(e.id)!.g.classList.toggle('is-filter', filtering);
    for (const b of personaBtns) {
      const on = b.dataset.persona === p;
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(on)); else b.toggleAttribute('data-on', on);
      const v = b.querySelector('.mc__pv, .dr__pv'); if (v) v.textContent = on ? (filtering ? 'filter on' : 'no filter') : 'off';
    }
    const total = nodes.filter((n) => n.type === 'fact').length;
    const label = p ? p[0].toUpperCase() + p.slice(1) : '';
    const msg = !p ? '' : filtering ? `${label} role applied. ${shown} of ${total} reports pass the row-level security filter. The rest fade because they have no portal role.` : `${label} role applied. Admin has no row filter, so all ${total} reports stay visible.`;
    if (flowHud) { flowHud.textContent = msg; flowHud.hidden = !msg; }
    if (live) live.textContent = msg || 'Persona filter cleared.';
    root.querySelectorAll('[data-dr-flow]').forEach((x) => { x.textContent = msg; (x as HTMLElement).hidden = !msg; });
  }
  const onPersona = (e: Event) => { const b = (e.target as Element).closest<HTMLElement>('[data-persona]'); if (!b) return; setPersona(persona === b.dataset.persona ? null : b.dataset.persona!); };
  off.push(on(world, 'click', onPersona));
  const barPersona = $('[data-mv-persona]', root);
  if (barPersona) off.push(on(barPersona, 'click', onPersona));
  const collectPersona = () => { personaBtns.length = 0; personaBtns.push(...$$('.mc__persona', world), ...$$('[data-persona]', barPersona ?? world).filter((x) => x.tagName === 'BUTTON'), ...(drawer ? $$('.dr__pbtn', drawer) : [])); };
  collectPersona();

  /* ---------------------------------------------------------------- mobile drawer */
  let drawerOpen = false;
  function renderDrawer() {
    if (!drawer) return;
    const wasOpen = drawerOpen;
    const prevToggleFocus = document.activeElement?.id === 'mv-drawer-toggle';
    drawer.replaceChildren();
    const tg = h('button', 'dr__toggle'); tg.type = 'button'; tg.id = 'mv-drawer-toggle'; tg.setAttribute('aria-expanded', String(wasOpen)); tg.setAttribute('aria-controls', 'mv-drawer-panel');
    tg.append(h('span', 'dr__grip'), h('span', 'dr__t', `All tables (${nodes.length}) and persona`), h('span', 'dr__chev'));
    const panel = h('div', 'dr__panel'); panel.dataset.lenisPrevent = ''; panel.id = 'mv-drawer-panel'; panel.hidden = !wasOpen;
    if (cfg.liveHref) {
      const grp = h('div', 'dr__persona'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'Persona, a row-level security demo');
      grp.append(h('p', 'dr__lead', 'Persona. Reports without a portal role fade.'));
      const row = h('div', 'dr__pbtns');
      for (const name of cfg.personas) { const b = h('button', 'dr__pbtn'); b.type = 'button'; b.dataset.persona = name.toLowerCase(); b.setAttribute('aria-pressed', String(persona === name.toLowerCase())); b.append(h('span', undefined, name), h('span', 'dr__pv mono', persona === name.toLowerCase() ? 'on' : 'off')); row.append(b); }
      grp.append(row);
      const fl = h('p', 'dr__flow'); fl.dataset.drFlow = ''; fl.hidden = true; grp.append(fl);
      panel.append(grp);
    }
    const ul = h('ul', 'dr__list');
    const q = (search?.value ?? '').trim();
    for (const n of order) {
      const li = h('li', 'dr__item');
      const b = h('button', 'dr__loc'); b.type = 'button'; b.dataset.locate = n.id;
      b.append(h('span', 'dr__k mono', n.type === 'fact' ? 'fact' : n.type === 'dim' ? 'dim' : n.type), h('span', 'dr__n', n.title));
      if (q && cards.get(n.id)?.hasAttribute('data-hit')) li.dataset.hit = '1';
      li.append(b);
      if (n.type === 'fact' && n.slug && n.href) { const a = h('a', 'dr__open', 'Open'); a.href = n.href; a.dataset.caseOpen = n.slug; a.setAttribute('aria-label', `Open case study: ${n.title}`); li.append(a); }
      else if ((n.type === 'sec' || n.type === 'about') && n.href) { const a = h('a', 'dr__open', 'Visit'); a.href = n.href; a.setAttribute('aria-label', `Visit ${n.title} page`); li.append(a); }
      ul.append(li);
    }
    panel.append(ul);
    drawer.append(tg, panel);
    drawer.hidden = false; drawer.dataset.open = String(wasOpen);
    collectPersona();
    if (persona) setPersonaUi();
    if (prevToggleFocus) tg.focus({ preventScroll: true });
  }
  function setPersonaUi() { const p = persona; persona = null; setPersona(p); }
  function toggleDrawer(open: boolean) {
    drawerOpen = open; drawer!.dataset.open = String(open);
    $('#mv-drawer-toggle', drawer!)?.setAttribute('aria-expanded', String(open));
    const panel = $('#mv-drawer-panel', drawer!); if (panel) panel.hidden = !open;
  }
  if (drawer) {
    off.push(on(drawer, 'click', (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest('#mv-drawer-toggle')) { toggleDrawer(!drawerOpen); return; }
      const pb = t.closest<HTMLButtonElement>('[data-persona]'); if (pb) { onPersona(e); return; }
      const loc = t.closest<HTMLElement>('[data-locate]');
      if (loc) { const n = byId.get(loc.dataset.locate!); if (n) { toggleDrawer(false); centerOn(n, 0.85); focusId = n.id; refreshHl(); cards.get(n.id)?.focus({ preventScroll: true }); } }
    }));
    off.push(on(drawer, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && drawerOpen) { toggleDrawer(false); $('#mv-drawer-toggle', drawer)?.focus(); } }));
    renderDrawer();
  }

  /* ---------------------------------------------------------------- list / diagram toggle */
  const lt = $<HTMLButtonElement>('[data-mv-list-toggle]', root);
  if (lt) off.push(on(lt, 'click', () => {
    const list = root.dataset.mode !== 'list';
    root.dataset.mode = list ? 'list' : 'diagram';
    lt.setAttribute('aria-pressed', String(list)); lt.textContent = list ? 'Diagram view' : 'List view';
    if (!list) { measure(); userMoved = false; relayoutIfNeeded(); fit(true); }
  }));

  /* ---------------------------------------------------------------- resize, theme, motion */
  function relayoutIfNeeded() { if (bucketOf() !== bucket) relayout(); }
  const ro = new ResizeObserver(() => {
    const w = viewport.clientWidth, hh = viewport.clientHeight;
    if (!w || !hh || (w === vw && hh === vh)) return;
    const first = vw === 0;
    measure(); syncTop();
    if (first || bucketOf() !== bucket) relayout();
    updateMinK();
    if (!userMoved || first) fit(true); else { setGoal({ ...cam }, true); drawMiniView(); }
  });
  ro.observe(viewport);
  // Colours come from CSS custom properties, so a theme switch repaints by itself; the event only needs to refresh derived state.
  off.push(on(window, 'themechange', () => { root.dataset.theme = document.documentElement.dataset.theme ?? ''; drawMiniView(); }));

  /* ---------------------------------------------------------------- first frame */
  // the thesis box floats over the top-left of the canvas, just below the toolbar (whatever height that has wrapped to)
  const syncTop = () => { root.style.setProperty('--mv-top', `${stage0.offsetTop}px`); };
  syncTop();
  relayout();
  updateMinK();
  fit(true);
  applyCam();
  renderDrawer();
  // The display face loads after the first frame; if it changes the thesis box, re-run the (cached, deterministic) layout once.
  let alive = true; off.push(() => { alive = false; });
  const hudH0 = thesis?.offsetHeight ?? 0;
  void document.fonts?.ready.then(() => {
    if (!alive || !thesis || isMobile()) return;
    if (Math.abs(thesis.offsetHeight - hudH0) > 8 && !userMoved && springs.size === 0) { relayout(); updateMinK(); fit(true); }
  });

  return () => {
    off.forEach((f) => { try { f(); } catch { /* ignore */ } });
    ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    raf = 0; springs.clear(); ptrs.clear();
    world.replaceChildren(); world.removeAttribute('style'); world.removeAttribute('data-active'); world.removeAttribute('data-persona'); world.removeAttribute('data-search');
    viewport.removeAttribute('style'); viewport.classList.remove('is-panning'); root.style.removeProperty('--mv-top');
    miniHost?.replaceChildren(); drawer?.replaceChildren(); if (drawer) drawer.hidden = true;
    if (flowHud) { flowHud.hidden = true; flowHud.textContent = ''; }
    $$('[data-mv-persona] button', root).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    if (search) search.value = ''; if (count) count.textContent = '';
    root.removeAttribute('data-ready'); root.removeAttribute('data-zoom'); root.dataset.mode = 'diagram';
    if (lt) { lt.setAttribute('aria-pressed', 'false'); lt.textContent = 'List view'; }
  };
}

export const initModelStage: Init = () => {
  const root = $('[data-model-stage]');
  if (!root) return;
  let teardown: Cleanup | null = null;
  const stopLayout = onLayout((l) => {
    teardown?.(); teardown = null;
    if (l === 'model') teardown = mount(root);
  });
  return () => { stopLayout(); teardown?.(); teardown = null; };
};
