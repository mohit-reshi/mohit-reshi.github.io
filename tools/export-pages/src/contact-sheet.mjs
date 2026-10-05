import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderContactSheet(results) {
  const cards = results.filter((r) => r.items?.length).map((r) => `
  <section><h2>${esc(r.slug)} <small>${esc(r.kind)}</small></h2><div class="grid">${r.items.map((it) => {
    const bad = it.status === 'failed' || it.status === 'blank';
    const img = it.file.endsWith('.png') && it.status !== 'failed' ? `<img loading="lazy" src="${esc(r.slug + '/' + it.file)}" alt="${esc(it.label)}">` : `<div class="ph">${it.file.endsWith('.pdf') ? 'PDF' : '-'}</div>`;
    return `<figure class="${bad ? 'bad' : ''}">${img}<figcaption>${esc(it.file.split('/').pop())}<br>${esc(it.label)}<br><b>${esc(it.status)}</b>${it.error ? '<br>' + esc(it.error) : ''}</figcaption></figure>`;
  }).join('')}</div></section>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Export contact sheet (private)</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}h2 small{color:#999;font-weight:400}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
figure{margin:0;background:#1c1c1c;padding:8px;border:2px solid #333}figure.bad{border-color:#e5484d}img{width:100%;display:block}.ph{height:120px;display:grid;place-items:center;background:#222}figcaption{font-size:12px;color:#bbb;margin-top:6px}</style>
<h1>Export contact sheet</h1><p>Private: page display names may contain client names. Review before committing anything from out/.</p>${cards}`;
}

export const writeContactSheet = (outDir, results) => writeFile(join(outDir, 'contact-sheet.html'), renderContactSheet(results));
