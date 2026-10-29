import { describe, it, expect } from 'vitest';
import { box, bnd, doc } from './fixtures/containment';
import { hiddenByCollapse, routeEdges, visibleNodes } from '../lib/containmentCollapse';
import { toggleCollapse } from '../state/ops/containmentCollapse';
import { hitsBoundaryChrome } from '../lib/containment';
import type { ArchEdge } from '../types';

const edge = (id: string, from: string, to: string | null): ArchEdge => ({ id, from, to, label: '', color: '#000' });

const base = () => {
  const s = doc([
    bnd('vpc', 0, 0, 400, 400),
    bnd('sub', 20, 40, 200, 200, { parentId: 'vpc', boundaryKind: 'subnet-private' }),
    box('a', 30, 80, 50, 50, { parentId: 'sub' }),
    box('b', 100, 80, 50, 50, { parentId: 'vpc' }),
    box('ext', 600, 100, 50, 50),
  ]);
  s.edges = [edge('e1', 'a', 'ext'), edge('e2', 'b', 'ext'), edge('e3', 'ext', 'a'), edge('e4', 'a', 'b'), edge('e5', 'ext', null)];
  return s;
};

describe('collapse boundaries (R1-E03-T03)', () => {
  it('collapsed hides descendants from render and hit test', () => {
    const s = toggleCollapse(base(), 'vpc');
    expect(s.nodes.find((n) => n.id === 'vpc')?.collapsed).toBe(true);
    expect([...hiddenByCollapse(s.nodes)].sort()).toEqual(['a', 'b', 'sub']);
    expect(visibleNodes(s.nodes).map((n) => n.id)).toEqual(['vpc', 'ext']);
    // the collapsed chip is hit anywhere on it; nested collapse hides through the chain
    expect(hitsBoundaryChrome(s.nodes[0], 5, 5)).toBe(true);
    const inner = toggleCollapse(base(), 'sub');
    expect(visibleNodes(inner.nodes).map((n) => n.id)).toEqual(['vpc', 'sub', 'b', 'ext']);
    expect(toggleCollapse(s, 'vpc').nodes[0].collapsed).toBe(false);
    expect(toggleCollapse(s, 'ext')).toBe(s);
  });

  it('edges reroute to chip with count', () => {
    const s = toggleCollapse(base(), 'vpc');
    const routed = routeEdges(s.nodes, s.edges);
    const toExt = routed.find((r) => r.edge.from === 'vpc' && r.edge.to === 'ext');
    expect(toExt?.count).toBe(2);
    expect(toExt?.sourceIds).toEqual(['e1', 'e2']);
    expect(routed.find((r) => r.edge.from === 'ext' && r.edge.to === 'vpc')?.count).toBe(1);
    expect(routed.some((r) => r.sourceIds.includes('e4'))).toBe(false); // internal to the chip
    expect(routed.find((r) => r.edge.id === 'e5')?.edge.to).toBeNull();
  });

  it('with nothing collapsed edges pass through unchanged', () => {
    const s = base();
    const routed = routeEdges(s.nodes, s.edges);
    expect(routed.map((r) => r.edge)).toEqual(s.edges);
    expect(routed.every((r) => r.count === 1)).toBe(true);
  });
});
