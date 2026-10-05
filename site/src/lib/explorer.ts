import { getProjects, getMedia, loadModelDoc, tagCounts, type Project } from './projects';
import { splitChapters } from './markdown';
import { siteConfig } from '../config';

/**
 * The one data shape every layout (classic grid, Index, Model View) and the case-study panel read.
 * It is emitted once as JSON in #explorer-data on the home and work pages.
 */
export interface ExplorerProject {
  slug: string; title: string; kind: 'report' | 'paginated' | 'pipeline'; group: 'portfolio' | 'enterprise';
  label: string; summary: string; tags: string[]; year: number; order: number;
  tables: number; measures: number; relationships: number; pages: number;
  live: boolean; href: string; cover: { src: string; w: number; h: number } | null;
}
export interface ExplorerCase {
  slug: string; intro: string; chapters: Array<{ name: string; id: string; html: string }>;
  facts: Array<{ k: string; v: string }>; measures: Array<{ name: string; dax: string }>;
  gallery: Array<{ src: string; thumb: string | null; title: string }>; video: string | null; poster: string | null;
  liveHref: string | null; techniques: string[];
}
export interface ExplorerData {
  projects: ExplorerProject[];
  tags: Array<{ key: string; label: string; group: 'platform' | 'skill' | 'domain'; color: string; count: number }>;
  cases: Record<string, ExplorerCase>;
  site: { name: string; tagline: string; location: string; status: string };
}

const labHref = (p: Project, base: (s: string) => string) => (siteConfig.liveLab.enabled && p.data.live_lab.enabled && p.data.live_lab.report_key ? `${base('live-lab/')}?report=${p.data.live_lab.report_key}` : null);

export async function buildExplorerData(withBase: (s: string) => string): Promise<ExplorerData> {
  const all = (await getProjects()).filter((p) => p.data.kind !== 'app');
  const projects: ExplorerProject[] = [];
  const cases: Record<string, ExplorerCase> = {};
  for (const p of all) {
    const doc = loadModelDoc(p);
    const media = getMedia(p);
    projects.push({
      slug: p.slug, title: p.data.title, kind: p.data.kind as ExplorerProject['kind'], group: p.data.group as ExplorerProject['group'],
      label: p.data.client_label ?? '', summary: p.data.summary, tags: p.data.tags, year: p.data.year, order: p.data.order,
      tables: doc?.stats.tables ?? 0, measures: doc?.stats.measures ?? 0, relationships: doc?.stats.relationships ?? 0, pages: doc?.stats.pages ?? 0,
      live: !!labHref(p, withBase), href: p.href, cover: media.cover,
    });
    const { intro, chapters } = splitChapters(p.body);
    const featured = p.data.featured_measures ?? [];
    cases[p.slug] = {
      slug: p.slug, intro, chapters: chapters.filter((c) => c.html.trim()),
      facts: doc ? [{ k: 'Tables', v: String(doc.stats.tables) }, { k: 'Relationships', v: String(doc.stats.relationships) }, { k: 'Measures', v: String(doc.stats.measures) }, { k: 'Pages', v: String(doc.stats.pages) }, { k: 'Storage', v: doc.storage_mode }] : [],
      measures: (doc?.measures ?? []).filter((m) => featured.includes(m.name)).map((m) => ({ name: m.name, dax: m.expression })),
      gallery: media.pages.slice(0, 8).map((g) => ({ src: g.src, thumb: g.thumb, title: g.title })),
      video: media.video, poster: media.poster?.src ?? media.cover?.src ?? null, liveHref: labHref(p, withBase), techniques: doc?.techniques ?? [],
    };
  }
  return {
    projects, tags: tagCounts(all), cases,
    site: { name: siteConfig.name, tagline: siteConfig.headline, location: siteConfig.location, status: siteConfig.status.show ? siteConfig.status.text : '' },
  };
}
