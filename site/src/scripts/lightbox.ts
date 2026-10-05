import { $, $$, on, type Cleanup, type Init } from './util';
import { lenisControl } from './motion';

export const initLightbox: Init = () => {
  const dlg = $<HTMLDialogElement>('[data-lightbox]');
  const triggers = $$<HTMLButtonElement>('[data-lightbox-index]');
  if (!dlg || !triggers.length) return;
  const img = $<HTMLImageElement>('[data-lightbox-img]', dlg)!, cap = $('[data-lightbox-caption]', dlg)!, count = $('[data-lightbox-count]', dlg)!;
  const off: Cleanup[] = [];
  let i = 0;
  const show = (n: number) => {
    i = (n + triggers.length) % triggers.length;
    const t = triggers[i];
    img.src = t.dataset.full!; img.alt = t.dataset.title || t.querySelector('img')?.alt || `Screenshot ${i + 1}`;
    cap.textContent = [t.dataset.title, t.dataset.caption].filter(Boolean).join(': ');
    count.textContent = `${i + 1} / ${triggers.length}`;
    const nxt = new Image(); nxt.src = triggers[(i + 1) % triggers.length].dataset.full!;
  };
  triggers.forEach((t, n) => off.push(on(t, 'click', () => { show(n); dlg.showModal(); lenisControl(false); })));
  off.push(on($('[data-lightbox-close]', dlg)!, 'click', () => dlg.close()));
  off.push(on($('[data-lightbox-prev]', dlg)!, 'click', () => show(i - 1)));
  off.push(on($('[data-lightbox-next]', dlg)!, 'click', () => show(i + 1)));
  off.push(on(dlg, 'keydown', (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1); }));
  off.push(on(dlg, 'close', () => lenisControl(true)));
  return () => off.forEach((f) => f());
};
