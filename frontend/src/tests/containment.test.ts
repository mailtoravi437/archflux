import { describe, it, expect } from 'vitest';
import type { ArchNode } from '../types';
import { box, bnd, doc } from './fixtures/containment';
import { ancestorsOf, containerAt, depthOf, descendantsOf, fitBoundary, hitsBoundaryChrome } from '../lib/containment';
import { reparent, growAncestors, fitToContents } from '../state/ops/containment';

const tree = () => [
  bnd('cloud', 0, 0, 1000, 800, { boundaryKind: 'cloud' }),
  bnd('vpc', 50, 50, 600, 500, { parentId: 'cloud' }),
  bnd('sub', 100, 100, 300, 300, { parentId: 'vpc', boundaryKind: 'subnet-private' }),
  box('svc', 120, 140, 100, 50, { parentId: 'sub' }),
  box('free', 700, 700, 100, 50),
];

describe('containment geometry (R1-E03-T02)', () => {
  it('descendantsOf, depthOf, ancestorsOf walk parentId', () => {
    const n = tree();
    expect(descendantsOf(n, 'cloud').sort()).toEqual(['sub', 'svc', 'vpc']);
    expect(descendantsOf(n, 'svc')).toEqual([]);
    expect(depthOf(n, 'svc')).toBe(3);
    expect(depthOf(n, 'cloud')).toBe(0);
    expect(ancestorsOf(n, 'svc')).toEqual(['sub', 'vpc', 'cloud']);
  });

  it('walks survive parentId cycles', () => {
    const n = [bnd('a', 0, 0, 10, 10, { parentId: 'b' }), bnd('b', 0, 0, 10, 10, { parentId: 'a' })];
    expect(descendantsOf(n, 'a')).toEqual(['b']);
    expect(depthOf(n, 'a')).toBe(1);
  });

  it('containerAt returns the deepest boundary, honours exclusions, page and collapsed', () => {
    const n = tree();
    expect(containerAt(n, 130, 150, new Set(), 'pg-1')?.id).toBe('sub');
    expect(containerAt(n, 130, 150, new Set(['sub']), 'pg-1')?.id).toBe('vpc');
    expect(containerAt(n, 900, 100, new Set(), 'pg-1')?.id).toBe('cloud');
    expect(containerAt(n, 2000, 2000, new Set(), 'pg-1')).toBeNull();
    expect(containerAt(n, 130, 150, new Set(), 'pg-2')).toBeNull();
    const collapsed = n.map((x) => (x.id === 'sub' ? { ...x, collapsed: true } : x));
    expect(containerAt(collapsed, 130, 150, new Set(), 'pg-1')?.id).toBe('vpc');
  });

  it('fitBoundary pads 24 and leaves a 28 label band', () => {
    const n = [bnd('b', 0, 0, 10, 10), box('c', 100, 100, 50, 40, { parentId: 'b' })];
    expect(fitBoundary(n, 'b')).toEqual({ x: 76, y: 72, w: 98, h: 92 });
    expect(fitBoundary([bnd('e', 5, 6, 7, 8)], 'e')).toEqual({ x: 5, y: 6, w: 7, h: 8 });
  });

  it('hit band: border and label only, not the empty interior', () => {
    const b = bnd('b', 0, 0, 200, 200);
    expect(hitsBoundaryChrome(b, 100, 100)).toBe(false);
    expect(hitsBoundaryChrome(b, 100, 5)).toBe(true);
    expect(hitsBoundaryChrome(b, 195, 100)).toBe(true);
    expect(hitsBoundaryChrome(b, 100, 20)).toBe(true);
    expect(hitsBoundaryChrome(b, 300, 100)).toBe(false);
  });
});

describe('reparent (R1-E03-T02)', () => {
  it('sets and clears parentId', () => {
    const s = doc(tree());
    const into = reparent(s, ['free'], 'vpc');
    expect(into.nodes.find((n) => n.id === 'free')?.parentId).toBe('vpc');
    const out = reparent(into, ['free'], null);
    expect(out.nodes.find((n) => n.id === 'free')?.parentId).toBeNull();
  });

  it('rejects cycles and non-boundary parents', () => {
    const s = doc(tree());
    expect(reparent(s, ['cloud'], 'sub')).toBe(s);
    expect(reparent(s, ['vpc'], 'vpc')).toBe(s);
    expect(reparent(s, ['free'], 'svc')).toBe(s);
  });

  it('rejects nesting deeper than 6', () => {
    const chain: ArchNode[] = [];
    for (let i = 0; i <= 5; i++) chain.push(bnd(`b${i}`, 0, 0, 100, 100, i ? { parentId: `b${i - 1}` } : {}));
    const s = doc([...chain, box('leaf', 10, 10, 20, 20)]);
    // b5 is at depth 5, so a leaf under it is depth 6: allowed
    expect(reparent(s, ['leaf'], 'b5')).not.toBe(s);
    const deeper = doc([...chain, bnd('b6', 0, 0, 100, 100, { parentId: 'b5' }), box('leaf', 10, 10, 20, 20)]);
    expect(reparent(deeper, ['leaf'], 'b6')).toBe(deeper);
  });

  it('rejects a parent on another page and is a no-op without change', () => {
    const s = doc([bnd('b', 0, 0, 100, 100, { pageId: 'pg-2' }), box('n', 10, 10, 20, 20)]);
    expect(reparent(s, ['n'], 'b')).toBe(s);
    const t = doc(tree());
    expect(reparent(t, ['svc'], 'sub')).toBe(t);
  });

  it('skips locked nodes', () => {
    const s = doc([bnd('b', 0, 0, 100, 100), box('n', 10, 10, 20, 20, { locked: true })]);
    expect(reparent(s, ['n'], 'b')).toBe(s);
  });
});

describe('auto-fit (R1-E03-T02)', () => {
  it('growAncestors grows but never shrinks', () => {
    const s = doc([bnd('b', 0, 0, 500, 500), box('c', 40, 40, 50, 50, { parentId: 'b' })]);
    expect(growAncestors(s, ['c'])).toBe(s);
    const out = growAncestors(doc([bnd('b', 0, 0, 100, 100), box('c', 90, 90, 50, 50, { parentId: 'b' })]), ['c']);
    const b = out.nodes[0];
    expect(b.x + b.w).toBe(140 + 24);
    expect(b.y + b.h).toBe(140 + 24);
  });

  it('fitToContents shrinks to the tight fit', () => {
    const s = doc([bnd('b', 0, 0, 500, 500), box('c', 100, 100, 50, 40, { parentId: 'b' })]);
    const b = fitToContents(s, 'b').nodes[0];
    expect({ x: b.x, y: b.y, w: b.w, h: b.h }).toEqual({ x: 76, y: 72, w: 98, h: 92 });
  });
});
