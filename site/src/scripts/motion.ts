import { $, $$, reducedMotion, idle, type Init } from './util';

type Lenis = import('lenis').default;
let lenis: Lenis | null = null;
let gsapLib: typeof import('gsap').gsap | null = null;
let ST: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null;
let ready: Promise<void> | null = null;

/** Called by dialogs: pause smooth scrolling while a modal is open. */
export const lenisControl = (running: boolean) => { if (!lenis) return; running ? lenis.start() : lenis.stop(); };

function load() {
  ready ??= (async () => {
    const [{ gsap }, { ScrollTrigger }, { default: LenisCtor }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('lenis')]);
    gsap.registerPlugin(ScrollTrigger);
    gsapLib = gsap; ST = ScrollTrigger;
    lenis = new LenisCtor({ lerp: 0.1, smoothWheel: true, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis!.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  })();
  return ready;
}

/** Smooth scroll (Lenis), reveal-on-scroll and the case-study chapters (GSAP + ScrollTrigger). Skipped entirely with reduced motion. */
export const initMotion: Init = () => {
  if (reducedMotion()) { document.documentElement.classList.add('no-motion'); return; }
  let cancelled = false;
  const safety = setTimeout(() => document.documentElement.classList.add('no-motion'), 3500); // content must never stay hidden if the chunk fails
  idle(async () => {
    try { await load(); } catch { return; }
    if (cancelled || !gsapLib || !ST) return;
    clearTimeout(safety);
    const gsap = gsapLib, ScrollTrigger = ST;
    if (!location.hash) lenis?.scrollTo(0, { immediate: true });
    $$('.reveal').forEach((el) => gsap.to(el, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } }));
    const title = $('[data-hero-title]');
    if (title) gsap.from(title, { y: 36, opacity: 0, duration: 1, ease: 'power3.out', delay: document.documentElement.dataset.intro === 'show' ? 2.4 : 0.05, clearProps: 'all' });
    // case study: reading progress + active chapter
    const article = $('article');
    const bar = $('[data-progress]');
    if (article && bar) ScrollTrigger.create({ trigger: article, start: 'top top', end: 'bottom bottom', onUpdate: (s) => bar.style.setProperty('--p', String(s.progress)) });
    const chips = $$<HTMLAnchorElement>('.cs-nav a');
    $$('[data-chapter]').forEach((ch) => ScrollTrigger.create({ trigger: ch, start: 'top 50%', end: 'bottom 50%', onToggle: (s) => { ch.classList.toggle('is-active', s.isActive); if (s.isActive) chips.forEach((c) => (c.getAttribute('href') === `#${ch.id}` ? c.setAttribute('aria-current', 'location') : c.removeAttribute('aria-current'))); } }));
    ScrollTrigger.refresh();
  });
  return () => { cancelled = true; clearTimeout(safety); ST?.getAll().forEach((t) => t.kill()); };
};
