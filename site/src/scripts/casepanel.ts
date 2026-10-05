import { $, on, type Cleanup, type Init } from './util';
import { lenisControl } from './motion';
import type { ExplorerData, ExplorerCase, ExplorerProject } from '../lib/explorer';

let data: ExplorerData | null = null;
const readData = (): ExplorerData | null => {
  if (data) return data;
  const el = document.getElementById('explorer-data');
  try { data = el ? (JSON.parse(el.textContent || '{}') as ExplorerData) : null; } catch { data = null; }
  return data;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

function render(body: HTMLElement, p: ExplorerProject, c: ExplorerCase, d: ExplorerData) {
  body.replaceChildren();
  const head = el('header', 'case__head');
  const meta = [p.kind === 'paginated' ? 'Paginated report' : p.kind === 'pipeline' ? 'Pipeline' : 'Report', String(p.year), p.label].filter(Boolean).join(' · ');
  head.append(el('p', 'case__meta mono', meta));
  const h = el('h2', 'case__title', p.title); h.id = 'case-title';
  head.append(h, el('p', 'case__summary', p.summary));
  const tagRow = el('ul', 'case__tags'); tagRow.setAttribute('aria-label', 'Tags');
  for (const k of p.tags) { const t = d.tags.find((x) => x.key === k); const li = el('li', undefined, t?.label ?? k); if (t) li.style.setProperty('--chip', t.color); tagRow.append(li); }
  head.append(tagRow);
  body.append(head);

  if (c.facts.length) {
    const dl = el('dl', 'case__facts');
    for (const f of c.facts) { const w = el('div'); w.append(el('dt', 'mono', f.k), el('dd', undefined, f.v)); dl.append(w); }
    body.append(dl);
  }
  const hero = c.video ?? c.poster ?? p.cover?.src ?? null;
  if (hero) {
    const fig = el('figure', 'case__media');
    if (c.video) { const v = document.createElement('video'); v.src = c.video; v.controls = true; v.muted = true; v.playsInline = true; v.preload = 'none'; if (c.poster) v.poster = c.poster; fig.append(v); }
    else { const img = document.createElement('img'); img.src = hero; img.alt = `${p.title}, report screenshot`; img.loading = 'lazy'; img.decoding = 'async'; fig.append(img); }
    body.append(fig);
  }
  if (c.intro.trim()) { const s = el('div', 'case__intro prose'); s.innerHTML = c.intro; body.append(s); }
  for (const ch of c.chapters) {
    const s = el('section', 'case__chapter');
    s.append(el('h3', undefined, ch.name));
    const prose = el('div', 'prose'); prose.innerHTML = ch.html; s.append(prose);
    body.append(s);
  }
  if (c.measures.length) {
    const s = el('section', 'case__chapter');
    s.append(el('h3', undefined, 'Featured DAX'));
    for (const m of c.measures) { const w = el('div', 'case__measure'); w.append(el('p', 'mono', m.name)); const pre = el('pre'); pre.append(el('code', undefined, m.dax)); w.append(pre); s.append(w); }
    body.append(s);
  }
  if (c.gallery.length) {
    const s = el('section', 'case__chapter'); s.append(el('h3', undefined, 'Report pages'));
    const g = el('div', 'case__gallery');
    for (const x of c.gallery) { const img = document.createElement('img'); img.src = x.thumb ?? x.src; img.alt = x.title || `${p.title}, page`; img.loading = 'lazy'; img.decoding = 'async'; g.append(img); }
    s.append(g); body.append(s);
  }
  const foot = el('footer', 'case__foot');
  const full = el('a', 'btn', 'Open the full page'); full.href = p.href; foot.append(full);
  if (c.liveHref) { const live = el('a', 'btn btn--primary', 'Try it in the Live Lab'); live.href = c.liveHref; foot.append(live); }
  body.append(foot);
}

export const initCasePanel: Init = () => {
  const dlg = $<HTMLDialogElement>('#case-panel');
  const body = $('[data-case-body]');
  const scroller = $('[data-case-scroll]');
  const kicker = $('[data-case-kicker]');
  if (!dlg || !body) return;
  const off: Cleanup[] = [];
  let slug: string | null = null;
  let opener: HTMLElement | null = null;

  const show = (next: string, from?: HTMLElement | null) => {
    const d = readData(); const p = d?.projects.find((x) => x.slug === next); const c = d?.cases[next];
    if (!d || !p || !c) return false;
    slug = next;
    render(body, p, c, d);
    const i = d.projects.findIndex((x) => x.slug === next);
    if (kicker) kicker.textContent = `${i + 1} of ${d.projects.length}`;
    if (!dlg.open) { opener = from ?? (document.activeElement as HTMLElement | null); dlg.showModal(); lenisControl(false); }
    scroller?.scrollTo({ top: 0 });
    dlg.dispatchEvent(new CustomEvent('casechange', { detail: next }));
    return true;
  };
  const step = (dir: number) => { const d = readData(); if (!d || !slug) return; const i = d.projects.findIndex((x) => x.slug === slug); show(d.projects[(i + dir + d.projects.length) % d.projects.length].slug); };

  off.push(on(document, 'case:open' as any, (e: CustomEvent<{ slug: string; from?: HTMLElement }>) => { show(e.detail.slug, e.detail.from); }));
  // capture phase: runs before the view-transition router, which would otherwise navigate to the project page first
  off.push(on(document, 'click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-case-open]');
    if (t && show(t.dataset.caseOpen!, t)) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true }));
  off.push(on($('[data-case-prev]')!, 'click', () => step(-1)));
  off.push(on($('[data-case-next]')!, 'click', () => step(1)));
  off.push(on($('[data-case-close]')!, 'click', () => dlg.close()));
  off.push(on(dlg, 'click', (e) => { if (e.target === dlg) dlg.close(); }));
  off.push(on(dlg, 'keydown', (e: KeyboardEvent) => { if (e.key === 'ArrowRight' && !(e.target as HTMLElement).closest('video,input,textarea')) step(1); else if (e.key === 'ArrowLeft' && !(e.target as HTMLElement).closest('video,input,textarea')) step(-1); }));
  off.push(on(dlg, 'close', () => { lenisControl(true); slug = null; body.replaceChildren(); opener?.focus?.(); opener = null; dlg.dispatchEvent(new CustomEvent('caseclose')); }));
  off.push(() => { if (dlg.open) dlg.close(); });
  return () => off.forEach((f) => f());
};
