#!/usr/bin/env node
// Fail on any file over 100 MB (GitHub hard limit); warn when the working tree passes 800 MB.
import { parseArgs, walk, humanSize } from './common.mjs';

const USAGE = `check-sizes [--root .] [--limit-mb 100] [--warn-total-mb 800]
Windows example:  node tools\\media\\src\\check-sizes.mjs --root .`;

export function checkSizes(root, { limitMb = 100, warnTotalMb = 800 } = {}) {
  const files = walk(root);
  const total = files.reduce((a, f) => a + f.size, 0);
  const tooBig = files.filter((f) => f.size > limitMb * 1024 * 1024).sort((a, b) => b.size - a.size);
  return { files: files.length, total, tooBig, warnTotal: total > warnTotalMb * 1024 * 1024 };
}

function main() {
  const a = parseArgs(process.argv.slice(2), { root: '.', 'limit-mb': 100, 'warn-total-mb': 800, help: false });
  if (a.help) return console.log(USAGE);
  const r = checkSizes(a.root, { limitMb: a['limit-mb'], warnTotalMb: a['warn-total-mb'] });
  console.log(`${r.files} files, ${humanSize(r.total)} total (excluding .git and node_modules)`);
  if (r.warnTotal) console.warn(`WARNING: repository content passes ${a['warn-total-mb']} MB: trim media (GitHub recommends repos stay well under 1 GB).`);
  for (const f of r.tooBig) console.error(`TOO BIG: ${f.path} (${humanSize(f.size)}) exceeds ${a['limit-mb']} MB`);
  if (r.tooBig.length) process.exit(1);
}

if (process.argv[1]?.endsWith('check-sizes.mjs')) main();
