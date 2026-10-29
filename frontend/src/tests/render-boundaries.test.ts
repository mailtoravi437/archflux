/** R1-E03-T01: boundary rendering (Boundaries.dc.html). Recording mock context, 7 px per character. */
import { describe, it, expect } from 'vitest';
import { drawBoundaryPass, orderForPaint } from '../canvas/render/boundaries';
import { drawNodePass } from '../canvas/render/nodePass';
import type { NodeIconSource, NodePaintFlags } from '../canvas/render/types';
import type { ArchNode, BoundaryKind } from '../types';
import { recordingCtx } from './fixtures/recordingCtx';

const noIcons: NodeIconSource = { get: () => null, ensure: () => {} };
const flags: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };
const opts = { isDark: false, selected: false, childCount: 0 };

function boundary(boundaryKind: BoundaryKind, over: Partial<ArchNode> = {}): ArchNode {
  return { id: 'b1', type: 'service', label: '10.0.0.0/16', tag: '', health: '', x: 100, y: 50, w: 400, h: 300, stroke: '', kind: 'boundary', boundaryKind, ...over };
}

describe('boundary renderer', () => {
  it('VPC uses solid #8C4FFF 1.5px', () => {
    const { ctx, calls } = recordingCtx();
    drawBoundaryPass(ctx, boundary('vpc'), opts);
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.strokeStyle).toBe('#8C4FFF');
    expect(border?.lineWidth).toBe(1.5);
    expect(border?.dash).toEqual([]);
  });

  it('region is dashed #00A4A6', () => {
    const { ctx, calls } = recordingCtx();
    drawBoundaryPass(ctx, boundary('region'), opts);
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.strokeStyle).toBe('#00A4A6');
    expect(border?.dash.length).toBeGreaterThan(0);
  });

  it('label is inside top-left', () => {
    const { ctx, calls } = recordingCtx();
    const n = boundary('vpc');
    drawBoundaryPass(ctx, n, opts);
    const text = calls.find((c) => c.op === 'fillText');
    expect(text?.args[0]).toBe('VPC · 10.0.0.0/16');
    expect(text?.args[1]).toBe(n.x + 10);
    expect(text?.args[2]).toBe(n.y + 18);
    expect(text?.font).toContain('600 12px');
    expect(text?.textAlign).toBe('left');
  });

  it('collapsed draws chip with child count and no body', () => {
    const { ctx, calls } = recordingCtx();
    const n = boundary('vpc', { collapsed: true });
    drawBoundaryPass(ctx, n, { ...opts, childCount: 3 });
    expect(calls.some((c) => c.op === 'rect')).toBe(false);
    const chip = calls.find((c) => c.op === 'roundRect');
    expect(chip?.args.slice(0, 2)).toEqual([n.x, n.y]);
    expect(chip?.args[3]).toBe(28);
    expect(calls.find((c) => c.op === 'fillText')?.args[0]).toBe('10.0.0.0/16 · 3');
  });

  it('swimlane draws its label rotated -90 degrees', () => {
    const { ctx, calls } = recordingCtx();
    drawBoundaryPass(ctx, boundary('swimlane', { label: 'Billing' }), opts);
    expect(calls.find((c) => c.op === 'rotate')?.args[0]).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('cloud with iconRef draws a 20 px logo before the label', () => {
    const { ctx, calls } = recordingCtx();
    const n = boundary('cloud', { iconRef: { source: 'x', id: 'aws' } as ArchNode['iconRef'] });
    drawBoundaryPass(ctx, n, { ...opts, logo: {} as CanvasImageSource });
    const img = calls.find((c) => c.op === 'drawImage');
    expect(img?.args.slice(3)).toEqual([20, 20]);
    expect((calls.find((c) => c.op === 'fillText')?.args[1] as number)).toBeGreaterThan(n.x + 30);
  });

  it('boundaries are painted before child nodes', () => {
    const child: ArchNode = { id: 'c', type: 'service', label: 'api', tag: '', health: '', x: 120, y: 90, w: 200, h: 80, stroke: '', parentId: 'b2' };
    const outer = boundary('vpc', { id: 'b1', z: 5 });
    const inner = boundary('az', { id: 'b2', parentId: 'b1', z: 0 });
    expect(orderForPaint([child, inner, outer]).map((n) => n.id)).toEqual(['b1', 'b2', 'c']);
  });

  it('layer order decides paint order, boundaries included', () => {
    const low: ArchNode = { id: 'n-low', type: 'service', label: 'low', tag: '', health: '', x: 0, y: 0, w: 10, h: 10, stroke: '', layerId: 'ly-a' };
    const high = boundary('vpc', { id: 'b-high', layerId: 'ly-b' });
    const lowBoundary = boundary('vpc', { id: 'b-low', layerId: 'ly-a' });
    const order = new Map([['ly-a', 0], ['ly-b', 1]]);
    // A boundary on the upper layer paints after every node of the lower layer (and after the lower layer's boundary).
    expect(orderForPaint([high, low, lowBoundary], order).map((n) => n.id)).toEqual(['b-low', 'n-low', 'b-high']);
    // Without layer information the old rule holds: boundaries first.
    expect(orderForPaint([high, low, lowBoundary]).map((n) => n.id)).toEqual(['b-high', 'b-low', 'n-low']);
  });

  it('drawNodePass dispatches boundary nodes to the boundary renderer', () => {
    const { ctx, calls } = recordingCtx();
    drawNodePass(ctx, boundary('vpc'), noIcons, flags);
    expect(calls.find((c) => c.op === 'fillText')?.args[0]).toBe('VPC · 10.0.0.0/16');
  });
});
