import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseArgs(argv, spec) {
  const out = { ...Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v === Boolean ? false : v])) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`);
    const k = a.slice(2);
    if (!(k in spec)) throw new Error(`Unknown option --${k}`);
    if (spec[k] === Boolean) out[k] = true; else { if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`); out[k] = argv[++i]; }
  }
  return out;
}

const titleCase = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const q = (s) => JSON.stringify(s); // YAML-safe double-quoted string

export function projectMarkdown(o) {
  const lines = [
    '---', `slug: ${o.slug}`, `title: ${q(o.title)}`, `kind: ${o.kind}`, `group: ${o.group}`, 'client_label: null',
    'summary: "One sentence (160 characters max) that says what the project does and why it matters."',
    `role: "Power BI developer"`, `year: ${o.year}`, 'tools: []', 'tags: []', 'featured: false', 'order: 100', 'draft: true', 'status: recorded-only',
    'media:', '  cover: media/cover.webp', '  # video: media/video.mp4', '  # poster: media/poster.webp', '  # before_after: { before: media/before.webp, after: media/after.webp, caption: "What changed" }',
    'links: {}', 'live_lab: { enabled: false, report_key: null }', 'featured_measures: []', 'model_doc: null',
  ];
  if (o.kind === 'app') lines.push(`appKind: ${o.appKind}`, ...(o.url ? [`url: ${o.url}`] : []), ...(o.repo ? [`repo: ${o.repo}`] : []), 'stack: []', 'ai_built: true', `needs_api_key: false`, 'howBuilt: ""');
  lines.push('---', '');
  const body = o.kind === 'app'
    ? ['## Problem', '', 'What need or curiosity is this app for?', '', '## Data model', '', 'What data or API does it use (no keys, no client data)?', '', '## Report', '', 'What does it look like and how do you use it? Add screenshots under `media/pages/`.', '',
       '## Under the hood', '', 'Stack, prompts, tools and what the AI did versus what you did.', '', '## Outcome', '', 'What you learned and what you would change.', '']
    : ['## Problem', '', 'What business question was asked, and who asked it (generic client label only, no names)?', '', '## Data model', '', 'Grain, facts, dimensions and the decisions that mattered. The diagram is generated from `model_doc` when set.', '',
       '## Report', '', 'What the report does, page by page. Screenshots go in `media/pages/`.', '', '## Under the hood', '', 'The techniques worth showing: DAX patterns, RLS, refresh design. List measure names in `featured_measures` to show their DAX.', '',
       '## Outcome', '', 'Result, impact, and what you would do next.', ''];
  return lines.join('\n') + body.join('\n');
}

export function writeProject(o, root = ROOT) {
  if (!KEBAB.test(o.slug)) throw new Error('--slug must be kebab-case (lowercase letters, digits and hyphens), for example my-report');
  const dir = join(root, 'content', 'projects', o.slug);
  if (existsSync(dir)) throw new Error(`content/projects/${o.slug} already exists; nothing was changed.`);
  for (const sub of ['media/pages', 'media/thumbs']) { mkdirSync(join(dir, sub), { recursive: true }); writeFileSync(join(dir, sub, '.gitkeep'), ''); }
  writeFileSync(join(dir, 'index.md'), projectMarkdown(o));
  return dir;
}

export const nextSteps = (slug) => `
Next steps:
  1. Edit content/projects/${slug}/index.md: title, summary, tags (keys from content/taxonomy.json), tools, then set draft: false.
  2. Write the case study under the five "##" headings.
  3. Add media: node tools/media/src/process-images.mjs --in <screenshots> --out out/images/${slug}
                node tools/media/src/place.mjs --slug ${slug} --from out/images/${slug}
  4. Check it:   npm --prefix site run validate -- --media
  5. Commit.   (the work grid, filters, search palette, sitemap and home page pick it up automatically)
`;

export { titleCase };
