import { $, $$, on, type Cleanup, type Init } from './util';
import { lenisControl } from './motion';

/** Info slide-over: open from the header button, close with the X, the backdrop or Escape. */
export const initInfo: Init = () => {
  const dlg = $<HTMLDialogElement>('#info-panel');
  if (!dlg) return;
  const off: Cleanup[] = [];
  const open = () => { if (!dlg.open) { dlg.showModal(); lenisControl(false); } };
  const close = () => dlg.close();
  $$('[data-open-info]').forEach((b) => off.push(on(b, 'click', open)));
  $$('[data-info-close]', dlg).forEach((b) => off.push(on(b, 'click', close)));
  off.push(on(dlg, 'click', (e) => { if (e.target === dlg) close(); }));
  off.push(on(dlg, 'close', () => lenisControl(true)));
  return () => off.forEach((f) => f());
};

/** "Open to roles" pill: on the About page it opens the connect dialog. The pill links to /about/?connect=1 from other pages. */
export const initConnect: Init = () => {
  const dlg = $<HTMLDialogElement>('#connect-dialog');
  if (!dlg) return;
  const off: Cleanup[] = [];
  const open = () => { if (!dlg.open) { dlg.showModal(); lenisControl(false); } };
  const close = () => dlg.close();
  $$('[data-connect-open]').forEach((b) => off.push(on(b, 'click', (e) => { e.preventDefault(); open(); })));
  $$('[data-connect-close]', dlg).forEach((b) => off.push(on(b, 'click', close)));
  off.push(on(dlg, 'click', (e) => { if (e.target === dlg) close(); }));
  off.push(on(dlg, 'close', () => { lenisControl(true); ($<HTMLElement>('[data-connect-open]') ?? document.body).focus?.(); }));
  const url = new URL(location.href);
  if (url.searchParams.has('connect')) {
    url.searchParams.delete('connect');
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    open();
  }
  return () => off.forEach((f) => f());
};
