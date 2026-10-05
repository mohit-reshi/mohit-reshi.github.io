#!/usr/bin/env node
// Copy processed media into content/projects/<slug>/media/ following SPEC 6.3. Idempotent; --dry-run shows the plan.
//   <from>/cover.webp, poster.webp, video.mp4, before.webp, after.webp -> media/ (same names)
//   <from>/*.webp (other) + <from>/thumbs/*.webp    -> media/pages/NN-<slug>.webp and media/thumbs/NN-<slug>.webp
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseArgs } from './common.mjs';

const USAGE = `place --slug <project-slug> --from <folder> [--content content/projects] [--dry-run]
Windows example:  node src\\place.mjs --slug my-report --from out\\images\\my-report --dry-run`;
const SPECIAL = { 'cover.webp': 'cover.webp', 'poster.webp': 'poster.webp', 'video.mp4': 'video.mp4', 'before.webp': 'before.webp', 'after.webp': 'after.webp' };
const pad = (n) => String(n).padStart(2, '0');
const sha = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');

export function planPlacement(slug, from, contentRoot) {
  const media = join(contentRoot, slug, 'media');
  const files = readdirSync(from).filter((f) => !f.startsWith('.'));
  const actions = [];
  for (const f of files) if (SPECIAL[f]) actions.push({ from: join(from, f), to: join(media, SPECIAL[f]) });
  const pages = files.filter((f) => /\.webp$/i.test(f) && !SPECIAL[f]).sort();
  const thumbDir = join(from, 'thumbs');
  pages.forEach((f, i) => {
    const target = `${pad(i + 1)}-${slug}.webp`;
    actions.push({ from: join(from, f), to: join(media, 'pages', target) });
    if (existsSync(join(thumbDir, f))) actions.push({ from: join(thumbDir, f), to: join(media, 'thumbs', target) });
  });
  return { media, actions, pageFiles: pages.map((_, i) => `${pad(i + 1)}-${slug}.webp`) };
}

export function mergePagesJson(existing, pageFiles) {
  const byFile = new Map((existing || []).map((p) => [p.file, p]));
  return pageFiles.map((file) => byFile.get(file) ?? { file, title: '', caption: '' });
}

export function place(slug, from, contentRoot, { dryRun = false } = {}) {
  const plan = planPlacement(slug, from, contentRoot);
  const report = [];
  for (const act of plan.actions) {
    const same = existsSync(act.to) && sha(act.from) === sha(act.to);
    report.push({ ...act, status: same ? 'unchanged' : existsSync(act.to) ? 'update' : 'new' });
    if (!dryRun && !same) { mkdirSync(join(act.to, '..'), { recursive: true }); copyFileSync(act.from, act.to); }
  }
  const pj = join(plan.media, 'pages', 'pages.json');
  if (plan.pageFiles.length) {
    const merged = mergePagesJson(existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')) : [], plan.pageFiles);
    const text = JSON.stringify(merged, null, 2) + '\n';
    const same = existsSync(pj) && readFileSync(pj, 'utf8') === text;
    report.push({ from: '(generated)', to: pj, status: same ? 'unchanged' : existsSync(pj) ? 'update' : 'new' });
    if (!dryRun && !same) { mkdirSync(join(pj, '..'), { recursive: true }); writeFileSync(pj, text); }
  }
  return report;
}

function main() {
  const a = parseArgs(process.argv.slice(2), { slug: '', from: '', content: 'content/projects', 'dry-run': false, help: false });
  if (a.help || !a.slug || !a.from) return console.log(USAGE);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) throw new Error('--slug must be kebab-case (the public project slug)');
  if (!existsSync(a.from)) throw new Error(`--from folder not found: ${a.from}`);
  const report = place(a.slug, a.from, a.content, { dryRun: a['dry-run'] });
  for (const r of report) console.log(`${a['dry-run'] ? '[dry-run] ' : ''}${r.status.padEnd(9)} ${r.to}`);
  console.log(`${report.filter((r) => r.status !== 'unchanged').length} change(s)${a['dry-run'] ? ' planned (nothing written)' : ' written'}.`);
}

if (process.argv[1]?.endsWith('place.mjs')) { try { main(); } catch (e) { console.error('Error: ' + e.message); process.exit(1); } }
