#!/usr/bin/env node
// The site copies the built Live Lab module (live-lab/dist). If it is missing, build it now so the Live Lab page works
// the first time you run the site, instead of showing the "not available" stub.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const lab = resolve(ROOT, 'live-lab');
if (existsSync(resolve(lab, 'dist', 'live-lab.js')) || !existsSync(resolve(lab, 'package.json'))) process.exit(0);

const run = (args) => spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: lab, stdio: 'inherit', shell: process.platform === 'win32' });
console.log('ensure-livelab: live-lab/dist is missing, building the Live Lab module (first run only)...');
if (!existsSync(resolve(lab, 'node_modules'))) run(['install']);
const r = run(['run', 'build']);
if (r.status !== 0) console.warn('ensure-livelab: the build failed; the site will show the Live Lab stub. Run "npm run build" in live-lab to see why.');
