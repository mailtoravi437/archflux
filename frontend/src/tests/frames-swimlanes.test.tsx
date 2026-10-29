import { describe, it, expect } from 'vitest';
import { box, bnd, doc } from './fixtures/containment';
import { addLaneBelow, createBoundary, frameOutline } from '../state/ops/containmentLanes';
import { containerAt } from '../lib/containment';

describe('frames and swimlanes (R1-E03-T06)', () => {
  it('F + drag creates a frame boundary', () => {
    const s = createBoundary(doc([]), 'f1', 'frame', { x0: 300, y0: 200, x1: 100, y1: 50 }, 'pg-1');
    const f = s.nodes[0];
    expect([f.kind, f.boundaryKind, f.pageId]).toEqual(['boundary', 'frame', 'pg-1']);
    expect([f.x, f.y, f.w, f.h]).toEqual([100, 50, 200, 150]);
    expect(createBoundary(s, 'f2', 'frame', { x0: 0, y0: 0, x1: 10, y1: 10 }, 'pg-1')).toBe(s); // too small
    expect(createBoundary(s, 'f1', 'frame', { x0: 0, y0: 0, x1: 99, y1: 99 }, 'pg-1')).toBe(s); // duplicate id
  });

  it('frames do not block children from being hit-tested', () => {
    const s = createBoundary(doc([box('n', 150, 100, 50, 50)]), 'f1', 'frame', { x0: 100, y0: 50, x1: 300, y1: 200 }, 'pg-1');
    expect(containerAt(s.nodes, 160, 110, new Set(['n']), 'pg-1')?.id).toBe('f1');
    expect(s.nodes.find((n) => n.id === 'n')).toBeDefined();
  });

  it('add lane below aligns width and y', () => {
    const s = doc([bnd('l1', 40, 100, 600, 150, { boundaryKind: 'swimlane' })]);
    expect(addLaneBelow(s, 'missing', 'l2')).toBe(s);
    const ok = addLaneBelow(s, 'l1', 'l2');
    const l2 = ok.nodes[1];
    expect([l2.x, l2.y, l2.w, l2.h]).toEqual([40, 250, 600, 150]);
    expect(l2.boundaryKind).toBe('swimlane');
    expect(addLaneBelow(doc([bnd('v', 0, 0, 100, 100)]), 'v', 'x').nodes).toHaveLength(1);
  });

  it('a dragged lane touching a lane shares its edge', () => {
    const s = doc([bnd('l1', 40, 100, 600, 150, { boundaryKind: 'swimlane' })]);
    const out = createBoundary(s, 'l2', 'swimlane', { x0: 50, y0: 253, x1: 500, y1: 400 }, 'pg-1');
    const l2 = out.nodes[1];
    expect([l2.x, l2.y, l2.w]).toEqual([40, 250, 600]);
  });

  it('outline lists frames in reading order', () => {
    let s = createBoundary(doc([]), 'b', 'frame', { x0: 300, y0: 300, x1: 400, y1: 400 }, 'pg-1');
    s = createBoundary(s, 'a', 'frame', { x0: 0, y0: 0, x1: 100, y1: 100 }, 'pg-1');
    s = createBoundary(s, 'c', 'frame', { x0: 0, y0: 0, x1: 100, y1: 100 }, 'pg-2');
    expect(frameOutline(s.nodes, 'pg-1').map((n) => n.id)).toEqual(['a', 'b']);
  });
});
