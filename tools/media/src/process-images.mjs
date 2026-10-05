#!/usr/bin/env node
// PNG/JPG screenshots -> WebP (quality ~82, max width 1920) plus 480px thumbnails in <out>/thumbs/.
import { mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import { parseArgs, humanSize } from './common.mjs';

const USAGE = `process-images --in <file|folder> [--out out/images] [--quality 82] [--force]
Windows example:  node src\\process-images.mjs --in out\\my-report\\pages --out out\\images\\my-report`;

export async function convertOne(input, outDir, { quality = 82, force = false } = {}) {
  const name = basename(input, extname(input));
  const out = join(outDir, `${name}.webp`), thumb = join(outDir, 'thumbs', `${name}.webp`);
  mkdirSync(join(outDir, 'thumbs'), { recursive: true });
  const fresh = existsSync(out) && existsSync(thumb) && statSync(out).mtimeMs >= statSync(input).mtimeMs;
  if (fresh && !force) return { input, out, thumb, skipped: true, size: statSync(out).size };
  await sharp(input).rotate().resize({ width: 1920, withoutEnlargement: true }).webp({ quality }).toFile(out);
  await sharp(input).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: Math.min(quality, 78) }).toFile(thumb);
  return { input, out, thumb, skipped: false, size: statSync(out).size };
}

async function main() {
  const a = parseArgs(process.argv.slice(2), { in: '', out: 'out/images', quality: 82, force: false, help: false });
  if (a.help || !a.in) return console.log(USAGE);
  const files = statSync(a.in).isDirectory() ? readdirSync(a.in).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => join(a.in, f)) : [a.in];
  if (!files.length) { console.error('No PNG/JPG files found.'); process.exit(1); }
  for (const f of files) {
    const r = await convertOne(f, a.out, { quality: a.quality, force: a.force });
    console.log(`${r.skipped ? 'skip' : 'ok  '} ${basename(f)} -> ${r.out} (${humanSize(r.size)})`);
  }
}

if (process.argv[1]?.endsWith('process-images.mjs')) main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
