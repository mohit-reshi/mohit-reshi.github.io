import type { ReportConfig, TokenResponse } from './types';

/** Deterministic fake responses for MOCK=true: no tenant needed. Same shapes as the real thing. */
export function mockToken(key: string, r: ReportConfig, persona: string | null, now: number, ttlMinutes: number): TokenResponse {
  return {
    reportId: r.reportId,
    embedUrl: `https://mock.invalid/reportEmbed?reportId=${r.reportId}&key=${encodeURIComponent(key)}`,
    accessToken: `mock-token.${key}.${persona ?? 'none'}`,
    expiration: new Date(now + ttlMinutes * 60_000).toISOString(),
    kind: r.kind,
  };
}

export const MOCK_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a]); // "%PDF-1.4\n%%EOF\n"
