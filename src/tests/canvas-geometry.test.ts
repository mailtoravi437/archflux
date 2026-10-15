import { describe, expect, it } from 'vitest';
import {
  clampNodeSize,
  hitResizeHandle,
  minimapTransform,
  miniToWorld,
  resizeHandles,
  snapNode,
  worldToMini,
} from '../canvasGeometry';

const box = { x: 100, y: 100, w: 170, h: 70 };

describe('resizeHandles', () => {
  it('places E/S/SE grips on the border with zoom-compensated size', () => {
    const hs = resizeHandles(box, 1);
    expect(hs.map((h) => h.id)).toEqual(['e', 's', 'se']);
    expect(hs.find((h) => h.id === 'se')).toMatchObject({ x: 270, y: 170 });
    expect(resizeHandles(box, 2)[0].size).toBeCloseTo(6);
  });

  it('hit-tests grips within half size', () => {
    expect(hitResizeHandle(270, 170, box, 1)).toBe('se');
    expect(hitResizeHandle(270, 135, box, 1)).toBe('e');
    expect(hitResizeHandle(185, 170, box, 1)).toBe('s');
    expect(hitResizeHandle(150, 150, box, 1)).toBeNull();
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
