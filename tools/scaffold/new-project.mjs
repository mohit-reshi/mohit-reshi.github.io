#!/usr/bin/env node
// npm run new:project -- --kind report --slug my-report --group portfolio   (from /site)
import { parseArgs, writeProject, nextSteps, titleCase } from './lib.mjs';

const USAGE = `new-project --kind report|paginated|pipeline --slug <kebab-slug> --group portfolio|enterprise [--title "Title"] [--year 2026]`;
try {
  const a = parseArgs(process.argv.slice(2), { kind: 'report', slug: '', group: 'portfolio', title: '', year: String(new Date().getFullYear()), help: Boolean });
  if (a.help || !a.slug) { console.log(USAGE); process.exit(a.help ? 0 : 1); }
  if (!['report', 'paginated', 'pipeline'].includes(a.kind)) throw new Error('--kind must be report, paginated or pipeline (use new:app for apps)');
  if (!['portfolio', 'enterprise'].includes(a.group)) throw new Error('--group must be portfolio or enterprise (apps use new:app)');
  const dir = writeProject({ kind: a.kind, slug: a.slug, group: a.group, title: a.title || titleCase(a.slug), year: Number(a.year) });
  console.log(`Created ${dir}`);
  console.log(nextSteps(a.slug));
} catch (e) { console.error('Error: ' + e.message + '\n' + USAGE); process.exit(1); }
