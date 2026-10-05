import { describe, expect, it } from 'vitest';
import { renderMarkdown, splitChapters, stripOwnerMarkers } from './markdown';
import { wrap } from '../pages/og/_card';

describe('markdown', () => {
  it('splits chapters only at top-level ## headings, not inside code fences', () => {
    const body = 'Intro text\n\n## Problem\nWhy.\n\n```md\n## Not a heading\n```\n\n## Custom extra\nMore.\n';
    const { intro, chapters } = splitChapters(body);
    expect(intro).toContain('Intro text');
    const problem = chapters.find((c) => c.name === 'Problem')!;
    expect(problem.html).toContain('Not a heading');
    expect(chapters.find((c) => c.name === 'Custom extra')!.id).toBe('custom-extra');
    expect(chapters.some((c) => c.name === 'Not a heading')).toBe(false);
  });
  it('escapes link attributes and drops javascript: links', () => {
    expect(renderMarkdown('[a](https://x.test/?a=1&b="2")')).toContain('&amp;b=');
    const html = renderMarkdown('[bad](javascript:alert(1))');
    expect(html).not.toContain('href="javascript');
  });
  it('adds rel=noopener to external links only', () => {
    expect(renderMarkdown('[a](https://x.test)')).toContain('rel="noopener"');
    expect(renderMarkdown('[a](/local)')).not.toContain('rel=');
  });
});

describe('owner markers', () => {
  it('removes whole-line and inline draft notes', () => {
    const md = 'Real text.\n\n[OWNER: add one real result.]\n\nMore text [OWNER: confirm the storage mode] stays.\n';
    const out = stripOwnerMarkers(md);
    expect(out).not.toContain('OWNER');
    expect(out).toContain('Real text.');
    expect(out).toContain('More text stays.');
  });
});

describe('og wrap', () => {
  it('truncates over-long words and never emits empty lines', () => {
    const l = wrap('x'.repeat(60) + ' tail', 24, 3);
    expect(l.every((x) => x.length > 0 && x.length <= 25)).toBe(true);
  });
  it('ellipsizes overflow', () => {
    const l = wrap('one two three four five six seven eight nine ten eleven twelve', 10, 2);
    expect(l.length).toBe(2);
    expect(l[1].endsWith('…')).toBe(true);
  });
});
