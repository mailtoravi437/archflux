/**
 * R1-E03-T02 behaviour tests at the reducer level (the same ops the store's applyOp runs, so one
 * applyOp = one undo step). The pointer wiring in CanvasScreen is listed in the epic changelog.
 */
import { describe, it, expect } from 'vitest';
import { box, bnd, doc } from './fixtures/containment';
import { containerAt } from '../lib/containment';
import { reparent, moveWithChildren, deleteBoundary } from '../state/ops/containment';

describe('containment on the canvas (R1-E03-T02)', () => {
  it('dropping a node inside a VPC sets parentId', () => {
    const s = doc([bnd('vpc', 0, 0, 400, 400), box('n', 600, 600, 100, 50)]);
    const drop = { x: 150, y: 150 };
    const target = containerAt(s.nodes, drop.x, drop.y, new Set(['n']), 'pg-1');
    const moved = { ...s, nodes: s.nodes.map((n) => (n.id === 'n' ? { ...n, x: 100, y: 100 } : n)) };
    const out = reparent(moved, ['n'], target?.id ?? null);
    expect(out.nodes.find((n) => n.id === 'n')?.parentId).toBe('vpc');
    const outside = containerAt(out.nodes, 900, 900, new Set(['n']), 'pg-1');
    expect(reparent(out, ['n'], outside?.id ?? null).nodes.find((n) => n.id === 'n')?.parentId).toBeNull();
  });

  it('moving the VPC moves its children; one undo restores all', () => {
    const s = doc([bnd('vpc', 0, 0, 400, 400), box('a', 20, 40, 50, 50, { parentId: 'vpc' }), box('b', 200, 200, 50, 50, { parentId: 'vpc' }), box('o', 900, 900, 50, 50)]);
    const out = moveWithChildren(s, 'vpc', 30, -10);
    const pos = (st: typeof s, id: string) => st.nodes.filter((n) => n.id === id).map((n) => [n.x, n.y])[0];
    expect(pos(out, 'vpc')).toEqual([30, -10]);
    expect(pos(out, 'a')).toEqual([50, 30]);
    expect(pos(out, 'b')).toEqual([230, 190]);
    expect(pos(out, 'o')).toEqual([900, 900]);
    // one op = one history entry: the previous state object is the whole undo target
    expect(pos(s, 'a')).toEqual([20, 40]);
    expect(moveWithChildren(s, 'vpc', 0, 0)).toBe(s);
  });

  it('child overflow grows the parent', () => {
    const s = doc([bnd('vpc', 0, 0, 200, 200), box('a', 50, 50, 50, 50, { parentId: 'vpc' })]);
    const moved = { ...s, nodes: s.nodes.map((n) => (n.id === 'a' ? { ...n, x: 300 } : n)) };
    const out = moveWithChildren(moved, 'a', 0, 0.5);
    const vpc = out.nodes[0];
    expect(vpc.x + vpc.w).toBe(350 + 24);
  });

  it('delete boundary only re-parents children', () => {
    const s = doc([bnd('cloud', 0, 0, 800, 800, { boundaryKind: 'cloud' }), bnd('vpc', 50, 50, 400, 400, { parentId: 'cloud' }), box('a', 60, 90, 50, 50, { parentId: 'vpc' })]);
    s.edges = [{ id: 'e', from: 'a', to: 'vpc', label: '', color: '#000' }];
    const out = deleteBoundary(s, 'vpc', 'only');
    expect(out.nodes.map((n) => n.id)).toEqual(['cloud', 'a']);
    expect(out.nodes.find((n) => n.id === 'a')?.parentId).toBe('cloud');
    expect(out.edges).toEqual([]);
    const all = deleteBoundary(s, 'vpc', 'with');
    expect(all.nodes.map((n) => n.id)).toEqual(['cloud']);
    const top = deleteBoundary(doc([bnd('v', 0, 0, 10, 10), box('a', 1, 1, 2, 2, { parentId: 'v' })]), 'v', 'only');
    expect(top.nodes[0].parentId).toBeNull();
  });
});
