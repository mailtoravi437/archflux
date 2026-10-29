/**
 * R1-E02-T03: shape display style (notation geometry). Recording mock context, 7 px per character;
 * assertions are on recorded calls, not pixels.
 */
import { describe, it, expect } from 'vitest';
import { drawNodePass } from '../canvas/render/nodePass';
import { KIND_NOTATION, notationFor, type BaseShape } from '../canvas/notation';
import type { NodeIconSource, NodePaintFlags } from '../canvas/render/types';
import type { ArchNode, ElementKind } from '../types';
import { recordingCtx } from './fixtures/recordingCtx';

const noIcons: NodeIconSource = { get: () => null, ensure: () => {} };
const flags: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };

function node(kind: ElementKind, over: Partial<ArchNode> = {}): ArchNode {
  return {
    id: 'n1', type: 'service', label: 'Orders DB', tag: '', health: '', x: 300, y: 140, w: 200, h: 100,
    stroke: '', kind, displayStyle: 'shape', technology: 'PostgreSQL 16', ...over,
  };
}

describe('shape style renderer', () => {
  it('database in shape style draws an ellipse cap', () => {
    const { ctx, calls } = recordingCtx();
    const n = node('database');
    drawNodePass(ctx, n, noIcons, flags);
    const ellipses = calls.filter((c) => c.op === 'ellipse');
    expect(ellipses.length).toBeGreaterThanOrEqual(2);
    // Top cap: centred horizontally in the box, near the top, wide as the box.
    const cap = ellipses[0].args as number[];
    expect(cap[0]).toBe(n.x + n.w / 2);
    expect(cap[2]).toBeCloseTo(n.w / 2 - 0.75, 5);
    expect(cap[1]).toBeLessThan(n.y + n.h / 4);
    // Border: 1.5 px in the kind colour.
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.strokeStyle).toBe('#B45309');
    expect(border?.lineWidth).toBe(1.5);
  });

  it('queue draws a horizontal pipe', () => {
    const { ctx, calls } = recordingCtx();
    const n = node('queue', { w: 210, h: 76, label: 'payment-jobs', technology: 'SQS' });
    drawNodePass(ctx, n, noIcons, flags);
    const ellipses = calls.filter((c) => c.op === 'ellipse').map((c) => c.args as number[]);
    expect(ellipses.length).toBeGreaterThanOrEqual(2);
    for (const e of ellipses) expect(e[4]).toBe(0); // rotation 0: a horizontal pipe, not a tilted one
    const cx = n.x + n.w / 2;
    expect(ellipses.some((e) => e[0] < cx)).toBe(true); // left end cap
    expect(ellipses.some((e) => e[0] > cx)).toBe(true); // right end cap
    // Caps are tall and narrow (radius x < radius y), the opposite of a cylinder cap.
    expect(ellipses[0][2]).toBeLessThan(ellipses[0][3]);
    // The queue bars: a round-capped, 6 px pink stroke.
    expect(calls.some((c) => c.op === 'stroke' && c.strokeStyle === '#F9A8D4' && c.lineWidth === 6)).toBe(true);
  });

  it('person draws a head arc', () => {
    const { ctx, calls } = recordingCtx();
    const n = node('person', { label: 'Customer', technology: '', w: 150, h: 100 });
    drawNodePass(ctx, n, noIcons, flags);
    const arc = calls.find((c) => c.op === 'arc');
    expect(arc).toBeTruthy();
    const [cx, , r] = arc!.args as number[];
    expect(cx).toBe(n.x + n.w / 2);
    expect(r).toBeCloseTo(n.h * 0.18 - 0.75, 5);
  });

  it('text stays within geometry bounds for every base shape', () => {
    const kinds = Object.keys(KIND_NOTATION) as Exclude<ElementKind, 'boundary'>[];
    const shapes = new Set<BaseShape>();
    for (const kind of kinds) {
      shapes.add(notationFor(kind).baseShape);
      for (const size of [{ w: 200, h: 80 }, { w: 170, h: 104 }, { w: 240, h: 120 }]) {
        const { ctx, calls } = recordingCtx();
        const n = node(kind, { ...size, label: 'A rather long element name that wraps', technology: 'Some technology string' });
        drawNodePass(ctx, n, noIcons, flags);
        const texts = calls.filter((c) => c.op === 'fillText');
        expect(texts.length, `${kind} paints text`).toBeGreaterThan(0);
        for (const c of texts) {
          const x = c.args[1] as number;
          const y = c.args[2] as number;
          const width = (c.args[0] as string).length * 7;
          const left = c.textAlign === 'center' ? x - width / 2 : x;
          expect(left, `${kind} ${size.w}x${size.h} x`).toBeGreaterThanOrEqual(n.x);
          expect(left + width, `${kind} ${size.w}x${size.h} right`).toBeLessThanOrEqual(n.x + n.w);
          expect(y, `${kind} y`).toBeGreaterThanOrEqual(n.y);
          expect(y, `${kind} y`).toBeLessThanOrEqual(n.y + n.h);
        }
      }
    }
    // Every geometry in the notation table is exercised.
    expect(shapes.size).toBeGreaterThanOrEqual(10);
  });
});
