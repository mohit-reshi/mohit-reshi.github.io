import type { Deps, Env } from './types';

const SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null; // concurrent callers share one token request
export const __resetEntraCache = () => { cached = null; inflight = null; };

/** App-only Entra token for the Power BI API, cached in memory until shortly before expiry. Never logged. */
export async function getEntraToken(env: Env, deps: Deps): Promise<string> {
  if (cached && cached.expiresAt - 120_000 > deps.now()) return cached.token;
  inflight ??= fetchToken(env, deps).finally(() => { inflight = null; });
  return inflight;
}

const clean = (v?: string) => (v ?? '').trim().replace(/^["']|["']$/g, '');

// #region token-entra | Broker: app-only Entra token (client credentials)
async function fetchToken(env: Env, deps: Deps): Promise<string> {
  // Trim: a secret pasted with a stray space, quote or line break is the most common setup mistake.
  const tenant = clean(env.TENANT_ID), clientId = clean(env.CLIENT_ID), clientSecret = (env.CLIENT_SECRET ?? '').trim().replace(/^["']|["']$/g, '');
  if (!tenant || !clientId || !clientSecret) throw new Error('missing_credentials');
  const res = await deps.fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: SCOPE }).toString(),
  });
  if (!res.ok) {
    // Entra's error code (for example invalid_client) is not secret; it helps setup debugging via DEBUG_HEALTH.
    const text = await res.text().catch(() => '');
    let err = '';
    try { err = String((JSON.parse(text) as { error?: string }).error ?? ''); } catch { /* not JSON */ }
    const aadsts = /AADSTS\d{3,7}/.exec(text)?.[0] ?? ''; // Microsoft's public error code, never a secret
    throw new Error(`entra_failed:${res.status}:${err.replace(/[^a-z_]/gi, '').slice(0, 40)}:${aadsts}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: deps.now() + (Number(body.expires_in) || 3000) * 1000 };
  return cached.token;
}
// #endregion
