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
