import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The scalability promise: a scaffolded project (and app) appears in the grid, filters, palette index, sitemap and home with no other edits.
const root = resolve(process.cwd(), '..');
const dirs = ['content/projects/zz-probe-report', 'content/projects/zz-probe-app'];

test('new:project and new:app appear everywhere without touching any other file', async () => {
  test.setTimeout(180_000);
  const sh = (cmd: string, env: Record<string, string> = {}) => execSync(cmd, { cwd: resolve(root, 'site'), env: { ...process.env, ...env }, stdio: 'pipe' }).toString();
  try {
    sh('npm run new:project -- --kind report --slug zz-probe-report --group portfolio --title "Probe Report"');
    sh('npm run new:app -- --slug zz-probe-app --app-kind repo-only --repo https://github.com/example/probe --title "Probe App"');
    for (const d of dirs) {
      const f = resolve(root, d, 'index.md');
      writeFileSync(f, readFileSync(f, 'utf8').replace('draft: true', 'draft: false').replace('featured: false', 'featured: true').replace('tags: []', 'tags: [dax]'));
    }
    const v = sh('npm run validate');
    expect(v).toContain('OK');
    sh('node ../tools/site/sync-media.mjs && npx astro build --outDir dist-probe');
    const html = (p: string) => readFileSync(resolve(root, 'site/dist-probe', p), 'utf8');
    expect(html('work/index.html')).toContain('Probe Report');
    expect(html('work/index.html')).not.toContain('Probe App');
    expect(html('apps/index.html')).toContain('Probe App');
    expect(html('index.html')).toContain('Probe Report');
    expect(html('sitemap.xml')).toContain('/work/zz-probe-report/');
    expect(html('sitemap.xml')).toContain('/work/zz-probe-app/');
    expect(html('search-index.json')).toContain('Probe Report');
    expect(html('search-index.json')).toContain('Filter: DAX');
    expect(existsSync(resolve(root, 'site/dist-probe/og/zz-probe-report.png'))).toBe(true);
    const app = html('work/zz-probe-app/index.html');
    expect(app).toContain('lives in a repository');
    expect(app).toContain('https://github.com/example/probe');
    expect(app).not.toContain('<iframe');
  } finally {
    for (const d of dirs) rmSync(resolve(root, d), { recursive: true, force: true });
    rmSync(resolve(root, 'site/dist-probe'), { recursive: true, force: true });
    execSync('node ../tools/site/sync-media.mjs --samples', { cwd: resolve(root, 'site'), stdio: 'pipe' });
  }
});
