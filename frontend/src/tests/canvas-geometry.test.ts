import { describe, expect, it } from 'vitest';
import {
  clampNodeSize,
  hitResizeHandle,
  minimapTransform,
  miniToWorld,
  resizeFromCorner,
  resizeHandles,
  snapNode,
  worldToMini,
} from '../lib/canvasGeometry';

const box = { x: 100, y: 100, w: 170, h: 70 };

describe('resizeHandles', () => {
  // R1-E14-T02: the old E/S/SE grips are gone; resizing uses the four 8 px corner handles.
  it('places the four corner handles at a constant 8 screen px', () => {
    const hs = resizeHandles(box, 1);
    expect(hs.map((h) => h.id)).toEqual(['nw', 'ne', 'sw', 'se']);
    expect(hs.find((h) => h.id === 'nw')).toMatchObject({ x: 100, y: 100 });
    expect(hs.find((h) => h.id === 'se')).toMatchObject({ x: 270, y: 170 });
    expect(hs[0].size).toBe(8);
    expect(resizeHandles(box, 2)[0].size).toBeCloseTo(4);
  });

  it('hit-tests the corners only, within a 24 px screen target', () => {
    expect(hitResizeHandle(270, 170, box, 1)).toBe('se');
    expect(hitResizeHandle(100, 100, box, 1)).toBe('nw');
    expect(hitResizeHandle(268, 104, box, 1)).toBe('ne');
    expect(hitResizeHandle(102, 168, box, 1)).toBe('sw');
    expect(hitResizeHandle(270, 135, box, 1)).toBeNull(); // old E grip
    expect(hitResizeHandle(185, 170, box, 1)).toBeNull(); // old S grip
    expect(hitResizeHandle(150, 150, box, 1)).toBeNull();
  });

  it('corner resize keeps the opposite corner fixed', () => {
    expect(resizeFromCorner(box, 'se', 30, 10, false)).toEqual({ x: 100, y: 100, w: 200, h: 80 });
    expect(resizeFromCorner(box, 'nw', -30, -10, false)).toEqual({ x: 70, y: 90, w: 200, h: 80 });
    expect(resizeFromCorner(box, 'ne', 30, 10, false)).toEqual({ x: 100, y: 110, w: 200, h: 60 });
    // Clamped to the minimum size, still anchored on the opposite corner.
    expect(resizeFromCorner(box, 'sw', 500, 0, false)).toEqual({ x: 170, y: 100, w: 100, h: 70 });
  });
});

describe('clampNodeSize', () => {
  it('enforces 100x50..400x200 bounds', () => {
    expect(clampNodeSize(10, 10)).toEqual({ w: 100, h: 50 });
    expect(clampNodeSize(900, 900)).toEqual({ w: 400, h: 200 });
    expect(clampNodeSize(170, 70)).toEqual({ w: 170, h: 70 });
  });
});

describe('snapNode', () => {
  const other = { x: 400, y: 100, w: 170, h: 70 };

  it('snaps left edge to a nearby left edge with a vertical guide', () => {
    const res = snapNode({ x: 403, y: 300, w: 170, h: 70 }, [other], 10);
    expect(res.x).toBe(400);
    expect(res.y).toBe(300);
    expect(res.guides).toEqual([{ vertical: true, at: 400 }]);
  });

  it('ignores anchors beyond the threshold and disables on 0', () => {
    expect(snapNode({ x: 430, y: 300, w: 170, h: 70 }, [other], 10).x).toBe(430);
    expect(snapNode({ x: 403, y: 300, w: 170, h: 70 }, [other], 0).guides).toEqual([]);
    expect(snapNode(box, [], 10)).toEqual({ x: 100, y: 100, guides: [] });
  });

  it('snaps nearest anchors on both axes', () => {
    // moving left 312→400 (d=88, no); moving cx 397→400 (d=3, snap) → x=315.
    // moving top 98→100 (d=2, snap) → y=100.
    const res = snapNode({ x: 312, y: 98, w: 170, h: 70 }, [other], 10);
    expect(res).toEqual({
      x: 315,
      y: 100,
      guides: [{ vertical: true, at: 400 }, { vertical: false, at: 100 }],
    });
  });
});

describe('minimapTransform', () => {
  it('fits content and round-trips coordinates', () => {
    const t = minimapTransform([box, { x: 400, y: 300, w: 100, h: 100 }], 160, 100);
    const p = worldToMini(100, 100, t);
    const back = miniToWorld(p.x, p.y, t);
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(100);
    expect(t.s).toBeGreaterThan(0);
  });

  it('handles empty content', () => {
    expect(minimapTransform([], 160, 100)).toMatchObject({ contentW: 0, contentH: 0 });
  });
});
