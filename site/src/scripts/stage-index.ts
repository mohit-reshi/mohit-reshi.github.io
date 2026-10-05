import { $, $$, on, reducedMotion, type Cleanup, type Init } from './util';
import { onLayout } from './layout';
import { drawArt, readPalette } from './index-art';

/**
 * Index layout behaviour: filter chips, floating hover/focus preview, procedural thumbnails, one entrance.
 * Everything is set up only while <html data-layout="index"> and fully torn down otherwise.
 */
const EASE = 'cubic-bezier(0.2, 0.7, 0.1, 1)';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function activate(root: HTMLElement): Cleanup {
  const off: Cleanup[] = [];
  let preview: ReturnType<typeof makePreview> | null = null;
  const anims: Animation[] = [];
  const list = $<HTMLElement>('[data-ix-list]', root);
  const rows = $$<HTMLAnchorElement>('[data-ix-row]', root);
  const li = (r: HTMLElement) => r.closest('li') as HTMLElement;
  const visibleRows = () => rows.filter((r) => !li(r).hidden);
  const data = (() => { try { return JSON.parse($('#explorer-data')?.textContent || '{}'); } catch { return {}; } })() as { projects?: Array<{ slug: string; kind: string; measures: number; tables: number; cover: { src: string } | null }> };
  const info = new Map((data.projects ?? []).map((p) => [p.slug, p]));

  /* ---------- procedural art: thumbs now, preview media on demand ---------- */
  const canvases = new Map<HTMLCanvasElement, { seed: string; w: number; h: number }>();
  const paint = () => { const pal = readPalette(); const dpr = Math.min(2, window.devicePixelRatio || 1); canvases.forEach((m, c) => drawArt(c, m.w, m.h, m.seed, pal, dpr)); };
  const makeCanvas = (seed: string, w: number, h: number) => { const c = document.createElement('canvas'); canvases.set(c, { seed, w, h }); drawArt(c, w, h, seed, readPalette(), Math.min(2, window.devicePixelRatio || 1)); return c; };
  rows.forEach((r) => { const t = $('[data-ix-thumb]', r); if (t && !t.querySelector('img')) t.append(makeCanvas(r.dataset.slug || '', 208, 130)); });
  const themeObs = new MutationObserver(paint);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  off.push(() => { themeObs.disconnect(); canvases.forEach((_, c) => c.remove()); canvases.clear(); });

  /* ---------- filters ---------- */
  const status = $('[data-ix-status]', root);
  const empty = $('[data-ix-empty]', root);
  const groupBtns = $$<HTMLButtonElement>('[data-ix-group]', root);
  const tagBtns = $$<HTMLButtonElement>('[data-ix-tag]', root);
  let group = 'all', tag = 'all';
  const matches = (r: HTMLElement, g: string, t: string) => (g === 'all' || r.dataset.group === g) && (t === 'all' || (r.dataset.tags || '').split(' ').includes(t));
  const label = (n: number) => `${n} project${n === 1 ? '' : 's'}`;
  const hidePreview = () => preview?.hide();
  const apply = (announce: boolean) => {
    let n = 0;
    rows.forEach((r) => { const ok = matches(r, group, tag); li(r).hidden = !ok; if (ok) n++; });
    groupBtns.forEach((b) => { const k = b.dataset.ixGroup!; b.setAttribute('aria-pressed', String(k === group)); const s = $('small', b); if (s) s.textContent = String(rows.filter((r) => matches(r, k, tag)).length); });
    tagBtns.forEach((b) => { const k = b.dataset.ixTag!; b.setAttribute('aria-pressed', String(k === tag)); if (k === 'all') return; const c = rows.filter((r) => matches(r, group, k)).length; const s = $('small', b); if (s) s.textContent = String(c); b.dataset.zero = c ? '0' : '1'; });
    if (empty) empty.hidden = n > 0;
    if (status && announce) status.textContent = (group === 'all' && tag === 'all') ? label(n) : `Showing ${n} of ${rows.length} projects`;
    hidePreview();
    if (announce) restage(visibleRows().slice(0, 8));
  };
  groupBtns.forEach((b) => off.push(on(b, 'click', () => { group = b.dataset.ixGroup!; apply(true); })));
  tagBtns.forEach((b) => off.push(on(b, 'click', () => { tag = tag === b.dataset.ixTag ? 'all' : b.dataset.ixTag!; apply(true); })));
  const reset = $('[data-ix-reset]', root);
  if (reset) off.push(on(reset, 'click', () => { group = 'all'; tag = 'all'; apply(true); ($('[data-ix-group="all"]', root) ?? $('[data-ix-tag="all"]', root))?.focus(); }));
  apply(false);

  /* ---------- keyboard: arrows move between visible rows (Tab order is untouched) ---------- */
  if (list) off.push(on(list, 'keydown', (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const cur = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-ix-row]'); if (!cur) return;
    const v = visibleRows(); const i = v.indexOf(cur);
    const to = e.key === 'ArrowDown' ? v[i + 1] : e.key === 'ArrowUp' ? v[i - 1] : e.key === 'Home' ? v[0] : e.key === 'End' ? v[v.length - 1] : null;
    if (to) { e.preventDefault(); to.focus(); } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) e.preventDefault();
  }));

  /* ---------- selected row follows the case panel ---------- */
  const dlg = $('#case-panel');
  const mark = (slug: string | null) => rows.forEach((r) => (r.dataset.slug === slug ? r.setAttribute('data-selected', '') : r.removeAttribute('data-selected')));
  if (dlg) {
    off.push(on(dlg, 'casechange', (e: CustomEvent<string>) => mark(e.detail)));
    off.push(on(dlg, 'caseclose', () => mark(null)));
  }

  /* ---------- hover and focus preview ---------- */
  const mqs = [matchMedia('(hover: hover) and (pointer: fine)'), matchMedia('(min-width: 56.01rem)'), matchMedia('(prefers-reduced-motion: reduce)')];
  // the preview is not motion-heavy: with reduced motion it still shows, but snaps to the pointer instead of easing
  const canPreview = () => mqs[0].matches && mqs[1].matches;
  function makePreview() {
    const el = document.createElement('div'); el.className = 'ix-preview'; el.setAttribute('aria-hidden', 'true');
    const media = document.createElement('div'); media.className = 'ix-preview__media';
    const cap = document.createElement('div'); cap.className = 'ix-preview__cap';
    const capL = document.createElement('span'), capR = document.createElement('span'); cap.append(capL, capR);
    el.append(media, cap); root.append(el);
    const cache = new Map<string, HTMLElement>();
    let slug = '', row: HTMLElement | null = null, mode: 'pointer' | 'focus' = 'pointer';
    const cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }; let shown = false, raf = 0;
    let last = { x: 0, y: 0 };
    const place = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (mode === 'pointer') { tgt.x = last.x + 28 + w > innerWidth - 12 ? last.x - w - 28 : last.x + 28; tgt.y = clamp(last.y - h / 2, 12, innerHeight - h - 12); }
      else if (row) { const rr = row.getBoundingClientRect(); const m = $('[data-ix-meta]', row)?.getBoundingClientRect(); tgt.x = clamp((m ? m.left : rr.right) - w - 32, 12, innerWidth - w - 12); tgt.y = clamp(rr.top + rr.height / 2 - h / 2, 12, innerHeight - h - 12); }
    };
    const frame = () => {
      raf = 0;
      const dx = tgt.x - cur.x, dy = tgt.y - cur.y;
      const k = reducedMotion() ? 1 : 0.18;
      cur.x += dx * k; cur.y += dy * k;
      el.style.transform = `translate3d(${cur.x.toFixed(1)}px,${cur.y.toFixed(1)}px,0) rotate(${reducedMotion() ? 0 : clamp(dx * 0.012, -3, 3).toFixed(2)}deg)`;
      if (shown || Math.abs(dx) + Math.abs(dy) > 0.4) raf = requestAnimationFrame(frame);
    };
    const setMedia = (s: string) => {
      let m = cache.get(s);
      if (!m) {
        const p = info.get(s);
        if (p?.cover) { const i = document.createElement('img'); i.src = p.cover.src; i.alt = ''; i.decoding = 'async'; m = i; }
        else m = makeCanvas(s, 352, 220);
        cache.set(s, m);
      }
      media.replaceChildren(m);
    };
    const show = (r: HTMLElement, md: 'pointer' | 'focus', x = 0, y = 0) => {
      const s = r.dataset.slug || '';
      mode = md; row = r; last = { x, y };
      if (s !== slug) { slug = s; setMedia(s); const p = info.get(s); capL.textContent = p ? `${p.measures} measures` : ''; capR.textContent = p ? `${p.tables} tables` : ''; }
      place();
      if (!shown) { cur.x = tgt.x; cur.y = tgt.y; shown = true; el.setAttribute('data-on', ''); }
      list?.setAttribute('data-active', slug);
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const hide = () => { shown = false; slug = ''; row = null; el.removeAttribute('data-on'); list?.removeAttribute('data-active'); };
    const destroy = () => { hide(); cancelAnimationFrame(raf); raf = 0; el.remove(); cache.forEach((m) => { if (m instanceof HTMLCanvasElement) canvases.delete(m); }); };
    return { show, hide, destroy, place, get shown() { return shown; }, get row() { return row; }, get mode() { return mode; }, setLast(x: number, y: number) { last = { x, y }; }, kick() { place(); if (!raf) raf = requestAnimationFrame(frame); } };
  }
  const pOff: Cleanup[] = [];
  const setupPreview = () => {
    if (preview || !canPreview() || !list) return;
    preview = makePreview();
    const pv = preview;
    let lx = 0, ly = 0, scrollQueued = false;
    const rowAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-ix-row]') ?? null;
    pOff.push(on(list, 'pointermove', (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      lx = e.clientX; ly = e.clientY;
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-ix-row]');
      if (!r) { pv.hide(); return; }
      if (pv.row === r && pv.mode === 'pointer') { pv.setLast(lx, ly); pv.kick(); } else pv.show(r, 'pointer', lx, ly);
    }));
    pOff.push(on(list, 'pointerleave', () => { if (pv.mode === 'pointer') pv.hide(); }));
    pOff.push(on(list, 'click', () => pv.hide()));
    pOff.push(on(list, 'focusin', (e: FocusEvent) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-ix-row]');
      if (r && r.matches(':focus-visible')) pv.show(r, 'focus'); else if (!r) pv.hide();
    }));
    pOff.push(on(list, 'focusout', (e: FocusEvent) => { if (pv.mode === 'focus' && !(e.relatedTarget as HTMLElement | null)?.closest?.('[data-ix-row]')) pv.hide(); }));
    pOff.push(on(document, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') pv.hide(); }));
    const onScroll = () => {
      if (!pv.shown || scrollQueued) return; scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false; if (!pv.shown) return;
        if (pv.mode === 'focus') { pv.kick(); return; }
        const r = rowAt(lx, ly); if (r) pv.show(r, 'pointer', lx, ly); else pv.hide();
      });
    };
    pOff.push(on(window, 'scroll', onScroll, { passive: true }), on(window, 'resize', onScroll));
  };
  const teardownPreview = () => { pOff.splice(0).forEach((f) => f()); preview?.destroy(); preview = null; };
  const syncPreview = () => { if (canPreview()) setupPreview(); else teardownPreview(); };
  mqs.forEach((m) => off.push(on(m, 'change', syncPreview)));
  syncPreview();
  off.push(teardownPreview);

  /* ---------- ticker pause control ---------- */
  const pause = $<HTMLButtonElement>('[data-ix-pause]', root);
  const ticker = $('[data-ix-ticker]', root);
  if (pause && ticker) off.push(on(pause, 'click', () => { const p = pause.getAttribute('aria-pressed') !== 'true'; pause.setAttribute('aria-pressed', String(p)); pause.textContent = p ? 'Play' : 'Pause'; ticker.toggleAttribute('data-paused', p); }));
  off.push(() => { ticker?.removeAttribute('data-paused'); if (pause) { pause.setAttribute('aria-pressed', 'false'); pause.textContent = 'Pause'; } });

  /* ---------- entrance: the only animation on load. Resting state is the visible page (backwards fill only) ---------- */
  function restage(els: HTMLElement[]) {
    if (reducedMotion()) return;
    els.forEach((el, i) => { const a = li(el).animate([{ opacity: 0, transform: 'translateY(0.6rem)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 25, easing: EASE, fill: 'backwards' }); anims.push(a); });
  }
  let io: IntersectionObserver | null = null;
  if (!reducedMotion() && !root.hasAttribute('data-ix-entered')) {
    root.setAttribute('data-ix-entered', '');
    const base = document.documentElement.dataset.intro === 'show' ? 2200 : 0;
    $$('[data-ix-line]', root).forEach((l, i) => anims.push(l.animate([{ transform: 'translateY(105%)' }, { transform: 'none' }], { duration: 900, delay: base + i * 110, easing: EASE, fill: 'backwards' })));
    const slide = (r: HTMLElement, d: number) => anims.push(li(r).animate([{ clipPath: 'inset(0 0 100% 0)', transform: 'translateY(1.2rem)' }, { clipPath: 'inset(0 0 0 0)', transform: 'none' }], { duration: 620, delay: d, easing: EASE, fill: 'backwards' }));
    const pending = new Set(rows);
    const inView = (r: HTMLElement) => { const b = r.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; };
    let k = 0;
    rows.filter((r) => !li(r).hidden && inView(r)).forEach((r) => { slide(r, base + 350 + k++ * 60); pending.delete(r as HTMLAnchorElement); });
    io = new IntersectionObserver((es) => {
      let j = 0;
      es.filter((x) => x.isIntersecting).forEach((x) => { const r = x.target as HTMLAnchorElement; io?.unobserve(r); if (pending.delete(r)) slide(r, j++ * 60); });
    }, { threshold: 0.15 });
    pending.forEach((r) => io!.observe(r));
  }
  off.push(() => { io?.disconnect(); anims.forEach((a) => { try { a.cancel(); } catch { /* ignore */ } }); anims.length = 0; });

  return () => off.splice(0).reverse().forEach((f) => { try { f(); } catch { /* ignore */ } });
}

export const initIndexStage: Init = () => {
  const root = $<HTMLElement>('[data-ix]');
  if (!root) return;
  let teardown: Cleanup | null = null;
  const stop = onLayout((l) => {
    if (l === 'index') teardown ??= activate(root);
    else { teardown?.(); teardown = null; }
  });
  return () => { stop(); teardown?.(); teardown = null; };
};
