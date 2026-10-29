import { describe, it, expect } from 'vitest';
import type { ArchNode, ArchEdge } from '../types';
import type { DocState } from '../state/ops/types';
import { addPage, deletePage, duplicatePage, moveToPage, renamePage, reorderPages } from '../state/ops/pages';
import { addLayer, deleteLayer, moveToLayer, updateLayer } from '../state/ops/layers';

function node(id: string, pageId: string, extra: Partial<ArchNode> = {}): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x: 0, y: 0, w: 100, h: 50, stroke: '#000', pageId, layerId: 'ly-default', ...extra };
}

function edge(id: string, from: string, to: string | null): ArchEdge {
  return { id, from, to, label: '', color: '#000' };
}

function base(): DocState {
  return {
    nodes: [node('a', 'pg-1'), node('b', 'pg-1', { parentId: 'a' }), node('c', 'pg-2', { linkPageId: 'pg-1' })],
    edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', null)],
    strokes: [{ id: 's1', pts: [{ x: 0, y: 0 }], color: '#000', width: 1, pageId: 'pg-1', layerId: 'ly-default' }],
    texts: [{ id: 't1', x: 0, y: 0, text: 'hi', fontSize: 12, color: '#000', pageId: 'pg-2', layerId: 'ly-default' }],
    pages: [
      { id: 'pg-1', name: 'Page 1', order: 0 },
      { id: 'pg-2', name: 'Page 2', order: 1 },
    ],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }],
  };
}

function seqIds() {
  let k = 0;
  return (prefix: 'n' | 'e' | 's' | 't') => `${prefix}-copy-${++k}`;
}

describe('page ops (R1-E00-T08)', () => {
  it('addPage appends a uniquely named page and leaves the input untouched', () => {
    const s = base();
    const frozen = JSON.stringify(s);
    const next = addPage(s, 'pg-3');
    expect(next.pages.map((p) => [p.id, p.name, p.order])).toEqual([
      ['pg-1', 'Page 1', 0],
      ['pg-2', 'Page 2', 1],
      ['pg-3', 'Page 3', 2],
    ]);
    expect(addPage(s, 'pg-4', '  Detail ').pages[2].name).toBe('Detail');
    expect(addPage(s, 'pg-1')).toBe(s);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(next.nodes).toBe(s.nodes);
  });

  it('renamePage trims and ignores empty names', () => {
    const s = base();
    expect(renamePage(s, 'pg-2', ' Detail ').pages[1].name).toBe('Detail');
    expect(renamePage(s, 'pg-2', '   ')).toBe(s);
    expect(renamePage(s, 'missing', 'X')).toBe(s);
  });

  it('deletePage removes page elements, touching edges and page links', () => {
    const s = base();
    const next = deletePage(s, 'pg-1');
    expect(next.pages).toEqual([{ id: 'pg-2', name: 'Page 2', order: 0 }]);
    expect(next.nodes.map((n) => n.id)).toEqual(['c']);
    expect(next.nodes[0].linkPageId).toBeUndefined();
    expect(next.edges).toEqual([]);
    expect(next.strokes).toEqual([]);
    expect(next.texts.map((t) => t.id)).toEqual(['t1']);
  });

  it('deletePage refuses the last page', () => {
    const one = deletePage(base(), 'pg-2');
    expect(one.pages).toHaveLength(1);
    expect(deletePage(one, 'pg-1')).toBe(one);
  });

  it('reorderPages renumbers order and keeps unlisted pages at the end', () => {
    const s = addPage(base(), 'pg-3');
    const next = reorderPages(s, ['pg-3', 'pg-1']);
    expect(next.pages.map((p) => [p.id, p.order])).toEqual([
      ['pg-3', 0],
      ['pg-1', 1],
      ['pg-2', 2],
    ]);
    expect(reorderPages(s, ['pg-1', 'pg-2', 'pg-3'])).toBe(s);
  });

  it('duplicatePage deep-copies elements with fresh ids and remaps edges and parentId', () => {
    const s = base();
    const next = duplicatePage(s, 'pg-1', 'pg-copy', seqIds());
    expect(next.pages.map((p) => [p.id, p.name, p.order])).toEqual([
      ['pg-1', 'Page 1', 0],
      ['pg-copy', 'Page 1 copy', 1],
      ['pg-2', 'Page 2', 2],
    ]);
    const copies = next.nodes.filter((n) => n.pageId === 'pg-copy');
    expect(copies.map((n) => n.id)).toEqual(['n-copy-1', 'n-copy-2']);
    expect(copies[1].parentId).toBe('n-copy-1');
    // Only edges with both ends on the page are copied (e2 crosses pages).
    const copiedEdges = next.edges.slice(s.edges.length);
    expect(copiedEdges.map((e) => [e.from, e.to])).toEqual([
      ['n-copy-1', 'n-copy-2'],
      ['n-copy-1', null],
    ]);
    expect(next.strokes.filter((x) => x.pageId === 'pg-copy')).toHaveLength(1);
    expect(next.texts).toBe(s.texts);
    // Deep copy: mutating a copy never reaches the source.
    copies[0].label = 'changed';
    expect(s.nodes[0].label).toBe('a');
    expect(duplicatePage(s, 'missing', 'pg-x', seqIds())).toBe(s);
  });
});

describe('layer ops (R1-E00-T08)', () => {
  it('addLayer and updateLayer', () => {
    const s = addLayer(base(), 'ly-1');
    expect(s.layers[1]).toEqual({ id: 'ly-1', name: 'Layer 2', order: 1, visible: true, locked: false });
    const next = updateLayer(s, 'ly-1', { name: 'Infra', locked: true });
    expect(next.layers[1]).toMatchObject({ name: 'Infra', locked: true, visible: true });
    expect(updateLayer(next, 'ly-1', { locked: true })).toBe(next);
  });

  it('deleteLayer moves elements to the default layer and refuses ly-default', () => {
    const withLayer = addLayer(base(), 'ly-1');
    const moved = moveToLayer(withLayer, ['a', 's1', 't1'], 'ly-1');
    expect(moved.nodes.find((n) => n.id === 'a')?.layerId).toBe('ly-1');
    expect(moved.strokes[0].layerId).toBe('ly-1');
    expect(moved.texts[0].layerId).toBe('ly-1');
    const next = deleteLayer(moved, 'ly-1');
    expect(next.layers.map((l) => l.id)).toEqual(['ly-default']);
    expect(next.nodes.every((n) => n.layerId === 'ly-default')).toBe(true);
    expect(next.strokes[0].layerId).toBe('ly-default');
    expect(deleteLayer(next, 'ly-default')).toBe(next);
  });

  it('moveToLayer ignores unknown layers', () => {
    const s = base();
    expect(moveToLayer(s, ['a'], 'ly-missing')).toBe(s);
  });

  it('moveToPage moves a node with its children and drops edges that would cross pages (R1-E04-T07)', () => {
    const s = base();
    const next = moveToPage(s, ['a'], 'pg-2');
    expect(next.nodes.filter((n) => n.pageId === 'pg-2').map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    // a and b moved together (kept); e2 b->c: both now on pg-2 (kept); the dangling e3 follows its source.
    expect(next.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
    const single = moveToPage(s, ['b'], 'pg-2');
    expect(single.edges.map((e) => e.id).sort()).toEqual(['e2', 'e3']); // e1 a->b would cross pages
    expect(single.nodes.find((n) => n.id === 'b')?.parentId).toBeUndefined();
    const toLinked = moveToPage(s, ['c'], 'pg-1');
    expect(toLinked.nodes.find((n) => n.id === 'c')?.linkPageId).toBeUndefined(); // linked to the page it now lives on
    expect(moveToPage(s, ['a'], 'pg-1')).toBe(s);
    expect(moveToPage(s, ['a'], 'nope')).toBe(s);
  });
});
