import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { projectSchema, taxonomySchema } from '../schema.mjs';
import { validateAll } from '../validate.mjs';
import { compileTerms, scanText, runLeakCheck } from '../leak-check.mjs';
import { parseTokens, ratio, PAIRS } from '../contrast.mjs';
import { writeProject } from '../../scaffold/lib.mjs';

const TAGS = ['power-bi', 'dax'];
const good = { slug: 'my-report', title: 'My report', kind: 'report', group: 'portfolio', summary: 'A summary.', year: 2026, tags: ['dax'] };
const parse = (o) => projectSchema(z, TAGS).safeParse({ ...good, ...o });

test('schema: accepts a minimal project and fills defaults', () => {
  const r = parse({}); assert.equal(r.success, true);
  assert.equal(r.data.draft, false); assert.equal(r.data.status, 'recorded-only'); assert.equal(r.data.media.cover, 'media/cover.webp'); assert.deepEqual(r.data.live_lab, { enabled: false, report_key: null });
});
test('schema: rejects unknown tags, long summaries, bad slugs, unknown keys, absolute media paths', () => {
  assert.equal(parse({ tags: ['nope'] }).success, false);
  assert.equal(parse({ summary: 'x'.repeat(161) }).success, false);
  assert.equal(parse({ slug: 'Bad Slug' }).success, false);
  assert.equal(parse({ surprise: 1 }).success, false);
  assert.equal(parse({ media: { cover: '/etc/x.webp' } }).success, false);
  assert.equal(parse({ model_doc: '/somewhere/else.json' }).success, false);
});
test('schema: apps and live lab rules', () => {
  assert.equal(parse({ kind: 'app', group: 'app' }).success, false);
  assert.equal(parse({ kind: 'app', group: 'app', appKind: 'external' }).success, false);
  assert.equal(parse({ kind: 'app', group: 'app', appKind: 'external', url: 'https://x.example' }).success, true);
  assert.equal(parse({ kind: 'app', group: 'app', appKind: 'repo-only', repo: 'https://github.com/a/b' }).success, true);
  assert.equal(parse({ live_lab: { enabled: true } }).success, false);
  assert.equal(parse({ status: 'live' }).success, false);
  assert.equal(parse({ status: 'live', live_lab: { enabled: true, report_key: 'k' } }).success, true);
});
test('taxonomy schema', () => {
  assert.equal(taxonomySchema(z).safeParse({ 'power-bi': { label: 'Power BI', group: 'platform', color: '#ffffff' } }).success, true);
  assert.equal(taxonomySchema(z).safeParse({ 'power-bi': { label: 'P', group: 'nope', color: '#fff' } }).success, false);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'site-'));
  mkdirSync(join(root, 'content'), { recursive: true });
  writeFileSync(join(root, 'content', 'taxonomy.json'), JSON.stringify({ dax: { label: 'DAX', group: 'skill', color: '#ffc83d' } }));
  return root;
}
test('scaffold + validate: a scaffolded project validates, a broken one reports clear errors', () => {
  const root = fixture();
  writeProject({ kind: 'report', slug: 'demo-report', group: 'portfolio', title: 'Demo report', year: 2026 }, root);
  let r = validateAll(root); assert.deepEqual(r.errors, []); assert.equal(r.count, 1);
  assert.ok(r.missing.some((m) => m.includes('cover')));
  assert.throws(() => writeProject({ kind: 'report', slug: 'demo-report', group: 'portfolio', title: 'x', year: 2026 }, root), /already exists/);
  assert.throws(() => writeProject({ kind: 'report', slug: 'Not Kebab', group: 'portfolio', title: 'x', year: 2026 }, root), /kebab-case/);
  const f = join(root, 'content/projects/demo-report/index.md');
  const orig = readFileSync(f, 'utf8');
  writeFileSync(f, orig.replace('tags: []', 'tags: [ghost]'));
  assert.ok(validateAll(root).errors.some((e) => e.includes('unknown tag')));
  writeFileSync(f, orig.replace('slug: demo-report', 'slug: other'));
  assert.ok(validateAll(root).errors.some((e) => e.includes('must equal the folder name')));
});
test('scaffold app', () => {
  const root = fixture();
  writeProject({ kind: 'app', group: 'app', appKind: 'external', url: 'https://x.example', slug: 'my-app', title: 'My app', year: 2026 }, root);
  assert.deepEqual(validateAll(root).errors, []);
});

test('leak-check: variants, boundaries, and masked output', () => {
  const terms = compileTerms(['Acme Corp', 'Zed', '# comment']);
  assert.equal(scanText('hello ACME-CORP and acmeCorp and Acme_Corp', terms).length, 3);
  assert.equal(scanText('Zedd and Zedge', terms).length, 0); // short term needs a word boundary
  assert.equal(scanText('a Zed b', terms).length, 1);
  const root = mkdtempSync(join(tmpdir(), 'leak-'));
  mkdirSync(join(root, 'dist'), { recursive: true }); mkdirSync(join(root, 'content'));
  writeFileSync(join(root, 'dist', 'index.html'), '<p>Built for Acme Corp</p>');
  writeFileSync(join(root, 'dist', 'x.json'), '{"id":"11111111-2222-3333-4444-555555555555"}');
  writeFileSync(join(root, 'content', 'ok.md'), 'clean');
  const r = runLeakCheck({ root, dist: join(root, 'dist'), content: join(root, 'content'), blocklist: ['Acme Corp'] });
  assert.equal(r.findings.length, 2);
  assert.ok(r.findings.every((f) => !JSON.stringify(f).includes('Acme')));
  assert.ok(r.findings.some((f) => f.what === 'guid'));
});

test('contrast: ratio maths and the real tokens pass', () => {
  assert.ok(Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01);
  const css = readFileSync(new URL('../../../site/src/styles/tokens.css', import.meta.url), 'utf8');
  const themes = parseTokens(css);
  assert.deepEqual(Object.keys(themes).sort(), ['dark', 'light']);
  for (const [name, t] of Object.entries(themes)) for (const [f, b, min, what] of PAIRS) if (t[f] && t[b]) assert.ok(ratio(t[f], t[b]) >= min, `${name}: ${what} ${f}/${b} = ${ratio(t[f], t[b]).toFixed(2)}`);
});

// ---------------------------------------------------------------- leak-check: tiers, whole repo, history
import { spawnSync } from 'node:child_process';
import { scanRepo, scanHistory } from '../leak-check.mjs';

test('leak-check: hard names match inside lowercase words; short and review words need boundaries; tiers; encoded separators', () => {
  const terms = compileTerms(['Zorbco', 'Zorb Point', '# tier: review', 'Quux', 'ZQX']);
  assert.equal(scanText('zorbcogovernance and xzorbco and ZorbcoCore', terms).length, 3);   // hard names: anywhere
  assert.equal(scanText('Zorb%20Point and zorb+point and zorb_point', terms).length, 3);
  assert.equal(scanText('Quuxery quuxfoo', terms).length, 0);                              // review words: boundary
  assert.equal(scanText('Quux GRC, QuuxFoo', terms).length, 2);
  assert.equal(scanText('integrity sha512-AYzqxPx', terms).length, 0);
  assert.equal(scanText('built by ZQX.', terms).length, 1);
});

function gitRepo() {
  const root = mkdtempSync(join(tmpdir(), 'leakrepo-'));
  const git = (...a) => { const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  git('init', '-q'); git('config', 'user.email', 'dev@example.com'); git('config', 'user.name', 'Dev');
  return { root, git };
}

test('leak-check --repo: finds names in contents and file names of tracked files, ignores build output and lock files', () => {
  const { root, git } = gitRepo();
  mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'zorbco-notes'));
  writeFileSync(join(root, 'docs', 'a.md'), 'line one\nthe Zorbco project');
  writeFileSync(join(root, 'zorbco-notes', 'b.txt'), 'clean');
  writeFileSync(join(root, 'dist', 'x.html'), 'Zorbco');                  // build output: scanned separately
  writeFileSync(join(root, 'package-lock.json'), '"integrity": "Zorbco"');
  writeFileSync(join(root, 'img.bin'), Buffer.from([0, 1, 2, 90, 111]));
  git('add', '-A'); git('commit', '-qm', 'x');
  const r = scanRepo(root, compileTerms(['Zorbco']));
  const where = r.findings.map((f) => f.file).sort();
  assert.deepEqual(where, ['docs/a.md', 'zorbco-notes/b.txt']);
  assert.equal(r.findings.find((f) => f.file === 'docs/a.md').line, 2);
  assert.ok(r.findings.every((f) => !JSON.stringify(f).toLowerCase().includes('zorbco') || f.file.includes('zorbco')));  // the term text is never in the message
});

test('leak-check --history: finds a name that was committed and later removed, plus author, message and branch names; masked output', () => {
  const { root, git } = gitRepo();
  writeFileSync(join(root, 'a.txt'), 'for Zorbco');
  git('add', '-A'); git('commit', '-qm', 'first');
  writeFileSync(join(root, 'a.txt'), 'clean'); git('commit', '-qam', 'remove the mention');
  git('commit', '-q', '--allow-empty', '-m', 'notes about zorbco rollout');
  git('branch', 'feature/zorbco-demo');
  const r = scanHistory(root, compileTerms(['Zorbco']));
  assert.ok(r.commits >= 3);
  const text = JSON.stringify(r.findings);
  assert.ok(r.findings.some((f) => f.what.includes('author, message or diff')));
  assert.ok(r.findings.some((f) => f.what.includes('branch or tag name')));
  assert.ok(!/zorbco/i.test(text), 'findings must not print the term');
  const clean = gitRepo();
  writeFileSync(join(clean.root, 'a.txt'), 'nothing'); clean.git('add', '-A'); clean.git('commit', '-qm', 'ok');
  assert.deepEqual(scanHistory(clean.root, compileTerms(['Zorbco'])).findings, []);
  assert.ok(scanHistory(mkdtempSync(join(tmpdir(), 'nogit-')), compileTerms(['x'])).error);
});

test('leak-check CLI: exit codes for --require, hits and clean runs', () => {
  const { root, git } = gitRepo();
  mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'content'));
  writeFileSync(join(root, 'dist', 'i.html'), '<p>fine</p>'); writeFileSync(join(root, 'a.md'), 'Zorbco');
  git('add', '-A'); git('commit', '-qm', 'x');
  const run = (args, env = {}) => spawnSync('node', [new URL('../leak-check.mjs', import.meta.url).pathname, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, BLOCKLIST: '', ...env } });
  assert.equal(run(['--require']).status, 2);                          // no blocklist: fail closed
  assert.equal(run([]).status, 0);                                     // no blocklist and no --require: warn only
  assert.equal(run(['--require'], { BLOCKLIST: 'Zorbco' }).status, 0); // dist and content are clean
  const hit = run(['--repo'], { BLOCKLIST: 'Zorbco' });
  assert.equal(hit.status, 1);
  assert.ok(!/zorbco/i.test(hit.stderr), 'stderr must not print the term');
});

test('hook modes: --staged and --message block terms without printing them', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'hook-'));
  const sh = (...c) => spawnSync(c[0], c.slice(1), { cwd: dir, encoding: 'utf8' });
  sh('git', 'init', '-q'); sh('git', 'config', 'user.email', 'a@b.c'); sh('git', 'config', 'user.name', 'n');
  const cli = new URL('../leak-check.mjs', import.meta.url).pathname;
  const env = { ...process.env, BLOCKLIST: 'Zorbco' };
  writeFileSync(join(dir, 'ok.txt'), 'hello'); sh('git', 'add', '.');
  assert.equal(spawnSync('node', [cli, '--root', dir, '--staged', '--require'], { env, encoding: 'utf8' }).status, 0);
  writeFileSync(join(dir, 'bad.txt'), 'for zorbco'); sh('git', 'add', '.');
  const r = spawnSync('node', [cli, '--root', dir, '--staged', '--require'], { env, encoding: 'utf8' });
  assert.equal(r.status, 1); assert.ok(!/zorbco/i.test(r.stderr));
  writeFileSync(join(dir, 'msg'), 'fix Zorbco thing');
  assert.equal(spawnSync('node', [cli, '--root', dir, '--message', join(dir, 'msg')], { env, encoding: 'utf8' }).status, 1);
});
