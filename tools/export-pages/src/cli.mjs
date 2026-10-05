#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseConfig } from './config.mjs';
import { loadEnv, requireCreds } from './env.mjs';
import { createTokenProvider } from './auth.mjs';
import { createClient } from './pbi.mjs';
import { exportReport, planReport, manualCaptureList } from './exporter.mjs';
import { writeContactSheet } from './contact-sheet.mjs';

const HELP = `export-pages: export every report page with the Export To File API.
  node src/cli.mjs [--config export.config.json] [--only <slug>] [--format png|pdf] [--identity <persona>] [--dry-run]
Credentials: TENANT_ID, CLIENT_ID, CLIENT_SECRET in .env (never committed).`;

export function parseArgs(argv) {
  const a = { config: 'export.config.json', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${k} needs a value`); return argv[++i]; };
    if (k === '--config') a.config = v(); else if (k === '--only') a.only = v(); else if (k === '--identity') a.identity = v();
    else if (k === '--format') { a.format = v().toLowerCase(); if (!['png', 'pdf'].includes(a.format)) throw new Error('--format must be png or pdf'); }
    else if (k === '--dry-run') a.dryRun = true; else if (k === '--help' || k === '-h') a.help = true; else throw new Error(`Unknown option ${k}`);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(HELP);
  const cfg = parseConfig(await readFile(args.config, 'utf8'));
  let reports = cfg.reports;
  if (args.only) { reports = reports.filter((r) => r.slug === args.only); if (!reports.length) throw new Error(`No report with slug "${args.only}" in the config.`); }

  if (args.dryRun) {
    console.log(`DRY RUN (no network). Output folder: ${cfg.outDir}/`);
    for (const r of reports) {
      const p = planReport(r, args);
      if (p.skip) console.log(`- ${r.slug}: skipped (${p.skip})`);
      else if (p.kind === 'paginated') console.log(`- ${r.slug}: paginated -> ${p.jobs.map((j) => j.file).join(', ')}`);
      else console.log(`- ${r.slug}: interactive -> one ${p.format} per page -> ${cfg.outDir}/${r.slug}/pages/NN-page${p.tag}.${p.ext} (page list read from the service)`);
    }
    return;
  }
  const creds = requireCreds(loadEnv());
  const client = createClient(createTokenProvider(creds));
  const results = [];
  for (const r of reports) {
    console.log(`Exporting ${r.slug} ...`);
    results.push(await exportReport(client, r, { outDir: cfg.outDir, format: args.format, identity: args.identity, concurrency: cfg.concurrency, log: console.log }));
  }
  await writeContactSheet(cfg.outDir, results);
  const manual = manualCaptureList(results);
  console.log(`\nContact sheet: ${cfg.outDir}/contact-sheet.html`);
  if (manual.length) { console.log('\nNEEDS MANUAL CAPTURE:'); manual.forEach((m) => console.log(' - ' + m)); process.exitCode = 2; }
  else console.log('\nNothing needs manual capture (still look at the contact sheet: the blank check is a heuristic).');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.mjs')) main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
