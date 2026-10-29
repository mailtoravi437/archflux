import { describe, it, expect } from 'vitest';
import { layeredLayout, layerDepths } from '../lib/layout';
import type { ArchNode } from '../types';

function node(id: string): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x: 0, y: 0, w: 120, h: 60, stroke: '#000' };
}
const e = (from: string, to: string) => ({ from, to });

describe('layered layout on cyclic graphs (R1-BUG-03)', () => {
  it('2-node cycle terminates, places each node once, breaks the back edge', () => {
    const nodes = [node('a'), node('b')];
    const t0 = Date.now();
    const out = layeredLayout(nodes, [e('a', 'b'), e('b', 'a')], 'LR');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
    const d = layerDepths(nodes, [e('a', 'b'), e('b', 'a')]);
    expect([d.get('a'), d.get('b')]).toEqual([0, 1]);
    expect(new Set(out.map((n) => `${n.x},${n.y}`)).size).toBe(2);
  });

  it('3-node cycle is layered a, b, c in DFS order and is deterministic', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'a')];
    const d = layerDepths(nodes, edges);
    expect([d.get('a'), d.get('b'), d.get('c')]).toEqual([0, 1, 2]);
    expect(layeredLayout(nodes, edges, 'TB')).toEqual(layeredLayout(nodes, edges, 'TB'));
  });

  it('cycle behind a source, a self loop and a detached cycle all terminate', () => {
    const nodes = [node('s'), node('a'), node('b'), node('x'), node('y'), node('z')];
    const edges = [e('s', 'a'), e('a', 'b'), e('b', 'a'), e('b', 'b'), e('x', 'y'), e('y', 'x'), e('y', 'z'), e('z', 'y')];
    const d = layerDepths(nodes, edges);
    expect(d.size).toBe(nodes.length);
    expect([d.get('s'), d.get('a'), d.get('b')]).toEqual([0, 1, 2]);
    const out = layeredLayout(nodes, edges, 'LR');
    expect(new Set(out.map((n) => n.id)).size).toBe(nodes.length);
    expect(new Set(out.map((n) => `${n.x},${n.y}`)).size).toBe(nodes.length);
  });
});
