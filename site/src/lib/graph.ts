import type { ModelDoc } from './projects';

export interface GNode { id: string; label: string; role: string; x: number; y: number; w: number; h: number; sub: string }
export interface GEdge { from: string; to: string; fromPt: [number, number]; toPt: [number, number]; active: boolean; both: boolean; fromCard: string; toCard: string; mid: [number, number] }
export interface Graph { nodes: GNode[]; edges: GEdge[]; width: number; height: number }

const W = 168, H = 50, GAPX = 36, GAPY = 96;

const tableOf = (ref: string) => ref.split('[')[0];

/**
 * Deterministic star-schema layout: facts in the middle row, dimensions above and below sorted by the average
 * x-position of the facts they relate to, unrelated tables in a last row. Measure tables are left out.
 */
export function layoutGraph(doc: Pick<ModelDoc, 'tables' | 'relationships'>): Graph {
  const tables = doc.tables.filter((t) => t.role !== 'measure-table');
  const ids = new Set(tables.map((t) => t.name));
  const rels = doc.relationships.filter((r) => ids.has(tableOf(r.from)) && ids.has(tableOf(r.to)));
  const degree = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();
  for (const r of rels) {
    const a = tableOf(r.from), b = tableOf(r.to);
    degree.set(a, (degree.get(a) ?? 0) + 1); degree.set(b, (degree.get(b) ?? 0) + 1);
    (neighbors.get(a) ?? neighbors.set(a, new Set()).get(a)!).add(b);
    (neighbors.get(b) ?? neighbors.set(b, new Set()).get(b)!).add(a);
  }
  const facts = tables.filter((t) => t.role === 'fact' && (degree.get(t.name) ?? 0) > 0);
  const factIds = new Set(facts.map((t) => t.name));
  const related = tables.filter((t) => !factIds.has(t.name) && (degree.get(t.name) ?? 0) > 0);
  const loose = tables.filter((t) => !factIds.has(t.name) && !(degree.get(t.name) ?? 0));

  const pos = new Map<string, { x: number; y: number }>();
  const factY = GAPY + H;
  facts.forEach((t, i) => pos.set(t.name, { x: i * (W + GAPX * 2), y: factY }));
  const factX = (id: string) => pos.get(id)?.x ?? 0;
  const avg = (id: string) => { const f = [...(neighbors.get(id) ?? [])].filter((n) => factIds.has(n)); return f.length ? f.reduce((s, n) => s + factX(n), 0) / f.length : Infinity; };
  const sorted = [...related].sort((a, b) => avg(a.name) - avg(b.name) || a.name.localeCompare(b.name));
  const top: typeof related = [], bottom: typeof related = [];
  sorted.forEach((t, i) => (i % 2 === 0 ? top : bottom).push(t));
  const place = (list: typeof related, y: number) => list.forEach((t, i) => pos.set(t.name, { x: i * (W + GAPX), y }));
  place(top, 0);
  place(bottom, factY + H + GAPY);
  const looseY = (bottom.length ? factY + H + GAPY : factY + H + GAPY / 2) + (bottom.length ? H + GAPY / 1.5 : 0);
  loose.forEach((t, i) => pos.set(t.name, { x: i * (W + GAPX), y: looseY }));

  // centre each row on the widest row
  const rows = new Map<number, string[]>();
  for (const [id, p] of pos) (rows.get(p.y) ?? rows.set(p.y, []).get(p.y)!).push(id);
  const rowWidth = (ids2: string[]) => Math.max(...ids2.map((i) => pos.get(i)!.x)) + W;
  const maxW = Math.max(W, ...[...rows.values()].map(rowWidth));
  for (const ids2 of rows.values()) { const off = (maxW - rowWidth(ids2)) / 2; ids2.forEach((i) => (pos.get(i)!.x += off)); }

  const byName = new Map(tables.map((t) => [t.name, t]));
  const nodes: GNode[] = [...pos.entries()].map(([id, p]) => ({ id, label: id, role: byName.get(id)!.role, x: p.x, y: p.y, w: W, h: H, sub: `${byName.get(id)!.role} · ${byName.get(id)!.columns} cols${byName.get(id)!.measures ? ` · ${byName.get(id)!.measures} meas.` : ''}` }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edgePoint = (n: GNode, toward: GNode): [number, number] => {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, tx = toward.x + toward.w / 2, ty = toward.y + toward.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const sx = dx ? (n.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (n.h / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return [cx + dx * s, cy + dy * s];
  };
  const edges: GEdge[] = rels.map((r) => {
    const a = nodeById.get(tableOf(r.from))!, b = nodeById.get(tableOf(r.to))!;
    const [c1, c2] = r.cardinality.split('-to-');
    const fromPt = edgePoint(a, b), toPt = edgePoint(b, a);
    return { from: a.id, to: b.id, fromPt, toPt, active: r.active, both: r.cross_filter === 'both', fromCard: c1 === 'one' ? '1' : '*', toCard: c2 === 'one' ? '1' : '*', mid: [(fromPt[0] + toPt[0]) / 2, (fromPt[1] + toPt[1]) / 2] };
  });
  const width = Math.max(maxW, ...nodes.map((n) => n.x + n.w));
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + 8;
  return { nodes, edges, width, height };
}
