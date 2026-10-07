import { getCollection } from 'astro:content';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withBase } from './url';
import { tagMeta, type Tag } from './taxonomy';
import mediaManifest from '../generated/media-manifest.json';

export interface ProjectData {
  slug: string; title: string; kind: 'report' | 'paginated' | 'app' | 'pipeline'; group: 'portfolio' | 'enterprise' | 'app';
  client_label: string | null; summary: string; role: string; year: number; tools: string[]; tags: string[]; featured: boolean; order: number;
  draft: boolean; sample: boolean; status: 'live' | 'recorded-only';
  media: { cover: string; video?: string; poster?: string; before_after?: { before: string; after: string; caption: string } };
  links: { repo?: string; pbip?: string; live?: string; external?: string };
  live_lab: { enabled: boolean; report_key: string | null }; featured_measures: string[]; model_doc: string | null;
  appKind?: 'static' | 'external' | 'repo-only'; url?: string; repo?: string; stack: string[]; ai_built: boolean; needs_api_key: boolean; howBuilt: string;
}
export interface Project { slug: string; data: ProjectData; body: string; href: string }

// sample projects only with SITE_SAMPLES=1 (tests and CI); real drafts are shown in dev
export const SAMPLES_ENABLED = process.env.SITE_SAMPLES === '1';
export const DRAFTS_ENABLED = import.meta.env.DEV;

/** Everything is derived from the collection: grid, filters, palette, sitemap, home, prev/next, related. */
export async function getProjects(): Promise<Project[]> {
  const entries = await getCollection('projects');
  return entries
    .filter((e) => (SAMPLES_ENABLED || !(e.data as ProjectData).sample) && (DRAFTS_ENABLED || !(e.data as ProjectData).draft))
    .map((e) => ({ slug: (e.data as ProjectData).slug, data: e.data as ProjectData, body: e.body ?? '', href: withBase(`work/${(e.data as ProjectData).slug}/`) }))
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export const isApp = (p: Project) => p.data.kind === 'app';
export const tagsOf = (p: Project): Tag[] => p.data.tags.map(tagMeta);

export function tagCounts(projects: Project[]) {
  const counts = new Map<string, number>();
  for (const p of projects) for (const t of p.data.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ ...tagMeta(key), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function related(p: Project, all: Project[], n = 3): Project[] {
  return all.filter((o) => o.slug !== p.slug)
    .map((o) => ({ o, score: o.data.tags.filter((t) => p.data.tags.includes(t)).length * 2 + (o.data.group === p.data.group ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.o.data.order - b.o.data.order).slice(0, n).map((x) => x.o);
}

export function prevNext(p: Project, all: Project[]) {
  const list = all.filter((x) => isApp(x) === isApp(p));
  const i = list.findIndex((x) => x.slug === p.slug);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}

// ---------------------------------------------------------------- media
export interface HiddenNav { x: number; y: number; w: number; h: number; label: string; note: string }
type Manifest = Record<string, { files: Record<string, { size: number; w?: number; h?: number }>; pages: Array<{ file: string; thumb: string | null; title: string; caption: string; story?: string[]; hidden_nav?: HiddenNav | null; w: number; h: number; tw: number }> }>;
const manifest = mediaManifest as Manifest;
export const mediaUrl = (slug: string, rel: string) => withBase(`projects/${slug}/${rel}`);

export function getMedia(p: Project) {
  const m = manifest[p.slug] ?? { files: {}, pages: [] };
  const has = (rel?: string) => !!rel && !!m.files[rel];
  const dim = (rel: string) => ({ w: m.files[rel]?.w ?? 0, h: m.files[rel]?.h ?? 0 });
  const pick = (rel?: string) => (rel && has(rel) ? { src: mediaUrl(p.slug, rel), ...dim(rel) } : null);
  const ba = p.data.media.before_after;
  return {
    cover: pick(p.data.media.cover),
    poster: pick(p.data.media.poster),
    video: has(p.data.media.video) ? mediaUrl(p.slug, p.data.media.video!) : null,
    pages: m.pages.map((g) => ({ src: mediaUrl(p.slug, g.file), thumb: g.thumb ? mediaUrl(p.slug, g.thumb) : null, title: g.title, caption: g.caption, story: g.story ?? [], hidden_nav: g.hidden_nav ?? null, w: g.w, h: g.h, tw: g.tw })),
    beforeAfter: ba ? { before: pick(ba.before), after: pick(ba.after), caption: ba.caption } : null,
  };
}

// ---------------------------------------------------------------- model documentation (SPEC 6.2)
export interface ModelDoc {
  slug: string; public_title: string; source_kind: string; storage_mode: string;
  tables: Array<{ name: string; role: string; columns: number; measures: number; hidden: boolean }>;
  relationships: Array<{ from: string; to: string; cardinality: string; cross_filter: string; active: boolean }>;
  measures: Array<{ name: string; table: string; display_folder: string; format: string; description: string; expression: string; depends_on: string[] }>;
  rls: Array<{ role: string; filters: Array<{ table: string; expression: string }> }>;
  pages: Array<{ index: number; display_name: string; hidden: boolean; tooltip: boolean; drillthrough: boolean; visual_count: number; visual_types: Record<string, number> }>;
  techniques: string[]; stats: { tables: number; measures: number; relationships: number; pages: number };
}

const ROOT = resolve(process.cwd(), '..');
export function loadModelDoc(p: Project): ModelDoc | null {
  if (!p.data.model_doc) return null;
  const f = join(ROOT, p.data.model_doc.replace(/^\//, ''));
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')) as ModelDoc; } catch { return null; }
}
