import { $$, type Cleanup, type Init } from './util';

/**
 * The work list is one vertical row: as each card scrolls into view it slides in from the left or the right (alternating)
 * and settles into place. Direction is assigned by script, so the cards stay fully visible if this never runs; with reduced
 * motion they are simply shown.
 */
export const initSlideIn: Init = () => {
  const stacks = $$('[data-stack]');
  if (!stacks.length || !('IntersectionObserver' in window)) return;
  // with reduced motion the slide is short and quick (see components.css) rather than removed
  const off: Cleanup[] = [];
  stacks.forEach((stack) => {
    const cards = () => $$('[data-card]', stack).filter((c) => !c.hidden);
    const assign = () => cards().forEach((c, i) => { c.dataset.slide = i % 2 === 0 ? 'left' : 'right'; });
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { (e.target as HTMLElement).classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const watch = () => { assign(); cards().forEach((c) => { if (!c.classList.contains('is-in')) io.observe(c); }); };
    watch();
    // filtering hides and shows cards: re-alternate so the visible ones keep a left, right, left rhythm
    const mo = new MutationObserver(() => watch());
    $$('[data-card]', stack).forEach((c) => mo.observe(c, { attributes: true, attributeFilter: ['hidden'] }));
    off.push(() => { io.disconnect(); mo.disconnect(); $$('[data-card]', stack).forEach((c) => { c.classList.remove('is-in'); delete c.dataset.slide; }); });
  });
  return () => off.forEach((f) => f());
};
