#!/usr/bin/env node
// npm run validate  (from /site)  or  node tools/validate/validate.mjs [--media] [--strict-media] [--root <dir>]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { projectSchema, taxonomySchema, CHAPTERS } from './schema.mjs';
import { REPO_ROOT, loadProjects, loadTaxonomy, modelDocPath } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const root = args.includes('--root') ? resolve(args[args.indexOf('--root') + 1]) : REPO_ROOT;

export function validateAll(root) {
  const errors = [], warnings = [], missing = [];
  const taxonomy = loadTaxonomy(root);
  if (!taxonomy) errors.push('content/taxonomy.json is missing');
  else {
    const t = taxonomySchema(z).safeParse(taxonomy);
    if (!t.success) for (const i of t.error.issues) errors.push(`content/taxonomy.json: ${i.path.join('.')}: ${i.message}`);
  }
  const tagKeys = Object.keys(taxonomy ?? {});
  const schema = projectSchema(z, tagKeys);
  const projects = loadProjects(root);
  const seen = new Map();
  const usedTags = new Set();
  for (const p of projects) {
    const where = `content/projects/${p.folder}/index.md`;
    if (p.error) { errors.push(`${where}: ${p.error}`); continue; }
    const r = schema.safeParse(p.data);
    if (!r.success) { for (const i of r.error.issues) errors.push(`${where}: ${i.path.join('.') || '(root)'}: ${i.message}`); continue; }
    const d = r.data;
    if (d.slug !== p.folder) errors.push(`${where}: slug "${d.slug}" must equal the folder name "${p.folder}"`);
    if (seen.has(d.slug)) errors.push(`${where}: duplicate slug (also ${seen.get(d.slug)})`);
    seen.set(d.slug, where);
    d.tags.forEach((t) => usedTags.add(t));
    // media (missing media never fails the build: placeholders are rendered)
    const base = join(root, 'content', 'projects', p.folder);
    const need = [['cover', d.media.cover], ['poster', d.media.poster], ['video', d.media.video], ['before', d.media.before_after?.before], ['after', d.media.before_after?.after]];
    for (const [what, rel] of need) if (rel && !existsSync(join(base, rel))) missing.push(`${p.folder}: ${what} (${rel})`);
    const pagesDir = join(base, 'media', 'pages');
    const pageFiles = existsSync(pagesDir) ? readdirSync(pagesDir).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)) : [];
    if (!pageFiles.length) missing.push(`${p.folder}: gallery (media/pages/ has no images)`);
    const pj = join(pagesDir, 'pages.json');
    if (existsSync(pj)) {
      try {
        const arr = JSON.parse(readFileSync(pj, 'utf8'));
        if (!Array.isArray(arr) || arr.some((x) => typeof x.file !== 'string')) errors.push(`${where.replace('index.md', 'media/pages/pages.json')}: must be an array of { file, title, caption }`);
        else for (const x of arr) if (!pageFiles.includes(x.file)) warnings.push(`${p.folder}: pages.json lists ${x.file} which is not in media/pages/`);
      } catch { errors.push(`${where.replace('index.md', 'media/pages/pages.json')}: invalid JSON`); }
    }
    // model doc
    if (d.model_doc) {
      const f = modelDocPath(root, d.model_doc);
      if (!existsSync(f)) warnings.push(`${p.folder}: model_doc ${d.model_doc} not found (the Under the hood section will be hidden)`);
      else {
        try {
          const doc = JSON.parse(readFileSync(f, 'utf8'));
          const names = new Set((doc.measures ?? []).map((m) => m.name));
          for (const m of d.featured_measures) if (!names.has(m)) warnings.push(`${p.folder}: featured measure "${m}" is not in ${d.model_doc}`);
        } catch { errors.push(`${p.folder}: ${d.model_doc} is not valid JSON`); }
      }
    } else if (d.featured_measures.length) warnings.push(`${p.folder}: featured_measures set but model_doc is null`);
    // body
    const headings = [...(p.body ?? '').matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const absent = CHAPTERS.filter((c) => !headings.some((h) => h.toLowerCase() === c.toLowerCase()));
    if (absent.length && !d.draft) warnings.push(`${p.folder}: case study has no "## ${absent.join('", "## ')}" section (auto-generated or omitted)`);
    if (d.status === 'live' && d.live_lab.report_key) {
      const cfgPath = join(root, 'live-lab', 'reports.config.json');
      if (existsSync(cfgPath)) {
        const keys = JSON.parse(readFileSync(cfgPath, 'utf8')).reports.map((r) => r.key);
        if (!keys.includes(d.live_lab.report_key)) errors.push(`${where}: live_lab.report_key "${d.live_lab.report_key}" is not in live-lab/reports.config.json`);
      }
    }
  }
  if (flag('--unused-tags')) for (const t of tagKeys) if (!usedTags.has(t) && projects.length) warnings.push(`taxonomy tag "${t}" is not used by any project`);
  return { errors, warnings, missing, count: projects.length };
}

if (process.argv[1]?.endsWith('validate.mjs')) {
  const r = validateAll(root);
  console.log(`validate: ${r.count} project(s)`);
  for (const w of r.warnings) console.warn('  warning: ' + w);
  if (flag('--media') || flag('--strict-media')) {
    console.log(r.missing.length ? `missing media (${r.missing.length}); placeholders will be shown:` : 'no missing media');
    for (const m of r.missing) console.log('  - ' + m);
  }
  for (const e of r.errors) console.error('  ERROR: ' + e);
  const bad = r.errors.length || (flag('--strict-media') && r.missing.length);
  console.log(bad ? `FAILED: ${r.errors.length} error(s)${flag('--strict-media') ? `, ${r.missing.length} missing media` : ''}` : 'OK');
  process.exit(bad ? 1 : 0);
}
