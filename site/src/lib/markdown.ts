import { Marked } from 'marked';
import { createHighlighter } from 'shiki';
import { CHAPTERS } from '../../../tools/validate/schema.mjs';

const highlighter = await createHighlighter({ themes: ['github-dark'], langs: ['dax', 'sql', 'python', 'typescript', 'javascript', 'json', 'powershell', 'bash', 'yaml', 'html', 'css', 'markdown'] });
export const highlightCode = (code: string, lang = 'dax') => {
  const l = highlighter.getLoadedLanguages().includes(lang) ? lang : 'text';
  return highlighter.codeToHtml(code, { lang: l, theme: 'github-dark' });
};

const marked = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang }) { return highlightCode(text, (lang ?? 'text').toLowerCase()); },
    link({ href, title, tokens }) {
      const external = /^https?:\/\//.test(href);
      const q = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (/^\s*(javascript|data|vbscript):/i.test(href)) return this.parser.parseInline(tokens);
      return `<a href="${q(href)}"${title ? ` title="${q(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
  },
});
/**
 * Draft notes to the owner look like "[OWNER: add a real result]". They are for editing time only: a production build removes them
 * (whole lines, and inline occurrences) so a published page never shows a placeholder. Dev keeps them visible as reminders.
 */
export function stripOwnerMarkers(md: string): string {
  return md
    .replace(/^[ \t]*\[OWNER:[^\n]*\][ \t]*\n?/gm, '')
    .replace(/[ \t]*\[OWNER:[^\]]*\]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}
export const renderMarkdown = (md: string) => marked.parse(import.meta.env.PROD ? stripOwnerMarkers(md) : md, { async: false }) as string;

export interface Chapter { name: string; id: string; html: string }
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Split the case-study body at its "## " headings; the five standard chapters keep their order. */
export function splitChapters(body: string): { intro: string; chapters: Chapter[] } {
  // Lex first so a "## " line inside a fenced code block is never mistaken for a heading.
  const sections: { name: string | null; md: string }[] = [{ name: null, md: '' }];
  for (const tok of marked.lexer(body)) {
    if (tok.type === 'heading' && (tok as { depth: number }).depth === 2) sections.push({ name: (tok as { text: string }).text.trim(), md: '' });
    else sections[sections.length - 1].md += tok.raw;
  }
  const intro = sections.shift()!.md;
  const found = new Map<string, string>();
  const extra: Chapter[] = [];
  for (const { name, md } of sections) {
    const std = CHAPTERS.find((c) => c.toLowerCase() === name!.toLowerCase());
    if (std) found.set(std, md); else extra.push({ name: name!, id: slugify(name!), html: renderMarkdown(md) });
  }
  const chapters: Chapter[] = CHAPTERS.map((c) => ({ name: c, id: slugify(c), html: found.has(c) ? renderMarkdown(found.get(c)!) : '' }));
  return { intro: renderMarkdown(intro), chapters: [...chapters, ...extra] };
}
