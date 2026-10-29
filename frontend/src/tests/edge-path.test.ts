/** R1-E04-T03: connector waypoints in the shared edge geometry. */
import { describe, it, expect } from 'vitest';
import { edgePath, edgePoints, hitEdgeSegment } from '../lib/canvasGeometry';

const from = { x: 0, y: 100, w: 200, h: 80 };
const to = { x: 600, y: 100, w: 200, h: 80 };
const base = { from: 'a', to: 'b' };

describe('edgePath', () => {
  it('path passes through waypoints in order', () => {
    const wps = [{ x: 300, y: 20 }, { x: 500, y: 300 }];
    const path = edgePath({ ...base, waypoints: wps }, from, to, { orthogonal: false, curve: 'straight' });
    expect(path).toHaveLength(4);
    expect(path[1]).toEqual(wps[0]);
    expect(path[2]).toEqual(wps[1]);
    // From-port faces the first waypoint (right side), to-port faces the last (left side of the target).
    expect(path[0]).toEqual({ x: 200, y: 140 });
    expect(path[3]).toEqual({ x: 600, y: 140 });
  });

  it('orthogonal adds elbows between waypoints', () => {
    const wps = [{ x: 300, y: 20 }, { x: 500, y: 300 }];
    const path = edgePath({ ...base, waypoints: wps }, from, to, { orthogonal: true, curve: 'orthogonal' });
    for (let i = 1; i < path.length; i++) {
      expect(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y).toBe(true);
    }
    expect(path).toContainEqual(wps[0]);
    expect(path).toContainEqual(wps[1]);
    expect(path.indexOf(wps[0])).toBeLessThan(path.findIndex((p) => p.x === 500 && p.y === 300));
    expect(path.length).toBeGreaterThan(4);
  });

  it('without waypoints keeps the automatic route', () => {
    const path = edgePath(base, from, to, { orthogonal: false, curve: 'straight' });
    expect(path).toEqual([{ x: 200, y: 140 }, { x: 600, y: 140 }]);
    const nodes = [{ id: 'a', ...from }, { id: 'b', ...to }];
    expect(edgePoints(base, nodes, true, 'orthogonal')).toHaveLength(4);
  });

  it('waypoints survive node moves: only the end segments change', () => {
    const wps = [{ x: 400, y: 20 }];
    const a = edgePath({ ...base, waypoints: wps }, from, to, { orthogonal: false, curve: 'straight' });
    const b = edgePath({ ...base, waypoints: wps }, { ...from, y: 150 }, to, { orthogonal: false, curve: 'straight' });
    expect(b[1]).toEqual(a[1]);
    expect(b[0]).not.toEqual(a[0]);
  });

  it('dangling edges end at targetCoords', () => {
    const path = edgePath({ from: 'a', targetCoords: { x: 50, y: 400 }, isDangling: true, waypoints: [{ x: 50, y: 300 }] }, from, null, { orthogonal: true, curve: 'orthogonal' });
    expect(path[path.length - 1]).toEqual({ x: 50, y: 400 });
  });
});

describe('hitEdgeSegment', () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  it('hitEdgeSegment finds segment index', () => {
    expect(hitEdgeSegment(path, 50, 3, 6)).toEqual({ index: 0, t: 0.5 });
    expect(hitEdgeSegment(path, 98, 75, 6)).toEqual({ index: 1, t: 0.75 });
  });
  it('returns null when nothing is within tolerance', () => {
    expect(hitEdgeSegment(path, 50, 40, 6)).toBeNull();
  });
});
