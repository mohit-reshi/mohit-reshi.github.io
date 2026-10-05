import type { HealthInfo, ReportEntry, TokenInfo } from './types';

export interface Broker {
  health(timeoutMs: number): Promise<HealthInfo>;
  token(reportKey: string, persona: string | null): Promise<TokenInfo>;
  exportFile(reportKey: string, persona: string | null, format: 'PDF' | 'PNG'): Promise<Blob>;
}

/** Offline broker used when brokerUrl is "mock:" (demo and tests): fake but same shapes as the Worker. */
export function createMockBroker(reports: ReportEntry[]): Broker {
  return {
    async health() { return { ok: true, checkedAt: new Date().toISOString() }; },
    async token(reportKey, persona) {
      const r = reports.find((x) => x.key === reportKey);
      if (!r) throw new Error('unknown_report');
      return { reportId: `mock-${reportKey}`, embedUrl: `https://mock.invalid/reportEmbed?key=${encodeURIComponent(reportKey)}`, accessToken: `mock-token.${reportKey}.${persona ?? 'none'}`, expiration: new Date(Date.now() + 30 * 60_000).toISOString(), kind: r.kind };
    },
    async exportFile() { return new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }); },
  };
}

export class BrokerError extends Error { constructor(public status: number, public code: string) { super(`broker ${status} ${code}`); } }

export function createBroker(brokerUrl: string, reports: ReportEntry[], fetchImpl: typeof fetch = (...a) => fetch(...a)): Broker {
  if (brokerUrl === 'mock:') return createMockBroker(reports);
  const base = brokerUrl.replace(/\/+$/, '');
  async function post(path: string, body: unknown) {
    const res = await fetchImpl(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      let code = 'error';
      try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* ignore */ }
      throw new BrokerError(res.status, code);
    }
    return res;
  }
  return {
    async health(timeoutMs) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(base + '/health', { signal: ctl.signal });
        if (!res.ok) return { ok: false };
        const j = (await res.json()) as HealthInfo;
        return { ok: j.ok === true, checkedAt: j.checkedAt };
      } catch { return { ok: false }; } finally { clearTimeout(timer); }
    },
    // #region token-request | Browser: ask the broker for an embed token
    async token(reportKey, persona) {
      // Only a report key and a persona key are sent. The broker maps them to the allowlisted identity.
      const res = await post('/token', { reportKey, ...(persona ? { persona } : {}) });
      return (await res.json()) as TokenInfo;
    },
    // #endregion
    // #region export-request | Browser: server-side export through the broker
    async exportFile(reportKey, persona, format) {
      // #highlight export
      const res = await post('/export', { reportKey, ...(persona ? { persona } : {}), format });
      return res.blob();
      // #endhighlight
    },
    // #endregion
  };
}
