import { describe, it, expect } from 'vitest';
import type { ArchNode } from '../types';
import type { DocState } from '../state/ops/types';
import { setDisplayStyle, boxForStyle } from '../state/ops/displayStyle';

function node(id: string, extra: Partial<ArchNode> = {}): ArchNode {
  return {
    id, type: 'service', label: `Label ${id}`, tag: 'ECS', health: 'ok', x: 10, y: 20, w: 200, h: 80, stroke: '#2563EB',
    kind: 'service', displayStyle: 'card', size: 'M', technology: 'ECS', iconRef: { provider: 'aws', id: 'ecs' },
    properties: { owner: 'Payments' }, pageId: 'pg-1', layerId: 'ly-default', ...extra,
  };
}
function doc(nodes: ArchNode[], lockedLayer = false): DocState {
  return {
    nodes, edges: [{ id: 'e1', from: nodes[0].id, to: nodes[1]?.id ?? null, label: '', color: '#000' }], strokes: [], texts: [],
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: lockedLayer }],
  };
}

describe('setDisplayStyle op (R1-E02-T05)', () => {
  it('changes only the style and the box; keeps text, icon, properties and edges', () => {
    const s = doc([node('a'), node('b')]);
    const out = setDisplayStyle(s, ['a'], 'shape');
    const a = out.nodes[0];
    expect(a.displayStyle).toBe('shape');
    expect({ ...a, displayStyle: 'card', w: 200, h: 80 }).toEqual(s.nodes[0]);
    expect(out.nodes[1]).toBe(s.nodes[1]);
    expect(out.edges).toBe(s.edges);
  });

  it('resets w/h to the size box for the new style', () => {
    const s = doc([node('a', { w: 333, h: 111, size: 'L' }), node('b')]);
    expect(boxForStyle({ size: 'L' }, 'card')).toEqual({ w: 240, h: 120 });
    expect(setDisplayStyle(s, ['a'], 'card').nodes[0]).toMatchObject({ w: 240, h: 120 });
    // Icon style: the box is the icon tile (S 48, M 64, L 96), so connectors meet the tile.
    expect(setDisplayStyle(s, ['a'], 'icon').nodes[0]).toMatchObject({ displayStyle: 'icon', w: 96, h: 96 });
    expect(setDisplayStyle(doc([node('a', { size: undefined }), node('b')]), ['a'], 'icon').nodes[0]).toMatchObject({ w: 64, h: 64 });
  });

  it('keeps w/h of a custom-sized node', () => {
    const s = doc([node('a', { w: 333, h: 111, customSize: true }), node('b')]);
    expect(setDisplayStyle(s, ['a'], 'shape').nodes[0]).toMatchObject({ displayStyle: 'shape', w: 333, h: 111 });
  });

  it('returns the same state when nothing changes, and skips locked nodes and boundaries', () => {
    const s = doc([node('a'), node('b', { locked: true }), node('c', { kind: 'boundary' })]);
    expect(setDisplayStyle(s, ['a'], 'card')).toBe(s);
    expect(setDisplayStyle(s, [], 'icon')).toBe(s);
    expect(setDisplayStyle(s, ['b', 'c'], 'icon')).toBe(s);
    expect(setDisplayStyle(doc([node('a'), node('b')], true), ['a'], 'icon').nodes[0].displayStyle).toBe('card');
  });
});
