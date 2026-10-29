/**
 * Node render dispatcher and the shape / icon display styles.
 * R1-E02-T03 (shape: notation geometry), R1-E02-T04 (icon: tile + name below, fixes UX-A12).
 * Card and legacy drawing live in ./nodes; geometry in ./shapes. Pure: no React, no store.
 */
import type { ArchNode } from '../../types';
import type { IconEntry } from '../../lib/icons';
import { NOTE_FILL, notationFor, type BaseShape } from '../notation';
import {
  ICON_LABEL_GAP,
  ICON_LABEL_MAX_W,
  ICON_NAME_LINE_H,
  ICON_TECH_LINE_H,
  effectiveNodeStyle,
  iconTileSize,
  nodeBounds,
} from '../../lib/canvasGeometry';
import {
  cardBox,
  cardTextX,
  drawCardIcon,
  drawCardNode,
  drawKindGlyph,
  drawLegacyNode,
  drawStateOverlays,
  glyphTileTint,
  iconSlotFor,
  type Box,
} from './nodes';
import { isCardFamily, paintShape, pathFor, shapeContent } from './shapes';
import type { NodeIconSource, NodePaintFlags } from './types';
import { ellipsizeToWidth, wrapText } from './text';
import { drawStrike, statusLook } from './status';
import { drawBoundaryPass, isBoundaryNode } from './boundaries';

const NAME_FONT = "600 13px 'Inter', -apple-system, sans-serif";
const SECOND_FONT = "11px 'Inter', -apple-system, sans-serif";
const NAME_COLOR = '#1B1F27';
const MUTED_COLOR = '#5B6474';
const SHAPE_ICON = 28;
const SHAPE_GAP = 8;
const NAME_LINE_H = 16;
const SECOND_LINE_H = 13;
const ROW_GAP = 1;
const RING_COLOR = 'rgba(79,70,229,.35)';
const RING_COLOR_DARK = 'rgba(139,131,255,.35)';
/** Corner radius of the rectangular overlays (focus ring, selection handles) around a non-card shape. */
const SHAPE_RING_RADIUS = 8;

/**
 * One node, any display style: `card` and `shape` and `icon` (or legacy `shape: 'logo'`) use the
 * §5A renderers; nodes with no style keep the legacy renderers until the style switch (T05).
 * Culled by the caller.
 */
export function drawNodePass(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  icons: NodeIconSource,
  opts: NodePaintFlags,
): void {
  if (isBoundaryNode(node)) {
    drawBoundaryPass(ctx, node, { isDark: opts.isDark, selected: opts.selected, childCount: opts.childCount, logo: opts.boundaryLogo });
    return;
  }
  switch (effectiveNodeStyle(node)) {
    case 'card':
      drawCardNode(ctx, node, icons, opts);
      return;
    case 'shape':
      drawShapeNode(ctx, node, icons, opts);
      return;
    case 'icon':
      drawIconNode(ctx, node, icons, opts);
      return;
    default:
      drawLegacyNode(ctx, node, icons, opts);
  }
}

/**
 * "<Kind> · <technology>" as two fillText calls (the technology starts at a stable x after the kind
 * prefix, like the card). Document DB marks the line with "{ }" (Elements.dc.html).
 */
function drawSecondLine(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  shape: BaseShape,
  x: number,
  y: number,
  maxW: number,
  centered: boolean,
): void {
  const mark = shape === 'cylinder-braces' ? '{ } ' : '';
  const label = mark + notationFor(node.kind).label;
  const technology = (node.technology ?? node.tag ?? '').trim();
  ctx.textAlign = 'left';
  if (!technology) {
    const text = ellipsizeToWidth(ctx, label, maxW);
    ctx.fillText(text, centered ? x - ctx.measureText(text).width / 2 : x, y);
    return;
  }
  const prefix = `${label} · `;
  const prefixW = ctx.measureText(prefix).width;
  if (prefixW >= maxW) {
    const text = ellipsizeToWidth(ctx, prefix + technology, maxW);
    ctx.fillText(text, centered ? x - ctx.measureText(text).width / 2 : x, y);
    return;
  }
  const tech = ellipsizeToWidth(ctx, technology, maxW - prefixW);
  const x0 = centered ? x - (prefixW + ctx.measureText(tech).width) / 2 : x;
  ctx.fillText(prefix, x0, y);
  ctx.fillText(tech, x0 + prefixW, y);
}

/**
 * Shape style (§5A.2 Notation): the kind's base geometry with the icon (28) and name (13/600, up to
 * 2 lines) plus "Kind · technology" inside. Card-family kinds draw as the card, as on the
 * Elements artboard.
 */
export function drawShapeNode(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  icons: NodeIconSource,
  opts: NodePaintFlags,
): void {
  const notation = notationFor(node.kind);
  const shape = notation.baseShape;
  if (isCardFamily(shape)) {
    drawCardNode(ctx, node, icons, opts);
    return;
  }
  const { isDark } = opts;
  const box = cardBox(node);
  const notConnected = node.isOrphan === true;
  const surface = isDark ? '#191D25' : '#FFFFFF';
  const look = statusLook(opts.status, isDark);
  const color = look.stroke ?? (notConnected ? '#8A93A3' : node.stroke || notation.color);
  const stroke = opts.pending ? (isDark ? '#F0B86E' : '#98600A') : color;
  const lineWidth = node.strokeWidth ?? (opts.pending ? 2 : 1.5);
  const fill = look.fill ?? node.fill ?? (shape === 'note' ? NOTE_FILL : surface);

  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = look.alpha;
  // Selected: 3 px accent ring just outside the outline, painted under the shape.
  if (opts.selected) {
    ctx.beginPath();
    pathFor(shape, box.x, box.y, box.w, box.h)(ctx);
    ctx.strokeStyle = isDark ? RING_COLOR_DARK : RING_COLOR;
    ctx.lineWidth = lineWidth + 6;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  const hoverShadow = (opts.hovered === true || opts.status?.hovered === true) && !opts.pending && !opts.selected;
  ctx.shadowColor = opts.pending ? '#F0B86E' : hoverShadow ? (isDark ? 'rgba(0,0,0,.45)' : 'rgba(16,24,40,.12)') : 'transparent';
  ctx.shadowBlur = opts.pending ? 8 : hoverShadow ? 12 : 0;
  ctx.shadowOffsetY = hoverShadow ? 4 : 0;
  paintShape(ctx, shape, box, {
    fill,
    stroke,
    lineWidth,
    dash: notConnected || node.borderDashed === true || look.dashed ? [6, 4] : [],
    chrome: isDark ? '#252A33' : '#F1F2F5',
    fold: '#FDE68A',
  });

  // Content: icon slot + name + "Kind · technology".
  const content = shapeContent(shape, box);
  const slot = content.icon ? iconSlotFor(node, opts.iconEntries) : ({ kind: 'none' } as const);
  const iconW = slot.kind === 'none' ? 0 : SHAPE_ICON + SHAPE_GAP;
  const centered = content.align === 'center';
  // The status slot sits on the cap / top edge, above the text rows, so it needs no reserved width.
  const maxW = Math.max(0, content.rect.w - iconW);
  const muted = isDark ? '#9CA3AF' : MUTED_COLOR;
  ctx.textAlign = centered ? 'center' : 'left';
  ctx.textBaseline = 'middle';
  ctx.font = NAME_FONT;
  // Two name lines only when they and the kind line fit the geometry; otherwise one.
  const roomForTwo = content.rect.h >= 2 * NAME_LINE_H + ROW_GAP + SECOND_LINE_H;
  const nameLines = wrapText(ctx, node.label ?? '', maxW, roomForTwo ? 2 : 1);
  const textH = nameLines.length * NAME_LINE_H + ROW_GAP + SECOND_LINE_H;
  const groupH = Math.max(textH, slot.kind === 'none' ? 0 : SHAPE_ICON);
  const top = content.vAlign === 'middle' ? content.rect.y + Math.max(0, (content.rect.h - groupH) / 2) : content.rect.y;
  const textTop = top + (groupH - textH) / 2;
  const textX = centered ? content.rect.x + content.rect.w / 2 : content.rect.x + iconW;
  const bottom = content.rect.y + content.rect.h;

  if (slot.kind !== 'none') {
    drawCardIcon(ctx, slot, icons, content.rect.x, top + (groupH - SHAPE_ICON) / 2, notation.glyph, notation.color, glyphTileTint(notation.color), SHAPE_ICON, SHAPE_ICON);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
  }
  ctx.font = NAME_FONT;
  ctx.fillStyle = isDark ? '#F9FAFB' : NAME_COLOR;
  nameLines.forEach((line, i) => {
    const ly = textTop + NAME_LINE_H / 2 + i * NAME_LINE_H;
    ctx.fillText(line, textX, ly);
    if (look.strike) drawStrike(ctx, textX, ly, ctx.measureText(line).width, ctx.fillStyle as string, centered);
  });
  const secondY = textTop + nameLines.length * NAME_LINE_H + ROW_GAP + SECOND_LINE_H / 2;
  if (secondY <= bottom) {
    ctx.font = SECOND_FONT;
    ctx.fillStyle = muted;
    drawSecondLine(ctx, node, shape, textX, secondY, maxW, centered);
  }
  ctx.restore();

  drawStateOverlays(ctx, box, SHAPE_RING_RADIUS, opts, {
    slotRight: box.x + box.w - 10,
    slotY: box.y + Math.min(14, box.h / 2),
  });
}

/**
 * Icon style (§5A.1b): an icon tile (48 / 64 / 96 from size S / M / L) centred at the top of the
 * node box, the name always below it (13/600, centred, up to 2 lines) and an optional technology
 * line. The label never overlaps the tile; `nodeBounds` covers both.
 */
export function drawIconNode(
  ctx: CanvasRenderingContext2D,
  node: ArchNode,
  icons: NodeIconSource,
  opts: NodePaintFlags,
): void {
  const { isDark } = opts;
  const notation = notationFor(node.kind);
  const tile = iconTileSize(node);
  const tx = node.x + (node.w - tile) / 2;
  const ty = node.y;
  const cx = node.x + node.w / 2;
  const radius = (10 * tile) / 64;
  const notConnected = node.isOrphan === true;
  const surface = isDark ? '#191D25' : '#FFFFFF';
  const look = statusLook(opts.status, isDark);
  const color = look.stroke ?? (notConnected ? '#8A93A3' : node.stroke || notation.color);
  const stroke = opts.pending ? (isDark ? '#F0B86E' : '#98600A') : color;
  const slot = iconSlotFor(node, opts.iconEntries);

  ctx.save();
  ctx.globalAlpha = look.alpha;
  const hoverShadow = (opts.hovered === true || opts.status?.hovered === true) && !opts.pending && !opts.selected;
  ctx.shadowColor = opts.pending ? '#F0B86E' : hoverShadow ? (isDark ? 'rgba(0,0,0,.45)' : 'rgba(16,24,40,.12)') : 'transparent';
  ctx.shadowBlur = opts.pending ? 8 : hoverShadow ? 12 : 0;
  ctx.shadowOffsetY = hoverShadow ? 4 : 0;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tile, tile, radius);
  ctx.fillStyle = look.fill ?? node.fill ?? surface;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Icon inside the tile: image 62.5 % (40 of 64), glyph tinted, emoji at the same size.
  if (slot.kind === 'glyph') {
    drawKindGlyph(ctx, notation.glyph, tx, ty, tile, notConnected ? '#5B6474' : notation.color, notConnected ? '#F1F2F5' : glyphTileTint(notation.color), {
      radius,
      glyphScale: (tile / 28) * 0.7,
    });
  } else if (slot.kind !== 'none') {
    const inner = Math.round(tile * 0.625);
    drawCardIcon(ctx, slot, icons, tx + (tile - inner) / 2, ty + (tile - inner) / 2, notation.glyph, notation.color, glyphTileTint(notation.color), inner, inner);
  }
  ctx.beginPath();
  ctx.roundRect(tx, ty, tile, tile, radius);
  ctx.setLineDash(notConnected || node.borderDashed === true || look.dashed || notation.baseShape === 'card-dashed' ? [6, 4] : []);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = node.strokeWidth ?? (opts.pending ? 2 : 1.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label below the tile, never overlapping it.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = NAME_FONT;
  ctx.fillStyle = isDark ? '#F9FAFB' : NAME_COLOR;
  const nameLines = wrapText(ctx, node.label ?? '', ICON_LABEL_MAX_W, 2);
  const labelTop = ty + tile + ICON_LABEL_GAP;
  nameLines.forEach((line, i) => {
    const ly = labelTop + ICON_NAME_LINE_H / 2 + i * ICON_NAME_LINE_H;
    ctx.fillText(line, cx, ly);
    if (look.strike) drawStrike(ctx, cx, ly, ctx.measureText(line).width, ctx.fillStyle as string, true);
  });
  const technology = (node.technology ?? node.tag ?? '').trim();
  if (technology) {
    ctx.font = SECOND_FONT;
    ctx.fillStyle = isDark ? '#9CA3AF' : MUTED_COLOR;
    ctx.fillText(
      ellipsizeToWidth(ctx, technology, ICON_LABEL_MAX_W),
      cx,
      labelTop + nameLines.length * ICON_NAME_LINE_H + ICON_TECH_LINE_H / 2,
    );
  }
  ctx.restore();

  // Selection around tile + label (no resize handles: the size is S / M / L); ports on the tile.
  const tileBox: Box = { x: tx, y: ty, w: tile, h: tile };
  const bounds: Box = nodeBounds(node);
  if (opts.selected) {
    drawStateOverlays(ctx, bounds, 8, { ...opts, status: { ...opts.status, multiSelected: true } }, {
      slotRight: tx + tile - 4,
      slotY: ty + 10,
    });
  } else {
    drawStateOverlays(ctx, tileBox, radius, opts, { slotRight: tx + tile - 4, slotY: ty + 10 });
  }
}

/** Inline editor field heights (DisplayStyles.dc.html "Inline editing": name 22, technology 20, gap 4). */
const EDIT_NAME_H = 22;
const EDIT_TECH_H = 20;
const EDIT_GAP = 4;

/**
 * World-space rectangles of the name and technology lines, where the inline editor (R1-E02-T06)
 * overlays inputs. Follows each style's text layout: card text column, shape content rect, or the
 * centred label under an icon tile.
 */
export function inlineEditRects(node: ArchNode, entries: IconEntry[] | undefined): { name: Box; technology: Box } {
  const style = effectiveNodeStyle(node);
  const stack = (x: number, y: number, w: number) => ({
    name: { x, y, w, h: EDIT_NAME_H },
    technology: { x, y: y + EDIT_NAME_H + EDIT_GAP, w, h: EDIT_TECH_H },
  });
  if (style === 'icon') {
    const tile = iconTileSize(node);
    return stack(node.x + node.w / 2 - ICON_LABEL_MAX_W / 2, node.y + tile + ICON_LABEL_GAP, ICON_LABEL_MAX_W);
  }
  const box = cardBox(node);
  const shape = notationFor(node.kind).baseShape;
  if (style === 'shape' && !isCardFamily(shape)) {
    const content = shapeContent(shape, box);
    const slot = content.icon ? iconSlotFor(node, entries) : ({ kind: 'none' } as const);
    const iconW = slot.kind === 'none' ? 0 : SHAPE_ICON + SHAPE_GAP;
    const h = EDIT_NAME_H + EDIT_GAP + EDIT_TECH_H;
    const y = content.vAlign === 'middle' ? content.rect.y + Math.max(0, (content.rect.h - h) / 2) : content.rect.y;
    return stack(content.rect.x + iconW, y, Math.max(40, content.rect.w - iconW));
  }
  const textX = cardTextX(node, entries);
  return stack(textX, box.y + 12, Math.max(40, box.x + box.w - 12 - textX));
}
