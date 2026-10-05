import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { layoutGraph } from './graph';

const load = (n: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'sample-data', n), 'utf8'));
const overlap = (a: any, b: any) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layoutGraph', () => {
  for (const f of ['sample-sales.model.json', 'sample-retention.model.json', 'sample-statements.model.json']) {
    it(`${f}: places every non-measure table once, without overlaps, with one edge per relationship`, () => {
      const doc = load(f);
      const g = layoutGraph(doc);
      const expected = doc.tables.filter((t: any) => t.role !== 'measure-table').map((t: any) => t.name).sort();
      expect(g.nodes.map((n) => n.id).sort()).toEqual(expected);
      for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) expect(overlap(g.nodes[i], g.nodes[j])).toBe(false);
      expect(g.edges.length).toBe(doc.relationships.length);
      for (const n of g.nodes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.y).toBeGreaterThanOrEqual(0); expect(n.x + n.w).toBeLessThanOrEqual(g.width + 0.01); }
    });
  }
  it('is deterministic and keeps flags and cardinality markers', () => {
    const doc = load('sample-sales.model.json');
    expect(JSON.stringify(layoutGraph(doc))).toBe(JSON.stringify(layoutGraph(doc)));
    const g = layoutGraph(doc);
    expect(g.edges.filter((e) => !e.active).length).toBe(1);
    expect(g.edges.every((e) => ['1', '*'].includes(e.fromCard) && ['1', '*'].includes(e.toCard))).toBe(true);
    expect(g.edges.find((e) => e.from === 'Fact_Sales' && e.to === 'Dim_Date')?.fromCard).toBe('*');
  });
  it('handles an empty model', () => {
    const g = layoutGraph({ tables: [], relationships: [] });
    expect(g.nodes).toEqual([]);
  });
  it('marks bi-directional filters', () => {
    const g = layoutGraph({ tables: [{ name: 'A', role: 'fact', columns: 1, measures: 0, hidden: false }, { name: 'B', role: 'dimension', columns: 1, measures: 0, hidden: false }], relationships: [{ from: 'A[k]', to: 'B[k]', cardinality: 'many-to-one', cross_filter: 'both', active: true }] });
    expect(g.edges[0].both).toBe(true);
  });
});
