// Parse and validate export.config.json. No names or IDs live in the repo: the owner fills this file locally.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseConfig(json) {
  const cfg = typeof json === 'string' ? JSON.parse(json) : json;
  const errors = [];
  if (!cfg || typeof cfg !== 'object') throw new Error('Config must be a JSON object.');
  if (!Array.isArray(cfg.reports) || cfg.reports.length === 0) errors.push('"reports" must be a non-empty array.');
  const seen = new Set();
  const reports = (cfg.reports || []).map((r, i) => {
    const at = `reports[${i}]`;
    if (!SLUG.test(r.slug || '')) errors.push(`${at}.slug must be kebab-case (public slug, never a client name).`);
    if (seen.has(r.slug)) errors.push(`${at}.slug "${r.slug}" is duplicated.`);
    seen.add(r.slug);
    for (const k of ['workspaceId', 'reportId']) if (!GUID.test(r[k] || '')) errors.push(`${at}.${k} must be a GUID.`);
    const kind = r.kind || 'interactive';
    if (!['interactive', 'paginated'].includes(kind)) errors.push(`${at}.kind must be interactive or paginated.`);
    const identities = r.identities || {};
    for (const [persona, id] of Object.entries(identities)) {
      if (!id.username || !Array.isArray(id.roles) || id.roles.length === 0) errors.push(`${at}.identities.${persona} needs username and roles[].`);
      if (Array.isArray(id.datasets) && id.datasets.some((d) => !GUID.test(d))) errors.push(`${at}.identities.${persona}.datasets must be GUIDs.`);
    }
    const parameterSets = r.parameterSets || (kind === 'paginated' ? [{ name: 'default', parameters: [] }] : []);
    return { slug: r.slug, workspaceId: r.workspaceId, reportId: r.reportId, kind, identities, parameterSets, pages: r.pages || null };
  });
  if (errors.length) throw new Error('Invalid export config:\n - ' + errors.join('\n - '));
  return { outDir: cfg.outDir || 'out', concurrency: Math.max(1, Math.min(cfg.concurrency || 2, 5)), reports };
}
