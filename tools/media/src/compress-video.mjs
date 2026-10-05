#!/usr/bin/env node
// Compress screen recordings to H.264 MP4 (1080p max, no audio, faststart) aiming at about 10 MB, plus a WebP poster.
import { mkdirSync, statSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { parseArgs, hasTool, FFMPEG_HELP, humanSize } from './common.mjs';

const USAGE = `compress-video --in <file|folder> [--out out/video] [--target-mb 10] [--crf 24] [--no-poster]
Windows example:  node src\\compress-video.mjs --in D:\\recordings --out out\\video`;
export const CRF_STEPS = (start) => [start, start + 3, start + 6, start + 9, start + 12].filter((c) => c <= 40);

export function buildArgs(input, output, crf) {
  return ['-y', '-i', input, '-an', '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output];
}

export async function compressOne(input, outDir, { targetMb = 10, crf = 24, poster = true } = {}) {
  mkdirSync(outDir, { recursive: true });
  const name = basename(input, extname(input));
  const output = join(outDir, `${name}.mp4`);
  let used = null;
  for (const c of CRF_STEPS(crf)) {
    const r = spawnSync('ffmpeg', buildArgs(input, output, c), { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${input}: ${(r.stderr || '').split('\n').slice(-4).join(' ')}`);
    used = c;
    if (statSync(output).size / 1024 / 1024 <= targetMb) break;
  }
  const size = statSync(output).size;
  let posterPath = null;
  if (poster) {
    const tmp = join(outDir, `${name}.poster.png`);
    const p = spawnSync('ffmpeg', ['-y', '-ss', '1', '-i', output, '-frames:v', '1', tmp], { encoding: 'utf8' });
    const src = p.status === 0 && existsSync(tmp) ? tmp : null;
    if (!src) spawnSync('ffmpeg', ['-y', '-i', output, '-frames:v', '1', tmp]);
    posterPath = join(outDir, `${name}.poster.webp`);
    await sharp(tmp).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }).toFile(posterPath);
    rmSync(tmp, { force: true });
  }
  return { input, output, poster: posterPath, size, crf: used, overTarget: size / 1024 / 1024 > targetMb };
}

async function main() {
  const a = parseArgs(process.argv.slice(2), { in: '', out: 'out/video', 'target-mb': 10, crf: 24, 'no-poster': false, help: false });
  if (a.help || !a.in) return console.log(USAGE);
  if (!hasTool('ffmpeg')) { console.error(FFMPEG_HELP); process.exit(1); }
  const files = statSync(a.in).isDirectory() ? readdirSync(a.in).filter((f) => /\.(mp4|mov|mkv|webm|avi)$/i.test(f)).map((f) => join(a.in, f)) : [a.in];
  if (!files.length) { console.error('No video files found.'); process.exit(1); }
  let warn = 0;
  for (const f of files) {
    const r = await compressOne(f, a.out, { targetMb: a['target-mb'], crf: a.crf, poster: !a['no-poster'] });
    console.log(`${basename(f)} -> ${r.output}  ${humanSize(r.size)}  (crf ${r.crf})${r.overTarget ? `  WARNING: above ${a['target-mb']} MB; shorten the clip or lower the resolution` : ''}`);
    warn += r.overTarget ? 1 : 0;
  }
  if (warn) process.exitCode = 2;
}

if (process.argv[1]?.endsWith('compress-video.mjs')) main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
