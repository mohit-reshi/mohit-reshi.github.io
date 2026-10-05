import { $, $$, on, type Cleanup, type Init } from './util';

const LINES = ['Connecting to the lakehouse…', 'Reading report definitions…', 'Applying row-level security…', 'Refreshing the semantic model…', 'Rendering.'];

/** Skippable "data loading" sequence: once per session, home page only, never blocks the keyboard (Esc, Enter, Space or the button skip it). */
export const initIntro: Init = () => {
  const root = document.documentElement;
  const overlay = $('[data-intro-overlay]');
  if (!overlay || root.dataset.intro !== 'show') return;
  const off: Cleanup[] = [];
  const log = $('[data-intro-log]')!, meter = $('[data-intro-meter]')!;
  const bars = $$('.intro__bars i', overlay);
  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const finish = () => {
    if (done) return; done = true;
    timers.forEach(clearTimeout);
    try { sessionStorage.setItem('intro', '1'); } catch { /* ignore */ }
    root.dataset.intro = 'leaving';
    setTimeout(() => { delete root.dataset.intro; }, 600);
  };
  const total = 2600;
  bars.forEach((b, i) => b.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 700, delay: 120 + i * 90, easing: 'cubic-bezier(0.2,0.7,0.1,1)', fill: 'forwards' }));
  meter.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: total, easing: 'linear', fill: 'forwards' });
  LINES.forEach((_, i) => timers.push(setTimeout(() => { log.innerHTML = LINES.slice(0, i + 1).map((t, j) => (j === i ? `<b>›</b> ${t}` : `✓ ${t}`)).join('<br>'); }, (total / LINES.length) * i)));
  timers.push(setTimeout(finish, total + 200));
  off.push(on(document, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }));
  off.push(on($('[data-intro-skip]')!, 'click', finish));
  $<HTMLButtonElement>('[data-intro-skip]')?.focus({ preventScroll: true });
  return () => { off.forEach((f) => f()); timers.forEach(clearTimeout); };
};
