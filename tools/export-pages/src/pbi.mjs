// Thin Power BI REST client with retry/backoff and Retry-After handling. fetch and sleep are injectable for tests.
const API = 'https://api.powerbi.com/v1.0/myorg';
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

export class PbiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

export function createClient(getToken, { fetchImpl = fetch, sleep = sleepReal, maxRetries = 5 } = {}) {
  async function request(method, path, { json, raw = false } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(API + path, {
        method,
        headers: { authorization: `Bearer ${await getToken()}`, ...(json ? { 'content-type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new PbiError(`HTTP ${res.status} after ${attempt} retries on ${method} ${path.replace(/[0-9a-f-]{36}/gi, '<id>')}`, res.status);
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        let body = '';
        try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
        throw new PbiError(`HTTP ${res.status} on ${method} ${path.replace(/[0-9a-f-]{36}/gi, '<id>')}: ${body}`, res.status, body);
      }
      return raw ? res : res.status === 204 ? null : res.json();
    }
  }

  const rp = (ws, rep) => `/groups/${ws}/reports/${rep}`;
  return {
    listPages: async (ws, rep) => (await request('GET', `${rp(ws, rep)}/pages`)).value,
    startExport: (ws, rep, body) => request('POST', `${rp(ws, rep)}/ExportTo`, { json: body }),
    getExport: (ws, rep, id) => request('GET', `${rp(ws, rep)}/exports/${id}`, { raw: true }).then(async (res) => ({ body: await res.json(), retryAfter: Number(res.headers.get('retry-after')) || 0 })),
    downloadExport: async (ws, rep, id) => Buffer.from(await (await request('GET', `${rp(ws, rep)}/exports/${id}/file`, { raw: true })).arrayBuffer()),
  };
}

/** Poll an export job until it succeeds, fails or times out. Honors Retry-After. */
export async function waitForExport(client, ws, rep, id, { sleep = sleepReal, timeoutMs = 10 * 60_000, now = () => Date.now(), defaultDelayMs = 5000 } = {}) {
  const start = now();
  for (;;) {
    const { body, retryAfter } = await client.getExport(ws, rep, id);
    if (body.status === 'Succeeded') return body;
    if (body.status === 'Failed') throw new PbiError(`Export failed: ${body.error?.code || 'unknown error'}`, 0, body);
    if (now() - start > timeoutMs) throw new PbiError('Export timed out', 0, body);
    await sleep(retryAfter > 0 ? retryAfter * 1000 : defaultDelayMs);
  }
}
