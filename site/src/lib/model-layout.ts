/**
 * Model View: the tidy layered layout (no DOM, no randomness).
 *
 *   top rows     platform dimension tables
 *   middle rows  fact tables, one per project, on a uniform grid (wrapped into rows of at most 5)
 *   bottom rows  skill and domain dimension tables
 *   right column Live Lab (security), About, Contact
 *
 * Cards inside a layer are ordered by barycenter (mean column of the tables they connect to) with a few sweeps; ties fall back to the
 * previous order and then the id, so the same data always gives the same picture. The channels between the rows are sized by the
 * number of line tracks that have to fit in them.
 */
import type { Band, Grid, MNode, Model, Rect } from './model-graph';
import { GRID, jaccard } from './model-types';
import { planHome } from './model-route';

export interface LayoutOpts { vw: number; vh: number; hud: { w: number; h: number } | null; mini: { w: number; h: number } | null; maxCols?: number }
export interface LayoutResult { frame: Rect; obstacles: Rect[]; scale0: number }

const { CW, G } = GRID;
const X0 = 48;

const chunkEven = <T>(a: T[], maxPer: number): T[][] => {
  if (!a.length) return [];
  const rows = Math.ceil(a.length / maxPer), per = Math.ceil(a.length / rows);
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += per) out.push(a.slice(i, i + per));
  return out;
};

function orderLayers(model: Model, T0: MNode[], F0: MNode[], B0: MNode[], maxCols: number) {
  const tag = model.edges.filter((e) => e.kind === 'tag');
  const dimsOf = new Map<string, string[]>(), factsOf = new Map<string, string[]>();
  for (const e of tag) { (dimsOf.get(e.to) ?? dimsOf.set(e.to, []).get(e.to)!).push(e.from); (factsOf.get(e.from) ?? factsOf.set(e.from, []).get(e.from)!).push(e.to); }
  const byTitle = (a: MNode, b: MNode) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1);
  let T = [...T0].sort(byTitle), B = [...B0].sort(byTitle);
  // facts start as a similarity chain, so reports with the same tags sit next to each other
  let F: MNode[] = [];
  const left = [...F0];
  if (left.length) {
    F.push(left.shift()!);
    while (left.length) {
      const last = F[F.length - 1]; let bi = 0, bs = -1;
      left.forEach((f, i) => { const s = jaccard(last.project!.tags, f.project!.tags); if (s > bs + 1e-9) { bs = s; bi = i; } });
      F.push(left.splice(bi, 1)[0]);
    }
  }
  const C = Math.max(1, ...[T, F, B].map((l) => Math.min(maxCols, l.length)));
  const colsOf = (list: MNode[]) => {
    const m = new Map<string, number>();
    for (const row of chunkEven(list, maxCols)) row.forEach((n, i) => m.set(n.id, (C - row.length) / 2 + i));
    return m;
  };
  const sortBy = (list: MNode[], key: (n: MNode) => number) => {
    const prev = new Map(list.map((n, i) => [n.id, i]));
    return list.map((n) => ({ n, k: key(n), i: prev.get(n.id)! })).sort((a, b) => a.k - b.k || a.i - b.i || (a.n.id < b.n.id ? -1 : 1)).map((x) => x.n);
  };
  const avg = (ids: string[] | undefined, pos: Map<string, number>, dflt: number) => {
    const v = (ids ?? []).map((i) => pos.get(i)).filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : dflt;
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    const pf = colsOf(F);
    T = sortBy(T, (d) => avg(factsOf.get(d.id), pf, C / 2));
    B = sortBy(B, (d) => avg(factsOf.get(d.id), pf, C / 2));
    const pd = new Map([...colsOf(T), ...colsOf(B)]);
    F = sortBy(F, (f) => avg(dimsOf.get(f.id), pd, C / 2));
  }
  return { T, F, B };
}

interface Pass { frame: Rect; w: number; h: number }

function pass(model: Model, o: LayoutOpts, R: { w: number; h: number } | null, M: { w: number; h: number } | null, share: boolean): Pass {
  const { nodes, edges } = model;
  const maxCols = o.maxCols ?? 5;
  const T0 = nodes.filter((n) => n.type === 'dim' && n.group === 'platform');
  const B0 = nodes.filter((n) => n.type === 'dim' && n.group !== 'platform');
  const F0 = nodes.filter((n) => n.type === 'fact');
  const specials = ['s:live-lab', 'a:about', 'c:contact'].map((id) => model.byId.get(id)).filter((n): n is MNode => !!n);
  const { T, F, B } = orderLayers(model, T0, F0, B0, maxCols);

  // columns: the widest row of cards in any layer
  const fRows = chunkEven(F, maxCols);
  const C = Math.max(1, ...fRows.map((r) => r.length), Math.min(maxCols, T.length), Math.min(maxCols, B.length));
  const colX = (c: number) => X0 + c * (CW + G);
  const right = X0 + C * CW + (C - 1) * G;
  const nSec = edges.filter((e) => e.kind === 'sec').length;
  const specX = right + 76 + 10 * nSec;

  const bands: Band[] = [];
  const place = (rows: MNode[][], kind: Band['kind'], freeFrom = -1) => {
    for (const row of rows) {
      let c0 = (C - row.length) / 2;
      if (freeFrom >= 0 && rows.length === 1) {
        const free = Array.from({ length: C }, (_, j) => j).filter((j) => colX(j) >= freeFrom);
        if (free.length >= row.length) c0 = free[0] + (free.length - row.length) / 2;
      }
      row.forEach((n, i) => { n.x = Math.round(colX(c0 + i)); n.hx = n.x; });
      bands.push({ kind, y: 0, h: row[0].h, nodes: row });
    }
  };
  place(chunkEven(T, maxCols), 'top', R ? R.w : -1);
  place(fRows, 'fact');
  place(chunkEven(B, maxCols), 'bot');
  const bandOf = new Map<string, number>();
  bands.forEach((b, i) => b.nodes.forEach((n) => bandOf.set(n.id, i)));
  const nb = bands.length;

  const grid: Grid = { bands, bandOf, chY: Array(nb + 1).fill(0), chH: Array(nb + 1).fill(0), x0: X0, right, colX: specX };
  model.grid = grid;
  for (const s of specials) { s.x = specX; s.hx = specX; }
  // the number of tracks in a channel does not depend on its height, so one plan sizes the channels and draws the routes
  const { tracks, build } = planHome(model, share);
  for (let c = 0; c <= nb; c++) {
    const need = tracks[c] ? 2 * GRID.PAD + (tracks[c] - 1) * GRID.STEP : 0;
    grid.chH[c] = c === 0 || c === nb ? need : Math.max(GRID.CH_MIN, need);
  }
  const stack = (shift: number) => {
    let y = shift;
    for (let c = 0; c <= nb; c++) {
      grid.chY[c] = y; y += grid.chH[c];
      if (c < nb) { bands[c].y = y; for (const n of bands[c].nodes) { n.y = y; n.hy = y; } y += bands[c].h; }
    }
    return y;
  };
  let bottom = stack(0);
  // keep the thesis box (top-left) clear of every card and of the channel that carries the lines into them
  if (R) {
    let top = Infinity;
    bands.forEach((b, i) => { if (b.nodes.some((n) => n.x < R.w)) top = Math.min(top, grid.chY[i]); });
    const shift = isFinite(top) ? Math.max(0, Math.ceil(R.h - top)) : 0;
    if (shift) bottom = stack(shift);
  }
  // special column: top aligned with the canvas, so it stays clear of the minimap that sits in the opposite corner
  let sy = R ? 0 : nb ? bands[0].y : 0;
  for (const s of specials) { s.y = Math.round(sy); s.hy = s.y; sy += s.h + G; }
  const specBottom = specials.length ? sy - G : 0;
  const W = specX + GRID.SW + GRID.MARGIN;
  const H = Math.max(bottom + GRID.MARGIN, specBottom + (M ? M.h : 0) + GRID.MARGIN);
  model.home = build(grid.chY, grid.chH);
  return { frame: { x: 0, y: 0, w: W, h: H }, w: W, h: H };
}

/**
 * Place every node on the tidy grid. The thesis box (hud) and the minimap are pinned over two corners of the canvas, so the layout
 * leaves room for them; their size in diagram units depends on the zoom, which is estimated from a first pass.
 */
export function layoutModel(model: Model, o: LayoutOpts): LayoutResult {
  const vw = Math.max(320, o.vw), vh = Math.max(240, o.vh);
  const kOf = (q: Pass) => Math.min(1.1, Math.max(0.2, Math.min((vw - 36) / q.w, (vh - 36) / q.h)));
  const run = (share: boolean) => {
    let p = pass(model, o, null, null, share);
    let k = kOf(p);
    if (o.hud || o.mini) {
      // the corner boxes are measured in screen pixels; their size in diagram units depends on the final zoom, which they themselves lower
      const k0 = k;
      for (let i = 0; i < 2; i++) {
        const kk = i === 0 ? k0 * 0.85 : Math.max(k0 * 0.6, k);
        const R = o.hud ? { w: (o.hud.w + 40) / kk, h: (o.hud.h + 24) / kk } : null;
        const M = o.mini ? { w: (o.mini.w + 28) / kk, h: (o.mini.h + 28) / kk } : null;
        p = pass(model, o, R, M, share); k = kOf(p);
      }
    }
    return { p, k };
  };
  let r = run(false);
  // many projects: one track per relationship makes the channels too tall to read the whole diagram, so share a trunk per dimension
  if (r.k < 0.62 && model.edges.length > 14) { const alt = run(true); if (alt.k > r.k + 0.02) r = alt; else r = run(false); }
  return { frame: r.p.frame, obstacles: [], scale0: r.k };
}
