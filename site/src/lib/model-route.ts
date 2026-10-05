/**
 * Model View: orthogonal relationship routing (no DOM).
 * While every card sits on the tidy grid, a line leaves a card's top or bottom edge at its own anchor, runs down into the empty
 * channel between two rows of cards, along a dedicated track, and down into the target. Edges that cross several rows travel
 * through a free vertical lane (a gutter between cards). A card that has been dragged off the grid gets a simple live route instead.
 * Everything is deterministic: ties are always broken by id.
 */
import type { MEdge, MNode, Model, Pt, Route, Side } from './model-graph';
import { GRID } from './model-types';

const f1 = (n: number) => n.toFixed(1);
const cxOf = (n: MNode) => n.x + n.w / 2;
const cyOf = (n: MNode) => n.y + n.h / 2;
const byKey = <T>(key: (t: T) => number, id: (t: T) => string) => (a: T, b: T) => key(a) - key(b) || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0);

/* ------------------------------------------------------------------------------------------ geometry helpers */

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.abs(l.x - p.x) > 0.01 || Math.abs(l.y - p.y) > 0.01) out.push({ x: p.x, y: p.y }); }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)) out.splice(i, 1);
  }
  return out;
}

/** polyline with rounded corners (quadratic bends); the curve stays inside the corner so it never leaves the channel */
export function roundPath(pts: Pt[], r = 9): string {
  let d = `M${f1(pts[0].x)} ${f1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += `L${f1(c.x + ((p.x - c.x) / l1) * rr)} ${f1(c.y + ((p.y - c.y) / l1) * rr)}Q${f1(c.x)} ${f1(c.y)} ${f1(c.x + ((n.x - c.x) / l2) * rr)} ${f1(c.y + ((n.y - c.y) / l2) * rr)}`;
  }
  const l = pts[pts.length - 1];
  return d + `L${f1(l.x)} ${f1(l.y)}`;
}

const markAt = (p: Pt, s: Side): Pt => (s === 'b' ? { x: p.x + 10, y: p.y + 12 } : s === 't' ? { x: p.x + 10, y: p.y - 12 } : s === 'l' ? { x: p.x - 12, y: p.y - 10 } : { x: p.x + 12, y: p.y - 10 });

/** turns a polyline into everything the SVG needs: path, cardinality marks, filter-direction chevrons, label spot */
function decorate(e: MEdge, rawPts: Pt[], su: Side, sv: Side): Route {
  const pts = simplify(rawPts);
  const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, len: Math.hypot(p.x - pts[i].x, p.y - pts[i].y) }));
  // the longest horizontal run carries the label and the bi-directional chevrons
  const hs = segs.filter((q) => Math.abs(q.a.y - q.b.y) < 0.01 && q.len >= 40);
  const longest = (hs.length ? hs : segs).reduce((m, q) => (q.len > m.len + 0.5 ? q : m));
  const at = (s: { a: Pt; b: Pt }, t: number) => ({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
  const ang = (s: { a: Pt; b: Pt }) => Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  const last = segs[segs.length - 1];
  const dirSeg = last.len >= 22 ? last : longest;
  const chev = e.bidi
    ? [{ ...at(longest, 0.36), ang: ang(longest) }, { ...at(longest, 0.64), ang: ang(longest) + Math.PI }]
    : [{ ...at(dirSeg, 0.5), ang: ang(dirSeg) }];
  const mid = at(longest, 0.5);
  return {
    id: e.id, d: roundPath(pts), pts, start: pts[0], end: pts[pts.length - 1], mid: { ...mid, ang: ang(longest) }, chev,
    markA: markAt(pts[0], su), markB: markAt(pts[pts.length - 1], sv), label: mid,
  };
}

/* ------------------------------------------------------------------------------------------ tidy (home) routing */

interface Lane { lo: number; hi: number; plans: Plan[] }
interface Leg { x: number; side: 'top' | 'bot' }
interface Seg { ch: number; lo: number; hi: number; legs: Leg[]; level: number }
interface Plan {
  e: MEdge; u: MNode; v: MNode; kind: 'band' | 'sec' | 'link'; su: Side; sv: Side; dir: 1 | -1 | 0;
  cu: number; cv: number; lane: Lane | null; lx: number; au: number; av: number; segs: Seg[];
}
export interface HomePlan { tracks: number[]; build: (chY: number[], chH: number[]) => Map<string, Route> }

/**
 * How many horizontal tracks does every channel need, and a builder that draws the routes once the channels have their final height.
 * Every relationship gets its own track. With `share`, relationships that start at the same table (a dimension, or the Live Lab) share
 * one trunk per channel instead and only branch apart at the anchors: the compact bus style, used when many projects would otherwise
 * make the channels too tall.
 */
export function planHome(model: Model, share = false): HomePlan {
  const grid = model.grid!;
  const { byId } = model;
  const { bands, bandOf } = grid;
  const nch = bands.length + 1;
  const plans: Plan[] = [];

  for (const e of model.edges) {
    const u = byId.get(e.from)!, v = byId.get(e.to)!;
    const bu = bandOf.get(u.id), bv = bandOf.get(v.id);
    if (bu !== undefined && bv !== undefined) {
      const dir: 1 | -1 | 0 = bu < bv ? 1 : bu > bv ? -1 : 0;
      plans.push({ e, u, v, kind: 'band', dir, su: dir === 1 ? 'b' : 't', sv: dir === -1 ? 'b' : 't', cu: dir === 1 ? bu + 1 : bu, cv: dir === -1 ? bv + 1 : bv, lane: null, lx: 0, au: 0, av: 0, segs: [] });
    } else if (bv !== undefined) {
      plans.push({ e, u, v, kind: 'sec', dir: 1, su: 'l', sv: 't', cu: -1, cv: bv, lane: null, lx: 0, au: 0, av: 0, segs: [] });
    } else {
      plans.push({ e, u, v, kind: 'link', dir: u.y <= v.y ? 1 : -1, su: u.y <= v.y ? 'b' : 't', sv: u.y <= v.y ? 't' : 'b', cu: -1, cv: -1, lane: null, lx: 0, au: 0, av: 0, segs: [] });
    }
  }

  /* lanes: vertical corridors a line may use to cross rows of cards */
  const lanes = new Map<string, Lane>();
  const laneOf = (lo: number, hi: number) => { const k = `${Math.round(lo)}|${Math.round(hi)}`; let l = lanes.get(k); if (!l) lanes.set(k, (l = { lo, hi, plans: [] })); return l; };
  const outerL = { lo: 6, hi: grid.x0 - 10 }, outerR = { lo: grid.right + 10, hi: grid.colX - 10 };
  for (const p of plans) {
    if (p.kind === 'sec') { p.lane = laneOf(outerR.lo, outerR.hi); p.lane.plans.push(p); continue; }
    if (p.kind !== 'band' || p.cu === p.cv) continue;
    const bu = bandOf.get(p.u.id)!, bv = bandOf.get(p.v.id)!;
    const crossed = bands.slice(Math.min(bu, bv) + 1, Math.max(bu, bv));
    const cands: Array<{ lo: number; hi: number }> = [outerL, outerR];
    for (const b of crossed) {
      const ns = [...b.nodes].sort((a, c) => a.x - c.x);
      for (let i = 0; i + 1 < ns.length; i++) { const lo = ns[i].x + ns[i].w + 8, hi = ns[i + 1].x - 8; if (hi - lo >= 14) cands.push({ lo, hi }); }
    }
    let best: { c: { lo: number; hi: number }; cost: number } | null = null;
    for (const c of cands) {
      const m = (c.lo + c.hi) / 2;
      if (crossed.some((b) => b.nodes.some((n) => m > n.x - 8 && m < n.x + n.w + 8))) continue;
      const cost = Math.abs(m - cxOf(p.u)) + Math.abs(m - cxOf(p.v));
      if (!best || cost < best.cost - 0.01 || (Math.abs(cost - best.cost) <= 0.01 && m < (best.c.lo + best.c.hi) / 2)) best = { c, cost };
    }
    const c = best?.c ?? outerR;
    p.lane = laneOf(c.lo, c.hi); p.lane.plans.push(p);
  }

  /* anchors: spread the ends that share one side of a card, ordered by where they are heading, so lines never share a point */
  interface End { p: Plan; end: 'u' | 'v'; key: number }
  const groups = new Map<string, End[]>();
  const push = (n: MNode, s: Side, en: End) => { const k = `${n.id}|${s}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(en); };
  const laneC = (p: Plan) => (p.lane ? (p.lane.lo + p.lane.hi) / 2 : 0);
  for (const p of plans) {
    if (p.kind === 'sec') { push(p.u, 'l', { p, end: 'u', key: -cxOf(p.v) }); push(p.v, 't', { p, end: 'v', key: laneC(p) }); }
    else if (p.kind === 'link') { push(p.u, p.su, { p, end: 'u', key: 0 }); push(p.v, p.sv, { p, end: 'v', key: 0 }); }
    else {
      push(p.u, p.su, { p, end: 'u', key: p.lane ? laneC(p) : cxOf(p.v) });
      push(p.v, p.sv, { p, end: 'v', key: p.lane ? laneC(p) : cxOf(p.u) });
    }
  }
  for (const [k, list] of groups) {
    const [nid, side] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)];
    const n = byId.get(nid)!;
    list.sort(byKey((x) => x.key, (x) => x.p.e.id));
    const horiz = side === 'l' || side === 'r';
    const span = horiz ? n.h - n.head - 20 : n.w - 28;
    const step = list.length > 1 ? Math.min(horiz ? 20 : 22, span / (list.length - 1)) : 0;
    list.forEach((x, i) => { const a = (i - (list.length - 1) / 2) * step; const val = horiz ? a : cxOf(n) + a; if (x.end === 'u') x.p.au = val; else x.p.av = val; });
  }
  // lane positions: edges sharing a corridor get their own x
  const owner = (p: Plan) => (share && (p.e.kind === 'tag' || p.e.kind === 'sec') ? p.e.from : p.e.id);
  for (const l of [...lanes.values()].sort((a, b) => a.lo - b.lo)) {
    const slots = new Map<string, Plan[]>();
    for (const p of l.plans) (slots.get(owner(p)) ?? slots.set(owner(p), []).get(owner(p))!).push(p);
    const list = [...slots.entries()].map(([k, ps]) => ({ k, ps, a: Math.min(...ps.map((p) => p.au)) })).sort(byKey((x) => x.a, (x) => x.k));
    const step = Math.min(10, (l.hi - l.lo) / (list.length + 1));
    list.forEach((x, i) => { for (const p of x.ps) p.lx = (l.lo + l.hi) / 2 + (i - (list.length - 1) / 2) * step; });
  }

  /* horizontal runs inside the channels */
  for (const p of plans) {
    if (p.kind === 'link') continue;
    if (p.kind === 'sec') { p.segs = [{ ch: p.cv, lo: Math.min(p.lx, p.av), hi: Math.max(p.lx, p.av), legs: [{ x: p.lx, side: 'top' }, { x: p.av, side: 'bot' }], level: 0 }]; continue; }
    const mk = (ch: number, a: Leg, b: Leg): Seg => ({ ch, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), legs: [a, b], level: 0 });
    if (p.dir === 0) p.segs = [mk(p.cu, { x: p.au, side: 'bot' }, { x: p.av, side: 'bot' })];
    else if (!p.lane) p.segs = p.dir === 1 ? [mk(p.cu, { x: p.au, side: 'top' }, { x: p.av, side: 'bot' })] : [mk(p.cu, { x: p.au, side: 'bot' }, { x: p.av, side: 'top' })];
    else if (p.dir === 1) p.segs = [mk(p.cu, { x: p.au, side: 'top' }, { x: p.lx, side: 'bot' }), mk(p.cv, { x: p.lx, side: 'top' }, { x: p.av, side: 'bot' })];
    else p.segs = [mk(p.cu, { x: p.au, side: 'bot' }, { x: p.lx, side: 'top' }), mk(p.cv, { x: p.lx, side: 'bot' }, { x: p.av, side: 'top' })];
  }
  const tracks: number[] = Array(nch).fill(0);
  const OV = 9; // segments closer than this horizontally never share a track
  for (let c = 0; c < nch; c++) {
    const all: Array<{ s: Seg; id: string; members: Seg[] }> = [];
    if (share) {
      const g = new Map<string, { s: Seg; id: string; members: Seg[] }>();
      for (const p of plans) for (const s of p.segs) if (s.ch === c) {
        const k = owner(p); const cur = g.get(k);
        if (!cur) g.set(k, { s: { ch: c, lo: s.lo, hi: s.hi, legs: [...s.legs], level: 0 }, id: k, members: [s] });
        else { cur.s.lo = Math.min(cur.s.lo, s.lo); cur.s.hi = Math.max(cur.s.hi, s.hi); cur.s.legs.push(...s.legs); cur.members.push(s); }
      }
      all.push(...g.values());
    } else for (const p of plans) for (const s of p.segs) if (s.ch === c) all.push({ s, id: p.e.id, members: [s] });
    if (!all.length) continue;
    const overlap = (a: Seg, b: Seg) => a.lo - OV < b.hi && b.lo - OV < a.hi;
    const inside = (x: number, s: Seg) => x > s.lo + 1 && x < s.hi - 1;
    // cost of putting a above b: crossings between a's lower leg and b's horizontal run, and b's upper leg and a's run
    const above = (a: Seg, b: Seg) => b.legs.filter((l) => l.side === 'top' && inside(l.x, a)).length + a.legs.filter((l) => l.side === 'bot' && inside(l.x, b)).length;
    all.sort((a, b) => (b.s.hi - b.s.lo) - (a.s.hi - a.s.lo) || (a.id < b.id ? -1 : 1));
    const order: typeof all = [];
    for (const it of all) {
      let bestPos = order.length, bestCost = Infinity;
      for (let pos = order.length; pos >= 0; pos--) {
        let cost = 0;
        for (let i = 0; i < order.length; i++) { const o = order[i]; if (!overlap(o.s, it.s)) continue; cost += i < pos ? above(o.s, it.s) : above(it.s, o.s); }
        if (cost < bestCost) { bestCost = cost; bestPos = pos; }
      }
      order.splice(bestPos, 0, it);
    }
    let max = 0;
    order.forEach((it, i) => { let lv = 0; for (let j = 0; j < i; j++) if (overlap(order[j].s, it.s)) lv = Math.max(lv, order[j].s.level + 1); it.s.level = lv; for (const m of it.members) m.level = lv; max = Math.max(max, lv); });
    tracks[c] = max + 1;
  }

  const build = (chY: number[], chH: number[]): Map<string, Route> => {
    const ty = (s: Seg) => chY[s.ch] + (chH[s.ch] - (tracks[s.ch] - 1) * GRID.STEP) / 2 + s.level * GRID.STEP;
    const edgeY = (n: MNode, s: Side) => (s === 'b' ? n.y + n.h : n.y);
    const out = new Map<string, Route>();
    for (const p of plans) {
      let pts: Pt[];
      if (p.kind === 'link') pts = [{ x: cxOf(p.u), y: edgeY(p.u, p.su) }, { x: cxOf(p.v), y: edgeY(p.v, p.sv) }];
      else if (p.kind === 'sec') { const y0 = cyOf(p.u) + p.au, t = ty(p.segs[0]); pts = [{ x: p.u.x, y: y0 }, { x: p.lx, y: y0 }, { x: p.lx, y: t }, { x: p.av, y: t }, { x: p.av, y: edgeY(p.v, p.sv) }]; }
      else if (!p.lane) { const t = ty(p.segs[0]); pts = [{ x: p.au, y: edgeY(p.u, p.su) }, { x: p.au, y: t }, { x: p.av, y: t }, { x: p.av, y: edgeY(p.v, p.sv) }]; }
      else { const t1 = ty(p.segs[0]), t2 = ty(p.segs[1]); pts = [{ x: p.au, y: edgeY(p.u, p.su) }, { x: p.au, y: t1 }, { x: p.lx, y: t1 }, { x: p.lx, y: t2 }, { x: p.av, y: t2 }, { x: p.av, y: edgeY(p.v, p.sv) }]; }
      out.set(p.e.id, decorate(p.e, pts, p.su === 'l' ? 'l' : p.su, p.sv));
    }
    return out;
  };
  return { tracks, build };
}

/* ------------------------------------------------------------------------------------------ live routing (dragged cards) */

interface Fb { e: MEdge; u: MNode; v: MNode; su: Side; sv: Side; au: number; av: number }

function fallbackRoutes(model: Model, list: MEdge[]): Map<string, Route> {
  const { byId } = model;
  const out = new Map<string, Route>();
  const items: Fb[] = [];
  for (const e of list) {
    const u = byId.get(e.from)!, v = byId.get(e.to)!;
    const GAP = 26;
    let su: Side, sv: Side;
    if (v.y - (u.y + u.h) >= GAP) { su = 'b'; sv = 't'; }
    else if (u.y - (v.y + v.h) >= GAP) { su = 't'; sv = 'b'; }
    else if (v.x - (u.x + u.w) >= GAP) { su = 'r'; sv = 'l'; }
    else if (u.x - (v.x + v.w) >= GAP) { su = 'l'; sv = 'r'; }
    else { su = 't'; sv = 't'; }
    items.push({ e, u, v, su, sv, au: 0, av: 0 });
  }
  const groups = new Map<string, Array<{ it: Fb; end: 'u' | 'v'; key: number }>>();
  for (const it of items) {
    for (const end of ['u', 'v'] as const) {
      const n = end === 'u' ? it.u : it.v, o = end === 'u' ? it.v : it.u, s = end === 'u' ? it.su : it.sv;
      const k = `${n.id}|${s}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push({ it, end, key: s === 'l' || s === 'r' ? cyOf(o) : cxOf(o) });
    }
  }
  for (const [k, list] of groups) {
    const nid = k.slice(0, k.lastIndexOf('|')), s = k.slice(k.lastIndexOf('|') + 1);
    const n = byId.get(nid)!; const horiz = s === 'l' || s === 'r';
    list.sort(byKey((x) => x.key, (x) => x.it.e.id));
    const span = horiz ? n.h - n.head - 20 : n.w - 28;
    const step = list.length > 1 ? Math.min(22, span / (list.length - 1)) : 0;
    list.forEach((x, i) => { const a = (i - (list.length - 1) / 2) * step; const val = horiz ? cyOf(n) + a : cxOf(n) + a; if (x.end === 'u') x.it.au = val; else x.it.av = val; });
  }
  for (const it of items) {
    const { u, v, su, sv, au, av } = it;
    let pts: Pt[];
    if (su === 'b' || su === 't') {
      if (su === sv) { const y = Math.min(u.y, v.y) - 30; pts = [{ x: au, y: u.y }, { x: au, y }, { x: av, y }, { x: av, y: v.y }]; }
      else {
        const y0 = su === 'b' ? u.y + u.h : u.y, y1 = sv === 't' ? v.y : v.y + v.h, m = (y0 + y1) / 2;
        pts = [{ x: au, y: y0 }, { x: au, y: m }, { x: av, y: m }, { x: av, y: y1 }];
      }
    } else {
      const x0 = su === 'r' ? u.x + u.w : u.x, x1 = sv === 'l' ? v.x : v.x + v.w, m = (x0 + x1) / 2;
      pts = [{ x: x0, y: au }, { x: m, y: au }, { x: m, y: av }, { x: x1, y: av }];
    }
    out.set(it.e.id, decorate(it.e, pts, su, sv));
  }
  return out;
}

const isHome = (n: MNode) => Math.abs(n.x - n.hx) < 0.5 && Math.abs(n.y - n.hy) < 0.5;

/** Route every relationship. Edges whose two tables sit on the tidy grid reuse the channel routes; the rest follow their card live. */
export function routeEdges(model: Model): Map<string, Route> {
  const { edges, byId } = model;
  const home = model.home;
  const out = new Map<string, Route>();
  const live: MEdge[] = [];
  for (const e of edges) {
    const r = home?.get(e.id);
    if (r && isHome(byId.get(e.from)!) && isHome(byId.get(e.to)!)) out.set(e.id, r); else live.push(e);
  }
  if (live.length) for (const [id, r] of fallbackRoutes(model, live)) out.set(id, r);
  return out;
}
