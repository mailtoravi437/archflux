/**
 * R1-E03-T01: boundary rendering (UI_REVAMP_SPEC §5A.3, Boundaries.dc.html).
 * Stroke, dash, width, fill and radius come from BOUNDARY_NOTATION; nothing is hard-coded per kind
 * except the darker label tints the artboard uses. Pure: no React, no store.
 */
import type { ArchNode, BoundaryKind } from '../../types';
import { BOUNDARY_NOTATION } from '../notation';
import { ellipsizeToWidth } from './text';

export interface BoundaryPaintOpts {
  isDark: boolean;
  selected: boolean;
  /** Direct and nested children counted by the caller; drawn on the collapsed chip. Omitted → no count. */
  childCount?: number;
  /** Provider logo for `cloud` boundaries with an `iconRef`, already loaded by the caller (drawn at 20 px). */
  logo?: CanvasImageSource | null;
}

const LABEL_FONT = "600 12px 'Inter', -apple-system, sans-serif";
const LABEL_X = 10;
const LABEL_Y = 18;
const LOGO = 20;
const LOGO_GAP = 6;
const BAND_W = 28;
const CHIP_H = 28;
const CHIP_PAD = 12;
const RING_COLOR = 'rgba(79,70,229,.35)';
const RING_COLOR_DARK = 'rgba(139,131,255,.35)';
const DARK_SURFACE = '#191D25';

/** Label colours from the artboard (darker than the stroke for contrast on white). */
const LABEL_COLOR: Record<BoundaryKind, string> = {
  cloud: '#232F3E',
  region: '#007A7C',
  vpc: '#6B2FD6',
  az: '#007A7C',
  'subnet-public': '#4D6B0A',
  'subnet-private': '#007A7C',
  'security-group': '#B42339',
  'k8s-cluster': '#1F4FB8',
  'k8s-namespace': '#1F4FB8',
  'c4-system': '#4B5563',
  trust: '#B91C1C',
  frame: '#4B5563',
  swimlane: '#4B5563',
};

/** Strokes that would vanish on the dark surface are lifted. */
function darkStroke(stroke: string): string {
  return stroke === '#232F3E' ? '#9CA3AF' : stroke === '#C3C8D1' ? '#4B5363' : stroke;
}

/** Nesting depth via `parentId` (cycle-safe). */
function depthIn(byId: Map<string, ArchNode>, node: ArchNode): number {
  let depth = 0;
  const seen = new Set<string>([node.id]);
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    depth++;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return depth;
}

export function isBoundaryNode(node: Pick<ArchNode, 'kind' | 'boundaryKind'>): boolean {
  return node.kind === 'boundary' && node.boundaryKind !== undefined && node.boundaryKind in BOUNDARY_NOTATION;
}

/**
 * Paint order. Within one layer: boundaries first (shallower before deeper, then `z`), then every other
 * node in its original order. With `layerOrder` (layer id → order) layers paint lowest first, so a
 * boundary on a higher layer covers nodes of a lower one (R1-E03-T05). The input is not mutated.
 */
export function orderForPaint(nodes: readonly ArchNode[], layerOrder?: ReadonlyMap<string, number>): ArchNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rankOf = (n: ArchNode) => layerOrder?.get(n.layerId ?? 'ly-default') ?? 0;
  const boundaries = nodes
    .filter(isBoundaryNode)
    .map((n, i) => ({ n, i, d: depthIn(byId, n) }))
    .sort((a, b) => rankOf(a.n) - rankOf(b.n) || a.d - b.d || (a.n.z ?? 0) - (b.n.z ?? 0) || a.i - b.i)
    .map((e) => e.n);
  const others = nodes.filter((n) => !isBoundaryNode(n));
  if (!layerOrder) return [...boundaries, ...others];
  // Merge per layer: that layer's boundaries, then that layer's other nodes (stable).
  const ranks = [...new Set([...boundaries, ...others].map(rankOf))].sort((a, b) => a - b);
  return ranks.flatMap((r) => [...boundaries.filter((n) => rankOf(n) === r), ...others.filter((n) => rankOf(n) === r)]);
}

function boundaryLabel(node: ArchNode, notationLabel: string): string {
  const own = (node.label ?? '').trim();
  return own ? `${notationLabel} · ${own}` : notationLabel;
}

/** One boundary: rectangle, label (swimlane: rotated in a left band), or the collapsed chip. Culled by the caller. */
export function drawBoundaryPass(ctx: CanvasRenderingContext2D, node: ArchNode, opts: BoundaryPaintOpts): void {
  const kind = node.boundaryKind;
  const notation = kind ? BOUNDARY_NOTATION[kind] : undefined;
  if (!kind || !notation) return;
  const { isDark, selected } = opts;
  const stroke = isDark ? darkStroke(notation.stroke) : notation.stroke;
  const labelColor = isDark ? (kind === 'cloud' ? '#E5E7EB' : stroke) : LABEL_COLOR[kind];
  const fill = notation.fill ? (isDark ? 'rgba(255,255,255,.04)' : notation.fill) : null;
  const { x, y, w, h } = node;

  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'alphabetic';

  if (node.collapsed) {
    const own = (node.label ?? '').trim() || notation.label;
    const text = opts.childCount === undefined ? own : `${own} · ${opts.childCount}`;
    const chipW = ctx.measureText(text).width + CHIP_PAD * 2;
    ctx.beginPath();
    ctx.roundRect(x, y, chipW, CHIP_H, CHIP_H / 2);
    ctx.fillStyle = fill ?? (isDark ? DARK_SURFACE : '#FFFFFF');
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = isDark ? RING_COLOR_DARK : RING_COLOR;
      ctx.lineWidth = notation.width + 6;
      ctx.stroke();
    }
    ctx.setLineDash(notation.dash);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = notation.width;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ellipsizeToWidth(ctx, text, chipW - CHIP_PAD * 2), x + CHIP_PAD, y + CHIP_H / 2);
    ctx.restore();
    return;
  }

  const body = (): void => {
    ctx.beginPath();
    if (notation.radius > 0) ctx.roundRect(x, y, w, h, notation.radius);
    else ctx.rect(x, y, w, h);
  };

  if (fill) {
    body();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (selected) {
    body();
    ctx.setLineDash([]);
    ctx.strokeStyle = isDark ? RING_COLOR_DARK : RING_COLOR;
    ctx.lineWidth = notation.width + 6;
    ctx.stroke();
  }
  body();
  ctx.setLineDash(notation.dash);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = notation.width;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = labelColor;
  if (kind === 'swimlane') {
    // Header band on the left; the label reads bottom to top, centred in the band.
    ctx.beginPath();
    ctx.rect(x, y, BAND_W, h);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,.06)' : '#EEF0F3';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + BAND_W, y);
    ctx.lineTo(x + BAND_W, y + h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.save();
    ctx.translate(x + BAND_W / 2, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ellipsizeToWidth(ctx, boundaryLabel(node, notation.label), Math.max(0, h - 16)), 0, 0);
    ctx.restore();
    ctx.restore();
    return;
  }

  let lx = x + LABEL_X;
  if (kind === 'cloud' && node.iconRef && opts.logo) {
    ctx.drawImage(opts.logo, lx, y + LABEL_Y - 14, LOGO, LOGO);
    lx += LOGO + LOGO_GAP;
  }
  ctx.textAlign = 'left';
  ctx.fillText(ellipsizeToWidth(ctx, boundaryLabel(node, notation.label), Math.max(0, x + w - 10 - lx)), lx, y + LABEL_Y);
  ctx.restore();
}
