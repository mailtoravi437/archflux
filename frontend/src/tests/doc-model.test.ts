import { describe, expect, it } from 'vitest';
import { normalizeDoc, defaultLayer, defaultPage, newId, DOC_SCHEMA_VERSION } from '../lib/docModel';
import type { ArchEdge, ArchNode, DiagramDoc } from '../types';
import { sampleEdges, sampleNodes } from './fixtures/sampleDiagram';

function node(over: Partial<ArchNode> & { id: string }): ArchNode {
  return { type: 'service', label: over.id, tag: '', health: '', x: 0, y: 0, w: 100, h: 60, stroke: '#000', ...over };
}

function edge(over: Partial<ArchEdge> & { id: string }): ArchEdge {
  return { from: 'a', to: 'b', label: '', color: '#000', ...over };
}

/** Hand-written v1 doc: one fixture per legacy row in DATA_MODEL_R1 §2.1 / §2.3. */
function v1Doc(): Record<string, unknown> {
  return {
    id: 'doc-v1',
    title: 'legacy.arch',
    createdAt: 1,
    updatedAt: 2,
    nodes: [
      node({ id: 'svc', type: 'service', tag: 'Go 1.22' }),
      node({ id: 'gw', type: 'gateway' }),
      node({ id: 'db', type: 'db' }),
      node({ id: 'cyl', type: 'other', shape: 'cylinder' }),
      node({ id: 'st', type: 'stream' }),
      node({ id: 'nt', type: 'note' }),
      node({ id: 'logo', type: 'gateway', shape: 'logo' }),
      node({ id: 'weird', type: 'mystery' }),
    ],
    edges: [
      edge({ id: 'plain', from: 'svc', to: 'gw' }),
      edge({ id: 'dash', from: 'svc', to: 'db', dashed: true }),
      edge({ id: 'dashStyle', from: 'svc', to: 'db', lineStyle: 'dashed' }),
      edge({ id: 'dot', from: 'db', to: 'cyl', lineStyle: 'dotted' }),
      edge({ id: 'both', from: 'gw', to: 'st', arrow: 'both' }),
    ],
    strokes: [{ id: 's1', pts: [{ x: 0, y: 0 }], color: '#000', width: 2 }],
  };
}

function nodeById(doc: DiagramDoc | null, id: string): ArchNode {
  const n = doc?.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`missing node ${id}`);
  return n;
}

function edgeById(doc: DiagramDoc | null, id: string): ArchEdge {
  const e = doc?.edges.find((x) => x.id === id);
  if (!e) throw new Error(`missing edge ${id}`);
  return e;
}

describe('docModel.normalizeDoc', () => {
  it('fills default page and layer for a v1 doc', () => {
    const doc = normalizeDoc(v1Doc());
    expect(doc).not.toBeNull();
    expect(doc?.pages).toEqual([{ id: 'pg-1', name: 'Page 1', order: 0 }]);
    expect(doc?.layers).toEqual([{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }]);
    expect(doc?.schemaVersion).toBe(DOC_SCHEMA_VERSION);
    expect(doc?.texts).toEqual([]);
    for (const n of doc?.nodes ?? []) {
      expect(n.pageId).toBe('pg-1');
      expect(n.layerId).toBe('ly-default');
    }
    expect(doc?.strokes?.[0]).toMatchObject({ pageId: 'pg-1', layerId: 'ly-default' });
    expect(defaultPage()).toEqual(doc?.pages?.[0]);
    expect(defaultLayer()).toEqual(doc?.layers?.[0]);
  });

  it('maps legacy db/cylinder to kind database, style shape', () => {
    const doc = normalizeDoc(v1Doc());
    expect(nodeById(doc, 'db')).toMatchObject({ kind: 'database', displayStyle: 'shape' });
    expect(nodeById(doc, 'cyl')).toMatchObject({ kind: 'database', displayStyle: 'shape' });
    expect(nodeById(doc, 'svc')).toMatchObject({ kind: 'service', displayStyle: 'card' });
    expect(nodeById(doc, 'gw')).toMatchObject({ kind: 'gateway', displayStyle: 'card' });
    expect(nodeById(doc, 'st')).toMatchObject({ kind: 'stream', displayStyle: 'shape' });
    expect(nodeById(doc, 'nt')).toMatchObject({ kind: 'note', displayStyle: 'card' });
    expect(nodeById(doc, 'weird')).toMatchObject({ kind: 'service', displayStyle: 'card' });
    // `shape` is kept: the current renderer still reads it.
    expect(nodeById(doc, 'cyl').shape).toBe('cylinder');
  });

  it('maps legacy logo shape to display style icon', () => {
    const doc = normalizeDoc(v1Doc());
    expect(nodeById(doc, 'logo')).toMatchObject({ kind: 'gateway', displayStyle: 'icon', shape: 'logo' });
  });

  it('maps dashed edge to relKind async and dotted to replication', () => {
    const doc = normalizeDoc(v1Doc());
    expect(edgeById(doc, 'dash').relKind).toBe('async');
    expect(edgeById(doc, 'dashStyle').relKind).toBe('async');
    expect(edgeById(doc, 'dot').relKind).toBe('replication');
    expect(edgeById(doc, 'both').relKind).toBe('bidirectional');
    expect(edgeById(doc, 'plain').relKind).toBe('sync');
    // lineStyle is kept for old clients.
    expect(edgeById(doc, 'dot').lineStyle).toBe('dotted');
  });

  it('copies tag to technology only when technology is missing', () => {
    const doc = normalizeDoc({
      ...v1Doc(),
      nodes: [node({ id: 'a', tag: 'Go 1.22' }), node({ id: 'b', tag: 'Old tag', technology: 'Rust' })],
      edges: [],
    });
    expect(nodeById(doc, 'a')).toMatchObject({ tag: 'Go 1.22', technology: 'Go 1.22' });
    expect(nodeById(doc, 'b')).toMatchObject({ tag: 'Old tag', technology: 'Rust' });
  });

  it('breaks a parentId cycle', () => {
    const doc = normalizeDoc({
      ...v1Doc(),
      nodes: [
        node({ id: 'a', kind: 'boundary', parentId: 'b' }),
        node({ id: 'b', kind: 'boundary', parentId: 'c' }),
        node({ id: 'c', kind: 'boundary', parentId: 'a' }),
        node({ id: 'self', kind: 'boundary', parentId: 'self' }),
      ],
      edges: [],
    });
    const nodes = doc?.nodes ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      const seen = new Set<string>();
      let cur: ArchNode | undefined = n;
      while (cur && typeof cur.parentId === 'string') {
        expect(seen.has(cur.id)).toBe(false);
        seen.add(cur.id);
        cur = byId.get(cur.parentId);
      }
    }
    expect(nodes.filter((n) => typeof n.parentId === 'string')).toHaveLength(2);
    expect(byId.get('self')?.parentId).toBeUndefined();
  });

  it('drops parentId pointing to a node on another page', () => {
    const doc = normalizeDoc({
      ...v1Doc(),
      pages: [
        { id: 'pg-a', name: 'A', order: 0 },
        { id: 'pg-b', name: 'B', order: 1 },
      ],
      nodes: [
        node({ id: 'box', kind: 'boundary', pageId: 'pg-b' }),
        node({ id: 'boxA', kind: 'boundary', pageId: 'pg-a' }),
        node({ id: 'child', pageId: 'pg-a', parentId: 'box' }),
        node({ id: 'ok', pageId: 'pg-a', parentId: 'boxA' }),
        node({ id: 'orphan', parentId: 'ghost' }),
      ],
      edges: [],
    });
    expect(nodeById(doc, 'child').parentId).toBeUndefined();
    expect(nodeById(doc, 'ok').parentId).toBe('boxA');
    expect(nodeById(doc, 'orphan').parentId).toBeUndefined();
    expect(nodeById(doc, 'orphan').pageId).toBe('pg-a');
  });

  it('is idempotent', () => {
    const sample = { id: 'doc-sample', title: 'sample.arch', nodes: sampleNodes, edges: sampleEdges, strokes: [], createdAt: 1, updatedAt: 2 };
    for (const raw of [sample, v1Doc()]) {
      const once = normalizeDoc(raw);
      expect(normalizeDoc(once)).toEqual(once);
    }
    // Inputs are not mutated.
    expect(sampleNodes[0].kind).toBeUndefined();
  });

  it('returns null for non-object input', () => {
    for (const raw of [null, undefined, 42, 'doc', true, [1, 2]]) {
      expect(normalizeDoc(raw)).toBeNull();
    }
    expect(newId('pg')).toMatch(/^pg-[0-9a-z]+$/);
  });
});
