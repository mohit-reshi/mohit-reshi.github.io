import { $$, on, type Cleanup, type Init } from './util';

export type Layout = 'classic' | 'index' | 'model';
export const LAYOUTS: Layout[] = ['classic', 'index', 'model'];
const ALIAS: Record<string, Layout> = { '0': 'classic', classic: 'classic', '1': 'index', index: 'index', '2': 'model', model: 'model' };

export const parseLayout = (v: string | null | undefined): Layout | null => (v && ALIAS[v.toLowerCase()]) || null;
export const currentLayout = (): Layout => parseLayout(document.documentElement.dataset.layout) ?? 'classic';

/** Switch layout: sets <html data-layout>, remembers it, keeps ?layout= in the URL, and tells the stages. */
export function setLayout(next: Layout) {
  if (next === currentLayout()) return;
  document.documentElement.dataset.layout = next;
  try { localStorage.setItem('layout', next); } catch { /* private mode */ }
  try { const u = new URL(location.href); if (next === 'classic') u.searchParams.delete('layout'); else u.searchParams.set('layout', next); history.replaceState(history.state, '', u); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('layoutchange', { detail: next }));
}

/** Run cb now and whenever the layout changes. Returns the remover. */
export function onLayout(cb: (l: Layout) => void): Cleanup {
  cb(currentLayout());
  return on(window, 'layoutchange', (e: CustomEvent<Layout>) => cb(e.detail));
}

export const initLayout: Init = () => {
  const buttons = $$<HTMLButtonElement>('[data-layout-set]');
  const sync = (l: Layout) => buttons.forEach((b) => { const on = b.dataset.layoutSet === l; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  const off: Cleanup[] = [onLayout(sync)];
  buttons.forEach((b, i) => {
    off.push(on(b, 'click', () => setLayout(b.dataset.layoutSet as Layout)));
    off.push(on(b, 'keydown', (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = buttons[(i + d + buttons.length) % buttons.length];
      setLayout(n.dataset.layoutSet as Layout); n.focus();
    }));
  });
  return () => off.forEach((f) => f());
};
