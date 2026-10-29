/**
 * R1-E02-T04: icon style renderer (UI_REVAMP_SPEC §5A.1b); regression for UX-A12, where an `iconSrc`
 * node in logo mode drew no name. Recording mock context, 7 px per character.
 */
import { describe, it, expect } from 'vitest';
import { drawNodePass } from '../canvas/render/nodePass';
import { iconTileSize, nodeBounds, hitsNode } from '../lib/canvasGeometry';
import type { NodeIconSource, NodePaintFlags } from '../canvas/render/types';
import type { ArchNode } from '../types';
import { recordingCtx } from './fixtures/recordingCtx';

const flags: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };
const loadedImage = { complete: true, naturalWidth: 32 } as HTMLImageElement;
const icons: NodeIconSource = { get: () => loadedImage, ensure: () => {} };

function node(over: Partial<ArchNode> = {}): ArchNode {
  return {
    id: 'n1', type: 'service', label: 'Order Service', tag: '', health: '', x: 300, y: 140, w: 64, h: 64,
    stroke: '', kind: 'service', displayStyle: 'icon', technology: 'ECS · Java', iconSrc: '/icons/aws/ecs.svg', size: 'M', ...over,
  };
}

describe('icon style renderer', () => {
  it('draws the name under an official SVG icon', () => {
    const { ctx, calls } = recordingCtx();
    const n = node();
    drawNodePass(ctx, n, icons, flags);
    expect(calls.some((c) => c.op === 'drawImage')).toBe(true);
    const name = calls.find((c) => c.op === 'fillText' && c.args[0] === 'Order Service');
    expect(name, 'the name is painted').toBeTruthy();
    expect(name!.font).toContain('600 13px');
    expect(name!.textAlign).toBe('center');
    // Centred under the tile, below it.
    expect(name!.args[1]).toBe(n.x + n.w / 2);
    expect(name!.args[2] as number).toBeGreaterThan(n.y + 64);
    // The technology line follows in muted 11 px.
    const tech = calls.find((c) => c.op === 'fillText' && c.args[0] === 'ECS · Java');
    expect(tech?.font).toMatch(/^11px /);
    expect(tech!.args[2] as number).toBeGreaterThan(name!.args[2] as number);
  });

  it('the legacy logo shape draws the same way', () => {
    const { ctx, calls } = recordingCtx();
    const { displayStyle: _d, ...legacy } = node({ shape: 'logo' });
    drawNodePass(ctx, legacy as ArchNode, icons, flags);
    expect(calls.some((c) => c.op === 'fillText' && c.args[0] === 'Order Service')).toBe(true);
  });

  it('label never overlaps the icon tile', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const { ctx, calls } = recordingCtx();
      const n = node({ size, w: 120, h: 120, label: 'A long element name that must wrap onto two lines' });
      drawNodePass(ctx, n, icons, flags);
      const tile = iconTileSize(n);
      expect(tile).toBe({ S: 48, M: 64, L: 96 }[size]);
      const texts = calls.filter((c) => c.op === 'fillText');
      expect(texts.length).toBeGreaterThan(1);
      for (const t of texts) {
        // Row centres sit at least half a line below the tile's bottom edge.
        expect(t.args[2] as number, `${size} text y`).toBeGreaterThan(n.y + tile);
      }
      // The tile is centred horizontally in the node box.
      const tileRect = calls.find((c) => c.op === 'roundRect');
      expect((tileRect!.args as number[]).slice(0, 4)).toEqual([n.x + (n.w - tile) / 2, n.y, tile, tile]);
    }
  });

  it('nodeBounds includes the label area', () => {
    const n = node();
    const b = nodeBounds(n);
    expect(b.y).toBe(n.y);
    expect(b.h).toBeGreaterThan(64 + 6 + 17); // tile + gap + at least one name line
    // Clicking the name (below the tile) hits the node; far below does not.
    expect(hitsNode(n, n.x + n.w / 2, n.y + 64 + 12)).toBe(true);
    expect(hitsNode(n, n.x + n.w / 2, n.y + b.h + 20)).toBe(false);
    // Card style bounds are the plain box.
    expect(nodeBounds({ ...n, displayStyle: 'card', w: 200, h: 80 })).toEqual({ x: n.x, y: n.y, w: 200, h: 80 });
  });
});
