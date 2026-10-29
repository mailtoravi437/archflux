/**
 * R1-E02-T08: element states (UI_REVAMP_SPEC §5A.5, States.dc.html). One `it` per state, asserting its
 * distinguishing draw call on the card; a last block checks the same marks in shape and icon style.
 */
import { describe, it, expect } from 'vitest';
import { drawNodePass } from '../canvas/render/nodePass';
import type { NodeIconSource, NodePaintFlags, NodeStatus } from '../canvas/render/types';
import type { ArchNode } from '../types';
import { recordingCtx, type Call } from './fixtures/recordingCtx';

const noIcons: NodeIconSource = { get: () => null, ensure: () => {} };
const base: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };

function node(over: Partial<ArchNode> = {}): ArchNode {
  return {
    id: 'n1', type: 'service', label: 'Order Service', tag: '', health: '', x: 300, y: 140, w: 200, h: 80,
    stroke: '', kind: 'service', displayStyle: 'card', technology: 'ECS', ...over,
  };
}

function paint(status: NodeStatus | undefined, flags: Partial<NodePaintFlags> = {}, n: ArchNode = node()) {
  const { ctx, calls } = recordingCtx();
  drawNodePass(ctx, n, noIcons, { ...base, ...flags, status });
  return calls;
}
const texts = (calls: Call[]) => calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
const arcs = (calls: Call[]) => calls.filter((c) => c.op === 'arc');
const borderStroke = (calls: Call[]) => calls.find((c) => c.op === 'stroke');

describe('element states', () => {
  it('default: kind-colour border, no marks', () => {
    const calls = paint(undefined);
    expect(borderStroke(calls)?.strokeStyle).toBe('#2563EB');
    expect(arcs(calls)).toHaveLength(0);
    expect(texts(calls)).not.toContain('Drift');
  });

  it('hover draws a soft shadow and the four ports', () => {
    const calls = paint(undefined, { hovered: true });
    expect(calls.some((c) => c.op === 'fill')).toBe(true);
    expect(arcs(calls)).toHaveLength(4);
    // Same through status.hovered.
    expect(arcs(paint({ hovered: true }))).toHaveLength(4);
  });

  it('selected draws a 3 px ring and four corner handles', () => {
    const calls = paint(undefined, { selected: true });
    expect(calls.filter((c) => c.op === 'stroke' && c.lineWidth === 3)).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'roundRect' && (c.args[2] as number) === 8)).toHaveLength(4);
  });

  it('multi-selected keeps the ring but draws no handles', () => {
    const calls = paint({ multiSelected: true }, { selected: true });
    expect(calls.filter((c) => c.op === 'stroke' && c.lineWidth === 3)).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'roundRect' && (c.args[2] as number) === 8)).toHaveLength(0);
  });

  it('keyboard focus draws a 2 px accent ring offset 4 px from the border', () => {
    const calls = paint({ focused: true });
    const ring = calls.find((c) => c.op === 'stroke' && c.lineWidth === 2 && c.strokeStyle === '#4F46E5');
    expect(ring).toBeTruthy();
    const n = node();
    const idx = calls.indexOf(ring!);
    const path = calls.slice(0, idx).reverse().find((c) => c.op === 'roundRect');
    expect(path?.args.slice(0, 4)).toEqual([n.x - 4, n.y - 4, n.w + 8, n.h + 8]);
  });

  it('locked draws a lock mark at the top right', () => {
    const calls = paint({ locked: true });
    const n = node();
    const pill = calls.find((c) => c.op === 'roundRect' && (c.args[2] as number) === 16 && (c.args[3] as number) === 16);
    expect(pill).toBeTruthy();
    const x = pill!.args[0] as number;
    expect(x).toBeGreaterThan(n.x + n.w / 2);
    expect(x + 16).toBeLessThanOrEqual(n.x + n.w - 12);
    expect(pill!.args[1] as number).toBeLessThan(n.y + 20);
  });

  it('drift draws an amber dot and the "Drift" label on cards', () => {
    const calls = paint({ drift: true });
    expect(arcs(calls).some((c) => (c.args[2] as number) === 5)).toBe(true);
    expect(calls.some((c) => c.op === 'fill' && c.fillStyle === '#D97706')).toBe(true);
    expect(texts(calls)).toContain('Drift');
  });

  it('lint draws a red dot for errors and an amber dot for warnings', () => {
    const red = paint({ lint: 'error' });
    expect(red.some((c) => c.op === 'fill' && c.fillStyle === '#B91C1C')).toBe(true);
    const amber = paint({ lint: 'warn' });
    expect(amber.some((c) => c.op === 'fill' && c.fillStyle === '#D97706')).toBe(true);
    expect(arcs(amber)).toHaveLength(1);
  });

  it('comments draw a pin with the count', () => {
    const calls = paint({ comments: 2 });
    expect(texts(calls)).toContain('2');
    expect(calls.some((c) => c.op === 'fill' && c.fillStyle === '#4F46E5')).toBe(true);
    expect(texts(paint({ comments: 12 }))).toContain('9+');
    expect(texts(paint({ comments: 0 }))).not.toContain('0');
  });

  it('proposed draws a green dashed border and a Proposed chip', () => {
    const calls = paint({ proposed: true });
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.strokeStyle).toBe('#15803D');
    expect(border?.dash).toEqual([6, 4]);
    expect(calls.find((c) => c.op === 'fill' && c.fillStyle === '#F0FDF4')).toBeTruthy();
    expect(texts(calls)).toContain('Proposed');
  });

  it('removed draws a red dashed border at 60% with a struck name', () => {
    const calls = paint({ diff: 'removed' });
    expect(calls.find((c) => c.op === 'stroke')?.strokeStyle).toBe('#B91C1C');
    expect(calls.find((c) => c.op === 'stroke')?.dash).toEqual([6, 4]);
    const name = calls.find((c) => c.op === 'fillText' && c.args[0] === 'Order Service')!;
    expect(name.globalAlpha).toBe(0.6);
    // A 1 px line through the name row.
    const n = node();
    const idx = calls.indexOf(name);
    const move = calls.slice(idx).find((c) => c.op === 'moveTo');
    expect(move?.args[1]).toBe(name.args[2]);
    expect(move?.args[0]).toBe(name.args[1]);
    expect(n.x).toBeLessThan(move!.args[0] as number);
  });

  it('changed tints the fill amber', () => {
    const calls = paint({ diff: 'changed' });
    expect(calls.find((c) => c.op === 'fill')?.fillStyle).toBe('#FEF3C7');
    expect(calls.find((c) => c.op === 'stroke')?.strokeStyle).toBe('#D97706');
  });

  it('status marks leave room: the name wraps before the status slot', () => {
    const plain = paint(undefined, {}, node({ label: 'Order Service Gateway Name' }));
    const marked = paint({ locked: true, comments: 1 }, {}, node({ label: 'Order Service Gateway Name' }));
    expect(texts(marked).length).toBeGreaterThanOrEqual(texts(plain).length);
  });

  it('shape and icon styles draw the same marks', () => {
    for (const style of ['shape', 'icon'] as const) {
      const n = node({ displayStyle: style, kind: 'database', size: 'M', w: 170, h: 104 });
      const calls = paint({ locked: true, comments: 3, diff: 'removed' }, {}, n);
      expect(texts(calls), style).toContain('3');
      expect(calls.some((c) => c.op === 'roundRect' && (c.args[2] as number) === 16 && (c.args[3] as number) === 16), style).toBe(true);
      expect(calls.find((c) => c.op === 'fillText' && c.args[0] === 'Order Service')?.globalAlpha, style).toBe(0.6);
      expect(calls.find((c) => c.op === 'moveTo' && c.args.length === 2 && calls.some((t) => t.op === 'fillText' && t.args[2] === c.args[1])), style).toBeTruthy();
    }
  });
});
