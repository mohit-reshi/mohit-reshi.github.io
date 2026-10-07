#!/usr/bin/env node
// Copy content/projects/*/media into site/public/projects/<slug>/media, write site/src/generated/media-manifest.json
// (image sizes for CLS-free layout), and copy live-lab/dist into site/public/live-lab when it has been built.
// Sample projects (sample: true), their sample apps and drafts are only copied with --samples or SITE_SAMPLES=1 (dev and test builds).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjects } from '../validate/lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(join(ROOT, 'site', 'package.json'));
const WITH_SAMPLES = process.argv.includes('--samples') || process.env.SITE_SAMPLES === '1';
const WITH_DRAFTS = WITH_SAMPLES || process.argv.includes('--drafts'); // dev: show real drafts (not the samples)
const IMG = /\.(webp|png|jpe?g|avif|gif)$/i;

async function main() {
  const sharp = require('sharp');
  const src = join(ROOT, 'content', 'projects');
  const pub = join(ROOT, 'site', 'public', 'projects');
  const gen = join(ROOT, 'site', 'src', 'generated');
  rmSync(pub, { recursive: true, force: true });
  mkdirSync(pub, { recursive: true });
  mkdirSync(gen, { recursive: true });
  const manifest = {};
  const size = async (p) => { try { const m = await sharp(p).metadata(); return { w: m.width, h: m.height }; } catch { return { w: 0, h: 0 }; } };
  const meta = new Map(loadProjects(ROOT).map((p) => [p.folder, p.data ?? {}]));
  const skipped = [];
  const folders = (existsSync(src) ? readdirSync(src).filter((n) => statSync(join(src, n)).isDirectory()) : []).filter((n) => {
    const d = meta.get(n) ?? {};
    const hidden = (!WITH_SAMPLES && d.sample === true) || (!WITH_DRAFTS && d.draft === true); // never ship draft or sample media in a production build
    if (hidden) skipped.push(n);
    return !hidden;
  });
  let files = 0;
  for (const slug of folders) {
    const media = join(src, slug, 'media');
    if (!existsSync(media)) { manifest[slug] = { files: {}, pages: [] }; continue; }
    cpSync(media, join(pub, slug, 'media'), { recursive: true, filter: (p) => !p.endsWith('.gitkeep') });
    const entry = { files: {}, pages: [] };
    const walk = (d, rel = '') => readdirSync(d).forEach((n) => { const p = join(d, n); if (statSync(p).isDirectory()) return walk(p, `${rel}${n}/`); entry.files[`media/${rel}${n}`] = { size: statSync(p).size }; });
    walk(media);
    for (const [k, v] of Object.entries(entry.files)) if (IMG.test(k)) Object.assign(v, await size(join(src, slug, k)));
    files += Object.keys(entry.files).length;
    const pagesDir = join(media, 'pages');
    let meta = [];
    try { meta = JSON.parse(readFileSync(join(pagesDir, 'pages.json'), 'utf8')); } catch { /* optional */ }
    const names = existsSync(pagesDir) ? readdirSync(pagesDir).filter((f) => IMG.test(f)).sort() : [];
    entry.pages = names.map((f) => {
      const m = meta.find((x) => x.file === f) ?? {};
      const thumb = entry.files[`media/thumbs/${f}`] ? `media/thumbs/${f}` : null;
      return { file: `media/pages/${f}`, thumb, title: m.title ?? '', caption: m.caption ?? '', story: m.story ?? [], hidden_nav: m.hidden_nav ?? null, w: entry.files[`media/pages/${f}`].w, h: entry.files[`media/pages/${f}`].h, tw: thumb ? entry.files[thumb].w : 0 };
    });
    manifest[slug] = entry;
  }
  writeFileSync(join(gen, 'media-manifest.json'), JSON.stringify(manifest, null, 1));
  // Live Lab recorded fallback: /media/live-lab/<report key>.mp4 and .webp come from the report's project media
  // (video.mp4 and poster.webp, else cover.webp), so the recording is stored once and only ships with a published project.
  const fb = join(ROOT, 'site', 'public', 'media', 'live-lab');
  rmSync(fb, { recursive: true, force: true });
  let fallbacks = 0;
  try {
    const lab = JSON.parse(readFileSync(join(ROOT, 'live-lab', 'reports.config.json'), 'utf8'));
    for (const r of lab.reports ?? []) {
      if (!r.projectSlug || !folders.includes(r.projectSlug)) continue;
      const media = join(src, r.projectSlug, 'media');
      const pick = (names) => names.map((n) => join(media, n)).find((f) => existsSync(f));
      const video = pick(['video.mp4']), poster = pick(['poster.webp', 'cover.webp']);
      if (!video && !poster) continue;
      mkdirSync(fb, { recursive: true });
      if (video) { cpSync(video, join(fb, `${r.key}.mp4`)); fallbacks++; }
      if (poster) { cpSync(poster, join(fb, `${r.key}.webp`)); fallbacks++; }
    }
  } catch { /* no live-lab config: nothing to copy */ }
  // Live Lab module (built by Session 2): copied only when present
  const dist = join(ROOT, 'live-lab', 'dist');
  const target = join(ROOT, 'site', 'public', 'live-lab');
  rmSync(target, { recursive: true, force: true });
  const available = existsSync(join(dist, 'live-lab.js'));
  if (available) cpSync(dist, target, { recursive: true, filter: (p) => !p.endsWith('.map') });
  writeFileSync(join(gen, 'livelab.json'), JSON.stringify({ available }));
  // static sample apps are served from /apps-hosted/<slug>/ and real apps live in site/public/apps-hosted
  const samples = join(ROOT, 'site', 'sample-apps');
  const hosted = join(ROOT, 'site', 'public', 'apps-hosted');
  for (const n of existsSync(hosted) ? readdirSync(hosted) : []) if (n.startsWith('sample-')) rmSync(join(hosted, n), { recursive: true, force: true });
  if (WITH_SAMPLES && existsSync(samples)) cpSync(samples, hosted, { recursive: true });
  console.log(`sync-media: ${folders.length} project(s)${skipped.length ? ` (${skipped.length} sample/draft project(s) skipped)` : ''}, ${files} media file(s); live-lab module ${available ? 'copied' : 'not built (stub will be used)'}, ${fallbacks} Live Lab fallback file(s)`);
}
main().catch((e) => { console.error('sync-media failed: ' + e.message); process.exit(1); });
