import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { waitForExport } from './pbi.mjs';
import { looksBlank } from './png.mjs';

const exists = (p) => access(p).then(() => true, () => false);
const pad = (n) => String(n).padStart(2, '0');

/** Decide what to export for one report. Pure function: used by --dry-run and the tests. */
export function planReport(report, { format, identity } = {}) {
  const persona = identity && report.identities[identity] ? identity : null;
  const tag = persona ? `.${persona}` : '';
  if (identity && !persona) return { slug: report.slug, skip: `no identity "${identity}" configured` };
  if (report.kind === 'paginated') {
    return { slug: report.slug, kind: 'paginated', persona, jobs: report.parameterSets.map((ps) => ({ name: ps.name, file: `pages/${ps.name}${tag}.pdf`, format: 'PDF', parameters: ps.parameters })) };
  }
  const fmt = (format || 'png').toUpperCase();
  return { slug: report.slug, kind: 'interactive', persona, format: fmt, tag, ext: fmt === 'PDF' ? 'pdf' : 'png' };
}

function identitiesBody(report, persona) {
  if (!persona) return undefined;
  const id = report.identities[persona];
  return [{ username: id.username, roles: id.roles, ...(id.datasets ? { datasets: id.datasets } : {}) }];
}

async function runPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

export async function exportReport(client, report, opts) {
  const { outDir, format, identity, concurrency = 2, sleep, log = () => {}, pollOptions = {} } = opts;
  const plan = planReport(report, { format, identity });
  const result = { slug: report.slug, kind: report.kind, items: [] };
  if (plan.skip) { result.skipped = plan.skip; return result; }
  const base = join(outDir, report.slug);
  await mkdir(join(base, 'pages'), { recursive: true });

  const doExport = async (body, file, label) => {
    const target = join(base, file);
    if (await exists(target)) return { label, file, status: 'skipped-existing' };
    try {
      const job = await client.startExport(report.workspaceId, report.reportId, body);
      await waitForExport(client, report.workspaceId, report.reportId, job.id, { sleep, ...pollOptions });
      const buf = await client.downloadExport(report.workspaceId, report.reportId, job.id);
      await writeFile(target, buf);
      const blank = file.endsWith('.png') ? looksBlank(buf) : false;
      log(`  ok   ${report.slug}/${file}${blank ? '  (looks blank!)' : ''}`);
      return { label, file, status: blank ? 'blank' : 'ok' };
    } catch (e) {
      log(`  FAIL ${report.slug}/${file}: ${e.message}`);
      return { label, file, status: 'failed', error: e.message };
    }
  };

  if (plan.kind === 'paginated') {
    const idBody = identitiesBody(report, plan.persona);
    result.items = await runPool(plan.jobs, concurrency, (j) => doExport({
      format: j.format,
      paginatedReportConfiguration: { ...(j.parameters.length ? { parameterValues: j.parameters } : {}), ...(idBody ? { identities: idBody } : {}) },
    }, j.file, j.name));
    return result;
  }

  const pages = report.pages || (await client.listPages(report.workspaceId, report.reportId));
  const ordered = [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  result.pageList = ordered.map((p, i) => ({ index: i + 1, name: p.name, displayName: p.displayName }));
  const idBody = identitiesBody(report, plan.persona);
  result.items = await runPool(ordered, concurrency, (p, i) => doExport({
    format: plan.format,
    powerBIReportConfiguration: { pages: [{ pageName: p.name }], ...(idBody ? { identities: idBody } : {}) },
  }, `pages/${pad(i + 1)}-page${plan.tag}.${plan.ext}`, p.displayName));
  // pages.json: display names for owner review (never used in file names)
  await writeFile(join(base, `pages${plan.tag}.json`), JSON.stringify({ slug: report.slug, exportedAt: new Date().toISOString(),
    pages: result.pageList.map((p, i) => ({ ...p, file: result.items[i]?.file, status: result.items[i]?.status })) }, null, 2));
  return result;
}

/** Final list for the owner: pages the API could not render or that look blank. */
export function manualCaptureList(results) {
  const out = [];
  for (const r of results) for (const it of r.items || []) {
    if (it.status === 'failed') out.push(`${r.slug}: ${it.file} (${it.label}) failed: ${it.error}`);
    if (it.status === 'blank') out.push(`${r.slug}: ${it.file} (${it.label}) looks blank: capture manually`);
  }
  return out;
}
