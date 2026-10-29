/** Node render pass and its helpers (meta text, details, icons, cylinder). Pure: no React, no store. */
import type { ArchNode, PropertyValue } from '../../types';
import { notationFor, SIZE_BOX } from '../notation';
import { resolveIcon, type IconEntry } from '../../lib/icons';
import type { NodeIconSource, NodePaintFlags } from './types';
import { ellipsizeToWidth, wrapText } from './text';
import { drawDriftLabel, drawFocusRing, drawProposedChip, drawStatusMarks, drawStrike, statusLook, statusSlotWidth } from './status';

export type { NodeIconSource, NodePaintFlags } from './types';

/**
 * Legacy node renderers: rectangle (header card), rounded, cylinder (database), logo (icon-only).
 * Used for nodes without an explicit `displayStyle` (until R1-E02-T05 lands the style switch, so
 * pinned canvas tests stay green). The dispatcher is `drawNodePass` in `./nodePass`.
 */
export function drawLegacyNode(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  icons: NodeIconSource,
  opts: NodePaintFlags,
): void {
  const { isDark } = opts;
  const isSelected = opts.selected;
  const isPending = opts.pending;
  const shape = node.shape ?? 'rectangle';
  const hasIcon = Boolean(node.icon || node.iconSrc);

  ctx.save();
  const nodeBg = node.fill ?? (isDark ? '#191D25' : '#FFFFFF');
  const strokeColor = isPending ? (isDark ? '#F0B86E' : '#98600A') : isSelected ? (isDark ? '#8B83FF' : '#4F46E5') : (node.stroke ?? (isDark ? '#4B5363' : '#C7CDD7'));
  const lineWidth = node.strokeWidth ?? (isSelected || isPending ? 2 : 1);
  const shadowColor = isPending ? '#F0B86E' : isSelected ? '#4F46E5' : 'transparent';
  const shadowBlur = (isSelected || isPending) ? 8 : 0;

  if (shape === 'logo') {
    // Logo-only mode: render just the icon, no box
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    if (node.iconSrc) {
      drawIconImage(ctx, node, icons, (n) => ({ x: n.x, y: n.y, size: Math.min(n.w, n.h) }));
    } else if (node.icon) {
      ctx.font = `${Math.min(node.w, node.h) * 0.7}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.icon, node.x + node.w / 2, node.y + node.h / 2);
      // Details centered below the icon
      const detailsLines = (node.details ?? '').split('\n').slice(0, 3);
      ctx.font = '10px "Inter", -apple-system, sans-serif';
      ctx.fillStyle = isDark ? '#9CA3AF' : '#6B7280';
      detailsLines.slice(0, 3).forEach((line, i) => {
        const truncated = line.length > 26 ? line.slice(0, 26) + '…' : line;
        const textWidth = ctx.measureText(truncated).width;
        ctx.fillText(truncated, node.x + node.w / 2 - textWidth / 2, node.y + node.h + 12 + i * 14);
      });
    }
    // Selection indicator
    if (isSelected) {
      ctx.strokeStyle = (isDark ? '#8B83FF' : '#4F46E5');
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(node.x - 4, node.y - 4, node.w + 8, node.h + 8);
      ctx.setLineDash([]);
    }
  } else if (shape === 'cylinder') {
    drawCylinderBody(ctx, node, nodeBg, strokeColor, lineWidth, shadowColor, shadowBlur);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    drawIconImage(ctx, node, icons, (n) => ({ x: n.x + 8, y: n.y + 8, size: 24 }), (n) => {
      ctx.font = "20px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.icon!, n.x + 10, n.y + 22);
    });
    drawNodeMeta(ctx, node, { isDark, textX: hasIcon ? 42 : 12, labelY: 20, tagY: 40, detailsTop: 56 });
  } else if (shape === 'rounded') {
    // Rounded rectangle (modern card style)
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.w, node.h, 10);
    ctx.fillStyle = nodeBg;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    drawIconImage(ctx, node, icons, (n) => ({ x: n.x + 10, y: n.y + 10, size: 24 }), (n) => {
      ctx.font = "20px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.icon!, n.x + 12, n.y + 22);
    });
    drawNodeMeta(ctx, node, { isDark, textX: hasIcon ? 42 : 14, labelY: 20, tagY: 40, detailsTop: 56 });
  } else {
    // Default: clean rectangle with subtle header
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.w, node.h, 6);
    ctx.fillStyle = nodeBg;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Header bar
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = isDark ? '#2D2D2D' : '#F8F9FA';
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.w, 32, [6, 6, 0, 0]);
    ctx.fill();
    ctx.strokeStyle = isDark ? '#3D3D3D' : '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(node.x, node.y + 32);
    ctx.lineTo(node.x + node.w, node.y + 32);
    ctx.stroke();

    drawIconImage(ctx, node, icons, (n) => ({ x: n.x + 8, y: n.y + 4, size: 24 }), (n) => {
      ctx.font = "18px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.icon!, n.x + 10, n.y + 16);
    });

    drawNodeMeta(ctx, node, { isDark, textX: hasIcon ? 40 : 12, labelY: 16, tagY: 34, detailsTop: 50 });
  }

  // Connector ports (only for non-logo shapes); hover shows the §5A.5 ports.
  if (shape !== 'logo' && opts.showPorts) drawPorts(ctx, node, isPending);
  else if (shape !== 'logo' && opts.hovered && !isSelected) drawHoverPorts(ctx, node, isDark);

  ctx.restore();
}

/** Blue N/S/W/E connector ports on a box (world coords). */
export function drawPorts(ctx: CanvasRenderingContext2D, box: Box, isPending: boolean): void {
  const ports = [
    { x: box.x + box.w / 2, y: box.y },
    { x: box.x + box.w / 2, y: box.y + box.h },
    { x: box.x, y: box.y + box.h / 2 },
    { x: box.x + box.w, y: box.y + box.h / 2 },
  ];
  ports.forEach((p) => {
    if (isPending) {
      ctx.save();
      ctx.shadowColor = '#6366F1';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#6366F1';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#6366F1';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** States.dc.html "Ports N/E/S/W on hover": 10 px white circles, 1.5 px accent ring (world coords). */
export function drawHoverPorts(ctx: CanvasRenderingContext2D, box: Box, isDark: boolean): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = isDark ? '#191D25' : '#FFFFFF';
  ctx.strokeStyle = isDark ? SELECTION.handleStrokeDark : SELECTION.handleStroke;
  ctx.lineWidth = 1.5;
  for (const [px, py] of [
    [box.x + box.w / 2, box.y],
    [box.x + box.w, box.y + box.h / 2],
    [box.x + box.w / 2, box.y + box.h],
    [box.x, box.y + box.h / 2],
  ]) {
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Shorten helper shared by all text painters. */
function ellipsize(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Line-per-line label/tag/details text of a node, matching the original branch colors. */
function drawNodeMeta(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  opts: { isDark: boolean; textX: number; labelY: number; tagY: number; detailsTop: number },
): void {
  ctx.font = "600 13px 'Inter', -apple-system, sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.isDark ? '#F9FAFB' : '#1F2937';
  // textX is an offset inside the node, not a canvas coordinate (FE-V2).
  ctx.fillText(ellipsize(node.label, 20), node.x + opts.textX, node.y + opts.labelY);
  ctx.font = "11px 'Inter', -apple-system, sans-serif";
  ctx.fillStyle = opts.isDark ? '#9CA3AF' : '#6B7280';
  ctx.fillText(ellipsize(node.tag, 22), node.x + opts.textX, node.y + opts.tagY);
  drawNodeDetailsBlock(ctx, node, opts.textX, opts.detailsTop, opts.isDark);
}

/** Details lines clipped to the node bounds (only lines that fit are drawn). */
function drawNodeDetailsBlock(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  textXOffset: number,
  topY: number,
  isDark: boolean,
): void {
  if (!node.details?.trim()) return;
  ctx.font = "10px 'Inter', -apple-system, sans-serif";
  ctx.fillStyle = isDark ? '#9CA3AF' : '#6B7280';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const maxChars = Math.max(8, Math.floor((node.w - (textXOffset) - 8) / 6));
  const maxLines = Math.max(0, Math.floor((node.y + node.h - 6 - (node.y + topY)) / 13));
  node.details.split('\n').slice(0, Math.min(3, maxLines)).forEach((line, i) => {
    const truncated = line.length > maxChars ? line.slice(0, maxChars) + '…' : line;
    ctx.fillText(truncated, node.x + textXOffset, node.y + topY + i * 13);
  });
}

function drawIconImage(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  icons: NodeIconSource,
  placement: (n: ArchNode) => { x: number; y: number; size: number },
  emojiFallback?: (n: ArchNode) => void,
): void {
  if (node.iconSrc) {
    const img = icons.get(node.iconSrc);
    icons.ensure(node.iconSrc);
    if (img && img.complete && img.naturalWidth > 0) {
      const { x, y, size } = placement(node);
      ctx.drawImage(img, x, y, size, size);
    }
  } else if (node.icon && emojiFallback) {
    emojiFallback(node);
  }
}

/** Cylinder body for database-ish nodes (top ellipse, walls, bottom ellipse). */
export function drawCylinderBody(
  ctx: CanvasRenderingContext2D,
  node: { x: number; y: number; w: number; h: number },
  nodeBg: string,
  strokeColor: string,
  lineWidth: number,
  shadowColor: string,
  shadowBlur: number,
): void {
  const cx = node.x + node.w / 2;
  const rx = node.w / 2;
  const ry = node.h * 0.15;
  const h = node.h * 0.7;
  const topY = node.y + ry;
  const bottomY = topY + h;

  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;

  // Top ellipse
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = nodeBg;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(node.x, topY);
  ctx.lineTo(node.x, bottomY);
  ctx.ellipse(cx, bottomY, rx, ry, 0, Math.PI, 0);
  ctx.lineTo(node.x + node.w, node.y + ry);
  ctx.ellipse(cx, node.y + ry, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = nodeBg;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Bottom ellipse (stroke only)
  ctx.beginPath();
  ctx.ellipse(cx, bottomY, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

// ── R1-E02-T02 · Card style (UI_REVAMP_SPEC §5A.1), R1-E14-T05 fidelity to Elements/States ──

export interface Box { x: number; y: number; w: number; h: number; }

/**
 * Card geometry (Elements.dc.html card M, States.dc.html anatomy), offsets inside the node box.
 * Text rows are top-aligned from the 12 px padding: name 13 px (16 px line), lines 2–3 11 px
 * (13 px line), 2 px between rows. Y values are row centres (textBaseline 'middle').
 */
const CARD = {
  radius: 8,
  pad: 12,
  /** Gap between the icon slot and the text column. */
  gap: 10,
  /** Official (image) icon: 32 px, radius 4, no tile. */
  icon: 32,
  iconRadius: 4,
  /** Generic kind glyph: 28 px tinted tile, radius 6. */
  tile: 28,
  tileRadius: 6,
  nameY: 20,
  nameLineH: 16,
  /** Name row centre → line-2 centre: 8 + 2 + 6.5. */
  secondGap: 16.5,
  /** Line-2 centre → line-3 centre: 6.5 + 2 + 6.5. */
  propertyGap: 15,
  detailsGap: 14,
  detailsLineH: 13,
  bottomPad: 6,
  borderW: 1.5,
} as const;

/** Selection (Main.dc.html L105–L112): 3 px ring outside the border, four 8 px square corner handles. */
const SELECTION = {
  ring: 3,
  ringColor: 'rgba(79,70,229,.35)',
  ringColorDark: 'rgba(139,131,255,.35)',
  handle: 8,
  handleRadius: 2,
  handleStroke: '#4F46E5',
  handleStrokeDark: '#8B83FF',
  handleLineW: 1.5,
} as const;

/** "Not connected" node (Main.dc.html L136–L139): dashed grey border, grey tile, amber status line. */
const NOT_CONNECTED_STYLE = {
  border: '#8A93A3',
  glyph: '#5B6474',
  tile: '#F1F2F5',
  text: '#92400E',
  textDark: '#F0B86E',
  label: 'Not connected',
} as const;

const NAME_FONT = "600 13px 'Inter', -apple-system, sans-serif";
const SECOND_FONT = "11px 'Inter', -apple-system, sans-serif";
const STATUS_FONT = "500 11px 'Inter', -apple-system, sans-serif";
const PROPERTY_FONT = "11px 'Inter', -apple-system, sans-serif";
const DETAILS_FONT = "10px 'Inter', -apple-system, sans-serif";
const NAME_COLOR = '#1B1F27';
const MUTED_COLOR = '#5B6474';
const CARD_DASH = [6, 4];
const NO_ENTRIES: IconEntry[] = [];

/**
 * Glyph tile tints from the artboards (Main.dc.html, Elements.dc.html), keyed by kind colour. Kinds
 * the artboards do not draw get the kind colour mixed 12 % over white.
 */
const TILE_TINT: Record<string, string> = {
  '#2563EB': '#E8F0FE',
  '#7C3AED': '#F1EBFE',
  '#B45309': '#FEF3E2',
  '#D97706': '#FEF3E2',
  '#C2410C': '#FEF3E2',
  '#6B7280': '#F1F2F5',
  '#475569': '#F1F2F5',
  '#334155': '#F1F2F5',
  '#1E3A8A': '#E8F0FE',
  '#B91C1C': '#FDE8E8',
  '#6D28D9': '#EDE9FE',
  '#0F766E': '#CCFBF1',
};

/** Opaque tint for a glyph tile: the artboard value, else `color` at 12 % over white. Pure. */
export function glyphTileTint(color: string): string {
  const known = TILE_TINT[color.toUpperCase()];
  if (known) return known;
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return TILE_TINT['#6B7280'];
  const v = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * 0.12).toString(16).padStart(2, '0');
  return `#${mix((v >> 16) & 255)}${mix((v >> 8) & 255)}${mix(v & 255)}`.toUpperCase();
}

/** The card box: explicit `w`/`h` win; a missing or non-positive size falls back to `SIZE_BOX[size]`. */
export function cardBox(node: ArchNode): Box {
  const fallback = SIZE_BOX[node.size ?? 'M'] ?? SIZE_BOX.M;
  const ok = (v: number) => Number.isFinite(v) && v > 0;
  return { x: node.x, y: node.y, w: ok(node.w) ? node.w : fallback.w, h: ok(node.h) ? node.h : fallback.h };
}

/** Image src for a node's icon slot: the resolved `iconRef` first, then the legacy `iconSrc`. */
export function cardIconSrc(node: ArchNode, entries: IconEntry[] | undefined): string | undefined {
  return resolveIcon(node.iconRef, entries ?? NO_ENTRIES)?.src ?? node.iconSrc;
}

/** "dataClass" → "Data class", "owner" → "Owner". */
function propertyLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function propertyText(v: PropertyValue | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Selection chrome for a box: a 3 px ring just outside the 1.5 px border (CSS
 * `box-shadow: 0 0 0 3px`) and four 8 px square handles (white, 1.5 px accent, radius 2) centred
 * on the corners. World units, like the box.
 */
export function drawSelectionChrome(ctx: CanvasRenderingContext2D, box: Box, radius: number, isDark: boolean, zoom = 1, handles = true): void {
  const half = SELECTION.ring / 2;
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.roundRect(box.x - half, box.y - half, box.w + SELECTION.ring, box.h + SELECTION.ring, radius + half);
  ctx.strokeStyle = isDark ? SELECTION.ringColorDark : SELECTION.ringColor;
  ctx.lineWidth = SELECTION.ring;
  ctx.stroke();
  ctx.restore();
  if (handles) drawSelectionHandles(ctx, box, isDark, zoom);
}

/**
 * The four corner resize handles alone (R1-E14-T02): 8 **screen** px squares, so the world size is
 * divided by `zoom`. The canvas hit-tests the same corners (`hitResizeHandle`).
 */
export function drawSelectionHandles(ctx: CanvasRenderingContext2D, box: Box, isDark: boolean, zoom = 1): void {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const s = SELECTION.handle / z;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = isDark ? SELECTION.handleStrokeDark : SELECTION.handleStroke;
  ctx.lineWidth = SELECTION.handleLineW / z;
  for (const [cx, cy] of [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ]) {
    ctx.beginPath();
    ctx.roundRect(cx - s / 2, cy - s / 2, s, s, SELECTION.handleRadius / z);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** What the icon slot holds: an official image (32, no tile), a legacy emoji (32), a kind glyph (28 tile) or nothing. */
export type IconSlot = { kind: 'image'; src: string } | { kind: 'emoji'; char: string } | { kind: 'glyph' } | { kind: 'none' };

export function iconSlotFor(node: ArchNode, entries: IconEntry[] | undefined): IconSlot {
  if (node.iconRef === null) return { kind: 'none' };
  const src = cardIconSrc(node, entries);
  if (src) return { kind: 'image', src };
  if (node.icon) return { kind: 'emoji', char: node.icon };
  return { kind: 'glyph' };
}

function slotWidth(slot: IconSlot): number {
  if (slot.kind === 'none') return 0;
  return (slot.kind === 'glyph' ? CARD.tile : CARD.icon) + CARD.gap;
}

/** X of the card's text column (after padding and the icon slot), world coords. */
export function cardTextX(node: ArchNode, entries: IconEntry[] | undefined): number {
  return cardBox(node).x + CARD.pad + slotWidth(iconSlotFor(node, entries));
}

/**
 * §5A.1 card (Elements.dc.html card M): rounded box with a 1.5 px kind-colour border, icon slot,
 * name (2 lines max), "Kind · technology", optional property line and the legacy details lines,
 * all clipped to the box. A node with no connections (`isOrphan`) gets the "Not connected"
 * treatment. Selection draws the ring and corner handles; ports when `opts.showPorts`.
 */
export function drawCardNode(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  icons: NodeIconSource,
  opts: NodePaintFlags,
): void {
  const { isDark } = opts;
  const box = cardBox(node);
  const notation = notationFor(node.kind);
  const notConnected = node.isOrphan === true;
  const external = notation.baseShape === 'card-dashed';
  const look = statusLook(opts.status, isDark);
  const dashed = external || notConnected || node.borderDashed === true || look.dashed;
  const surface = isDark ? '#191D25' : '#FFFFFF';
  const dashedFill = isDark ? '#252A33' : '#F3F4F6';
  const fill = look.fill ?? node.fill ?? (external ? dashedFill : surface);
  const kindStroke = look.stroke ?? (notConnected ? NOT_CONNECTED_STYLE.border : (node.stroke || notation.color));
  const stroke = opts.pending ? (isDark ? '#F0B86E' : '#98600A') : kindStroke;

  ctx.save();
  // Box (the pending connector source keeps its amber glow).
  // Hover (§5A.5, States.dc.html): box-shadow 0 4px 12px rgba(16,24,40,.12).
  const hovered = opts.hovered === true || opts.status?.hovered === true;
  const hoverShadow = hovered && !opts.pending && !opts.selected;
  ctx.globalAlpha = look.alpha;
  ctx.shadowColor = opts.pending ? '#F0B86E' : hoverShadow ? (isDark ? 'rgba(0,0,0,.45)' : 'rgba(16,24,40,.12)') : 'transparent';
  ctx.shadowBlur = opts.pending ? 8 : hoverShadow ? 12 : 0;
  ctx.shadowOffsetY = hoverShadow ? 4 : 0;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, CARD.radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.setLineDash(dashed ? CARD_DASH : []);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = node.strokeWidth ?? (opts.pending ? 2 : CARD.borderW);
  ctx.stroke();
  ctx.setLineDash([]);

  // Icon slot (iconRef === null means "No icon": no slot, text moves left)
  const slot = iconSlotFor(node, opts.iconEntries);
  const glyphColor = notConnected ? NOT_CONNECTED_STYLE.glyph : notation.color;
  const tint = notConnected ? NOT_CONNECTED_STYLE.tile : glyphTileTint(notation.color);
  drawCardIcon(ctx, slot, icons, box.x + CARD.pad, box.y + CARD.pad, notation.glyph, glyphColor, tint);

  const textX = box.x + CARD.pad + slotWidth(slot);
  const maxW = Math.max(0, box.x + box.w - CARD.pad - textX - statusSlotWidth(opts.status));
  const bottom = box.y + box.h - CARD.bottomPad;
  const muted = isDark ? '#9CA3AF' : MUTED_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const finish = (): void => {
    ctx.restore();
    drawStateOverlays(ctx, box, CARD.radius, opts, {
      slotRight: box.x + box.w - CARD.pad,
      slotY: box.y + CARD.nameY,
      driftLabelY: box.y + box.h - 11,
      driftRight: box.x + box.w - CARD.pad,
    });
  };

  // Name: 13/600, up to 2 lines then "…"
  ctx.font = NAME_FONT;
  ctx.fillStyle = isDark ? '#F9FAFB' : NAME_COLOR;
  const nameLines = wrapText(ctx, node.label ?? '', maxW, 2);
  let y = box.y + CARD.nameY;
  nameLines.forEach((line, i) => {
    y = box.y + CARD.nameY + i * CARD.nameLineH;
    ctx.fillText(line, textX, y);
    if (look.strike) drawStrike(ctx, textX, y, ctx.measureText(line).width, ctx.fillStyle as string);
  });

  // "Not connected" status takes line 2 (Main.dc.html Billing Worker): 11/500 amber.
  if (notConnected) {
    y += CARD.secondGap;
    if (y > bottom) return finish();
    ctx.font = STATUS_FONT;
    ctx.fillStyle = isDark ? NOT_CONNECTED_STYLE.textDark : NOT_CONNECTED_STYLE.text;
    ctx.fillText(ellipsizeToWidth(ctx, NOT_CONNECTED_STYLE.label, maxW), textX, y);
  }

  // Kind line: "<Kind label> · <technology>", 11 px muted. The technology is its own fillText
  // so it starts at a stable x after the kind prefix.
  y += notConnected ? CARD.propertyGap : CARD.secondGap;
  if (y > bottom) return finish();
  ctx.font = SECOND_FONT;
  ctx.fillStyle = muted;
  const technology = (node.technology ?? node.tag ?? '').trim();
  if (!technology) {
    ctx.fillText(ellipsizeToWidth(ctx, notation.label, maxW), textX, y);
  } else {
    const prefix = `${notation.label} · `;
    const prefixW = ctx.measureText(prefix).width;
    if (prefixW >= maxW) {
      ctx.fillText(ellipsizeToWidth(ctx, prefix + technology, maxW), textX, y);
    } else {
      ctx.fillText(prefix, textX, y);
      ctx.fillText(ellipsizeToWidth(ctx, technology, maxW - prefixW), textX + prefixW, y);
    }
  }

  // Property line: "Owner: X" from doc.defaults.propertyLine (default owner); nothing when empty.
  const key = opts.propertyLineKey || 'owner';
  const value = propertyText(node.properties?.[key]);
  if (value && y + CARD.propertyGap <= bottom) {
    y += CARD.propertyGap;
    ctx.font = PROPERTY_FONT;
    ctx.fillStyle = muted;
    ctx.fillText(ellipsizeToWidth(ctx, `${propertyLabel(key)}: ${value}`, maxW), textX, y);
  }

  // Legacy details text: only the lines that fit inside the box.
  if (node.details?.trim()) {
    ctx.font = DETAILS_FONT;
    ctx.fillStyle = muted;
    let dy = y + CARD.detailsGap;
    for (const line of node.details.split('\n').slice(0, 3)) {
      if (dy > bottom) break;
      ctx.fillText(ellipsizeToWidth(ctx, line, maxW), textX, dy);
      dy += CARD.detailsLineH;
    }
  }
  finish();
}

/**
 * Icon slot at (x, y). Official images are 32 px clipped to radius 4 with no tile; a legacy emoji
 * fills the same 32 px slot; the generic kind glyph sits on a 28 px tile tinted `tint`.
 */
export function drawCardIcon(
  ctx: CanvasRenderingContext2D,
  slot: IconSlot,
  icons: NodeIconSource,
  x: number,
  y: number,
  glyph: string,
  color: string,
  tint: string,
  size: number = CARD.icon,
  tile: number = CARD.tile,
): void {
  if (slot.kind === 'image') {
    icons.ensure(slot.src);
    const img = icons.get(slot.src);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, CARD.iconRadius);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
    }
    return;
  }
  if (slot.kind === 'emoji') {
    ctx.font = `${Math.round(size * 0.69)}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.char, x + size / 2, y + size / 2);
    return;
  }
  if (slot.kind === 'glyph') drawKindGlyph(ctx, glyph, x, y, tile, color, tint);
}

/**
 * Generic kind glyph (§5A.2 "glyph" column): a `size` tile, radius 6, filled with `tint` (default:
 * the artboard tint for `color`) and a 16 px line drawing in `color`.
 */
export function drawKindGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  x: number,
  y: number,
  size: number,
  color: string,
  tint: string = glyphTileTint(color),
  /** Tile corner radius (default 6) and glyph scale (default 1 = the 16 px drawing). */
  look: { radius?: number; glyphScale?: number } = {},
): void {
  ctx.save();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, look.radius ?? CARD.tileRadius);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.75;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = x + size / 2;
  const cy = y + size / 2;
  const gs = look.glyphScale ?? 1;
  if (gs !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(gs, gs);
    ctx.translate(-cx, -cy);
    ctx.lineWidth = 1.75 / gs * Math.min(gs, 1.5);
  }
  ctx.beginPath();
  switch (glyph) {
    case 'person':
      ctx.arc(cx, cy - 4, 3.5, 0, Math.PI * 2);
      ctx.moveTo(cx + 7, cy + 8);
      ctx.arc(cx, cy + 8, 7, 0, Math.PI, true);
      break;
    case 'window':
      ctx.rect(cx - 8, cy - 7, 16, 14);
      ctx.moveTo(cx - 8, cy - 3);
      ctx.lineTo(cx + 8, cy - 3);
      break;
    case 'globe':
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.moveTo(cx, cy - 8);
      ctx.ellipse(cx, cy, 3.5, 8, 0, -Math.PI / 2, Math.PI * 1.5);
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx + 8, cy);
      break;
    case 'chevron':
      ctx.moveTo(cx - 6, cy - 7);
      ctx.lineTo(cx + 1, cy);
      ctx.lineTo(cx - 6, cy + 7);
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 7, cy);
      ctx.lineTo(cx, cy + 7);
      break;
    case 'lambda':
      ctx.moveTo(cx - 6, cy - 8);
      ctx.lineTo(cx - 2, cy - 8);
      ctx.lineTo(cx + 6, cy + 8);
      ctx.moveTo(cx - 6, cy + 8);
      ctx.lineTo(cx, cy - 1);
      break;
    case 'cylinder':
    case 'cylinder-braces':
      ctx.ellipse(cx, cy - 6, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.moveTo(cx - 7, cy - 6);
      ctx.lineTo(cx - 7, cy + 6);
      ctx.ellipse(cx, cy + 6, 7, 2.5, 0, Math.PI, 0, true);
      ctx.lineTo(cx + 7, cy - 6);
      break;
    case 'bolt':
      ctx.moveTo(cx + 2, cy - 8);
      ctx.lineTo(cx - 5, cy + 1);
      ctx.lineTo(cx, cy + 1);
      ctx.lineTo(cx - 2, cy + 8);
      ctx.lineTo(cx + 5, cy - 1);
      ctx.lineTo(cx, cy - 1);
      ctx.closePath();
      break;
    case 'pipe':
    case 'log':
      ctx.ellipse(cx - 6, cy, 2.5, 6, 0, 0, Math.PI * 2);
      ctx.moveTo(cx - 6, cy - 6);
      ctx.lineTo(cx + 6, cy - 6);
      ctx.ellipse(cx + 6, cy, 2.5, 6, 0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(cx - 6, cy + 6);
      if (glyph === 'log') {
        for (const dx of [-2, 1, 4]) {
          ctx.moveTo(cx + dx, cy - 6);
          ctx.lineTo(cx + dx, cy + 6);
        }
      }
      break;
    case 'bucket':
      ctx.ellipse(cx, cy - 5, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.moveTo(cx - 7, cy - 5);
      ctx.lineTo(cx - 5, cy + 7);
      ctx.lineTo(cx + 5, cy + 7);
      ctx.lineTo(cx + 7, cy - 5);
      break;
    case 'magnifier':
      ctx.arc(cx - 2, cy - 2, 5.5, 0, Math.PI * 2);
      ctx.moveTo(cx + 2, cy + 2);
      ctx.lineTo(cx + 7, cy + 7);
      break;
    case 'clock':
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + 4, cy + 2);
      break;
    case 'pulse':
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx - 4, cy);
      ctx.lineTo(cx - 2, cy - 6);
      ctx.lineTo(cx + 2, cy + 6);
      ctx.lineTo(cx + 4, cy);
      ctx.lineTo(cx + 8, cy);
      break;
    case 'note':
      ctx.moveTo(cx - 7, cy - 8);
      ctx.lineTo(cx + 3, cy - 8);
      ctx.lineTo(cx + 7, cy - 4);
      ctx.lineTo(cx + 7, cy + 8);
      ctx.lineTo(cx - 7, cy + 8);
      ctx.closePath();
      ctx.moveTo(cx + 3, cy - 8);
      ctx.lineTo(cx + 3, cy - 4);
      ctx.lineTo(cx + 7, cy - 4);
      break;
    default: {
      // 'hexagon' (service) and any glyph without its own drawing.
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = cx + 8 * Math.cos(a);
        const py = cy + 8 * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Everything drawn above a node after its body (R1-E02-T08): focus ring, selection ring and
 * handles (handles only for a single selection), hover or connector ports, the top-right status
 * slot, the "Proposed" chip and, on cards, the "Drift" label. Shared by all display styles.
 */
export function drawStateOverlays(
  ctx: CanvasRenderingContext2D,
  box: Box,
  radius: number,
  opts: NodePaintFlags,
  at: { slotRight: number; slotY: number; driftLabelY?: number; driftRight?: number },
): void {
  const { isDark, status } = opts;
  if (status?.focused) drawFocusRing(ctx, box, radius, isDark);
  if (opts.selected) drawSelectionChrome(ctx, box, radius, isDark, opts.zoom, status?.multiSelected !== true);
  if (opts.showPorts) drawPorts(ctx, box, opts.pending);
  else if ((opts.hovered || status?.hovered) && !opts.selected) drawHoverPorts(ctx, box, isDark);
  drawStatusMarks(ctx, status, at.slotRight, at.slotY, isDark);
  if (status?.proposed) drawProposedChip(ctx, box, isDark);
  if (status?.drift && at.driftLabelY !== undefined && at.driftRight !== undefined) drawDriftLabel(ctx, at.driftRight, at.driftLabelY);
}
