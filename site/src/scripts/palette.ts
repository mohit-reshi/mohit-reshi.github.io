import { navigate } from 'astro:transitions/client';
import { searchItems, type SearchItem } from '../lib/search';
import { $, on, type Cleanup, type Init } from './util';
import { lenisControl } from './motion';

let items: SearchItem[] | null = null;
const KIND_LABEL: Record<SearchItem['kind'], string> = { project: 'Project', app: 'App', page: 'Page', tag: 'Filter' };

export const initPalette: Init = () => {
  const dlg = $<HTMLDialogElement>('#palette');
  const input = $<HTMLInputElement>('[data-palette-input]');
  const list = $<HTMLUListElement>('[data-palette-list]');
  const empty = $('[data-palette-empty]');
  if (!dlg || !input || !list || !empty) return;
  const off: Cleanup[] = [];
  let results: SearchItem[] = [];
  let active = 0;

  const render = () => {
    results = searchItems(items ?? [], input.value, 8);
    active = Math.min(active, Math.max(0, results.length - 1));
    list.replaceChildren(...results.map((r, i) => {
      const li = document.createElement('li'); li.className = 'palette__item'; li.role = 'presentation';
      const a = document.createElement('a'); a.href = r.url; a.id = `pal-${i}`; a.role = 'option'; a.setAttribute('aria-selected', String(i === active)); a.tabIndex = -1;
      const k = document.createElement('span'); k.className = 'palette__kind'; k.textContent = KIND_LABEL[r.kind];
      const t = document.createElement('span'); t.textContent = r.title; const s = document.createElement('small'); s.textContent = r.hint; t.append(s);
      a.append(k, t); li.append(a); return li;
    }));
    empty.hidden = results.length > 0;
    input.setAttribute('aria-activedescendant', results.length ? `pal-${active}` : '');
  };
  const move = (d: number) => { if (!results.length) return; active = (active + d + results.length) % results.length; render(); $(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' }); };
  const go = (r?: SearchItem) => { if (!r) return; dlg.close(); const u = new URL(r.url, location.href); if (u.origin === location.origin) void navigate(u.pathname + u.search + u.hash); else location.href = r.url; };

  const open = async () => {
    if (!dlg.open) { dlg.showModal(); lenisControl(false); }
    input.value = ''; active = 0; input.focus();
    if (!items) { try { items = await (await fetch(dlg.dataset.index!)).json(); } catch { items = []; } }
    render();
  };
  off.push(on(document, 'keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg.open ? dlg.close() : void open(); }
  }));
  document.querySelectorAll('[data-open-palette]').forEach((b) => off.push(on(b, 'click', () => void open())));
  off.push(on(input, 'input', () => { active = 0; render(); }));
  off.push(on(input, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  }));
  off.push(on(list, 'click', (e) => { const a = (e.target as HTMLElement).closest('a'); if (a) { e.preventDefault(); go(results[Number(a.id.replace('pal-', ''))]); } }));
  off.push(on(dlg, 'click', (e) => { if (e.target === dlg) dlg.close(); }));
  off.push(on(dlg, 'close', () => lenisControl(true)));
  return () => off.forEach((f) => f());
};
