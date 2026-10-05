import { beforeEach, describe, expect, it } from 'vitest';
import { handle, __resetState } from '../src/index';
import { __resetEntraCache } from '../src/entra';
import { parseReportsConfig } from '../src/config';
import { buildGenerateTokenBody } from '../src/pbi';
import type { Deps, Env } from '../src/types';

const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const REPORTS = {
  reports: {
    plain: { kind: 'interactive', workspaceId: G(1), reportId: G(2), datasetIds: [G(3)], rls: false, personas: {} },
    portal: { kind: 'interactive', workspaceId: G(1), reportId: G(4), datasetIds: [G(5)], rls: true, defaultPersona: 'employer',
      personas: { employer: { username: 'emp@example.com', roles: ['EmployerRole'] }, member: { username: 'mem@example.com', roles: ['MemberRole'] } } },
    paged: { kind: 'paginated', workspaceId: G(1), reportId: G(6), datasetIds: [], rls: false, personas: {}, exportEnabled: true },
  },
};
const ORIGIN = 'https://site.example';
const baseEnv = (over: Partial<Env> = {}): Env => ({ ALLOWED_ORIGINS: ORIGIN, MOCK: 'false', TOKEN_TTL: '30', TENANT_ID: 't', CLIENT_ID: 'c', CLIENT_SECRET: 's', REPORTS_CONFIG: JSON.stringify(REPORTS), ...over });

type Call = { url: string; method: string; body?: any; auth?: string | null };
function makeDeps(opts: { now?: () => number; allow?: boolean; failPbi?: boolean } = {}) {
  const calls: Call[] = [];
  let t = 1_700_000_000_000;
  const deps: Deps = {
    now: opts.now ?? (() => t),
    sleep: async (ms) => { t += ms; },
    rateLimit: async () => opts.allow !== false,
    fetch: (async (input: any, init: any = {}) => {
      const url = String(input);
      const c: Call = { url, method: init.method ?? 'GET', body: init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body, auth: init.headers?.Authorization ?? null };
      calls.push(c);
      if (url.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'ENTRA_TOKEN', expires_in: 3600 }));
      if (opts.failPbi) return new Response('{"error":{"message":"SECRET DETAILS"}}', { status: 400 });
      if (url.endsWith('/GenerateToken')) return new Response(JSON.stringify({ token: 'EMBED_TOKEN', tokenId: 'x', expiration: '2030-01-01T00:00:00Z' }));
      if (/\/exports\/[^/]+\/file$/.test(url)) return new Response('PDFBYTES', { headers: { 'Content-Type': 'application/pdf' } });
      if (/\/exports\/[^/]+$/.test(url)) return new Response(JSON.stringify({ status: 'Succeeded' }));
      if (url.endsWith('/ExportTo')) return new Response(JSON.stringify({ id: 'job1' }));
      if (/\/reports\/[^/]+$/.test(url)) return new Response(JSON.stringify({ id: 'r', embedUrl: 'https://app.powerbi.com/reportEmbed?x=1', datasetId: G(3) }));
      return new Response('{}', { status: 404 });
    }) as any,
  };
  return { deps, calls };
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://broker.example' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '1.2.3.4', ...headers }, body: JSON.stringify(body) });

beforeEach(() => { __resetState(); __resetEntraCache(); });

describe('config validation', () => {
  it('accepts the example shape', () => expect(Object.keys(parseReportsConfig(JSON.stringify(REPORTS)))).toEqual(['plain', 'portal', 'paged']));
  it('rejects bad guid, rls without personas, identities on non-rls, unknown default persona', () => {
    const bad = (r: any) => () => parseReportsConfig(JSON.stringify({ reports: { x: { kind: 'interactive', workspaceId: G(1), reportId: G(2), datasetIds: [G(3)], rls: false, personas: {}, ...r } } }));
    expect(bad({ workspaceId: 'nope' })).toThrow(/workspaceId/);
    expect(bad({ rls: true })).toThrow(/no personas/);
    expect(bad({ personas: { a: { username: 'u', roles: ['r'] } } })).toThrow(/only allowed when rls is true/);
    expect(bad({ rls: true, personas: { a: { username: 'u', roles: ['r'] } }, defaultPersona: 'zzz' })).toThrow(/defaultPersona/);
    expect(bad({ datasetIds: [] })).toThrow(/datasetIds/);
    expect(() => parseReportsConfig('not json')).toThrow(/not valid JSON/);
    expect(() => parseReportsConfig(undefined)).toThrow(/not set/);
  });
});

describe('credential hygiene', () => {
  it('trims whitespace and quotes from the Entra credentials before use', async () => {
    const { deps, calls } = makeDeps();
    const res = await handle(post('/token', { reportKey: 'plain' }), baseEnv({ TENANT_ID: ' "tenant-x"\r\n', CLIENT_ID: "'cid'\n", CLIENT_SECRET: ' sec \n' }), deps);
    expect(res.status).toBe(200);
    const entra = calls.find((c) => c.url.includes('login.microsoftonline.com'))!;
    expect(entra.url).toContain('/tenant-x/');
    expect(String(entra.body)).toContain('client_id=cid&');
    expect(String(entra.body)).toContain('client_secret=sec&');
  });
});

describe('POST /token debug detail', () => {
  it('shows the Power BI status and error code only with DEBUG_HEALTH, never tokens', async () => {
    const off = await handle(post('/token', { reportKey: 'plain' }), baseEnv(), makeDeps({ failPbi: true }).deps);
    expect(off.status).toBe(502);
    expect(await off.json()).toEqual({ error: 'upstream_failed' });
    __resetState(); __resetEntraCache();
    const on = (await (await handle(post('/token', { reportKey: 'plain' }), baseEnv({ DEBUG_HEALTH: 'true' }), makeDeps({ failPbi: true }).deps)).json()) as any;
    expect(on.detail).toMatch(/^pbi_(report|generate_token)_failed:400:/);
    expect(JSON.stringify(on)).not.toMatch(/ENTRA_TOKEN/);
  });
});

describe('GET /health reason', () => {
  const get = () => new Request('https://broker.example/health', { headers: { Origin: ORIGIN } });
  it('hides the reason by default and shows a non-secret code with DEBUG_HEALTH', async () => {
    const mk = () => { const { deps } = makeDeps({ failPbi: true }); return deps; };
    const hidden = (await (await handle(get(), baseEnv(), mk())).json()) as any;
    expect(hidden.ok).toBe(false); expect(hidden.reason).toBeUndefined();
    __resetState(); __resetEntraCache();
    const shown = (await (await handle(get(), baseEnv({ DEBUG_HEALTH: 'true' }), mk())).json()) as any;
    expect(shown.reason).toMatch(/^pbi_report_failed:400:/);
    expect(JSON.stringify(shown)).not.toMatch(/ENTRA_TOKEN/);
    expect(shown.shape).toEqual({ tenantId: 'not_a_guid(len 1)', clientId: 'not_a_guid(len 1)', clientSecret: 'len 1' });
  });
});

describe('POST /token', () => {
  it('rejects prototype-key personas for non-RLS reports', async () => {
    const { deps } = makeDeps();
    const res = await handle(post('/token', { reportKey: 'plain', persona: 'constructor' }), baseEnv(), deps);
    expect(res.status).toBe(400);
  });
  it('caps the body even without a content-length header', async () => {
    const { deps } = makeDeps();
    const big = JSON.stringify({ reportKey: 'plain', pad: 'x'.repeat(20000) });
    const req = new Request('https://broker.example/token', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }), duplex: 'half' } as any);
    expect((await handle(req, baseEnv(), deps)).status).toBe(413);
  });
  it('maps persona to the server-side identity and sends identities only for RLS reports', async () => {
    const { deps, calls } = makeDeps();
    const res = await handle(post('/token', { reportKey: 'portal', persona: 'member' }), baseEnv(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accessToken: 'EMBED_TOKEN', kind: 'interactive', reportId: G(4), embedUrl: expect.stringContaining('reportEmbed') });
    const gen = calls.find((c) => c.url.endsWith('/GenerateToken'))!;
    expect(gen.body.identities).toEqual([{ username: 'mem@example.com', roles: ['MemberRole'], datasets: [G(5)] }]);
    expect(gen.body.datasets).toEqual([{ id: G(5) }]);
    expect(gen.body.lifetimeInMinutes).toBe(30);
    expect(gen.auth).toBe('Bearer ENTRA_TOKEN');
  });
  it('uses the default persona when none is given', async () => {
    const { deps, calls } = makeDeps();
    await handle(post('/token', { reportKey: 'portal' }), baseEnv(), deps);
    expect(calls.find((c) => c.url.endsWith('/GenerateToken'))!.body.identities[0].username).toBe('emp@example.com');
  });
  it('omits identities for non-RLS and paginated reports', async () => {
    const { deps, calls } = makeDeps();
    await handle(post('/token', { reportKey: 'plain' }), baseEnv(), deps);
    await handle(post('/token', { reportKey: 'paged' }), baseEnv(), deps);
    const gens = calls.filter((c) => c.url.endsWith('/GenerateToken'));
    expect(gens[0].body.identities).toBeUndefined();
    expect(gens[1].body.identities).toBeUndefined();
    expect(gens[1].body.datasets).toBeUndefined();
  });
  it('rejects any client-supplied identity, dataset or role', async () => {
    const { deps, calls } = makeDeps();
    for (const extra of [{ identities: [{ username: 'x' }] }, { username: 'admin@x.com' }, { roles: ['Admin'] }, { datasetId: G(9) }, { datasets: [G(9)] }, { effectiveUserName: 'x' }]) {
      const res = await handle(post('/token', { reportKey: 'portal', persona: 'member', ...extra }), baseEnv(), deps);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'unexpected_field' });
    }
    expect(calls.length).toBe(0);
  });
  it('rejects unknown report keys and personas (including prototype keys)', async () => {
    const { deps } = makeDeps();
    expect((await handle(post('/token', { reportKey: 'nope' }), baseEnv(), deps)).status).toBe(404);
    expect((await handle(post('/token', { reportKey: 'constructor' }), baseEnv(), deps)).status).toBe(404);
    expect((await handle(post('/token', { reportKey: 'portal', persona: 'admin' }), baseEnv(), deps)).status).toBe(400);
    expect((await handle(post('/token', { reportKey: 'portal', persona: 'constructor' }), baseEnv(), deps)).status).toBe(400);
    expect((await handle(post('/token', { reportKey: 'plain', persona: 'employer' }), baseEnv(), deps)).status).toBe(400);
    expect((await handle(post('/token', { reportKey: 5 }), baseEnv(), deps)).status).toBe(400);
  });
  it('caches the Entra token between requests and refreshes near expiry', async () => {
    let t = 1_700_000_000_000;
    const { deps, calls } = makeDeps({ now: () => t });
    await handle(post('/token', { reportKey: 'plain' }), baseEnv(), deps);
    await handle(post('/token', { reportKey: 'plain' }), baseEnv(), deps);
    expect(calls.filter((c) => c.url.includes('login.microsoftonline.com')).length).toBe(1);
    t += 3500 * 1000;
    await handle(post('/token', { reportKey: 'plain' }), baseEnv(), deps);
    expect(calls.filter((c) => c.url.includes('login.microsoftonline.com')).length).toBe(2);
  });
  it('returns a minimal error body when Power BI fails and never leaks upstream text', async () => {
    const { deps } = makeDeps({ failPbi: true });
    const res = await handle(post('/token', { reportKey: 'plain' }), baseEnv(), deps);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe('{"error":"upstream_failed"}');
  });
  it('mock mode returns deterministic fake tokens without calling out', async () => {
    const { deps, calls } = makeDeps();
    const res = await handle(post('/token', { reportKey: 'portal', persona: 'member' }), baseEnv({ MOCK: 'true', TENANT_ID: undefined }), deps);
    const body = await res.json() as any;
    expect(body.accessToken).toBe('mock-token.portal.member');
    expect(body.embedUrl).toContain('mock.invalid');
    expect(calls.length).toBe(0);
  });
  it('is misconfigured (500) rather than crashing when REPORTS_CONFIG is invalid', async () => {
    const { deps } = makeDeps();
    expect((await handle(post('/token', { reportKey: 'plain' }), baseEnv({ REPORTS_CONFIG: '{}' }), deps)).status).toBe(500);
  });
});

describe('request hygiene', () => {
  it('CORS: allowed origin is reflected, others are rejected', async () => {
    const { deps } = makeDeps();
    const ok = await handle(post('/token', { reportKey: 'plain' }), baseEnv({ MOCK: 'true' }), deps);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ok.headers.get('Vary')).toBe('Origin');
    const bad = await handle(post('/token', { reportKey: 'plain' }, { Origin: 'https://evil.example' }), baseEnv({ MOCK: 'true' }), deps);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const noOrigin = new Request('https://b.example/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"reportKey":"plain"}' });
    expect((await handle(noOrigin, baseEnv({ MOCK: 'true' }), deps)).status).toBe(403);
  });
  it('CORS preflight', async () => {
    const { deps } = makeDeps();
    const pre = await handle(new Request('https://b.example/token', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), baseEnv(), deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect((await handle(new Request('https://b.example/token', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), baseEnv(), deps)).status).toBe(403);
  });
  it('method checks, size limit, content type, bad JSON, unknown paths', async () => {
    const { deps } = makeDeps();
    const env = baseEnv({ MOCK: 'true' });
    expect((await handle(new Request('https://b.example/token', { method: 'GET', headers: { Origin: ORIGIN } }), env, deps)).status).toBe(405);
    expect((await handle(new Request('https://b.example/health', { method: 'POST', headers: { Origin: ORIGIN } }), env, deps)).status).toBe(405);
    expect((await handle(post('/token', { reportKey: 'plain', pad: 'x'.repeat(2000) }), env, deps)).status).toBe(413);
    expect((await handle(new Request('https://b.example/token', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: 'x' }), env, deps)).status).toBe(415);
    expect((await handle(new Request('https://b.example/token', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{bad' }), env, deps)).status).toBe(400);
    expect((await handle(new Request('https://b.example/other', { method: 'GET', headers: { Origin: ORIGIN } }), env, deps)).status).toBe(404);
  });
  it('rate limit returns 429 with Retry-After', async () => {
    const { deps } = makeDeps({ allow: false });
    const res = await handle(post('/token', { reportKey: 'plain' }), baseEnv({ MOCK: 'true' }), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });
  it('turnstile (when enabled) must pass', async () => {
    const { deps } = makeDeps();
    const env = baseEnv({ MOCK: 'true', TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET: 'x' });
    expect((await handle(post('/token', { reportKey: 'plain' }), env, deps)).status).toBe(403);
    const ok = { ...deps, fetch: (async () => new Response(JSON.stringify({ success: true }))) as any };
    expect((await handle(post('/token', { reportKey: 'plain', turnstileToken: 't' }), env, ok)).status).toBe(200);
  });
});

describe('GET /health', () => {
  const get = () => new Request('https://b.example/health', { headers: { Origin: ORIGIN } });
  it('is ok only when Entra and a report are reachable, and is cached for 60s', async () => {
    let t = 1_700_000_000_000;
    const { deps, calls } = makeDeps({ now: () => t });
    const first = await (await handle(get(), baseEnv(), deps)).json() as any;
    expect(first.ok).toBe(true);
    const n = calls.length;
    await handle(get(), baseEnv(), deps);
    expect(calls.length).toBe(n);
    t += 61_000;
    await handle(get(), baseEnv(), deps);
    expect(calls.length).toBeGreaterThan(n);
  });
  it('is not ok when Power BI is unreachable, or credentials are missing', async () => {
    const { deps } = makeDeps({ failPbi: true });
    expect(((await (await handle(get(), baseEnv(), deps)).json()) as any).ok).toBe(false);
    __resetState(); __resetEntraCache();
    expect(((await (await handle(get(), baseEnv({ CLIENT_SECRET: undefined }), makeDeps().deps)).json()) as any).ok).toBe(false);
  });
  it('mock mode is ok', async () => {
    expect(((await (await handle(get(), baseEnv({ MOCK: 'true' }), makeDeps().deps)).json()) as any).ok).toBe(true);
  });
});

describe('POST /export', () => {
  it('is 404 unless EXPORT_ENABLED and the report allows it', async () => {
    const { deps } = makeDeps();
    expect((await handle(post('/export', { reportKey: 'paged' }), baseEnv(), deps)).status).toBe(404);
    expect((await handle(post('/export', { reportKey: 'plain' }), baseEnv({ EXPORT_ENABLED: 'true' }), deps)).status).toBe(404);
  });
  it('streams the exported PDF with the persona identity for RLS reports', async () => {
    const { deps, calls } = makeDeps();
    const env = baseEnv({ EXPORT_ENABLED: 'true', REPORTS_CONFIG: JSON.stringify({ reports: { ...REPORTS.reports, portal: { ...REPORTS.reports.portal, exportEnabled: true } } }) });
    const res = await handle(post('/export', { reportKey: 'portal', persona: 'member' }), env, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(await res.text()).toBe('PDFBYTES');
    const start = calls.find((c) => c.url.endsWith('/ExportTo'))!;
    expect(start.body.powerBIReportConfiguration.identities[0].username).toBe('mem@example.com');
    const paged = await handle(post('/export', { reportKey: 'paged' }), env, deps);
    expect(paged.status).toBe(200);
    expect(calls.filter((c) => c.url.endsWith('/ExportTo')).at(-1)!.body.format).toBe('PDF');
  });
  it('mock export returns a tiny pdf; bad format is rejected', async () => {
    const { deps } = makeDeps();
    const env = baseEnv({ MOCK: 'true', EXPORT_ENABLED: 'true' });
    const res = await handle(post('/export', { reportKey: 'paged' }), env, deps);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(5);
    expect((await handle(post('/export', { reportKey: 'paged', format: 'EXE' }), env, deps)).status).toBe(400);
  });
});

describe('body builder', () => {
  it('never includes identities without rls', () => {
    const cfg = parseReportsConfig(JSON.stringify(REPORTS));
    expect(buildGenerateTokenBody(cfg.plain, 'x', 20).identities).toBeUndefined();
    expect(buildGenerateTokenBody(cfg.portal, 'member', 20).identities).toHaveLength(1);
  });
});
