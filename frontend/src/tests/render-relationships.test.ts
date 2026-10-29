/** R1-E02-T09: relationship styles in the edge pass (UI_REVAMP_SPEC §5A.4). Recording mock context. */
import { describe, it, expect } from 'vitest';
import { clampLabelPos, drawEdgePass, edgeDash, edgeHandlePoints, edgeHops, edgeLabelText, labelPosFromPoint } from '../canvas/render/edges';
import type { EdgePaintFlags } from '../canvas/render/types';
import type { ArchEdge, ArchNode } from '../types';

interface Call { op: string; args: unknown[]; font: string; dash: number[]; fillStyle: string; strokeStyle: string; lineWidth: number }

function recordingCtx() {
  const calls: Call[] = [];
  const state = { font: '', dash: [] as number[], fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (_t, p) => {
      if (p === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (p === 'setLineDash') return (d: number[]) => { state.dash = [...d]; };
      if (p === 'font') return state.font;
      if (typeof p !== 'string') return undefined;
      return (...args: unknown[]) => {
        calls.push({ op: p, args, font: state.font, dash: state.dash, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, lineWidth: state.lineWidth });
      };
    },
    set: (_t, p, v) => {
      if (p === 'font') state.font = String(v);
      if (p === 'fillStyle') state.fillStyle = String(v);
      if (p === 'strokeStyle') state.strokeStyle = String(v);
      if (p === 'lineWidth') state.lineWidth = Number(v);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

// Two nodes on one row: a straight path from (200,140) to (400,140).
const nodes = [
  { id: 'a', x: 0, y: 100, w: 200, h: 80 },
  { id: 'b', x: 400, y: 100, w: 200, h: 80 },
] as ArchNode[];
const flags: EdgePaintFlags = { isDark: false, selected: false, orthogonal: false, curve: 'straight' };

function edge(over: Partial<ArchEdge> = {}): ArchEdge {
  return { id: 'e1', from: 'a', to: 'b', label: '', color: '#2563EB', ...over };
}

function draw(e: ArchEdge) {
  const { ctx, calls } = recordingCtx();
  drawEdgePass(ctx, e, nodes, flags);
  return calls;
}

/** Heads are the fills / strokes after the body stroke, before any label or badge. */
function heads(calls: Call[]) {
  const body = calls.findIndex((c) => c.op === 'stroke');
  const stop = calls.findIndex((c, i) => i > body && (c.op === 'roundRect' || c.op === 'arc'));
  return calls.slice(body + 1, stop < 0 ? undefined : stop).filter((c) => c.op === 'fill' || c.op === 'stroke');
}

describe('relationship styles', () => {
  it('async uses dash [6,4] and open arrow', () => {
    const calls = draw(edge({ relKind: 'async' }));
    expect(calls.find((c) => c.op === 'stroke')?.dash).toEqual([6, 4]);
    expect(heads(calls).map((c) => c.op)).toEqual(['stroke']);
    expect(heads(draw(edge({ relKind: 'sync' }))).map((c) => c.op)).toEqual(['fill']);
    expect(draw(edge({ relKind: 'sync' })).find((c) => c.op === 'stroke')?.dash).toEqual([]);
    expect(edgeDash(edge({ relKind: 'replication' }))).toEqual([2, 4]);
    // Today's inspector writes lineStyle: an explicit value still wins (mapped to §5A.4 dashes).
    expect(edgeDash(edge({ relKind: 'sync', lineStyle: 'dashed' }))).toEqual([6, 4]);
    expect(edgeDash(edge({ relKind: 'async', isDangling: true }))).toEqual([4, 4]);
  });

  it('label pill uses sans 11px and a background rect', () => {
    const calls = draw(edge({ label: 'Places order', protocol: 'REST' }));
    const text = calls.find((c) => c.op === 'fillText');
    expect(text?.args[0]).toBe('Places order · REST');
    expect(text?.font).toContain('11px');
    expect(text?.font).toContain('Inter');
    expect(text?.font).not.toMatch(/italic|Caveat|cursive/);
    // Centred at labelPos 0.5 of the path.
    expect(text?.args.slice(1)).toEqual([300, 140]);
    const pill = calls.find((c) => c.op === 'roundRect');
    expect(pill).toBeDefined();
    const [x, , w] = pill!.args as number[];
    expect(x).toBeLessThan(300);
    expect(x + w).toBeGreaterThan(300);
    const i = calls.indexOf(pill!);
    expect(calls.slice(i, calls.indexOf(text!)).map((c) => c.op)).toEqual(['roundRect', 'fill', 'stroke']);
    // labelPos moves the pill; no label and no protocol draws no pill.
    expect(draw(edge({ label: 'x', labelPos: 0.25 })).find((c) => c.op === 'fillText')?.args.slice(1)).toEqual([250, 140]);
    expect(draw(edge()).some((c) => c.op === 'roundRect' || c.op === 'fillText')).toBe(false);
    expect(edgeLabelText(edge({ protocol: 'gRPC' }))).toBe('gRPC');
  });

  it('edges are 1.5px #8A93A3 with white pills bordered #E3E6EB (Main.dc.html)', () => {
    const calls = draw(edge({ label: 'gRPC · TLS' }));
    const body = calls.find((c) => c.op === 'stroke');
    expect(body?.lineWidth).toBe(1.5);
    expect(body?.strokeStyle).toBe('#8A93A3');
    expect(heads(calls)[0].fillStyle).toBe('#8A93A3');
    const pillIdx = calls.findIndex((c) => c.op === 'roundRect');
    const [, , w, h, r] = calls[pillIdx].args as number[];
    // padding 2 8 + 1 px border around 11 px text: width = text + 18, fully round ends.
    expect(w).toBe('gRPC · TLS'.length * 7 + 18);
    expect(h).toBe(19);
    expect(r).toBe(h / 2);
    const [fill, border] = calls.slice(pillIdx + 1, pillIdx + 3);
    expect(fill.fillStyle).toBe('#FFFFFF');
    expect(border.strokeStyle).toBe('#E3E6EB');
    expect(border.lineWidth).toBe(1);
    const text = calls.find((c) => c.op === 'fillText');
    expect(text?.fillStyle).toBe('#3D4553');
    expect(text?.font).toMatch(/^11px /);
  });

  it('bidirectional draws two heads', () => {
    expect(heads(draw(edge({ relKind: 'bidirectional' })))).toHaveLength(2);
    expect(heads(draw(edge({ relKind: 'sync' })))).toHaveLength(1);
    expect(heads(draw(edge({ relKind: 'bidirectional', arrow: 'none' })))).toHaveLength(0);
  });

  it('step badge renders number', () => {
    const calls = draw(edge({ step: 3 }));
    const badge = calls.find((c) => c.op === 'arc');
    expect(badge?.args.slice(0, 3)).toEqual([216, 140, 9]);
    const num = calls.find((c) => c.op === 'fillText');
    expect(num?.args).toEqual(['3', 216, 140]);
    expect(draw(edge({ step: null })).some((c) => c.op === 'arc')).toBe(false);
  });

  it('draws a hop at crossings', () => {
    const { ctx, calls } = recordingCtx();
    drawEdgePass(ctx, edge(), nodes, { ...flags, hops: [{ x: 300, y: 140 }] });
    const hop = calls.find((c) => c.op === 'arc');
    expect(hop?.args.slice(0, 3)).toEqual([300, 140, 6]);
    // The body line stops 6 px before the crossing and resumes after the arc.
    const before = calls.find((c) => c.op === 'lineTo');
    expect(before?.args).toEqual([294, 140]);
    expect(calls.findIndex((c) => c.op === 'arc')).toBeLessThan(calls.findIndex((c) => c.op === 'stroke'));
  });

  it('edgeHops gives the later edge the hop over an earlier crossing edge', () => {
    const grid = [
      { id: 'a', x: 0, y: 100, w: 200, h: 80 }, { id: 'b', x: 400, y: 100, w: 200, h: 80 },
      { id: 'c', x: 250, y: -100, w: 100, h: 50 }, { id: 'd', x: 250, y: 300, w: 100, h: 50 },
    ] as ArchNode[];
    const e1 = edge({ id: 'e1' });
    const e2 = edge({ id: 'e2', from: 'c', to: 'd' });
    const hops = edgeHops([e1, e2], grid, false, 'straight');
    expect(hops.has('e1')).toBe(false);
    expect(hops.get('e2')).toEqual([{ x: 300, y: 140 }]);
  });

  it('label position is clamped to 0.05-0.95 and follows a dragged point', () => {
    expect(clampLabelPos(0)).toBe(0.05);
    expect(clampLabelPos(1)).toBe(0.95);
    const path = [{ x: 200, y: 140 }, { x: 400, y: 140 }];
    expect(labelPosFromPoint(path, 300, 200)).toBe(0.5);
    expect(labelPosFromPoint(path, 1000, 140)).toBe(0.95);
    const calls = draw(edge({ label: 'x', labelPos: 0 }));
    expect(calls.find((c) => c.op === 'fillText')?.args.slice(1)).toEqual([210, 140]);
  });

  it('selected edge shows waypoint and midpoint handles', () => {
    const wp = [{ x: 300, y: 40 }];
    const e = edge({ waypoints: wp });
    const { ctx, calls } = recordingCtx();
    drawEdgePass(ctx, e, nodes, { ...flags, selected: true });
    const dots = calls.filter((c) => c.op === 'arc');
    // Two "+" midpoints and one waypoint, 4 px radius at zoom 1.
    expect(dots).toHaveLength(3);
    expect(dots.every((c) => c.args[2] === 4)).toBe(true);
    const h = edgeHandlePoints(e, [{ x: 200, y: 140 }, { x: 300, y: 40 }, { x: 400, y: 140 }]);
    expect(h.waypoints).toEqual(wp);
    expect(h.mids.map((m) => m.insertIndex)).toEqual([0, 1]);
  });
});
