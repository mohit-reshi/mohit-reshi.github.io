import { $, on, finePointer, reducedMotion, type Cleanup, type Init } from './util';

const LABEL: Record<string, string> = { view: 'View', play: 'Play', drag: 'Drag' };

/** Custom cursor on fine-pointer devices only. States come from [data-cursor] ("view", "play", "drag", "link"). */
export const initCursor: Init = () => {
  const el = $('.cursor');
  if (!el || !finePointer()) { document.documentElement.classList.remove('has-cursor'); return; }
  const ring = $('.cursor__ring', el)!, dot = $('.cursor__dot', el)!;
  const off: Cleanup[] = [];
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0, seen = false;
  const smooth = !reducedMotion();
  const loop = () => {
    rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    raf = requestAnimationFrame(loop);
  };
  const setState = (t: EventTarget | null) => {
    const el0 = t as HTMLElement | null;
    const marked = el0?.closest?.('[data-cursor]') as HTMLElement | null; // an explicit state wins over the generic link state
    const host = marked ?? (el0?.closest?.('a, button, summary, label') as HTMLElement | null);
    const kind = marked?.dataset.cursor ?? (host ? 'link' : '');
    el.setAttribute('data-state', kind);
    ring.textContent = LABEL[kind] ?? '';
  };
  off.push(on(window, 'pointermove', (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!seen) { seen = true; rx = x; ry = y; document.documentElement.classList.add('has-cursor'); if (smooth) raf = requestAnimationFrame(loop); }
    dot.style.transform = `translate(${x}px, ${y}px)`;
    if (!smooth) ring.style.transform = `translate(${x}px, ${y}px)`;
    setState(e.target);
  }, { passive: true }));
  off.push(on(document.documentElement, 'pointerleave', () => document.documentElement.classList.remove('has-cursor')));
  off.push(on(document.documentElement, 'pointerenter', () => { if (seen) document.documentElement.classList.add('has-cursor'); }));
  return () => { cancelAnimationFrame(raf); off.forEach((f) => f()); };
};
