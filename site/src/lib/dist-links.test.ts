import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(__dirname, '../../dist');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

// Runs against the last build. Skipped when there is no dist folder (a fresh clone before `npm run build`).
describe.skipIf(!existsSync(DIST))('built site', () => {
  const pages = existsSync(DIST) ? walk(DIST).filter((p) => p.endsWith('.html')) : [];
  const known = (href: string) => {
    const path = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (!path) return true;
    const rel = path.startsWith('/') ? path.slice(1) : path;
    const t = join(DIST, rel);
    return existsSync(t) && (!statSync(t).isDirectory() || existsSync(join(t, 'index.html')));
  };

  it('has pages', () => expect(pages.length).toBeGreaterThan(3));

  it('internal links and images resolve', () => {
    const broken: string[] = [];
    for (const p of pages) {
      const html = readFileSync(p, 'utf8');
      for (const m of html.matchAll(/(?:href|src)="(\/[^"#?][^"]*|\/)"/g)) {
        if (m[1].startsWith('//')) continue;
        if (!known(m[1])) broken.push(`${p.replace(DIST, '')} -> ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('every image has an alt attribute', () => {
    const bad: string[] = [];
    for (const p of pages) for (const m of readFileSync(p, 'utf8').matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) bad.push(p.replace(DIST, ''));
    expect(bad).toEqual([]);
  });

  it('every page has a title and one h1', () => {
    for (const p of pages) {
      const html = readFileSync(p, 'utf8');
      if (/http-equiv="refresh"/.test(html) || p.includes('/apps-hosted/')) continue;
      expect(/<title>[^<]+<\/title>/.test(html), p).toBe(true);
      const h1 = (html.match(/<h1\b/g) ?? []).length;
      expect(h1, p).toBeGreaterThanOrEqual(1);
      // The home and work pages render one h1 per layout and shows one at a time.
      if (!['index.html', 'work/index.html'].some((f) => p === join(DIST, f))) expect(h1, p).toBeLessThanOrEqual(1);
    }
  });
});
