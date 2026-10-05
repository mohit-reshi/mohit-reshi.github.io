#!/usr/bin/env node
// Offline secret-shaped text check (a small stand-in for gitleaks; the CI job uses the real gitleaks, see docs/requests).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIRS = ['live-lab', 'tools/export-pages', 'tools/media', 'docs'];
const SKIP = new Set(['node_modules', 'dist', 'generated', '.wrangler', 'test-results', 'playwright-report', 'out']);
const RULES = [
  ['client secret value', /client_?secret["']?\s*[:=]\s*["'][A-Za-z0-9~._-]{12,}["']/i],
  ['JWT', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['storage key / SAS', /AccountKey=[A-Za-z0-9+/=]{20,}|sig=[A-Za-z0-9%]{30,}/],
  ['Databricks token', /dapi[0-9a-f]{20,}/],
  ['non-placeholder GUID', /\b(?!00000000-0000-0000-0000-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
];
const walk = (d) => readdirSync(d).flatMap((n) => { if (SKIP.has(n)) return []; const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|mjs|js|json|md|toml|html|yml|yaml|txt)$/.test(n) ? [p] : []; });
let bad = 0;
for (const d of DIRS) for (const f of walk(join(ROOT, d))) {
  if (f.endsWith('package-lock.json')) continue;
  const text = readFileSync(f, 'utf8');
  for (const [name, rx] of RULES) {
    const m = text.match(rx);
    if (m) { bad++; console.error(`${relative(ROOT, f)}: possible ${name}`); }
  }
}
console.log(bad ? `${bad} possible secret(s) found` : 'secret scan: clean');
process.exit(bad ? 1 : 0);
