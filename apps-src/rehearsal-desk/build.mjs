#!/usr/bin/env node
// Builds Rehearsal Desk into one self-contained HTML file: core logic + app code + styles, no dependencies.
// Core and app files are written as ES modules so the core can be unit tested; here they are joined into one script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = (p) => readFileSync(join(here, 'src', p), 'utf8');
const ORDER = ['core/text.js', 'core/parse.js', 'core/jd.js', 'core/ats.js', 'core/answers.js', 'core/questions.js', 'core/practice.js', 'core/extract.js', 'core/story.js', 'sample.js', 'app/store.js', 'app/board.js', 'app/views.js', 'app/story.js', 'app/main.js'];

const script = ORDER.map((f) => {
  let t = src(f);
  t = t.replace(/^import\s[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  t = t.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
  if (/^\s*(?:import|export)\s/m.test(t)) throw new Error('Unhandled import/export left in ' + f);
  return '/* ---- ' + f + ' ---- */\n' + t;
}).join('\n');
if (script.includes('</script')) throw new Error('A source file contains a closing script tag.');
const html = src('template.html').replace('/*STYLE*/', () => src('styles.css')).replace('/*SCRIPT*/', () => script);

const out = join(root, 'site', 'public', 'apps-hosted', 'rehearsal-desk', 'index.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('rehearsal-desk: ' + Math.round(html.length / 1024) + ' KB -> ' + out.replace(root + '/', ''));
