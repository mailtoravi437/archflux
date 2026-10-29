import { describe, expect, it } from 'vitest';
import { invertChange, semanticDiff } from '../lib/semanticDiff';
import type { DocState } from '../state/ops/types';
import type { ArchEdge, ArchNode } from '../types';

function node(over: Partial<ArchNode> & { id: string }): ArchNode {
  return { type: 'service', label: over.id, tag: '', health: '', x: 0, y: 0, w: 100, h: 60, stroke: '#000', ...over };
}

function edge(over: Partial<ArchEdge> & { id: string }): ArchEdge {
  return { from: 'a', to: 'b', label: '', color: '#000', ...over };
}

function doc(nodes: ArchNode[], edges: ArchEdge[] = []): DocState {
  return {
    nodes,
    edges,
    strokes: [],
    texts: [],
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }],
  };
}

describe('semanticDiff', () => {
  it('detects added/removed nodes by id', () => {
    const before = doc([node({ id: 'a', label: 'API' }), node({ id: 'b', label: 'DB' })], [edge({ id: 'e1', from: 'a', to: 'b' })]);
    // Order shuffled and positions unchanged: only ids matter.
    const after = doc([node({ id: 'c', label: 'Cache' }), node({ id: 'a', label: 'API' })], [edge({ id: 'e1', from: 'a', to: 'b' })]);
    const d = semanticDiff(before, after);
    const nodeChanges = d.changes.filter((c) => c.entity === 'node');
    expect(nodeChanges.map((c) => [c.id, c.kind])).toEqual([['c', 'added'], ['b', 'removed']]);
    // Edge kept in place but its endpoint was removed: reported as removed, not changed.
    expect(d.changes.find((c) => c.id === 'e1')?.kind).toBe('removed');
    expect(d.summary).toEqual({ added: 1, removed: 2, changed: 0, moved: 0 });
    expect(semanticDiff(before, before).changes).toEqual([]);
  });

  it('label change is changed with before/after', () => {
    const before = doc([node({ id: 'a', label: 'Orders' })]);
    const after = doc([node({ id: 'a', label: 'Order service', x: 40 })]);
    const [c] = semanticDiff(before, after).changes;
    expect(c.kind).toBe('changed');
    expect(c.label).toBe('Order service');
    expect(c.fields).toContainEqual({ field: 'label', before: 'Orders', after: 'Order service' });
  });

  it('position-only change is moved', () => {
    const before = doc([node({ id: 'a' })], [edge({ id: 'e', from: 'a', to: 'a' })]);
    const after = doc([node({ id: 'a', x: 10, y: 20, w: 120 })], [edge({ id: 'e', from: 'a', to: 'a', waypoints: [{ x: 1, y: 2 }] })]);
    const d = semanticDiff(before, after);
    expect(d.changes.map((c) => [c.entity, c.kind])).toEqual([['node', 'moved'], ['edge', 'moved']]);
    expect(d.changes[0].fields.map((f) => f.field)).toEqual(['w', 'x', 'y']);
    expect(d.summary.moved).toBe(2);
    expect(d.summary.changed).toBe(0);
  });

  it('property change reports properties.owner', () => {
    const before = doc([node({ id: 'a', properties: { owner: 'payments', tier: 1 } })]);
    const after = doc([node({ id: 'a', properties: { owner: 'checkout', tier: 1 } })]);
    const [c] = semanticDiff(before, after).changes;
    expect(c.kind).toBe('changed');
    expect(c.fields).toEqual([{ field: 'properties.owner', before: 'payments', after: 'checkout' }]);
  });

  it('invertChange of an added node removes it and its edges', () => {
    const before = doc([node({ id: 'a' })]);
    const after = doc([node({ id: 'a' }), node({ id: 'n' })], [edge({ id: 'e', from: 'a', to: 'n' })]);
    const added = semanticDiff(before, after).changes.find((c) => c.id === 'n' && c.kind === 'added');
    expect(added).toBeDefined();
    const reverted = invertChange(added!, after);
    expect(reverted.nodes.map((n) => n.id)).toEqual(['a']);
    expect(reverted.edges).toEqual([]);
    expect(after.nodes).toHaveLength(2); // input untouched
  });

  it('invertChange of a changed label restores old label without touching other edits', () => {
    const before = doc([node({ id: 'a', label: 'Orders' }), node({ id: 'b', label: 'DB' })]);
    const after = doc([node({ id: 'a', label: 'Order service' }), node({ id: 'b', label: 'DB' })]);
    const change = semanticDiff(before, after).changes.find((c) => c.id === 'a')!;
    // Later edits made after the compared version.
    const current = doc(
      [node({ id: 'a', label: 'Order service', x: 300, properties: { owner: 'checkout' } }), node({ id: 'b', label: 'Postgres' })],
    );
    const reverted = invertChange(change, current);
    const a = reverted.nodes.find((n) => n.id === 'a')!;
    expect(a.label).toBe('Orders');
    expect(a.x).toBe(300);
    expect(a.properties).toEqual({ owner: 'checkout' });
    expect(reverted.nodes.find((n) => n.id === 'b')?.label).toBe('Postgres');
  });

  it('re-parent is changed, style-only edit is moved', () => {
    const before = doc([node({ id: 'vpc', kind: 'boundary' }), node({ id: 'a' })], [edge({ id: 'e', from: 'a', to: 'vpc' })]);
    const after = doc(
      [node({ id: 'vpc', kind: 'boundary' }), node({ id: 'a', parentId: 'vpc' })],
      [edge({ id: 'e', from: 'a', to: 'vpc' })],
    );
    const reparent = semanticDiff(before, after).changes;
    expect(reparent).toEqual([
      { id: 'a', entity: 'node', kind: 'changed', label: 'a', fields: [{ field: 'parentId', before: undefined, after: 'vpc' }] },
    ]);

    const styled = doc(
      [node({ id: 'vpc', kind: 'boundary' }), node({ id: 'a', stroke: '#f00', fill: '#eee', strokeWidth: 3, displayStyle: 'icon', size: 'L', customSize: true })],
      [edge({ id: 'e', from: 'a', to: 'vpc' })],
    );
    const style = semanticDiff(before, styled);
    expect(style.changes.map((c) => [c.id, c.kind])).toEqual([['a', 'moved']]);
    expect(style.summary).toEqual({ added: 0, removed: 0, changed: 0, moved: 1 });
  });

  it('derived flags alone produce no change', () => {
    const before = doc([node({ id: 'a' }), node({ id: 'b' })], [edge({ id: 'e', from: 'a', to: 'b' })]);
    const after = doc(
      [node({ id: 'a', isOrphan: true }), node({ id: 'b' })],
      [edge({ id: 'e', from: 'a', to: 'b', isDangling: true, targetCoords: { x: 5, y: 5 } })],
    );
    expect(semanticDiff(before, after).changes).toEqual([]);
    const added = semanticDiff(doc([]), after).changes.find((c) => c.id === 'a')!;
    expect(added.fields.map((f) => f.field)).not.toContain('isOrphan');
  });

  it('invertChange of an added page removes its elements; of an added layer moves elements to ly-default', () => {
    const base = doc([node({ id: 'a' })]);
    const withPage: DocState = {
      ...base,
      pages: [...base.pages, { id: 'pg-2', name: 'Page 2', order: 1 }],
      nodes: [...base.nodes, node({ id: 'p', pageId: 'pg-2' })],
      edges: [edge({ id: 'e', from: 'a', to: 'p' })],
      texts: [{ id: 't', x: 0, y: 0, text: 'hi', fontSize: 12, color: '#000', pageId: 'pg-2' }],
    };
    const pageAdd = semanticDiff(base, withPage).changes.find((c) => c.entity === 'page')!;
    const noPage = invertChange(pageAdd, withPage);
    expect(noPage.pages.map((p) => p.id)).toEqual(['pg-1']);
    expect(noPage.nodes.map((n) => n.id)).toEqual(['a']);
    expect(noPage.edges).toEqual([]);
    expect(noPage.texts).toEqual([]);

    const withLayer: DocState = {
      ...base,
      layers: [...base.layers, { id: 'ly-2', name: 'Infra', order: 1, visible: true, locked: false }],
      nodes: [node({ id: 'a', layerId: 'ly-2' })],
    };
    const layerAdd = semanticDiff(base, withLayer).changes.find((c) => c.entity === 'layer')!;
    const noLayer = invertChange(layerAdd, withLayer);
    expect(noLayer.layers.map((l) => l.id)).toEqual(['ly-default']);
    expect(noLayer.nodes[0].layerId).toBe('ly-default');
  });
});
