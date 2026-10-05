import type { Deps, Env, ReportConfig, ReportsConfig } from './types';
import { parseReportsConfig } from './config';
import { allowedOrigins, corsHeaders, json, readJson } from './http';
import { getEntraToken } from './entra';
import { exportReport, generateToken, getReport } from './pbi';
import { makeRateLimiter } from './ratelimit';
import { MOCK_PDF, mockToken } from './mock';

const ALLOWED_FIELDS = new Set(['reportKey', 'persona', 'format', 'turnstileToken']);
let health: { at: number; value: { ok: boolean; checkedAt: string; reason?: string; shape?: Record<string, string> } } | null = null;
let configCache: { raw: string; parsed: ReportsConfig } | null = null;
export const __resetState = () => { health = null; configCache = null; };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Debug aid: says whether each credential has the expected shape, never the value itself. */
function credentialShape(env: Env): Record<string, string> {
  const strip = (v?: string) => (v ?? '').trim().replace(/^["']|["']$/g, '');
  const guid = (v?: string) => { const x = strip(v); return !x ? 'missing' : GUID.test(x) ? 'guid_ok' : `not_a_guid(len ${x.length})`; };
  const secret = strip(env.CLIENT_SECRET);
  return { tenantId: guid(env.TENANT_ID), clientId: guid(env.CLIENT_ID), clientSecret: !secret ? 'missing' : `len ${secret.length}` };
}

const isMock = (env: Env) => env.MOCK === 'true';
const ttl = (env: Env) => Math.min(60, Math.max(10, Number(env.TOKEN_TTL) || 30));

function loadConfig(env: Env): ReportsConfig {
  const raw = env.REPORTS_CONFIG ?? '';
  if (!configCache || configCache.raw !== raw) configCache = { raw, parsed: parseReportsConfig(raw) };
  return configCache.parsed;
}

/** The ONLY identity source: the persona key from the client is looked up in server-side config. */
function resolvePersona(r: ReportConfig, persona: unknown): { key: string | null } | { error: Response } {
  if (persona !== undefined && typeof persona !== 'string') return { error: json(400, { error: 'bad_request' }) };
  const keys = Object.keys(r.personas);
  if (!r.rls) return persona && !keys.includes(persona as string) ? { error: json(400, { error: 'unknown_persona' }) } : { key: null };
  const key = persona ?? r.defaultPersona;
  if (!key || !keys.includes(key)) return { error: json(400, { error: 'unknown_persona' }) };
  return { key };
}

async function verifyTurnstile(env: Env, deps: Deps, token: unknown, ip: string): Promise<boolean> {
  if (env.TURNSTILE_ENABLED !== 'true') return true;
  if (typeof token !== 'string' || !env.TURNSTILE_SECRET) return false;
  const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }).toString(),
  });
  return res.ok && ((await res.json()) as { success?: boolean }).success === true;
}

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  const cors = corsHeaders(env, origin);
  const allowed = !!origin && allowedOrigins(env).includes(origin);
  const reply = (r: Response) => { for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';

  if (req.method === 'OPTIONS') return allowed ? reply(new Response(null, { status: 204 })) : json(403, { error: 'origin_not_allowed' });

  if (url.pathname === '/health') {
    if (req.method !== 'GET') return reply(json(405, { error: 'method_not_allowed' }, { Allow: 'GET, OPTIONS' }));
    if (health && deps.now() - health.at < 60_000) return reply(json(200, health.value));
    let ok = false;
    let reason: string | undefined;
    if (isMock(env)) ok = true;
    else {
      try {
        const cfg = loadConfig(env);
        await getEntraToken(env, deps);
        for (const r of Object.values(cfg)) { try { await getReport(env, deps, r); ok = true; break; } catch (e) { reason ??= (e as Error).message; } }
        if (ok) reason = undefined;
      } catch (e) { ok = false; reason = (e as Error).message.startsWith('entra_failed') || (e as Error).message === 'missing_credentials' ? (e as Error).message : 'config_invalid'; }
    }
    health = { at: deps.now(), value: { ok, checkedAt: new Date(deps.now()).toISOString(), ...(!ok && reason && env.DEBUG_HEALTH === 'true' ? { reason, shape: credentialShape(env) } : {}) } };
    return reply(json(200, health.value));
  }

  if (url.pathname !== '/token' && url.pathname !== '/export') return reply(json(404, { error: 'not_found' }));
  if (req.method !== 'POST') return reply(json(405, { error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' }));
  if (!allowed) return json(403, { error: 'origin_not_allowed' });

  const isExport = url.pathname === '/export';
  if (isExport && env.EXPORT_ENABLED !== 'true') return reply(json(404, { error: 'export_disabled' }));
  if (!(await deps.rateLimit(isExport ? 'export' : 'token', ip, isExport ? 3 : 20, 60))) return reply(json(429, { error: 'rate_limited' }, { 'Retry-After': '60' }));

  const body = await readJson(req);
  if (body instanceof Response) return reply(body);
  const extra = Object.keys(body).filter((k) => !ALLOWED_FIELDS.has(k));
  if (extra.length) return reply(json(400, { error: 'unexpected_field' })); // never accept identities, datasets, roles, usernames
  if (typeof body.reportKey !== 'string') return reply(json(400, { error: 'bad_request' }));
  if (!(await verifyTurnstile(env, deps, body.turnstileToken, ip))) return reply(json(403, { error: 'turnstile_failed' }));

  let cfg: ReportsConfig;
  try { cfg = loadConfig(env); } catch { return reply(json(500, { error: 'server_misconfigured' })); }
  const r = Object.prototype.hasOwnProperty.call(cfg, body.reportKey) ? cfg[body.reportKey] : undefined;
  if (!r) return reply(json(404, { error: 'unknown_report' }));
  const who = resolvePersona(r, body.persona);
  if ('error' in who) return reply(who.error);

  try {
    if (!isExport) {
      if (isMock(env)) return reply(json(200, mockToken(body.reportKey, r, who.key, deps.now(), ttl(env))));
      const [meta, tok] = await Promise.all([getReport(env, deps, r), generateToken(env, deps, r, who.key, ttl(env))]);
      return reply(json(200, { reportId: r.reportId, embedUrl: meta.embedUrl, accessToken: tok.token, expiration: tok.expiration, kind: r.kind }));
    }
    if (!r.exportEnabled) return reply(json(404, { error: 'export_disabled' }));
    const format = body.format === 'PNG' ? 'PNG' : body.format === undefined || body.format === 'PDF' ? 'PDF' : null;
    if (!format) return reply(json(400, { error: 'bad_format' }));
    if (isMock(env)) return reply(new Response(MOCK_PDF, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${body.reportKey}.pdf"`, 'Cache-Control': 'no-store' } }));
    const file = await exportReport(env, deps, r, who.key, format);
    return reply(new Response(file.body, { headers: { 'Content-Type': file.headers.get('Content-Type') ?? 'application/octet-stream', 'Content-Disposition': `attachment; filename="${body.reportKey}.${format.toLowerCase()}"`, 'Cache-Control': 'no-store' } }));
  } catch (e) {
    // Minimal error body: no upstream text, no tokens, no IDs.
    return reply(json(502, { error: 'upstream_failed', ...(env.DEBUG_HEALTH === 'true' ? { detail: (e as Error).message } : {}) }));
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env, { fetch: (...a) => fetch(...a), now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), rateLimit: makeRateLimiter(env) });
  },
};
