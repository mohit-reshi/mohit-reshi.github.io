/**
 * Owner-only progress store for the hosted apps. One JSON document per app, guarded by a single key that only
 * the owner knows (Worker secret OWNER_KEY). Visitors never reach this: without the key every call is 401.
 *   GET  /state/<app>   -> { updatedAt, data }   (404 when nothing is saved yet)
 *   PUT  /state/<app>   body { updatedAt, data } (data: object of string values)
 *   GET  /health        -> { ok: true }
 */
export interface KV { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void>; }
export interface Env { OWNER_KEY?: string; ALLOWED_ORIGINS?: string; APP_STATE: KV; }

const MAX_BODY = 2 * 1024 * 1024;
const APP = /^[a-z0-9][a-z0-9-]{0,39}$/;

const origins = (env: Env) => (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
/** Compares digests of both values in constant time, so neither the key nor its length leaks through timing. */
async function keyMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function readCapped(req: Request): Promise<string | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY || !req.body) return len > MAX_BODY ? null : '';
  const reader = req.body.getReader();
  const dec = new TextDecoder();
  let text = '', total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) { await reader.cancel(); return null; }
    text += dec.decode(value, { stream: true });
  }
  return text + dec.decode();
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  const ok = !origin || origins(env).includes(origin);
  const cors: Record<string, string> = { Vary: 'Origin' };
  if (origin && ok) {
    cors['Access-Control-Allow-Origin'] = origin;
    cors['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS';
    cors['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    cors['Access-Control-Max-Age'] = '600';
  }
  const reply = (r: Response) => { for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };

  if (!ok) return json(403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return reply(new Response(null, { status: 204 }));
  if (url.pathname === '/health') return reply(json(200, { ok: true }));

  const m = /^\/state\/([^/]+)$/.exec(url.pathname);
  if (!m) return reply(json(404, { error: 'not_found' }));
  if (req.method !== 'GET' && req.method !== 'PUT') return reply(json(405, { error: 'method_not_allowed' }, { Allow: 'GET, PUT, OPTIONS' }));

  // Authenticate before anything else, and before revealing whether an app name is valid.
  const bearer = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '');
  if (!env.OWNER_KEY || !bearer || !(await keyMatches(bearer[1].trim(), env.OWNER_KEY.trim()))) return reply(json(401, { error: 'unauthorized' }));

  const app = decodeURIComponent(m[1]);
  if (!APP.test(app)) return reply(json(400, { error: 'bad_app' }));
  const kvKey = `state:${app}`;

  if (req.method === 'GET') {
    const raw = await env.APP_STATE.get(kvKey);
    return reply(raw === null ? json(404, { error: 'empty' }) : new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }));
  }

  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(json(415, { error: 'unsupported_media_type' }));
  const text = await readCapped(req);
  if (text === null) return reply(json(413, { error: 'too_large' }));
  let body: any;
  try { body = JSON.parse(text); } catch { return reply(json(400, { error: 'bad_json' })); }
  const data = body?.data;
  const valid = body && typeof body.updatedAt === 'number' && Number.isFinite(body.updatedAt) && data && typeof data === 'object' && !Array.isArray(data)
    && Object.values(data).every((v) => typeof v === 'string');
  if (!valid) return reply(json(400, { error: 'bad_request' }));
  await env.APP_STATE.put(kvKey, JSON.stringify({ updatedAt: body.updatedAt, data }));
  return reply(json(200, { ok: true }));
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
