#!/usr/bin/env node
// npm run new:app -- --slug my-app [--app-kind external] [--url https://...]   (from /site)
import { parseArgs, writeProject, nextSteps, titleCase } from './lib.mjs';

const USAGE = `new-app --slug <kebab-slug> [--app-kind static|external|repo-only] [--title "Title"] [--url https://...] [--repo https://github.com/...] [--year 2026]`;
try {
  const a = parseArgs(process.argv.slice(2), { slug: '', 'app-kind': 'external', title: '', url: '', repo: '', year: String(new Date().getFullYear()), help: Boolean });
  if (a.help || !a.slug) { console.log(USAGE); process.exit(a.help ? 0 : 1); }
  if (!['static', 'external', 'repo-only'].includes(a['app-kind'])) throw new Error('--app-kind must be static, external or repo-only');
  const dir = writeProject({ kind: 'app', group: 'app', appKind: a['app-kind'], slug: a.slug, title: a.title || titleCase(a.slug), year: Number(a.year), url: a.url || undefined, repo: a.repo || undefined });
  console.log(`Created ${dir}`);
  if (a['app-kind'] === 'static') console.log(`Static apps are served from /apps-hosted/${a.slug}/ : put the built app in site/public/apps-hosted/${a.slug}/.`);
  if (a['app-kind'] === 'external' && !a.url) console.log('Remember: external apps need url: in the frontmatter (validate fails without it).');
  console.log(nextSteps(a.slug));
} catch (e) { console.error('Error: ' + e.message + '\n' + USAGE); process.exit(1); }
