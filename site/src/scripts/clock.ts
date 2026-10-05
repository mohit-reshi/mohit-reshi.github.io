import { $, type Init } from './util';

export const initClock: Init = () => {
  const el = $('[data-clock]');
  if (!el) return;
  const tz = el.dataset.tz || 'Asia/Kolkata';
  const label = el.dataset.label || 'India';
  let fmt: Intl.DateTimeFormat;
  try { fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }); } catch { return; }
  const tick = () => { el.textContent = `${label} · ${fmt.format(new Date())} IST`; };
  tick();
  const id = setInterval(tick, 15_000);
  return () => clearInterval(id);
};
