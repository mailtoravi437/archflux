/**
 * R1-E02-T02: card style renderer (UI_REVAMP_SPEC §5A.1); R1-E14-T05 geometry from Elements.dc.html
 * card M (padding 12, gap 10, 28 px glyph tile / 32 px official icon). Recording mock context,
 * 7 px per character.
 */
import { describe, it, expect } from 'vitest';
import { drawCardNode, cardIconSrc } from '../canvas/render/nodes';
import { wrapText } from '../canvas/render/text';
import type { NodeIconSource, NodePaintFlags } from '../canvas/render/types';
import type { IconEntry } from '../lib/icons';
import type { ArchNode } from '../types';

interface Call { op: string; args: unknown[]; font: string; dash: number[]; fillStyle: string; strokeStyle: string; lineWidth: number }

function recordingCtx() {
  const calls: Call[] = [];
  const state = { font: '', dash: [] as number[], fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const snap = (op: string, args: unknown[]): Call => ({ op, args, font: state.font, dash: state.dash, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, lineWidth: state.lineWidth });
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (_t, p) => {
      if (p === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (p === 'setLineDash') return (d: number[]) => { state.dash = [...d]; calls.push(snap('setLineDash', [d])); };
      if (p === 'font') return state.font;
      if (typeof p !== 'string') return undefined;
      return (...args: unknown[]) => { calls.push(snap(p, args)); };
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

const noIcons: NodeIconSource = { get: () => null, ensure: () => {} };
const flags: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };

function node(over: Partial<ArchNode> = {}): ArchNode {
  return {
    id: 'n1', type: 'service', label: 'Order Service', tag: '', health: '', x: 300, y: 140, w: 200, h: 80,
    stroke: '', kind: 'service', displayStyle: 'card', technology: 'Java 21', ...over,
  };
}

const texts = (calls: Call[]) => calls.filter((c) => c.op === 'fillText');

describe('card style renderer', () => {
  it('draws name and kind·technology inside the box', () => {
    const { ctx, calls } = recordingCtx();
    const n = node({ properties: { owner: 'Payments' } });
    drawCardNode(ctx, n, noIcons, flags);
    const painted = texts(calls);
    expect(painted.map((c) => c.args[0])).toEqual(['Order Service', 'Service · ', 'Java 21', 'Owner: Payments']);
    for (const c of painted) {
      const x = c.args[1] as number;
      const y = c.args[2] as number;
      expect(x).toBeGreaterThanOrEqual(n.x);
      expect(x).toBeLessThanOrEqual(n.x + n.w);
      expect(y).toBeGreaterThanOrEqual(n.y);
      expect(y).toBeLessThanOrEqual(n.y + n.h);
    }
    const [name, kind, tech] = painted;
    // Generic glyph: text column = padding 12 + 28 tile + gap 10; name row centred 12 + 8 down.
    expect(name.args.slice(1)).toEqual([n.x + 50, n.y + 20]);
    expect(name.font).toContain('600 13px');
    expect(name.fillStyle).toBe('#1B1F27');
    expect(kind.font).toMatch(/^11px /);
    expect(kind.fillStyle).toBe('#5B6474');
    expect(painted[3].fillStyle).toBe('#5B6474');
    expect(tech.args[1]).toBe(n.x + 50 + 'Service · '.length * 7);
    // Box: radius 8, 1.5 px border in the node stroke or the kind colour.
    expect(calls.find((c) => c.op === 'roundRect')?.args).toEqual([n.x, n.y, n.w, n.h, 8]);
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.lineWidth).toBe(1.5);
    expect(border?.strokeStyle).toBe('#2563EB');
  });

  it('wraps long names to two lines with ellipsis', () => {
    const { ctx, calls } = recordingCtx();
    const n = node({ label: 'Payment Orchestrator Saga Coordinator Primary Region Worker' });
    drawCardNode(ctx, n, noIcons, flags);
    const names = texts(calls).filter((c) => c.font.includes('600 13px'));
    expect(names).toHaveLength(2);
    expect(names[1].args[2]).toBe(n.y + 20 + 16);
    const second = names[1].args[0] as string;
    expect(second.endsWith('…')).toBe(true);
    const maxW = n.w - 50 - 12;
    for (const c of names) expect((c.args[0] as string).length * 7).toBeLessThanOrEqual(maxW);
    // Pure helper contract.
    expect(wrapText(ctx, 'a b', 100, 2)).toEqual(['a b']);
    expect(wrapText(ctx, '', 100, 2)).toEqual([]);
  });

  it('external kind uses dashed border', () => {
    const { ctx, calls } = recordingCtx();
    drawCardNode(ctx, node({ kind: 'external' }), noIcons, flags);
    const stroke = calls.find((c) => c.op === 'stroke');
    expect(stroke?.dash).toEqual([6, 4]);
    const plain = recordingCtx();
    drawCardNode(plain.ctx, node(), noIcons, flags);
    expect(plain.calls.find((c) => c.op === 'stroke')?.dash).toEqual([]);
  });

  it('iconRef null hides icon slot and shifts text left', () => {
    const withIcon = recordingCtx();
    drawCardNode(withIcon.ctx, node(), noIcons, flags);
    // Generic kind glyph: a tinted 28 px tile at (x+12, y+12).
    const n = node();
    expect(withIcon.calls.some((c) => c.op === 'roundRect' && c.args[0] === n.x + 12 && c.args[1] === n.y + 12 && c.args[2] === 28)).toBe(true);

    const { ctx, calls } = recordingCtx();
    drawCardNode(ctx, node({ iconRef: null, iconSrc: '/icons/aws/ecs.svg' }), noIcons, flags);
    expect(calls.filter((c) => c.op === 'roundRect')).toHaveLength(1);
    expect(calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(texts(calls)[0].args[1]).toBe(n.x + 12);
  });

  it('prefers the resolved iconRef over iconSrc and never fetches', () => {
    const img = { complete: true, naturalWidth: 32 } as HTMLImageElement;
    const asked: string[] = [];
    const icons: NodeIconSource = { get: (src) => (src === '/icons/aws/rds.svg' ? img : null), ensure: (src) => { asked.push(src); } };
    const entries: IconEntry[] = [{ id: 'aws/amazon-rds', set: 'aws', name: 'RDS', keywords: [], kinds: ['database'], src: '/icons/aws/rds.svg' }];
    const n = node({ iconRef: { set: 'aws', id: 'aws/amazon-rds' }, iconSrc: '/icons/aws/ecs.svg' });
    expect(cardIconSrc(n, entries)).toBe('/icons/aws/rds.svg');
    expect(cardIconSrc(n, undefined)).toBe('/icons/aws/ecs.svg');
    const { ctx, calls } = recordingCtx();
    drawCardNode(ctx, n, icons, { ...flags, iconEntries: entries });
    expect(asked).toEqual(['/icons/aws/rds.svg']);
    expect(calls.find((c) => c.op === 'drawImage')?.args).toEqual([img, n.x + 12, n.y + 12, 32, 32]);
  });

  it('official icon has no tile; generic glyph has 28px tint tile', () => {
    const img = { complete: true, naturalWidth: 32 } as HTMLImageElement;
    const icons: NodeIconSource = { get: () => img, ensure: () => {} };
    const n = node({ iconSrc: '/icons/aws/ecs.svg' });
    const official = recordingCtx();
    drawCardNode(official.ctx, n, icons, flags);
    // Only the box is filled: the 32 px image is clipped to radius 4, with no tile behind it.
    expect(official.calls.filter((c) => c.op === 'fill')).toHaveLength(1);
    expect(official.calls.some((c) => c.op === 'roundRect' && c.args[2] === 28)).toBe(false);
    expect(official.calls.find((c) => c.op === 'roundRect' && c.args[2] === 32)?.args).toEqual([n.x + 12, n.y + 12, 32, 32, 4]);
    expect(official.calls.map((c) => c.op)).toContain('clip');
    expect(official.calls.find((c) => c.op === 'drawImage')?.args.slice(1)).toEqual([n.x + 12, n.y + 12, 32, 32]);
    // Text column: padding 12 + icon 32 + gap 10.
    expect(texts(official.calls)[0].args[1]).toBe(n.x + 54);

    const tints: Record<string, string> = { service: '#E8F0FE', gateway: '#F1EBFE', database: '#FEF3E2', observability: '#F1F2F5' };
    for (const [kind, tint] of Object.entries(tints)) {
      const g = recordingCtx();
      drawCardNode(g.ctx, node({ kind: kind as ArchNode['kind'] }), noIcons, flags);
      const tileIdx = g.calls.findIndex((c) => c.op === 'roundRect' && c.args[2] === 28);
      expect(g.calls[tileIdx].args, kind).toEqual([n.x + 12, n.y + 12, 28, 28, 6]);
      const tileFill = g.calls.slice(tileIdx).find((c) => c.op === 'fill');
      expect(tileFill?.fillStyle, kind).toBe(tint);
      expect(texts(g.calls)[0].args[1]).toBe(n.x + 50);
    }
  });

  it('selected draws 3px ring and four 8px handles', () => {
    const n = node();
    const { ctx, calls } = recordingCtx();
    drawCardNode(ctx, n, noIcons, { ...flags, selected: true });
    // The kind border stays 1.5 px in the kind colour; selection never recolours it.
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.strokeStyle).toBe('#2563EB');
    expect(border?.lineWidth).toBe(1.5);
    // Ring: 3 px stroke just outside the border.
    const ringIdx = calls.findIndex((c) => c.op === 'roundRect' && c.args[0] === n.x - 1.5);
    expect(calls[ringIdx].args).toEqual([n.x - 1.5, n.y - 1.5, n.w + 3, n.h + 3, 9.5]);
    const ring = calls.slice(ringIdx).find((c) => c.op === 'stroke');
    expect(ring?.lineWidth).toBe(3);
    expect(ring?.strokeStyle).toBe('rgba(79,70,229,.35)');
    // Handles: 8 px squares, radius 2, centred on the four corners, white fill, 1.5 px #4F46E5.
    const handles = calls.filter((c) => c.op === 'roundRect' && c.args[2] === 8 && c.args[3] === 8);
    expect(handles.map((c) => c.args)).toEqual([
      [n.x - 4, n.y - 4, 8, 8, 2],
      [n.x + n.w - 4, n.y - 4, 8, 8, 2],
      [n.x - 4, n.y + n.h - 4, 8, 8, 2],
      [n.x + n.w - 4, n.y + n.h - 4, 8, 8, 2],
    ]);
    const after = calls.slice(calls.indexOf(handles[0]));
    expect(after.find((c) => c.op === 'fill')?.fillStyle).toBe('#FFFFFF');
    const hs = after.find((c) => c.op === 'stroke');
    expect(hs?.strokeStyle).toBe('#4F46E5');
    expect(hs?.lineWidth).toBe(1.5);
    // Unselected: no ring and no handles.
    const plain = recordingCtx();
    drawCardNode(plain.ctx, n, noIcons, flags);
    expect(plain.calls.filter((c) => c.op === 'roundRect' && c.args[2] === 8)).toHaveLength(0);
    expect(plain.calls.some((c) => c.op === 'roundRect' && c.args[0] === n.x - 1.5)).toBe(false);
  });

  it('not-connected node gets dashed grey border and amber status line', () => {
    const n = node({ isOrphan: true });
    const { ctx, calls } = recordingCtx();
    drawCardNode(ctx, n, noIcons, flags);
    const border = calls.find((c) => c.op === 'stroke');
    expect(border?.dash).toEqual([6, 4]);
    expect(border?.strokeStyle).toBe('#8A93A3');
    const painted = texts(calls);
    expect(painted.map((c) => c.args[0])).toEqual(['Order Service', 'Not connected', 'Service · ', 'Java 21']);
    expect(painted[1].fillStyle).toBe('#92400E');
    expect(painted[1].font).toContain('500 11px');
    for (const c of painted) expect(c.args[2] as number).toBeLessThanOrEqual(n.y + n.h);
  });

  it('property line uses the configured key and is skipped when empty', () => {
    const a = recordingCtx();
    drawCardNode(a.ctx, node({ properties: { owner: '', dataClass: 'PII' } }), noIcons, { ...flags, propertyLineKey: 'dataClass' });
    expect(texts(a.calls).map((c) => c.args[0])).toContain('Data class: PII');
    const b = recordingCtx();
    drawCardNode(b.ctx, node({ properties: { owner: '  ' } }), noIcons, flags);
    expect(texts(b.calls).some((c) => String(c.args[0]).startsWith('Owner'))).toBe(false);
  });
});
