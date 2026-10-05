#!/usr/bin/env node
// Fail if any blocklist term appears in the built site or the content. The blocklist comes from the BLOCKLIST env var
// (newline separated; a CI secret) or a local, gitignored blocklist.local.txt. Output NEVER prints the term itself.
//   node tools/validate/leak-check.mjs [--dist site/dist] [--content content] [--require] [--root <dir>] [--repo] [--history] [--staged] [--message <file>]
//   --repo     also scan every tracked file in the repository (names and contents), not only the build and content
//   --history  also scan the whole git history (authors, messages, diffs, branch and tag names)
// Also flags GUIDs, connection strings and .onmicrosoft.com addresses in the built site.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { REPO_ROOT } from './lib.mjs';

const TEXT = /\.(html?|js|mjs|css|json|xml|txt|svg|md|webmanifest|map|ya?ml)$/i;

export function splitWords(term) {
  const out = [];
  for (const chunk of term.trim().split(/[\s_\-.]+/)) out.push(...(chunk.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|\d+/g) ?? (chunk ? [chunk] : [])));
  return out;
}

/**
 * Blocklist lines, one term per line. `# tier: review` / `# tier: hard` comment lines switch the tier (default hard).
 * Unique names (hard tier) match anywhere, so "acmegovernance" and "xacme" are caught. Only short generic words
 * (five letters or fewer, or review-tier words up to eight) require a word or camelCase boundary to avoid noise.
 */
export function compileTerms(lines) {
  const terms = [];
  let tier = 'hard';
  for (const raw of lines) {
    const t = raw.trim();
    const m = t.match(/^#\s*tier:\s*(hard|review)/i);
    if (m) { tier = m[1].toLowerCase(); continue; }
    if (!t || t.startsWith('#')) continue;
    const words = splitWords(t);
    const letters = words.join('').length;
    // separators: space, underscore, hyphen, dot, URL-encoded space and plus
    terms.push({ rx: new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:[\\s_\\-.+]|%20)*'), 'gi'), short: letters <= 5 || (tier === 'review' && letters <= 8), tier, len: t.length });
  }
  return terms;
}

function boundaryOk(text, s, e) {
  const before = text[s - 1] ?? '', after = text[e] ?? '';
  const first = text[s], last = text[e - 1];
  const left = !/[A-Za-z]/.test(before) || (/[A-Z]/.test(first) && /[a-z0-9]/.test(before));
  const right = !/[A-Za-z]/.test(after) || (/[a-z]/.test(last) && /[A-Z]/.test(after));
  return left && right;
}

export function scanText(text, terms) {
  const hits = [];
  terms.forEach((t, i) => {
    t.rx.lastIndex = 0;
    let m;
    while ((m = t.rx.exec(text))) {
      if (!t.short || boundaryOk(text, m.index, m.index + m[0].length)) hits.push({ term: i + 1, line: text.slice(0, m.index).split('\n').length });
      if (m[0].length === 0) t.rx.lastIndex++;
    }
  });
  return hits;
}

const GENERIC = [
  ['guid', /\b(?!00000000-0000-0000-0000-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['connection string', /(?:Data Source|Initial Catalog|AccountKey|SharedAccessSignature)\s*=/i],
  ['tenant address', /@[\w-]+\.onmicrosoft\.com/i],
  ['fabric/azure host', /\.(?:datawarehouse\.fabric\.microsoft\.com|sql\.azuresynapse\.net|database\.windows\.net|pbidedicated\.windows\.net)/i],
];

const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((n) => { if (n === 'node_modules' || n === '.git') return []; const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : TEXT.test(n) ? [p] : []; }) : []);

const REPO_SKIP = new Set(['node_modules', '.git', 'dist', 'dist-off', 'dist-probe', '.astro', 'out', 'test-results', 'playwright-report', '.wrangler', '.lighthouseci']);
const REPO_SKIP_PATHS = [/package-lock\.json$/, /(^|\/)src\/generated\//, /\.map$/];

/** Every text file in the repository that git tracks (or, outside git, that is not build output), for the whole-repo check. */
export function repoFiles(root) {
  const r = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const list = r.status === 0 ? r.stdout.split('\0').filter(Boolean) : null;
  const rel = list ?? walkAll(root).map((f) => relative(root, f).split(sep).join('/'));
  return rel.filter((f) => existsSync(join(root, f)) && !f.split('/').some((seg) => REPO_SKIP.has(seg)) && !REPO_SKIP_PATHS.some((rx) => rx.test(f)));
}
const walkAll = (d) => readdirSync(d).flatMap((n) => { if (REPO_SKIP.has(n)) return []; const p = join(d, n); return statSync(p).isDirectory() ? walkAll(p) : [p]; });
const isTextFile = (buf) => !buf.subarray(0, 8192).includes(0);

/** Scan paths and contents of every tracked file. */
export function scanRepo(root, terms) {
  const findings = [];
  let files = 0;
  for (const f of repoFiles(root)) {
    for (const h of scanText(f, terms)) findings.push({ file: f, line: 0, what: `blocklist term #${h.term} in the file name` });
    const full = join(root, f);
    if (statSync(full).size > 25_000_000) continue;
    const buf = readFileSync(full);
    if (!isTextFile(buf)) continue;
    files++;
    for (const h of scanText(buf.toString('utf8'), terms)) findings.push({ file: f, line: h.line, what: `blocklist term #${h.term}` });
  }
  return { findings, files };
}

/**
 * Scan the whole git history: every commit's author, message and diff, plus branch and tag names. Output is masked:
 * a finding names the commit and the term number, never the term. Rewriting history is the owner's decision.
 */
export function scanHistory(root, terms) {
  const findings = [];
  const SEP = '\u0001COMMIT\u0001';
  const r = spawnSync('git', ['log', '--all', '-p', '-U0', '--no-color', `--format=${SEP}%h%n%an <%ae>%n%B%n${SEP}END`], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) return { findings, commits: 0, error: 'git log failed (not a git repository?)' };
  const chunks = r.stdout.split(SEP).filter((c) => c && !c.startsWith('END'));
  for (const c of chunks) {
    const [sha] = c.split('\n', 1);
    for (const h of scanText(c, terms)) findings.push({ file: `commit ${sha}`, line: 0, what: `blocklist term #${h.term} (author, message or diff)` });
  }
  const refs = spawnSync('git', ['for-each-ref', '--format=%(refname)'], { cwd: root, encoding: 'utf8' }).stdout ?? '';
  for (const ref of refs.split('\n').filter(Boolean)) for (const h of scanText(ref, terms)) findings.push({ file: `ref ${ref.replace(/\S/g, '*')}`, line: 0, what: `blocklist term #${h.term} in a branch or tag name` });
  // collapse duplicates (same commit and term)
  const seen = new Set();
  const unique = findings.filter((f) => { const k = f.file + f.what; if (seen.has(k)) return false; seen.add(k); return true; });
  return { findings: unique, commits: chunks.length };
}

export function loadBlocklist(root, env = process.env) {
  if (env.BLOCKLIST && env.BLOCKLIST.trim()) return env.BLOCKLIST.split(/\r?\n/);
  const f = join(root, 'blocklist.local.txt');
  return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/) : null;
}

export function runLeakCheck({ root, dist, content, blocklist, generic = true }) {
  const terms = compileTerms(blocklist ?? []);
  const findings = [];
  const targets = [...walk(dist).map((f) => ({ f, built: true })), ...walk(content).map((f) => ({ f, built: false }))];
  for (const { f, built } of targets) {
    const text = readFileSync(f, 'utf8');
    for (const h of scanText(text, terms)) findings.push({ file: relative(root, f), line: h.line, what: `blocklist term #${h.term}` });
    if (generic && built && !f.endsWith('.map')) for (const [name, rx] of GENERIC) if (rx.test(text)) findings.push({ file: relative(root, f), line: 0, what: name });
  }
  return { findings, files: targets.length, terms: terms.length };
}

if (process.argv[1]?.endsWith('leak-check.mjs')) {
  const a = process.argv.slice(2);
  const opt = (n, d) => (a.includes(n) ? a[a.indexOf(n) + 1] : d);
  const root = resolve(opt('--root', REPO_ROOT));
  const bl = loadBlocklist(root);
  if (!bl) {
    const msg = 'leak-check: no blocklist (set the BLOCKLIST env var / CI secret, or create the gitignored blocklist.local.txt).';
    if (a.includes('--require')) { console.error(msg + ' Failing because --require was given.'); process.exit(2); }
    console.warn(msg + ' Skipping the term check (generic ID checks still run).');
  }
  // Hook modes: --staged scans staged names and staged contents; --message <file> scans a commit message.
  if (a.includes('--staged') || a.includes('--message')) {
    const terms = compileTerms(bl ?? []);
    const hits = [];
    if (a.includes('--staged')) {
      const names = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
      for (const n of names) {
        for (const h of scanText(n, terms)) hits.push(`staged path: blocklist term #${h.term}`);
        const c = spawnSync('git', ['show', ':' + n], { cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
        if (c.status === 0 && !c.stdout.includes(0)) for (const h of scanText(c.stdout.toString('utf8'), terms)) hits.push(`${n}:${h.line}: blocklist term #${h.term}`);
      }
    }
    if (a.includes('--message')) {
      const mf = opt('--message', '');
      if (mf && existsSync(mf)) for (const h of scanText(readFileSync(mf, 'utf8'), terms)) hits.push(`commit message: blocklist term #${h.term}`);
    }
    for (const x of hits) console.error('  LEAK ' + x);
    if (hits.length) { console.error('Commit blocked. Terms are not printed on purpose.'); process.exit(1); }
    process.exit(0);
  }
  const wantRepo = a.includes('--repo'), wantHistory = a.includes('--history');
  const r = wantRepo && !a.includes('--dist')
    ? { findings: [], files: 0, terms: compileTerms(bl ?? []).length }
    : runLeakCheck({ root, dist: resolve(root, opt('--dist', 'site/dist')), content: resolve(root, opt('--content', 'content')), blocklist: bl });
  if (wantRepo) { const rr = scanRepo(root, compileTerms(bl ?? [])); r.findings.push(...rr.findings); r.files += rr.files; }
  if (wantHistory) {
    const hh = scanHistory(root, compileTerms(bl ?? []));
    if (hh.error) console.warn('leak-check: ' + hh.error); else console.log(`leak-check: scanned ${hh.commits} commit(s) of history`);
    r.findings.push(...hh.findings);
  }
  console.log(`leak-check: ${r.files} files, ${r.terms} blocklist term(s)`);
  for (const f of r.findings) console.error(`  LEAK ${f.file}${f.line ? ':' + f.line : ''}: ${f.what}`);
  if (r.findings.length) { console.error(`FAILED: ${r.findings.length} finding(s). Terms are not printed on purpose.`); process.exit(1); }
  console.log('OK: no blocklist terms or identifiers found');
}
