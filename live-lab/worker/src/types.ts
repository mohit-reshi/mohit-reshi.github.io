export interface Env {
  ALLOWED_ORIGINS?: string;
  MOCK?: string;
  TOKEN_TTL?: string;
  EXPORT_ENABLED?: string;
  TURNSTILE_ENABLED?: string;
  /** "true" adds a non-secret `reason` code to /health failures (setup debugging only). */
  DEBUG_HEALTH?: string;
  TENANT_ID?: string;
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  REPORTS_CONFIG?: string;
  TURNSTILE_SECRET?: string;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export type ReportKind = 'interactive' | 'paginated';
export interface Persona { username: string; roles: string[] }
export interface ReportConfig {
  kind: ReportKind;
  workspaceId: string;
  reportId: string;
  datasetIds: string[];
  rls: boolean;
  personas: Record<string, Persona>;
  defaultPersona?: string;
  exportEnabled?: boolean;
}
export type ReportsConfig = Record<string, ReportConfig>;

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  rateLimit: (bucket: string, key: string, limit: number, windowSec: number) => Promise<boolean>;
}

export interface TokenResponse { reportId: string; embedUrl: string; accessToken: string; expiration: string; kind: ReportKind }
