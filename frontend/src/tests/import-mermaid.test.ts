// R1-E09-T02: Mermaid flowchart importer and the pure layered layout.
import { describe, expect, it } from 'vitest';
import { importMermaid } from '../lib/import/mermaid';
import { BOUNDARY_LABEL_BAND, BOUNDARY_PADDING } from '../lib/import/shared';
import type { ImportResult } from '../lib/import/types';
import { layeredLayout } from '../lib/layout';
import type { ArchNode } from '../types';

function node(r: ImportResult, id: string): ArchNode {
  const n = r.doc?.nodes.find((x) => x.id === `n-${id}`);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

const edgesOf = (r: ImportResult) => (r.doc?.edges ?? []).map((e) => `${e.from.slice(2)}>${(e.to ?? '').slice(2)}:${e.label}`);

describe('importMermaid', () => {
  it('parses node shapes to kinds', () => {
    const r = importMermaid(
      ['flowchart TD', '  A', '  B[Orders API]', '  C[(Orders DB)]', '  D((Round))', '  E>Remember this]', '  F{Edge GW}', '  G[/Jobs/]', '  H[[Sub routine]]', '  I["Quoted<br/>Node 20"]'].join('\n'),
      'shapes.mmd',
    );
    expect(r.ok).toBe(true);
    expect(r.format).toBe('mermaid');
    expect(r.doc?.title).toBe('shapes');
    const kinds = Object.fromEntries((r.doc?.nodes ?? []).map((n) => [n.id.slice(2), [n.kind, n.label]]));
    expect(kinds).toEqual({
      A: ['service', 'A'],
      B: ['service', 'Orders API'],
      C: ['database', 'Orders DB'],
      D: ['service', 'Round'],
      E: ['note', 'Remember this'],
      F: ['gateway', 'Edge GW'],
      G: ['queue', 'Jobs'],
      H: ['service', 'Sub routine'],
      I: ['service', 'Quoted'],
    });
    expect(node(r, 'I').technology).toBe('Node 20');
    expect(node(r, 'C').displayStyle).toBe('shape');
    expect(r.stats.nodes).toBe(9);
    expect(r.warnings).toEqual([]);
  });

  it('parses chained and & edges with labels', () => {
    const r = importMermaid(
      ['graph LR', 'A --> B --> C', 'A & B --> D', 'C -->|reads| E', 'D -- writes --> E', 'E --- F', 'F <--> G', 'G ==> H', 'X-->Y'].join('\n'),
      'chain.mmd',
    );
    expect(r.ok).toBe(true);
    expect(edgesOf(r)).toEqual([
      'A>B:', 'B>C:', 'A>D:', 'B>D:', 'C>E:reads', 'D>E:writes', 'E>F:', 'F>G:', 'G>H:', 'X>Y:',
    ]);
    const edges = r.doc?.edges ?? [];
    expect(edges[6].arrow).toBe('none');
    expect(edges[7].relKind).toBe('bidirectional');
    expect(edges[7].arrow).toBe('both');
    expect(edges[8].relKind).toBe('sync');
    expect(r.stats.edges).toBe(10);
  });

  it('dotted arrow is async', () => {
    const r = importMermaid('flowchart LR\n  A -.-> B\n  B -. emits .-> C\n  C --> D', 'dots.mmd');
    const [ab, bc, cd] = r.doc?.edges ?? [];
    expect(ab.relKind).toBe('async');
    expect(ab.dashed).toBe(true);
    expect(bc.relKind).toBe('async');
    expect(bc.label).toBe('emits');
    expect(cd.relKind).toBe('sync');
  });

  it('subgraph becomes boundary with children', () => {
    const r = importMermaid(
      [
        'flowchart TB',
        '  client --> api',
        '  subgraph platform [Platform]',
        '    api[API] --> svc[Service]',
        '    subgraph data [Data tier]',
        '      db[(Postgres)]',
        '    end',
        '  end',
        '  svc --> db',
      ].join('\n'),
      'sub.mmd',
    );
    expect(r.ok).toBe(true);
    expect(r.stats.boundaries).toBe(2);
    expect(r.stats.nodes).toBe(4);
    const platform = node(r, 'platform');
    const data = node(r, 'data');
    expect(platform.kind).toBe('boundary');
    expect(platform.boundaryKind).toBe('c4-system');
    expect(platform.label).toBe('Platform');
    expect(data.parentId).toBe(platform.id);
    expect(node(r, 'api').parentId).toBe(platform.id);
    expect(node(r, 'svc').parentId).toBe(platform.id);
    expect(node(r, 'db').parentId).toBe(data.id);
    expect(node(r, 'client').parentId).toBeUndefined();
    // Fitted: padding around the child, label band on top.
    const db = node(r, 'db');
    expect(data.x).toBe(db.x - BOUNDARY_PADDING);
    expect(data.y).toBe(db.y - BOUNDARY_PADDING - BOUNDARY_LABEL_BAND);
    expect(data.w).toBe(db.w + 2 * BOUNDARY_PADDING);
    expect(data.h).toBe(db.h + 2 * BOUNDARY_PADDING + BOUNDARY_LABEL_BAND);
    // The outer boundary contains everything inside it, nested boundary included.
    for (const k of [node(r, 'api'), node(r, 'svc'), data]) {
      expect(k.x).toBeGreaterThanOrEqual(platform.x);
      expect(k.y).toBeGreaterThanOrEqual(platform.y);
      expect(k.x + k.w).toBeLessThanOrEqual(platform.x + platform.w);
      expect(k.y + k.h).toBeLessThanOrEqual(platform.y + platform.h);
    }
  });

  it('LR layout increases x along edges', () => {
    const r = importMermaid('flowchart LR\n  A --> B\n  B --> C\n  A --> C', 'lr.mmd');
    const [a, b, c] = ['A', 'B', 'C'].map((id) => node(r, id));
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeGreaterThan(b.x);
    const td = importMermaid('flowchart TD\n  A --> B', 'td.mmd');
    expect(node(td, 'B').y).toBeGreaterThan(node(td, 'A').y);
    const rl = importMermaid('flowchart RL\n  A --> B', 'rl.mmd');
    expect(node(rl, 'B').x).toBeLessThan(node(rl, 'A').x);
  });

  it('unknown statement yields warning, not error', () => {
    const r = importMermaid(
      ['flowchart TD', '  %% a comment', '  A --> B', '  click A callback', '  ??? nonsense', '  classDef hot fill:#f00', '  class A hot', '  style B fill:#0f0'].join('\n'),
      'odd.mmd',
    );
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.stats.nodes).toBe(2);
    const codes = r.warnings.map((w) => w.code);
    expect(codes.filter((c) => c === 'styles_ignored')).toHaveLength(1);
    expect(codes).toContain('unsupported_statement');
    expect(r.warnings.find((w) => w.message.includes('???'))?.sourceRef).toBe('5');
  });

  it('non-flowchart input is an error result, never a throw', () => {
    const r = importMermaid('sequenceDiagram\n  A->>B: hi', 'seq.mmd');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/flowchart/);
    expect(importMermaid('', 'empty.mmd').ok).toBe(false);
  });
});

describe('layeredLayout', () => {
  const mk = (id: string): ArchNode => ({ id, type: 'service', label: id, tag: '', health: '', x: 0, y: 0, w: 150, h: 70, stroke: '#000' });

  it('LR with default spacing matches the store dag layout', () => {
    const out = layeredLayout([mk('a'), mk('b'), mk('c')], [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }], 'LR');
    expect(out.map((n) => [n.id, n.x, n.y])).toEqual([['a', 80, 110], ['b', 300, 110], ['c', 300, 240]]);
  });

  it('terminates on cycles and does not mutate its input', () => {
    const nodes = [mk('a'), mk('b')];
    const out = layeredLayout(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], 'TB');
    expect(out).toHaveLength(2);
    expect(nodes[0].x).toBe(0);
  });
});
