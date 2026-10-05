#!/usr/bin/env node
// Extract code snippets from the REAL source files using region markers, highlight them with Shiki at build time,
// and write src/generated/snippets.json for the Live | Code tabs.
//   // #region <id> | <Title>      ... code ...      // #endregion
//   // #highlight <action>       ... lines ...      // #endhighlight        (markers are removed from the shown code)
// Fails the build if anything secret-shaped appears in a snippet.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHighlighter } from 'shiki';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCAN_DIRS = ['src', 'worker/src', '../tools/export-pages/src'];
const ORDER = ['token-entra', 'token-generate', 'token-request', 'embed-config', 'persona-switch', 'filters', 'theme', 'events', 'token-refresh', 'export-request', 'export-broker'];
const SECRET = [/client_?secret["']?\s*[:=]\s*["'][^"'<$]{6,}["']/i, /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/, /-----BEGIN [A-Z ]*PRIVATE KEY/, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /AccountKey\s*=|sig=[A-Za-z0-9%]{20,}/];

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'generated' ? [] : walk(p)) : /\.(ts|mjs|js)$/.test(n) && !/\.d\.ts$/.test(n) ? [p] : []; });

export function extractRegions(text, file) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\/\/ #region ([\w-]+)(?: \| (.+))?$/);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*\/\/ #endregion/.test(lines[j])) j++;
    if (j >= lines.length) throw new Error(`${file}: region "${m[1]}" has no #endregion`);
    out.push({ id: m[1], title: m[2] ?? m[1], file, body: lines.slice(i + 1, j) });
  }
  return out;
}

/** Dedent, drop #highlight markers and record 1-based line ranges per action. */
export function cleanBody(body) {
  const kept = [], highlights = {};
  let open = null;
  for (const l of body) {
    const h = l.match(/^\s*\/\/ #highlight ([\w-]+)\s*$/);
    if (h) { open = { action: h[1], start: kept.length + 1 }; continue; }
    if (/^\s*\/\/ #endhighlight\s*$/.test(l)) { if (open) { highlights[open.action] = [open.start, kept.length]; open = null; } continue; }
    kept.push(l);
  }
  const ind = Math.min(...kept.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  return { code: kept.map((l) => l.slice(Number.isFinite(ind) ? ind : 0)).join('\n').replace(/\s+$/, ''), highlights };
}

async function main() {
  const regions = SCAN_DIRS.flatMap((d) => { try { return walk(join(ROOT, d)); } catch { return []; } })
    .flatMap((f) => extractRegions(readFileSync(f, 'utf8'), relative(join(ROOT, '..'), f).split(sep).join('/')));
  const dupes = regions.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupes.length) throw new Error('Duplicate region ids: ' + dupes.join(', '));
  const hl = await createHighlighter({ themes: ['github-dark'], langs: ['typescript'] });
  const snippets = [];
  for (const r of regions) {
    const { code, highlights } = cleanBody(r.body);
    for (const rx of SECRET) if (rx.test(code)) throw new Error(`Secret-shaped text in snippet "${r.id}" (${r.file}): ${rx}`);
    snippets.push({ id: r.id, title: r.title, lang: 'typescript', file: r.file, code, html: hl.codeToHtml(code, { lang: 'typescript', theme: 'github-dark' }), highlights });
  }
  snippets.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99) || a.id.localeCompare(b.id));
  mkdirSync(join(ROOT, 'src/generated'), { recursive: true });
  writeFileSync(join(ROOT, 'src/generated/snippets.json'), JSON.stringify({ snippets }, null, 1));
  console.log(`snippets: ${snippets.length} (${snippets.map((s) => s.id).join(', ')})`);
}

if (process.argv[1] && process.argv[1].endsWith('build-snippets.mjs')) main().catch((e) => { console.error('snippets failed: ' + e.message); process.exit(1); });
