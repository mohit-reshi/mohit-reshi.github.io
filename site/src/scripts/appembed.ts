import { $$, on, type Cleanup, type Init } from './util';

/** Optional inline preview of an app: strict sandbox, loaded only on click, with an open-in-new-tab fallback next to it. */
export const initAppEmbed: Init = () => {
  const off: Cleanup[] = [];
  $$('[data-app-embed]').forEach((wrap) => {
    const btn = wrap.querySelector<HTMLButtonElement>('[data-app-load]');
    if (!btn) return;
    off.push(on(btn, 'click', () => {
      const f = document.createElement('iframe');
      f.src = wrap.dataset.url!;
      f.title = 'App preview';
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer';
      // Same-origin (static) apps never get allow-same-origin: it would defeat the sandbox.
      f.setAttribute('sandbox', wrap.dataset.kind === 'static' ? 'allow-scripts' : 'allow-scripts allow-forms allow-popups allow-same-origin');
      wrap.querySelector('[data-app-slot]')!.replaceChildren(f);
      btn.disabled = true;
    }));
  });
  return () => off.forEach((f) => f());
};
