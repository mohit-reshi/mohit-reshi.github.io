import { Marked } from 'marked';
import { createHighlighter } from 'shiki';
import { CHAPTERS } from '../../../tools/validate/schema.mjs';

const highlighter = await createHighlighter({ themes: ['github-dark'], langs: ['dax', 'sql', 'python', 'typescript', 'javascript', 'json', 'powershell', 'bash', 'yaml', 'html', 'css', 'markdown'] });
export const highlightCode = (code: string, lang = 'dax') => {
  const l = highlighter.getLoadedLanguages().includes(lang) ? lang : 'text';
  return highlighter.codeToHtml(code, { lang: l, theme: 'github-dark' });
};

/** A screen of a project that a case study can place inside its text with ![alt](screen:N), N counting from 1 in the project's "screens" group. */
export interface Shot { src: string; title: string; caption: string; alt?: string; w: number; h: number }
let shotList: Shot[] = [];
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const shotFigure = (s: Shot) => `<figure class="shot" style="max-width:min(100%,${s.w}px)"><button type="button" data-lightbox-index="0" data-full="${esc(s.src)}" data-title="${esc(s.title)}" data-caption="${esc(s.caption)}" data-cursor="view" aria-label="Open ${esc(s.title)} larger"><img src="${esc(s.src)}" width="${s.w}" height="${s.h}" alt="${esc(s.alt || s.title)}" loading="lazy" decoding="async"></button><figcaption><strong>${esc(s.title)}</strong><span>${esc(s.caption)}</span></figcaption></figure>`;

const marked = new Marked({
  gfm: true,
  renderer: {
    image({ href, text }) {
      const m = /^screen:(\d+)$/.exec(href);
      const shot = m ? shotList[Number(m[1]) - 1] : undefined;
      if (m && shot) return shotFigure(shot);
      if (m) return '';
      return `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy">`;
    },
    paragraph({ tokens }) {
      const only = tokens.length === 1 && tokens[0].type === 'image' && /^screen:\d+$/.test((tokens[0] as { href: string }).href);
      const html = this.parser.parseInline(tokens);
      return only ? html : `<p>${html}</p>\n`;
    },
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
/** The screen numbers (1-based) that a case study body places inline. */
export const inlineShots = (body: string): number[] => [...body.matchAll(/!\[[^\]]*\]\(screen:(\d+)\)/g)].map((m) => Number(m[1]));

export interface Chapter { name: string; id: string; html: string }
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Split the case-study body at its "## " headings; the five standard chapters keep their order. */
export function splitChapters(body: string, shots: Shot[] = []): { intro: string; chapters: Chapter[] } {
  shotList = shots;
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
