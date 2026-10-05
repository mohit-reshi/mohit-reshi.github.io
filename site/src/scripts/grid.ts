import { $, $$, on, reducedMotion, finePointer, type Cleanup, type Init } from './util';

/**
 * Hover/focus previews on the work cards: a recording plays when there is one (fetched only on hover or keyboard focus, never on touch),
 * otherwise the report pages crossfade one after another. With reduced motion nothing plays or cycles: the second page is shown still.
 */
export const initPreviews: Init = () => {
  if (!finePointer()) return;
  const reduce = reducedMotion();
  const off: Cleanup[] = [];
  $$('[data-card]').forEach((card) => {
    const video = $<HTMLVideoElement>('video[data-src]', card);
    const media = $('.card__media', card);
    let pages: string[] = [];
    try { pages = JSON.parse(card.dataset.previews ?? '[]'); } catch { pages = []; }
    if (!video && (pages.length < 2 || !media)) return;

    let timer = 0, layer: HTMLElement | null = null, imgs: HTMLImageElement[] = [], i = 0, active = false;
    const mount = () => {
      if (layer || !media) return;
      layer = document.createElement('div'); layer.className = 'card__flip'; layer.setAttribute('aria-hidden', 'true');
      imgs = pages.map((src, n) => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.decoding = 'async'; if (n === 0) im.dataset.on = 'true'; layer!.append(im); return im; });
      media.append(layer);
      requestAnimationFrame(() => layer?.setAttribute('data-ready', 'true'));
    };
    const show = (n: number) => { i = n % imgs.length; imgs.forEach((im, k) => { im.dataset.on = String(k === i); }); };
    const start = () => {
      active = true;
      if (video) { if (reduce) return; if (!video.src) video.src = video.dataset.src!; video.play().then(() => (video.dataset.playing = 'true')).catch(() => {}); return; }
      mount(); if (!layer) return;
      show(1);
      if (!reduce) timer = window.setInterval(() => show(i + 1), 1100);
    };
    const stop = () => {
      active = false;
      if (video) { video.pause(); video.dataset.playing = 'false'; return; }
      window.clearInterval(timer); timer = 0;
      layer?.remove(); layer = null; imgs = [];
    };
    off.push(on(card, 'pointerenter', (e: PointerEvent) => { if (e.pointerType === 'mouse' && !active) start(); }));
    off.push(on(card, 'pointerleave', () => { if (active) stop(); }));
    off.push(on(card, 'focusin', (e: FocusEvent) => { if (!active && (e.target as HTMLElement).matches(':focus-visible')) start(); }));
    off.push(on(card, 'focusout', () => { if (active) stop(); }));
    off.push(() => stop());
  });
  return () => off.forEach((f) => f());
};

/** Filterable work grid: multi-select tag chips (AND), URL sync (?tag=a,b), FLIP reflow, live status text. */
export const initGrid: Init = () => {
  const grid = $('[data-grid]');
  const bar = $('[data-filters]');
  if (!grid || !bar) return;
  const status = $('[data-filter-status]')!;
  const emptyEl = $('[data-filter-empty]')!;
  const chips = $$<HTMLButtonElement>('[data-filter]', bar);
  const all = $<HTMLButtonElement>('[data-filter-all]', bar)!;
  const cards = $$('[data-card]', grid);
  let active = new Set<string>();
  const reduce = reducedMotion();

  const fromUrl = () => new Set((new URL(location.href).searchParams.get('tag') ?? '').split(',').filter((t) => chips.some((c) => c.dataset.filter === t)));
  const toUrl = () => { const u = new URL(location.href); active.size ? u.searchParams.set('tag', [...active].join(',')) : u.searchParams.delete('tag'); history.replaceState(history.state, '', u); };

  const apply = (animate: boolean) => {
    const first = new Map<HTMLElement, DOMRect>();
    if (animate && !reduce) cards.filter((c) => !c.hidden).forEach((c) => first.set(c, c.getBoundingClientRect()));
    cards.forEach((c) => { const tags = (c.dataset.tags ?? '').split(' '); c.hidden = ![...active].every((t) => tags.includes(t)); });
    const visible = cards.filter((c) => !c.hidden);
    chips.forEach((c) => c.setAttribute('aria-pressed', String(active.has(c.dataset.filter!))));
    all.setAttribute('aria-pressed', String(active.size === 0));
    status.textContent = active.size ? `Showing ${visible.length} of ${cards.length} projects` : '';
    emptyEl.hidden = visible.length > 0;
    if (animate && !reduce) visible.forEach((c) => {
      const f = first.get(c), l = c.getBoundingClientRect();
      if (f) { const dx = f.left - l.left, dy = f.top - l.top; if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.2,0.7,0.1,1)' }); }
      else c.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
    });
  };

  const off: Cleanup[] = [];
  active = fromUrl();
  apply(false);
  chips.forEach((c) => off.push(on(c, 'click', () => { const k = c.dataset.filter!; active.has(k) ? active.delete(k) : active.add(k); toUrl(); apply(true); })));
  off.push(on(all, 'click', () => { active.clear(); toUrl(); apply(true); }));
  return () => off.forEach((f) => f());
};
