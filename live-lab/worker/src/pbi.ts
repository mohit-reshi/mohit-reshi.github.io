import type { Deps, Env, ReportConfig } from './types';
import { getEntraToken } from './entra';

const API = 'https://api.powerbi.com/v1.0/myorg';

async function call(env: Env, deps: Deps, method: string, path: string, body?: unknown): Promise<Response> {
  const token = await getEntraToken(env, deps);
  return deps.fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}

/** Compact, non-secret description of a failed Power BI call (status, error code, trimmed message). Shown only with DEBUG_HEALTH. */
async function why(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  let code = '', msg = '';
  try { const e = (JSON.parse(text) as { error?: { code?: string; message?: string } | string }).error; if (typeof e === 'string') code = e; else { code = e?.code ?? ''; msg = e?.message ?? ''; } } catch { msg = text; }
  return `${res.status}:${code}:${msg}`.replace(/\s+/g, ' ').slice(0, 300);
}

export async function getReport(env: Env, deps: Deps, r: ReportConfig): Promise<{ id: string; embedUrl: string; datasetId?: string }> {
  const res = await call(env, deps, 'GET', `/groups/${r.workspaceId}/reports/${r.reportId}`);
  if (!res.ok) throw new Error(`pbi_report_failed:${await why(res)}`);
  return (await res.json()) as { id: string; embedUrl: string; datasetId?: string };
}

// #region token-generate | Broker: GenerateToken, identities only for RLS reports
/**
 * Build the GenerateToken (multi-resource) request body.
 * RLS rule: identities are sent ONLY for reports whose dataset has RLS (the API rejects identities for datasets
 * without RLS, and rejects RLS datasets without them). The identity always comes from the server-side config.
 */
export function buildGenerateTokenBody(r: ReportConfig, personaKey: string | null, ttlMinutes: number) {
  const body: Record<string, unknown> = {
    reports: [{ id: r.reportId }],
    targetWorkspaces: [{ id: r.workspaceId }],
    lifetimeInMinutes: ttlMinutes,
  };
  if (r.kind === 'interactive') body.datasets = r.datasetIds.map((id) => ({ id }));
  if (r.rls && personaKey) {
    const p = r.personas[personaKey];
    body.identities = [{ username: p.username, roles: p.roles, datasets: r.datasetIds }];
  }
  return body;
}

export async function generateToken(env: Env, deps: Deps, r: ReportConfig, personaKey: string | null, ttlMinutes: number) {
  const res = await call(env, deps, 'POST', '/GenerateToken', buildGenerateTokenBody(r, personaKey, ttlMinutes));
  if (!res.ok) throw new Error(`pbi_generate_token_failed:${await why(res)}`);
  return (await res.json()) as { token: string; tokenId: string; expiration: string };
}

// #endregion

// #region export-broker | Broker: server-side export (ExportTo, poll, stream the file)
/** Server-side export (PDF). Polls the job for up to ~40s then streams the file. */
export async function exportReport(env: Env, deps: Deps, r: ReportConfig, personaKey: string | null, format: 'PDF' | 'PNG'): Promise<Response> {
  const cfg: Record<string, unknown> = {};
  const identities = r.rls && personaKey ? [{ username: r.personas[personaKey].username, roles: r.personas[personaKey].roles, datasets: r.datasetIds }] : undefined;
  const body = r.kind === 'paginated'
    ? { format: 'PDF', paginatedReportConfiguration: identities ? { identities } : cfg }
    : { format, powerBIReportConfiguration: identities ? { identities } : cfg };
  const start = await call(env, deps, 'POST', `/groups/${r.workspaceId}/reports/${r.reportId}/ExportTo`, body);
  if (!start.ok) throw new Error('pbi_export_failed');
  const { id } = (await start.json()) as { id: string };
  const deadline = deps.now() + 40_000;
  for (;;) {
    const st = await call(env, deps, 'GET', `/groups/${r.workspaceId}/reports/${r.reportId}/exports/${id}`);
    if (!st.ok) throw new Error('pbi_export_failed');
    const s = (await st.json()) as { status: string };
    if (s.status === 'Succeeded') break;
    if (s.status === 'Failed' || deps.now() > deadline) throw new Error('pbi_export_failed');
    await deps.sleep(Math.max(1, Number(st.headers.get('Retry-After') ?? 3)) * 1000);
  }
  const file = await call(env, deps, 'GET', `/groups/${r.workspaceId}/reports/${r.reportId}/exports/${id}/file`);
  if (!file.ok || !file.body) throw new Error('pbi_export_failed');
  return file;
}
// #endregion
