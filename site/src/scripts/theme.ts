import { $, on, type Init } from './util';

export const initTheme: Init = () => {
  const btn = $('[data-theme-toggle]');
  const current = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const sync = () => btn?.setAttribute('aria-pressed', String(current() === 'light'));
  sync();
  if (!btn) return;
  return on(btn, 'click', () => {
    const next = current() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode */ }
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', next === 'light' ? '#f7f5ef' : '#0b0f14');
    sync();
    window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });
};
