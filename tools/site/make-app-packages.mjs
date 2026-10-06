#!/usr/bin/env node
// For every static app in site/public/apps-hosted/<slug>/ that has an index.html:
//  - copies site/apps-shared/app-chrome.js next to it (the page loads ./app-chrome.js)
//  - writes <slug>-local.zip with the app files and a short README, so visitors can run it on their own computer.
// Generated files are gitignored. No dependencies: the zip is written with node:zlib.
import { readdirSync, readFileSync, writeFileSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hosted = join(root, 'site', 'public', 'apps-hosted');
const chrome = join(root, 'site', 'apps-shared', 'app-chrome.js');

function crc32(buf) { return zlib.crc32 ? zlib.crc32(buf) >>> 0 : slowCrc(buf); }
function slowCrc(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}

/** files: [{ name, data: Buffer }] -> zip Buffer (deflate, fixed timestamp so builds are reproducible). */
export function makeZip(files) {
  const parts = [], central = [];
  let offset = 0;
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = f.data;
    const def = zlib.deflateRawSync(raw, { level: 9 });
    const useDef = def.length < raw.length;
    const body = useDef ? def : raw;
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDef ? 8 : 0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDef ? 8 : 0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const readme = (slug) => `Run ${slug} on your computer
================================

1. Unzip this folder anywhere.
2. Double-click index.html. It opens in your browser. No install, no server, no account.

Good to know
- Your progress is saved in your browser on this computer. Use the same browser each time.
- Clearing your browser's site data or cookies removes it. Do not clear it if you want to keep your history.
- Nothing is sent anywhere. The app makes no network requests.
- Keep the files in this folder together.
`;

export function buildPackages() {
  if (!existsSync(hosted) || !existsSync(chrome)) return [];
  const made = [];
  for (const slug of readdirSync(hosted)) {
    const dir = join(hosted, slug);
    if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'index.html'))) continue;
    copyFileSync(chrome, join(dir, 'app-chrome.js'));
    const files = readdirSync(dir)
      .filter((n) => statSync(join(dir, n)).isFile() && !n.endsWith('.zip'))
      .sort()
      .map((n) => ({ name: `${slug}/${n}`, data: readFileSync(join(dir, n)) }));
    files.push({ name: `${slug}/README.txt`, data: Buffer.from(readme(slug), 'utf8') });
    writeFileSync(join(dir, `${slug}-local.zip`), makeZip(files));
    made.push(slug);
  }
  return made;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const made = buildPackages();
  console.log(`app packages: ${made.length ? made.join(', ') : 'none'}`);
}
