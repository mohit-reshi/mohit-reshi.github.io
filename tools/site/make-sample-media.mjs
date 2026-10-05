#!/usr/bin/env node
// Generates the abstract sample media (covers, screenshots, a short clip) for content/projects/sample-sales-analytics
// with sharp + ffmpeg, then places it with tools/media. Run:  node tools/site/make-sample-media.mjs
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sharp = createRequire(join(ROOT, 'tools/media/package.json'))('sharp');
const out = join(ROOT, 'out', 'sample-media');
rmSync(out, { recursive: true, force: true });
const mediaDir = join(ROOT, 'content/projects/sample-sales-analytics/media');
for (const d of ['pages', 'thumbs']) rmSync(join(mediaDir, d), { recursive: true, force: true });
mkdirSync(join(out, 'png'), { recursive: true });
mkdirSync(join(out, 'frames'), { recursive: true });

const COLORS = ['#ffc83d', '#4fd1c5', '#7c9cff', '#ff7a90'];
const bars = (n, seed, x0, y0, w, h, phase = 0) => Array.from({ length: n }, (_, i) => {
  const v = 0.25 + 0.7 * Math.abs(Math.sin(i * 1.7 + seed + phase));
  const bw = w / n - 8;
  return `<rect x="${x0 + i * (w / n)}" y="${y0 + h - v * h}" width="${bw}" height="${v * h}" rx="5" fill="${COLORS[(i + seed) % 4]}" opacity="0.9"/>`;
}).join('');
const card = (x, y, w, h, label, val) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#161d29" stroke="#2b3544"/><text x="${x + 22}" y="${y + 34}" fill="#a3adbd" font-family="DejaVu Sans, sans-serif" font-size="18">${label}</text><text x="${x + 22}" y="${y + 78}" fill="#eef1f6" font-family="DejaVu Sans, sans-serif" font-size="40" font-weight="700">${val}</text>`;
const page = (title, kind, seed, phase = 0, w = 1280, h = 720) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#0b0f14"/><rect x="0" y="0" width="1280" height="72" fill="#121823"/><rect x="28" y="22" width="150" height="28" rx="6" fill="#ffc83d"/><text x="210" y="44" fill="#eef1f6" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="700">${title}</text>
${card(28, 96, 290, 110, 'Revenue', '$4.2M')}${card(338, 96, 290, 110, 'YoY growth', '+8.4%')}${card(648, 96, 290, 110, 'vs Budget', '+1.9%')}${card(958, 96, 294, 110, 'Open orders', '312')}
<rect x="28" y="228" width="760" height="460" rx="14" fill="#121823" stroke="#2b3544"/>${bars(10, seed, 60, 270, 700, 380, phase)}
<rect x="808" y="228" width="444" height="460" rx="14" fill="#121823" stroke="#2b3544"/>${bars(5, seed + 2, 840, 270, 380, 380, phase * 0.7)}
<text x="1240" y="708" text-anchor="end" fill="#7d8899" font-family="DejaVu Sans Mono, monospace" font-size="14">${kind} · synthetic sample</text></svg>`;
const before = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#f2f2f2"/><rect width="1280" height="56" fill="#d9d9d9"/><text x="24" y="36" fill="#333" font-family="DejaVu Sans, sans-serif" font-size="22">Sales report (before)</text>${Array.from({ length: 14 }, (_, r) => `<rect x="24" y="${80 + r * 40}" width="1232" height="36" fill="${r % 2 ? '#fff' : '#ececec'}"/>${[0, 1, 2, 3, 4, 5].map((c) => `<text x="${40 + c * 200}" y="${104 + r * 40}" fill="#444" font-family="DejaVu Sans, sans-serif" font-size="15">${r === 0 ? ['Region', 'Product', 'Units', 'Revenue', 'Cost', 'Margin'][c] : (r * 7 + c * 13) % 97 + 3}</text>`).join('')}`).join('')}</svg>`;

async function png(name, svg) { await sharp(Buffer.from(svg)).png().toFile(join(out, 'png', name)); }
await png('cover.png', page('Sales Analytics', 'Executive page', 1));
await png('poster.png', page('Sales Analytics', 'Executive page', 1));
await png('before.png', before);
await png('after.png', page('Sales Analytics', 'Redesigned', 3));
await png('page-1.png', page('Executive Summary', 'Page 1', 1));
await png('page-2.png', page('Product Analysis', 'Page 2', 4));
await png('page-3.png', page('Rep Detail', 'Page 3', 6));
// short clip: animated bars
for (let f = 0; f < 36; f++) await sharp(Buffer.from(page('Sales Analytics', 'Walkthrough', 1, f / 6, 960, 540))).png().toFile(join(out, 'frames', `f${String(f).padStart(3, '0')}.png`));
const ff = spawnSync('ffmpeg', ['-y', '-framerate', '12', '-i', join(out, 'frames', 'f%03d.png'), '-an', '-c:v', 'libx264', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, 'video.mp4')], { encoding: 'utf8' });
if (ff.status !== 0) { console.error('ffmpeg failed:\n' + ff.stderr.slice(-400)); process.exit(1); }

// convert + place with the media tools (dogfooding)
const run = (args) => { const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); } };
run(['tools/media/src/process-images.mjs', '--in', join(out, 'png'), '--out', join(out, 'webp')]);
const staging = join(out, 'stage'); mkdirSync(join(staging, 'thumbs'), { recursive: true });
const { copyFileSync } = await import('node:fs');
for (const n of ['cover', 'poster', 'before', 'after']) copyFileSync(join(out, 'webp', `${n}.webp`), join(staging, `${n}.webp`));
for (const n of [1, 2, 3]) { copyFileSync(join(out, 'webp', `page-${n}.webp`), join(staging, `page-${n}.webp`)); copyFileSync(join(out, 'webp', 'thumbs', `page-${n}.webp`), join(staging, 'thumbs', `page-${n}.webp`)); }
copyFileSync(join(out, 'video.mp4'), join(staging, 'video.mp4'));
run(['tools/media/src/place.mjs', '--slug', 'sample-sales-analytics', '--from', staging]);
console.log('sample media written to content/projects/sample-sales-analytics/media');
