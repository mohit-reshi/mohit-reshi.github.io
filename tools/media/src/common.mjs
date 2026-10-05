import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function parseArgs(argv, spec) {
  const out = { _: [] };
  for (const [k, d] of Object.entries(spec)) if (d !== undefined) out[k] = d;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (!(key in spec)) throw new Error(`Unknown option --${key}`);
    if (typeof spec[key] === 'boolean') out[key] = true;
    else { if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`); out[key] = typeof spec[key] === 'number' ? Number(argv[++i]) : argv[++i]; }
  }
  return out;
}

export const FFMPEG_HELP = `ffmpeg was not found on PATH.
Windows (PowerShell), pick one:
  winget install Gyan.FFmpeg
  choco install ffmpeg
Then open a NEW PowerShell window and check:  ffmpeg -version`;

export function hasTool(name) {
  const r = spawnSync(name, ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

export function humanSize(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function walk(dir, { skip = ['.git', 'node_modules'] } = {}) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (skip.includes(n)) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, { skip })); else out.push({ path: p, size: st.size });
  }
  return out;
}
