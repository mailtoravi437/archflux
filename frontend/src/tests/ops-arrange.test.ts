import { describe, it, expect } from 'vitest';
import type { ArchNode } from '../types';
import type { DocState } from '../state/ops/types';
import { align, descendantIds, distribute } from '../state/ops/arrange';

function node(id: string, x: number, y: number, extra: Partial<ArchNode> = {}): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x, y, w: 100, h: 50, stroke: '#000', pageId: 'pg-1', layerId: 'ly-default', ...extra };
}

function doc(nodes: ArchNode[], lockedLayer = false): DocState {
  return {
    nodes,
    edges: [],
    strokes: [],
    texts: [],
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }],
    layers: [
      { id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false },
      { id: 'ly-locked', name: 'Locked', order: 1, visible: true, locked: lockedLayer },
    ],
  };
}

const at = (s: DocState, id: string) => {
  const n = s.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`missing ${id}`);
  return n;
};

describe('arrange ops: align and distribute (R1-E04-T01)', () => {
  it('align left sets all x to min x', () => {
    const s = doc([node('a', 40, 0), node('b', 10, 100), node('c', 90, 200, { w: 30 })]);
    const out = align(s, ['a', 'b', 'c'], 'left');
    expect(out.nodes.map((n) => n.x)).toEqual([10, 10, 10]);
    expect(out.nodes.map((n) => n.y)).toEqual([0, 100, 200]);
  });

  it('align right and bottom use the max edge', () => {
    const s = doc([node('a', 0, 0), node('b', 50, 30, { w: 200, h: 100 })]);
    const r = align(s, ['a', 'b'], 'right');
    expect(at(r, 'a').x + at(r, 'a').w).toBe(250);
    expect(at(r, 'b').x).toBe(50);
    const b = align(s, ['a', 'b'], 'bottom');
    expect(at(b, 'a').y + at(b, 'a').h).toBe(130);
  });

  it('align middle centres on selection bounds', () => {
    // bounds y: 0..200 → centre 100
    const s = doc([node('a', 0, 0, { h: 40 }), node('b', 200, 150, { h: 50 })]);
    const out = align(s, ['a', 'b'], 'middle');
    expect(at(out, 'a').y + at(out, 'a').h / 2).toBe(100);
    expect(at(out, 'b').y + at(out, 'b').h / 2).toBe(100);
    expect(at(out, 'a').x).toBe(0);
    const c = align(s, ['a', 'b'], 'center');
    // bounds x: 0..300 → centre 150
    expect(at(c, 'a').x + 50).toBe(150);
    expect(at(c, 'b').x + 50).toBe(150);
  });

  it('align needs at least two nodes and is a no-op when already aligned', () => {
    const s = doc([node('a', 10, 0), node('b', 10, 100)]);
    expect(align(s, ['a'], 'left')).toBe(s);
    expect(align(s, ['a', 'b'], 'left')).toBe(s);
  });

  it('distribute h gives equal gaps', () => {
    const s = doc([node('a', 0, 0), node('c', 500, 0, { w: 60 }), node('b', 120, 40, { w: 80 })]);
    const out = distribute(s, ['a', 'b', 'c'], 'h');
    const a = at(out, 'a');
    const b = at(out, 'b');
    const c = at(out, 'c');
    expect(a.x).toBe(0);
    expect(c.x).toBe(500);
    const gap1 = b.x - (a.x + a.w);
    const gap2 = c.x - (b.x + b.w);
    expect(gap1).toBeCloseTo(gap2, 6);
    expect(gap1).toBeCloseTo((560 - 240) / 2, 6);
    expect(b.y).toBe(40);
  });

  it('distribute v orders by position and needs three nodes', () => {
    const s = doc([node('a', 0, 300), node('b', 0, 0), node('c', 0, 40)]);
    const out = distribute(s, ['a', 'b', 'c'], 'v');
    expect(at(out, 'b').y).toBe(0);
    expect(at(out, 'a').y).toBe(300);
    expect(at(out, 'c').y).toBe(150);
    expect(distribute(s, ['a', 'b'], 'v')).toBe(s);
  });

  it('locked nodes are not moved', () => {
    const s = doc(
      [
        node('a', 40, 0),
        node('b', 10, 100, { locked: true }),
        node('c', 90, 200),
        node('d', 0, 300, { layerId: 'ly-locked' }),
      ],
      true,
    );
    const out = align(s, ['a', 'b', 'c', 'd'], 'left');
    expect(at(out, 'b').x).toBe(10);
    expect(at(out, 'd').x).toBe(0);
    // bounds come from the unlocked nodes only (a, c → min x 40)
    expect(at(out, 'a').x).toBe(40);
    expect(at(out, 'c').x).toBe(40);
    // only one unlocked node left → nothing to align
    const s2 = doc([node('a', 40, 0), node('b', 10, 0, { locked: true })]);
    expect(align(s2, ['a', 'b'], 'left')).toBe(s2);
  });

  it('a boundary moves with its children', () => {
    const s = doc([
      node('box', 100, 100, { kind: 'boundary', w: 300, h: 200 }),
      node('kid', 120, 140, { parentId: 'box' }),
      node('grand', 130, 150, { parentId: 'kid' }),
      node('other', 20, 400),
    ]);
    expect(descendantIds(s, 'box').sort()).toEqual(['grand', 'kid']);
    const out = align(s, ['box', 'other'], 'left');
    expect(at(out, 'box').x).toBe(20);
    expect(at(out, 'kid').x).toBe(40);
    expect(at(out, 'grand').x).toBe(50);
    // a selected child is carried by its selected parent, not aligned twice
    const out2 = align(s, ['box', 'kid', 'other'], 'left');
    expect(at(out2, 'kid').x).toBe(40);
  });
});
