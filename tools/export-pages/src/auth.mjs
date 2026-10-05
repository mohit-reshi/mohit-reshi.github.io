// Entra client-credentials token for the Power BI API. The token is kept in memory only.
const SCOPE = 'https://analysis.windows.net/powerbi/api/.default';

export function createTokenProvider({ tenantId, clientId, clientSecret }, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cached = null;
  return async function getToken() {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: SCOPE }).toString(),
    });
    if (!res.ok) throw new Error(`Entra token request failed (HTTP ${res.status}). Check TENANT_ID / CLIENT_ID / CLIENT_SECRET.`);
    const body = await res.json();
    cached = { token: body.access_token, expiresAt: now() + (Number(body.expires_in) || 3000) * 1000 };
    return cached.token; // never logged
  };
}
