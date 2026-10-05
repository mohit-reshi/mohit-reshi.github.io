import { $, type Init } from './util';

interface Handle { destroy(): void; setTheme(t: 'light' | 'dark'): void }

/** Stub with the same signature as the real module: renders a "coming online" state. */
function stubMount(container: HTMLElement): Handle {
  container.innerHTML = '<div class="livelab-stub"><strong>Live Lab is coming online</strong><p>The interactive module has not been built into this deployment yet. Recorded walkthroughs appear on each project page.</p></div>';
  return { destroy: () => container.replaceChildren(), setTheme: () => {} };
}

export const initLiveLab: Init = () => {
  const host = $('[data-livelab]');
  if (!host) return;
  const status = $('[data-live-status]');
  const pill = $('[data-status]');
  const base = host.dataset.base ?? '/';
  const broker = host.dataset.broker ?? 'mock:';
  let handle: Handle | null = null, cancelled = false;
  const themeNow = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') as 'light' | 'dark';
  const config = JSON.parse(document.getElementById('livelab-config')?.textContent || '{"reports":[]}');
  let pushTheme: ((t: 'light' | 'dark') => void) | null = null;
  const onTheme = (e: Event) => { const t = (e as CustomEvent<'light' | 'dark'>).detail; handle?.setTheme(t); pushTheme?.(t); };
  window.addEventListener('themechange', onTheme);

  (async () => {
    // header pill + intro sentence reflect the broker health (the module also checks it itself)
    let live = broker === 'mock:';
    if (broker !== 'mock:') {
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000); const r = await fetch(broker.replace(/\/$/, '') + '/health', { signal: c.signal }); clearTimeout(t); live = r.ok && (await r.json()).ok === true; } catch { live = false; }
    }
    if (status) status.textContent = broker === 'mock:' ? 'Demo mode: simulated reports, real code.' : live ? 'Live capacity is up.' : 'Live capacity is off, so you will see recorded walkthroughs.';
    if (pill) { pill.dataset.state = live ? 'live' : 'offline'; pill.textContent = broker === 'mock:' ? 'Demo mode' : live ? 'Live now' : 'Offline · recorded'; }
    if (cancelled) return;
    const params = new URLSearchParams(location.search);
    const opts = { brokerUrl: broker, config, theme: themeNow(), initialReport: params.get('report') ?? undefined, onThemeRequest: (cb: (t: 'light' | 'dark') => void) => { pushTheme = cb; } };
    try {
      if (host.dataset.available === 'true') {
        const mod = await import(/* @vite-ignore */ `${base}live-lab/live-lab.js`);
        if (!cancelled) handle = mod.mountLiveLab(host, opts);
      } else handle = stubMount(host);
    } catch { if (!cancelled) handle = stubMount(host); }
  })();
  return () => { cancelled = true; window.removeEventListener('themechange', onTheme); handle?.destroy(); };
};
