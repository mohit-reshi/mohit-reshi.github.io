import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfig } from '../src/config.mjs';
import { parseEnv, requireCreds } from '../src/env.mjs';
import { createClient, waitForExport } from '../src/pbi.mjs';
import { createTokenProvider } from '../src/auth.mjs';
import { exportReport, planReport, manualCaptureList } from '../src/exporter.mjs';
import { looksBlank } from '../src/png.mjs';
import { renderContactSheet } from '../src/contact-sheet.mjs';
import { parseArgs } from '../src/cli.mjs';
import { makePng, res } from './helpers.mjs';

const G = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const cfgJson = { reports: [{ slug: 'demo-report', workspaceId: G(1), reportId: G(2) },
  { slug: 'demo-paginated', workspaceId: G(1), reportId: G(3), kind: 'paginated', parameterSets: [{ name: 'dec', parameters: [{ name: 'M', value: '2025-12-01' }] }] }] };

test('config: valid config parses with defaults', () => {
  const c = parseConfig(cfgJson);
  assert.equal(c.outDir, 'out'); assert.equal(c.reports[0].kind, 'interactive'); assert.equal(c.reports[1].parameterSets.length, 1);
});
test('config: rejects bad slug, bad guid, duplicates, bad identity', () => {
  assert.throws(() => parseConfig({ reports: [{ slug: 'Bad Slug', workspaceId: 'x', reportId: G(2) }] }), /kebab-case[\s\S]*GUID/);
  assert.throws(() => parseConfig({ reports: [cfgJson.reports[0], cfgJson.reports[0]] }), /duplicated/);
  assert.throws(() => parseConfig({ reports: [{ ...cfgJson.reports[0], identities: { p: { username: 'a' } } }] }), /needs username and roles/);
  assert.throws(() => parseConfig({}), /non-empty/);
});
test('env: parses .env text and reports missing credentials', () => {
  assert.deepEqual(parseEnv('# c\nA=1\nB="two words"\n'), { A: '1', B: 'two words' });
  assert.throws(() => requireCreds({ TENANT_ID: 't' }), /CLIENT_ID, CLIENT_SECRET/);
});
test('cli args', () => {
  assert.deepEqual(parseArgs(['--only', 'x', '--format', 'PDF', '--dry-run']), { config: 'export.config.json', dryRun: true, only: 'x', format: 'pdf' });
  assert.throws(() => parseArgs(['--format', 'gif']), /png or pdf/);
  assert.throws(() => parseArgs(['--nope']), /Unknown/);
});
test('auth: caches token until near expiry', async () => {
  let calls = 0, t = 0;
  const get = createTokenProvider({ tenantId: 't', clientId: 'c', clientSecret: 's' }, { now: () => t, fetchImpl: async (url, init) => { calls++; assert.match(url, /oauth2\/v2\.0\/token/); assert.match(init.body, /powerbi%2Fapi%2F\.default/); return res(200, { access_token: 'TOKEN', expires_in: 3600 }); } });
  await get(); await get(); assert.equal(calls, 1);
  t = 3_600_000; await get(); assert.equal(calls, 2);
});
test('client: retries 429 honoring Retry-After', async () => {
  const sleeps = []; let n = 0;
  const c = createClient(async () => 'T', { sleep: async (ms) => sleeps.push(ms), fetchImpl: async () => (n++ < 2 ? res(429, {}, { 'retry-after': '7' }) : res(200, { value: [1] })) });
  assert.deepEqual(await c.listPages('w', 'r'), [1]); assert.deepEqual(sleeps, [7000, 7000]);
});
test('client: non-retryable error does not echo ids', async () => {
  const c = createClient(async () => 'T', { fetchImpl: async () => res(403, { error: 'no' }) });
  await assert.rejects(c.listPages(G(1), G(2)), (e) => e.status === 403 && !e.message.includes(G(1)));
});
test('waitForExport: polls with Retry-After then succeeds; fails; times out', async () => {
  const seq = [{ body: { status: 'Running' }, retryAfter: 3 }, { body: { status: 'Running' }, retryAfter: 0 }, { body: { status: 'Succeeded' }, retryAfter: 0 }];
  const sleeps = []; const client = { getExport: async () => seq.shift() };
  const done = await waitForExport(client, 'w', 'r', 'e', { sleep: async (ms) => sleeps.push(ms), defaultDelayMs: 111 });
  assert.equal(done.status, 'Succeeded'); assert.deepEqual(sleeps, [3000, 111]);
  await assert.rejects(waitForExport({ getExport: async () => ({ body: { status: 'Failed', error: { code: 'X' } }, retryAfter: 0 }) }, 'w', 'r', 'e'), /Export failed: X/);
  let t = 0;
  await assert.rejects(waitForExport({ getExport: async () => ({ body: { status: 'Running' }, retryAfter: 0 }) }, 'w', 'r', 'e', { sleep: async () => { t += 60_000; }, now: () => t, timeoutMs: 120_000 }), /timed out/);
});
test('png blank heuristic', () => {
  assert.equal(looksBlank(makePng(64, 64, () => [240, 240, 240])), true);
  assert.equal(looksBlank(makePng(64, 64, (x, y) => [(x * 4) & 255, (y * 4) & 255, 90])), false);
  assert.equal(looksBlank(Buffer.from('not a png')), null);
});
test('plan: file names are index based and identity is checked', () => {
  const c = parseConfig({ reports: [{ ...cfgJson.reports[0], identities: { employer: { username: 'u@example.com', roles: ['R'] } } }] }).reports[0];
  assert.equal(planReport(c, {}).ext, 'png'); assert.equal(planReport(c, { format: 'pdf' }).ext, 'pdf');
  assert.equal(planReport(c, { identity: 'employer' }).tag, '.employer'); assert.match(planReport(c, { identity: 'nobody' }).skip, /no identity/);
});

test('exportReport: index-based files, pages.json, resume, failure and blank handling', async () => {
  const out = await mkdtemp(join(tmpdir(), 'exp-'));
  const report = parseConfig(cfgJson).reports[0];
  const good = makePng(64, 64, (x, y) => [x * 3, y * 3, 50]), blank = makePng(64, 64, () => [255, 255, 255]);
  const bodies = []; let id = 0;
  const client = {
    listPages: async () => [{ name: 'Sec3', displayName: 'Acme Third', order: 2 }, { name: 'Sec1', displayName: 'First', order: 0 }, { name: 'Sec2', displayName: 'Second', order: 1 }],
    startExport: async (w, r, body) => { bodies.push(body); return { id: 'e' + id++ }; },
    getExport: async () => ({ body: { status: 'Succeeded' }, retryAfter: 0 }),
    downloadExport: async () => (bodies.at(-1).powerBIReportConfiguration.pages[0].pageName === 'Sec2' ? blank : good),
  };
  const r1 = await exportReport(client, report, { outDir: out, concurrency: 1, sleep: async () => {} });
  assert.deepEqual((await readdir(join(out, 'demo-report', 'pages'))).sort(), ['01-page.png', '02-page.png', '03-page.png']);
  assert.deepEqual(r1.items.map((i) => i.status), ['ok', 'blank', 'ok']);
  assert.equal(bodies[0].format, 'PNG'); assert.equal(bodies[0].powerBIReportConfiguration.pages[0].pageName, 'Sec1');
  const pj = JSON.parse(await readFile(join(out, 'demo-report', 'pages.json'), 'utf8'));
  assert.equal(pj.pages[2].displayName, 'Acme Third');
  assert.match(manualCaptureList([r1])[0], /02-page\.png.*blank/);
  const before = bodies.length;
  const r2 = await exportReport(client, report, { outDir: out, concurrency: 1, sleep: async () => {} });
  assert.equal(bodies.length, before); assert.ok(r2.items.every((i) => i.status === 'skipped-existing'));
  assert.ok(renderContactSheet([r1]).includes('class="bad"'));
});
test('exportReport: a failing page does not stop the others; RLS identity and paginated bodies', async () => {
  const out = await mkdtemp(join(tmpdir(), 'exp-'));
  const cfg = parseConfig({ reports: [{ ...cfgJson.reports[0], identities: { employer: { username: 'u@example.com', roles: ['R'], datasets: [G(9)] } } }, cfgJson.reports[1]] });
  const bodies = [];
  const client = {
    listPages: async () => [{ name: 'A', displayName: 'A', order: 0 }, { name: 'B', displayName: 'B', order: 1 }],
    startExport: async (w, r, body) => { bodies.push(body); if (body.powerBIReportConfiguration?.pages[0].pageName === 'A') throw new Error('boom'); return { id: 'e' }; },
    getExport: async () => ({ body: { status: 'Succeeded' }, retryAfter: 0 }), downloadExport: async () => makePng(8, 8, (x) => [x * 30, 5, 5]),
  };
  const r = await exportReport(client, cfg.reports[0], { outDir: out, identity: 'employer', concurrency: 1, sleep: async () => {} });
  assert.deepEqual(r.items.map((i) => i.status), ['failed', 'ok']);
  assert.deepEqual(bodies[1].powerBIReportConfiguration.identities, [{ username: 'u@example.com', roles: ['R'], datasets: [G(9)] }]);
  const p = await exportReport({ ...client, downloadExport: async () => Buffer.from('%PDF') }, cfg.reports[1], { outDir: out, sleep: async () => {} });
  assert.equal(bodies.at(-1).format, 'PDF'); assert.deepEqual(bodies.at(-1).paginatedReportConfiguration.parameterValues, [{ name: 'M', value: '2025-12-01' }]);
  assert.equal(p.items[0].file, 'pages/dec.pdf');
});
