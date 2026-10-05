import { $$, on, type Cleanup, type Init } from './util';

export const initBeforeAfter: Init = () => {
  const off: Cleanup[] = [];
  $$('[data-before-after]').forEach((fig) => {
    const box = fig.querySelector<HTMLElement>('.ba')!, range = fig.querySelector<HTMLInputElement>('.ba__range')!;
    const set = () => box.style.setProperty('--pos', `${range.value}%`);
    off.push(on(range, 'input', set));
    off.push(on(range, 'pointerdown', (e: PointerEvent) => { const r = box.getBoundingClientRect(); range.value = String(Math.round(((e.clientX - r.left) / r.width) * 100)); set(); }));
    set();
  });
  return () => off.forEach((f) => f());
};
