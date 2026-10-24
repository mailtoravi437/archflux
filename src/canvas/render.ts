/**
 * Canvas render passes — the single source of truth for how ArchFlux draws
 * nodes, edges, ink, text, and review pins on a 2D context.
 *
 * Consumers:
 *  - CanvasScreen draw() (single-canvas main editor)
 *  - CanvasEngine (multi-layer engine; composition is in CanvasEngine)
 *
 * Pure: no React, no store access. Passes take a plain options bag with the
 * palette/selection flags they need. Vendor-icon loading is abstracted behind
 * NodeIconSource so each consumer can hook its own cache and repaint logic.
 */
import type { ArchEdge, ArchNode, FreeText } from '../types';
import { edgePoints, type ConnectorCurve } from '../canvasGeometry';

// ==================== ADAPTERS ====================

/**
 * Vendor icon bridge. `get` returns a possibly-still-loading image (the pass
 * only draws when `complete`); `ensure` starts a load if not yet started.
 */
export interface NodeIconSource {
  get(src: string): HTMLImageElement | null;
  ensure(src: string): void;
}

export interface CanvasPaletteFlags {
  isDark: boolean;
}

// ==================== EDGES ====================

export interface EdgePaintFlags extends CanvasPaletteFlags {
  selected: boolean;
  /** Routing settings forwarded to the shared edgePoints helper. */
  orthogonal: boolean;
  curve: ConnectorCurve;
}

/**
 * One connector: body, arrowheads per `arrow` mode, label + protocol tag.
 * Colors and dashes match the historical CanvasScreen output exactly.
 */
export function drawEdgePass(
  ctx: CanvasRenderingContext2D,
  edge: ArchEdge,
  nodes: ArchNode[],
  opts: EdgePaintFlags,
): void {
  const pts = edgePoints(edge, nodes ?? [], opts.orthogonal, opts.curve);
  if (!pts) return;
  const { isDark } = opts;
  const isEdgeSelected = opts.selected;
  const startX = pts[0].x;
  const startY = pts[0].y;
  const endX = pts[pts.length - 1].x;
  const endY = pts[pts.length - 1].y;

  ctx.save();
  ctx.strokeStyle = isEdgeSelected ? (isDark ? '#8B83FF' : '#635BFF') : (isDark ? '#4B5363' : '#C7CDD7');
  ctx.lineWidth = isEdgeSelected ? 3 : 2;
  if (isEdgeSelected) {
    ctx.shadowColor = '#635BFF';
    ctx.shadowBlur = 8;
  }
  const lineStyle = edge.lineStyle ?? (edge.dashed ? 'dashed' : 'solid');
  if (edge.isDangling || lineStyle === 'dashed') ctx.setLineDash([4, 4]);
  else if (lineStyle === 'dotted') ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  const headlen = 8;
  const arrowMode = edge.arrow ?? 'end';
  const drawHead = (hx: number, hy: number, angle: number): void => {
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - headlen * Math.cos(angle - Math.PI / 6), hy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(hx - headlen * Math.cos(angle + Math.PI / 6), hy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };
  const prev = pts[pts.length - 2] ?? pts[0];
  const angle = Math.atan2(endY - prev.y, endX - prev.x);
  ctx.fillStyle = isEdgeSelected ? '#635BFF' : (isDark ? '#9CA3AF' : '#6B7280');
  if (arrowMode !== 'none') drawHead(endX, endY, angle);
  if (arrowMode === 'both') {
    const first = pts[1] ?? pts[0];
    drawHead(startX, startY, Math.atan2(startY - first.y, startX - first.x));
  }
  if (edge.label) {
    ctx.font = "600 13px 'Caveat', cursive";
    ctx.fillStyle = isEdgeSelected ? (isDark ? '#93C5FD' : '#1D4ED8') : isDark ? '#D1D5DB' : '#6B7280';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(edge.label, (startX + endX) / 2 - 15, (startY + endY) / 2 - 8);
  }
  ctx.restore();
}

// ==================== NODES ====================

export interface NodePaintFlags extends CanvasPaletteFlags {
  selected: boolean;
  /** Connector source node (amber ring + glow). */
  pending: boolean;
  /** Show blue connector ports (active when the connector tool is armed). */
  showPorts: boolean;
}

/**
 * One node in any supported shape: rectangle (header card), rounded,
 * cylinder (database), logo (icon-only). Culled by the caller.
 */
export function drawNodePass(
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
  const strokeColor = isPending ? (isDark ? '#F0B86E' : '#98600A') : isSelected ? (isDark ? '#8B83FF' : '#635BFF') : (node.stroke ?? (isDark ? '#4B5363' : '#C7CDD7'));
  const lineWidth = node.strokeWidth ?? (isSelected || isPending ? 2 : 1);
  const shadowColor = isPending ? '#F0B86E' : isSelected ? '#635BFF' : 'transparent';
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
      ctx.strokeStyle = (isDark ? '#8B83FF' : '#635BFF');
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

  // Connector ports (only for non-logo shapes)
  if (shape !== 'logo' && opts.showPorts) {
    const ports = [
      { x: node.x + node.w / 2, y: node.y },
      { x: node.x + node.w / 2, y: node.y + node.h },
      { x: node.x, y: node.y + node.h / 2 },
      { x: node.x + node.w, y: node.y + node.h / 2 },
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
  ctx.fillText(ellipsize(node.label, 20), opts.textX, node.y + opts.labelY);
  ctx.font = "11px 'Inter', -apple-system, sans-serif";
  ctx.fillStyle = opts.isDark ? '#9CA3AF' : '#6B7280';
  ctx.fillText(ellipsize(node.tag, 22), opts.textX, node.y + opts.tagY);
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

// ==================== INK / TEXT / PINS ====================

/** One freehand stroke (single point renders as a round dot). */
export function drawInkPass(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  width: number,
  selected: boolean,
): void {
  if (pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = selected ? '#635BFF' : color;
  ctx.fillStyle = selected ? '#635BFF' : color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (selected) {
    ctx.shadowColor = '#635BFF';
    ctx.shadowBlur = 8;
  }
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Free-standing text label (multi-line, background pill, selection glow). */
export function drawFreeTextPass(
  ctx: CanvasRenderingContext2D,
  t: FreeText,
  selected: boolean,
  isDark: boolean,
): void {
  const lines = t.text.split('\n');
  const lh = t.fontSize * 1.3;
  ctx.save();
  const fam = t.fontFamily ?? 'Caveat';
  const generic = fam === 'Fira Code' ? 'monospace' : fam === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive';
  ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '600'} ${t.fontSize}px '${fam}', ${generic}`;
  // Background pill behind the whole block.
  if (t.fill && t.fill !== 'transparent') {
    let maxW = 0;
    lines.forEach((line) => { maxW = Math.max(maxW, ctx.measureText(line).width); });
    const pad = 8;
    const bw = maxW + pad * 2;
    const bh = lines.length * lh + pad;
    const bx = t.x - pad;
    const by = t.y - t.fontSize - pad / 2;
    ctx.fillStyle = t.fill;
    ctx.beginPath();
    const rr = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    if (typeof rr.roundRect === 'function') rr.roundRect(bx, by, bw, bh, 8);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    if (t.border) {
      ctx.strokeStyle = selected ? '#635BFF' : t.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.fillStyle = selected ? '#635BFF' : t.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (selected) {
    ctx.shadowColor = '#635BFF';
    ctx.shadowBlur = 8;
  }
  lines.forEach((line, i) => {
    ctx.fillText(line, t.x, t.y + i * lh);
  });
  ctx.restore();
  void isDark;
}

/** Review-thread pin at a node's top-right (amber open / green resolved). */
export function drawThreadPinPass(
  ctx: CanvasRenderingContext2D,
  node: { x: number; y: number; w: number; h: number },
  opts: { resolved: boolean; isDark: boolean },
): void {
  const cx = node.x + node.w + 6;
  const cy = node.y - 6;
  ctx.save();
  ctx.fillStyle = opts.resolved ? '#16A34A' : '#F59E0B';
  ctx.strokeStyle = opts.isDark ? '#1F2937' : '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "bold 10px 'Patrick Hand', cursive";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.resolved ? '✓' : '!', cx, cy + 0.5);
  ctx.restore();
}
