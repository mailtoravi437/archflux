/**
 * BUG-LIVE-017: legacy (no displayStyle) rectangle and database renderers keep the sub-label clear
 * of the header divider and the title clear of the top ellipse. Recording mock context.
 */
import { describe, it, expect } from 'vitest';
import { drawLegacyNode } from '../canvas/render/nodes';
import type { NodeIconSource, NodePaintFlags } from '../canvas/render/types';
import type { ArchNode } from '../types';
import { recordingCtx } from './fixtures/recordingCtx';

const noIcons: NodeIconSource = { get: () => null, ensure: () => {} };
const flags: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };
/** Half the 13 px / 11 px text line height used as the clearance between a text centre and a line. */
const HALF_TAG = 6;
const HALF_LABEL = 7;

function node(over: Partial<ArchNode> = {}): ArchNode {
  return {
    id: 'n1', type: 'service', label: 'Orders', tag: 'Node.js / REST', health: '', x: 300, y: 140, w: 200, h: 80,
    stroke: '', kind: 'service', ...over,
  };
}

describe('legacy node text placement (BUG-LIVE-017)', () => {
  it('rectangle: the divider does not cross the sub-label', () => {
    const { ctx, calls } = recordingCtx();
    const n = node();
    drawLegacyNode(ctx, n, noIcons, flags);
    const dividerY = n.y + 32;
    const tag = calls.find((c) => c.op === 'fillText' && c.args[0] === 'Node.js / REST');
    expect(tag).toBeTruthy();
    expect(Math.abs((tag!.args[2] as number) - dividerY)).toBeGreaterThan(HALF_TAG);
    expect(tag!.args[2] as number).toBeGreaterThan(dividerY); // sub-label sits below the header
    expect((tag!.args[2] as number) + HALF_TAG).toBeLessThanOrEqual(n.y + n.h);
  });

  it('database: the title sits below the top ellipse', () => {
    for (const h of [60, 80, 120]) {
      const { ctx, calls } = recordingCtx();
      const n = node({ h, shape: 'cylinder', label: 'Orders DB', tag: 'PostgreSQL' });
      drawLegacyNode(ctx, n, noIcons, flags);
      const ellipseBottom = n.y + n.h * 0.15 * 2; // top cap spans y .. y + 2*ry
      const title = calls.find((c) => c.op === 'fillText' && c.args[0] === 'Orders DB');
      expect(title, `h=${h}`).toBeTruthy();
      expect((title!.args[2] as number) - HALF_LABEL).toBeGreaterThanOrEqual(ellipseBottom);
    }
  });
});
