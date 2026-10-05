/**
 * Model View: pure graph logic (no DOM). Derives tables and relationships from ExplorerData and works out which
 * tables light up (and in which direction) when one is hovered or focused. The tidy layered layout lives in
 * model-layout.ts and the orthogonal channel router in model-route.ts; both are re-exported from here.
 */
import type { ExplorerData, ExplorerProject } from './explorer';
import { GRID, jaccard } from './model-types';
export { GRID } from './model-types';

export type NodeType = 'fact' | 'dim' | 'sec' | 'about' | 'contact';
export type FkGroup = 'skill' | 'platform' | 'domain';
export interface Row { k: string; v: string; fk?: FkGroup; live?: boolean; persona?: string; href?: string; external?: boolean }
export interface MNode {
  id: string; type: NodeType; title: string; kicker: string; meta: string; rows: Row[]; note?: string;
  w: number; h: number; head: number; x: number; y: number; hx: number; hy: number;
  slug?: string; href?: string; group?: string; tag?: string; project?: ExplorerProject; portal?: boolean;
}
export interface MEdge {
  id: string; from: string; to: string; a: string; b: string; kind: 'tag' | 'sec' | 'bidi' | 'link';
  fk?: FkGroup; inactive?: boolean; bidi?: boolean; label?: string;
}
export interface Model {
  nodes: MNode[]; edges: MEdge[]; byId: Map<string, MNode>; personas: string[]; portals: string[]; signature: string;
  /** set by layoutModel: the tidy grid and the routes of every relationship while all cards sit on it */
  grid?: Grid; home?: Map<string, Route>;
}
export interface Pt { x: number; y: number }
export type Side = 'l' | 'r' | 't' | 'b';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Band { kind: 'top' | 'fact' | 'bot'; y: number; h: number; nodes: MNode[] }
/** bands are the rows of cards, channels (ch[i] sits above band i, ch[bands.length] below the last) are the empty strips between them */
export interface Grid { bands: Band[]; bandOf: Map<string, number>; chY: number[]; chH: number[]; x0: number; right: number; colX: number }
export interface Route {
  id: string; d: string; pts: Pt[]; start: Pt; end: Pt; mid: Pt & { ang: number }; chev: Array<Pt & { ang: number }>;
  markA: Pt; markB: Pt; label: Pt;
}

export interface ModelConfig {
  liveHref: string | null; aboutHref: string; labHref?: string;
  about: { role: string; location: string; status: string };
  links: { email?: string; linkedin?: string; github?: string };
  personas: string[];
}

export const ROW_H = 22;
const FACT_W = GRID.CW, DIM_W = GRID.CW, SEC_W = GRID.SW, MISC_W = GRID.SW;
const HEAD_FACT = 60, HEAD_DIM = 46, HEAD_SEC = 56, HEAD_MISC = 46;
const PERSONA_H = 28, NOTE_H = 58;

/** A project is a "portal" when it carries a row-level-security role for an insurance or embedded audience. */
export const isPortal = (p: ExplorerProject) => p.tags.includes('rls') && (p.tags.includes('insurance') || p.tags.includes('embedded'));

const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/^linkedin\.com\//, '').replace(/^github\.com\//, '').replace(/\/$/, '');

export function buildModel(data: ExplorerData, cfg: ModelConfig): Model {
  const nodes: MNode[] = [];
  const edges: MEdge[] = [];
  const dims = data.tags.filter((t) => t.group === 'skill' || t.group === 'platform');
  const domain = data.tags.filter((t) => t.group === 'domain' && t.count >= 2).slice(0, 3);
  const dimTags = [...dims, ...domain];
  const dimKeys = new Map(dimTags.map((t) => [t.key, t]));

  for (const p of data.projects) {
    const rows: Row[] = [];
    for (const g of ['skill', 'platform', 'domain'] as const) {
      const n = p.tags.filter((k) => dimKeys.get(k)?.group === g).length;
      if (n) rows.push({ k: `${g}_key`, v: `×${n}`, fk: g });
    }
    if (p.live) rows.push({ k: 'live', v: 'yes', live: true });
    const stats: Array<[string, number]> = [['measures', p.measures], ['tables', p.tables], ['relationships', p.relationships], ['pages', p.pages]];
    for (const [k, v] of stats) if (v > 0) rows.push({ k, v: String(v) });
    if (rows.length < 4) rows.push({ k: 'group', v: p.group });
    if (rows.length < 4) rows.push({ k: 'year', v: String(p.year) });
    const shown = rows.slice(0, 6);
    nodes.push({
      id: `f:${p.slug}`, type: 'fact', title: p.title, kicker: 'fact', meta: `${p.kind} · ${p.year}`, rows: shown, slug: p.slug, href: p.href, project: p, portal: isPortal(p),
      w: FACT_W, head: HEAD_FACT, h: HEAD_FACT + shown.length * ROW_H + 8, x: 0, y: 0, hx: 0, hy: 0,
    });
  }
  const facts = nodes.filter((n) => n.type === 'fact');
  // consistent card heights: every fact table is as tall as the tallest one
  const factH = Math.max(...facts.map((f) => f.head + f.rows.length * ROW_H + 8), 0);
  for (const f of facts) f.h = factH;
  for (const t of dimTags) {
    const users = data.projects.filter((p) => p.tags.includes(t.key));
    nodes.push({
      id: `d:${t.key}`, type: 'dim', title: t.label, kicker: 'dimension', meta: t.group, tag: t.key, group: t.group,
      rows: [{ k: 'key', v: t.key }, { k: 'count', v: String(t.count) }, { k: 'used_by', v: `${users.length} fact${users.length === 1 ? '' : 's'}` }],
      w: DIM_W, head: HEAD_DIM, h: HEAD_DIM + 3 * ROW_H + 8, x: 0, y: 0, hx: 0, hy: 0,
    });
    for (const p of users) {
      edges.push({
        id: `e:${t.key}>${p.slug}`, from: `d:${t.key}`, to: `f:${p.slug}`, a: '1', b: '*', kind: 'tag', fk: t.group,
        inactive: t.key === 'userelationship', label: t.key === 'userelationship' ? 'inactive' : undefined,
      });
    }
  }

  // Bi-directional pair: the two reports with the most similar tag sets (ties resolved by project order).
  if (facts.length >= 2) {
    let best: [number, MNode, MNode] | null = null;
    for (let i = 0; i < facts.length; i++) for (let j = i + 1; j < facts.length; j++) {
      const s = jaccard(facts[i].project!.tags, facts[j].project!.tags);
      if (!best || s > best[0] + 1e-9) best = [s, facts[i], facts[j]];
    }
    if (best && best[0] >= 0.5) edges.push({ id: `e:${best[1].slug}<>${best[2].slug}`, from: best[1].id, to: best[2].id, a: '*', b: '*', kind: 'bidi', bidi: true, label: 'both ways' });
  }

  const portals = facts.filter((f) => f.portal);
  if (cfg.liveHref) {
    nodes.push({
      id: 's:live-lab', type: 'sec', title: 'Live Lab', kicker: 'security', meta: 'rls · demo', href: cfg.liveHref,
      rows: cfg.personas.map((p) => ({ k: p, v: '', persona: p.toLowerCase() })),
      note: portals.length ? 'Pick a persona. Reports with no portal role fade, as they would for that identity.' : 'No portal reports are published yet, so there is nothing to filter.',
      w: SEC_W, head: HEAD_SEC, h: HEAD_SEC + cfg.personas.length * PERSONA_H + NOTE_H + 12, x: 0, y: 0, hx: 0, hy: 0,
    });
    for (const f of portals) edges.push({ id: `e:sec>${f.slug}`, from: 's:live-lab', to: f.id, a: '1', b: '*', kind: 'sec', fk: undefined });
  }
  const aboutRows: Row[] = [{ k: 'name', v: data.site.name }, { k: 'role', v: cfg.about.role }, { k: 'location', v: cfg.about.location }];
  if (data.site.status) aboutRows.push({ k: 'status', v: data.site.status });
  nodes.push({ id: 'a:about', type: 'about', title: 'About', kicker: 'disconnected', meta: 'profile', href: cfg.aboutHref, rows: aboutRows, w: MISC_W, head: HEAD_MISC, h: HEAD_MISC + aboutRows.length * ROW_H + 8, x: 0, y: 0, hx: 0, hy: 0 });
  const cr: Row[] = [];
  if (cfg.links.email) cr.push({ k: 'email', v: cfg.links.email, href: `mailto:${cfg.links.email}` });
  if (cfg.links.linkedin) cr.push({ k: 'linkedin', v: short(cfg.links.linkedin), href: cfg.links.linkedin, external: true });
  if (cfg.links.github) cr.push({ k: 'github', v: short(cfg.links.github), href: cfg.links.github, external: true });
  nodes.push({ id: 'c:contact', type: 'contact', title: 'Contact', kicker: 'disconnected', meta: 'links', href: cfg.links.email ? `mailto:${cfg.links.email}` : undefined, rows: cr, w: MISC_W, head: HEAD_MISC, h: HEAD_MISC + cr.length * ROW_H + 8, x: 0, y: 0, hx: 0, hy: 0 });
  edges.push({ id: 'e:about-contact', from: 'a:about', to: 'c:contact', a: '1', b: '1', kind: 'link' });

  return { nodes, edges, byId: new Map(nodes.map((n) => [n.id, n])), personas: cfg.personas, portals: portals.map((p) => p.id), signature: nodes.map((n) => n.id).join('|') + '#' + edges.length };
}

export function bounds(nodes: MNode[], extra: Rect[] = []): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); }
  for (const r of extra) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export { layoutModel, type LayoutOpts, type LayoutResult } from './model-layout';
export { routeEdges } from './model-route';

/* -------------------------------------------------------------------------------------------- */
/* Filter propagation                                                                            */

export type Flow = 'self' | 'up' | 'down';
export interface Highlight { nodes: Map<string, Flow>; edges: Set<string> }

/** Filters flow from the "1" side to the "*" side. A bi-directional relationship passes the filter on to its peer. */
export function propagate(id: string, edges: MEdge[]): Highlight {
  const nodes = new Map<string, Flow>([[id, 'self']]);
  const lit = new Set<string>();
  for (const e of edges) {
    if (e.from !== id && e.to !== id) continue;
    lit.add(e.id);
    const other = e.from === id ? e.to : e.from;
    if (!nodes.has(other)) nodes.set(other, e.from === id || e.bidi ? 'down' : 'up');
  }
  for (const [nid, f] of [...nodes]) {
    if (f !== 'down') continue;
    for (const e of edges) if (e.bidi && (e.from === nid || e.to === nid)) { lit.add(e.id); const o = e.from === nid ? e.to : e.from; if (!nodes.has(o)) nodes.set(o, 'down'); }
  }
  return { nodes, edges: lit };
}
