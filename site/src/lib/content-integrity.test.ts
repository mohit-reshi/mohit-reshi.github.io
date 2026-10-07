import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const PROJECTS = join(ROOT, 'content', 'projects');
const IMG = /\.(webp|png|jpe?g)$/i;
const folders = existsSync(PROJECTS) ? readdirSync(PROJECTS).filter((f) => statSync(join(PROJECTS, f)).isDirectory()) : [];
const withPages = folders.filter((f) => existsSync(join(PROJECTS, f, 'media', 'pages')) && readdirSync(join(PROJECTS, f, 'media', 'pages')).some((n) => IMG.test(n)));

const load = (slug: string) => {
  const dir = join(PROJECTS, slug, 'media', 'pages');
  const files = readdirSync(dir).filter((n) => IMG.test(n)).sort();
  const meta: Array<Record<string, any>> = existsSync(join(dir, 'pages.json')) ? JSON.parse(readFileSync(join(dir, 'pages.json'), 'utf8')) : [];
  return { dir, files, meta };
};
const EM_DASH = '—';

describe('report page media', () => {
  it('finds projects to check', () => expect(folders.length).toBeGreaterThan(0));

  for (const slug of withPages) {
    describe(slug, () => {
      const { dir, files, meta } = load(slug);

      it('pages.json lists only files that exist, and every image is listed', () => {
        for (const m of meta) expect(files, `${m.file} is listed but missing`).toContain(m.file);
        for (const f of files) expect(meta.map((m) => m.file), `${f} has no pages.json entry`).toContain(f);
      });

      it('every page has a title and a caption', () => {
        for (const m of meta) {
          expect(String(m.title ?? '').trim(), `${m.file} title`).not.toBe('');
          expect(String(m.caption ?? '').trim(), `${m.file} caption`).not.toBe('');
        }
      });

      it('every page has a thumbnail', () => {
        for (const f of files) expect(existsSync(join(dir, '..', 'thumbs', f)), `${f} thumb`).toBe(true);
      });

      it('no two pages are the same image', () => {
        const seen = new Map<string, string>();
        for (const f of files) {
          const h = createHash('sha1').update(readFileSync(join(dir, f))).digest('hex');
          expect(seen.get(h), `${f} duplicates ${seen.get(h)}`).toBeUndefined();
          seen.set(h, f);
        }
      });

      it('story text and hidden navigation highlights are well formed', () => {
        for (const m of meta) {
          if (m.story !== undefined) {
            expect(Array.isArray(m.story), `${m.file} story`).toBe(true);
            for (const para of m.story) expect(typeof para === 'string' && para.trim().length > 0).toBe(true);
          }
          if (m.hidden_nav) {
            const h = m.hidden_nav;
            for (const k of ['x', 'y', 'w', 'h']) expect(typeof h[k] === 'number' && h[k] >= 0 && h[k] <= 100, `${m.file} hidden_nav.${k}`).toBe(true);
            expect(h.x + h.w).toBeLessThanOrEqual(100);
            expect(h.y + h.h).toBeLessThanOrEqual(100);
            expect(String(h.label ?? '').length).toBeGreaterThan(0);
            expect(String(h.note ?? '').length).toBeGreaterThan(0);
          }
        }
      });

      it('copy follows the style rules (no em dashes, no emoji)', () => {
        const text = JSON.stringify(meta);
        expect(text.includes(EM_DASH)).toBe(false);
        expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
      });
    });
  }
});

describe('covers', () => {
  for (const slug of folders) {
    const cover = join(PROJECTS, slug, 'media', 'cover.webp');
    if (!existsSync(cover)) continue;
    it(`${slug} cover is a real image`, () => expect(statSync(cover).size).toBeGreaterThan(2000));
  }
});
