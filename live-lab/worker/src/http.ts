import type { Env } from './types';

export const MAX_BODY = 1024;

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}

/** Read a small JSON body. Returns a Response when the request must be rejected. */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY) return json(413, { error: 'too_large' });
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return json(415, { error: 'unsupported_media_type' });
  // Stream with a hard cap so a missing/lying content-length cannot buffer an unbounded body.
  let text = '';
  if (req.body) {
    const reader = req.body.getReader();
    const dec = new TextDecoder();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY) { await reader.cancel().catch(() => {}); return json(413, { error: 'too_large' }); }
      text += dec.decode(value, { stream: true });
    }
    text += dec.decode();
  }
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return json(400, { error: 'bad_request' });
    return v as Record<string, unknown>;
  } catch { return json(400, { error: 'bad_request' }); }
}
