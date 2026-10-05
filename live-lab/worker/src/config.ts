import type { ReportsConfig, ReportConfig, Persona } from './types';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Parse and validate the REPORTS_CONFIG secret. Throws with a readable list of problems. */
export function parseReportsConfig(raw: string | undefined): ReportsConfig {
  if (!raw) throw new Error('REPORTS_CONFIG is not set');
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error('REPORTS_CONFIG is not valid JSON'); }
  const src = json?.reports;
  if (!src || typeof src !== 'object' || Array.isArray(src) || Object.keys(src).length === 0) throw new Error('REPORTS_CONFIG.reports must be a non-empty object');
  const errors: string[] = [];
  const out: ReportsConfig = {};
  for (const [key, r] of Object.entries<any>(src)) {
    const at = `reports.${key}`;
    if (!KEY.test(key)) errors.push(`${at}: key must be kebab-case`);
    if (!['interactive', 'paginated'].includes(r?.kind)) errors.push(`${at}.kind must be interactive or paginated`);
    if (!GUID.test(r?.workspaceId ?? '')) errors.push(`${at}.workspaceId must be a GUID`);
    if (!GUID.test(r?.reportId ?? '')) errors.push(`${at}.reportId must be a GUID`);
    const datasetIds: string[] = Array.isArray(r?.datasetIds) ? r.datasetIds : [];
    if (datasetIds.some((d) => !GUID.test(d))) errors.push(`${at}.datasetIds must be GUIDs`);
    if (r?.kind === 'interactive' && datasetIds.length === 0) errors.push(`${at}.datasetIds needs the report's dataset for interactive reports`);
    const personas: Record<string, Persona> = {};
    for (const [p, v] of Object.entries<any>(r?.personas ?? {})) {
      if (!KEY.test(p)) errors.push(`${at}.personas.${p}: key must be kebab-case`);
      if (r?.rls) {
        if (typeof v?.username !== 'string' || !v.username || !Array.isArray(v?.roles) || v.roles.length === 0) errors.push(`${at}.personas.${p} needs username and roles[] (rls is true)`);
      } else if (v?.roles?.length || v?.username) {
        errors.push(`${at}.personas.${p}: identities are only allowed when rls is true`);
      }
      personas[p] = { username: String(v?.username ?? ''), roles: Array.isArray(v?.roles) ? v.roles.map(String) : [] };
    }
    if (r?.rls && Object.keys(personas).length === 0) errors.push(`${at}: rls is true but no personas are defined`);
    if (r?.defaultPersona && !personas[r.defaultPersona]) errors.push(`${at}.defaultPersona is not one of the personas`);
    out[key] = { kind: r?.kind, workspaceId: r?.workspaceId, reportId: r?.reportId, datasetIds, rls: !!r?.rls, personas, defaultPersona: r?.defaultPersona, exportEnabled: !!r?.exportEnabled } as ReportConfig;
  }
  if (errors.length) throw new Error('Invalid REPORTS_CONFIG:\n - ' + errors.join('\n - '));
  return out;
}
