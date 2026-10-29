import { describe, it, expect } from 'vitest';
import type { ArchNode } from '../types';
import type { DocState } from '../state/ops/types';
import { align, isNodeLocked, matchSize, setLocked, zOrder } from '../state/ops/arrange';

function node(id: string, extra: Partial<ArchNode> = {}): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x: 0, y: 0, w: 100, h: 50, stroke: '#000', pageId: 'pg-1', layerId: 'ly-default', ...extra };
}

function doc(nodes: ArchNode[]): DocState {
  return {
    nodes,
    edges: [],
    strokes: [],
    texts: [],
    pages: [
      { id: 'pg-1', name: 'Page 1', order: 0 },
      { id: 'pg-2', name: 'Page 2', order: 1 },
    ],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }],
  };
}

const z = (s: DocState, id: string) => s.nodes.find((n) => n.id === id)?.z;

describe('arrange ops: match size, z-order, lock (R1-E04-T02)', () => {
  it('front sets z above max on page', () => {
    const s = doc([node('a', { z: 5 }), node('b', { z: 2 }), node('c', { z: 9, pageId: 'pg-2' })]);
    const out = zOrder(s, ['b'], 'front');
    expect(z(out, 'b')).toBe(6);
    expect(z(out, 'a')).toBe(5);
    expect(z(out, 'c')).toBe(9); // other page untouched
    expect(zOrder(out, ['b'], 'front')).toBe(out); // already on top: no-op
  });

  it('back sets z below min; forward and backward step one place', () => {
    const s = doc([node('a', { z: 0 }), node('b', { z: 1 }), node('c', { z: 2 })]);
    expect(z(zOrder(s, ['c'], 'back'), 'c')).toBe(-1);
    const fwd = zOrder(s, ['a'], 'forward');
    expect([z(fwd, 'b'), z(fwd, 'a'), z(fwd, 'c')]).toEqual([0, 1, 2]);
    const bwd = zOrder(s, ['c'], 'backward');
    expect([z(bwd, 'a'), z(bwd, 'c'), z(bwd, 'b')]).toEqual([0, 1, 2]);
    expect(zOrder(s, ['c'], 'forward')).toBe(s);
  });

  it('matchSize copies the primary node size', () => {
    const s = doc([node('p', { w: 240, h: 120 }), node('q'), node('r', { locked: true })]);
    const both = matchSize(s, ['p', 'q', 'r'], 'both');
    const q = both.nodes.find((n) => n.id === 'q');
    expect([q?.w, q?.h, q?.customSize]).toEqual([240, 120, true]);
    const r = both.nodes.find((n) => n.id === 'r');
    expect([r?.w, r?.h]).toEqual([100, 50]);
    const wOnly = matchSize(s, ['p', 'q'], 'w').nodes.find((n) => n.id === 'q');
    expect([wOnly?.w, wOnly?.h]).toEqual([240, 50]);
  });

  it('setLocked toggles the flag', () => {
    const s = doc([node('a'), node('b')]);
    const locked = setLocked(s, ['a'], true);
    expect(locked.nodes[0].locked).toBe(true);
    expect(setLocked(locked, ['a'], true)).toBe(locked);
    const unlocked = setLocked(locked, ['a'], false);
    expect('locked' in unlocked.nodes[0]).toBe(false);
  });

  it('locked node ignores drag and delete', () => {
    // Op-level part: arrange ops never move, resize or restack a locked node.
    // Store delete is covered in find-replace.test.tsx's store block; pointer drag is R1-E04-T08.
    const s = doc([node('a', { x: 50, locked: true, z: 0 }), node('b', { x: 0, z: 1 }), node('c', { x: 10, z: 2 })]);
    expect(isNodeLocked(s, s.nodes[0])).toBe(true);
    expect(align(s, ['a', 'b', 'c'], 'right').nodes[0]).toBe(s.nodes[0]);
    expect(matchSize(s, ['b', 'a'], 'both')).toBe(s);
    expect(zOrder(s, ['a'], 'front')).toBe(s);
  });
});
