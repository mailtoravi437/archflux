/**
 * Pure canvas geometry helpers: resize handles, alignment snapping, minimap
 * transforms, node size clamps. No React, no canvas — fully unit-testable.
 * CanvasScreen wires these into pointer handlers and the draw pass.
 */

export type ResizeHandleId = 'e' | 's' | 'se';

export interface ResizeHandle {
  id: ResizeHandleId;
  x: number;
  y: number;
  /** World-unit edge length (constant screen size via zoom). */
  size: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_NODE_W = 100;
export const MIN_NODE_H = 50;
export const MAX_NODE_W = 400;
export const MAX_NODE_H = 200;

/** E / S / SE grips on a node's border (12px on screen). Skipped for multi-select. */
export function resizeHandles(node: Box, zoom: number): ResizeHandle[] {
  const size = 12 / Math.max(zoom, 0.1);
  return [
    { id: 'e', x: node.x + node.w, y: node.y + node.h / 2, size },
    { id: 's', x: node.x + node.w / 2, y: node.y + node.h, size },
    { id: 'se', x: node.x + node.w, y: node.y + node.h, size },
  ];
}

/**
 * Grip hit test with a ≥24px screen hit area (CAN-R11) so touch and coarse
 * pointers can grab the 12px visual handle.
 */
export function hitResizeHandle(px: number, py: number, node: Box, zoom: number): ResizeHandleId | null {
  const tol = Math.max(12, 24 / Math.max(zoom, 0.1)) / 2;
  for (const h of resizeHandles(node, zoom)) {
    if (Math.abs(px - h.x) <= tol && Math.abs(py - h.y) <= tol) return h.id;
  }
  return null;
}

export function clampNodeSize(w: number, h: number): { w: number; h: number } {
  return {
    w: Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, w)),
    h: Math.min(MAX_NODE_H, Math.max(MIN_NODE_H, h)),
  };
}

export interface GuideLine {
  /** True = vertical line at x=at; false = horizontal line at y=at. */
  vertical: boolean;
  at: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

/**
 * Snap a moving box's top-left to nearby edges of other boxes.
 * Compares left/center-x/right and top/center-y/bottom anchors; applies the
 * smallest correction per axis within `threshold` (world units, 0 disables).
 */
export function snapNode(moving: Box, others: Box[], threshold: number): SnapResult {
  if (threshold <= 0 || others.length === 0) return { x: moving.x, y: moving.y, guides: [] };
  const myX = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const myY = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  let bestDx = 0;
  let bestDy = 0;
  let guideX: number | null = null;
  let guideY: number | null = null;
  for (const o of others) {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w];
    const oy = [o.y, o.y + o.h / 2, o.y + o.h];
    for (const a of myX) {
      for (const b of ox) {
        const d = b - a;
        if (Math.abs(d) <= threshold && (guideX === null || Math.abs(d) < Math.abs(bestDx))) {
          bestDx = d;
          guideX = b;
        }
      }
    }
    for (const a of myY) {
      for (const b of oy) {
        const d = b - a;
        if (Math.abs(d) <= threshold && (guideY === null || Math.abs(d) < Math.abs(bestDy))) {
          bestDy = d;
          guideY = b;
        }
      }
    }
  }
  const guides: GuideLine[] = [];
  if (guideX !== null) guides.push({ vertical: true, at: guideX });
  if (guideY !== null) guides.push({ vertical: false, at: guideY });
  return { x: moving.x + bestDx, y: moving.y + bestDy, guides };
}

export interface MinimapTransform {
  /** World-to-minimap scale. */
  s: number;
  ox: number;
  oy: number;
  contentW: number;
  contentH: number;
}

/** Fit world content bounds into a vw×vh minimap with padding. */
export function minimapTransform(
  boxes: { x: number; y: number; w: number; h: number }[],
  vw: number,
  vh: number,
  pad = 8,
): MinimapTransform {
  if (boxes.length === 0) return { s: 1, ox: pad, oy: pad, contentW: 0, contentH: 0 };
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const s = Math.min((vw - pad * 2) / contentW, (vh - pad * 2) / contentH);
  return {
    s,
    ox: (vw - contentW * s) / 2 - minX * s,
    oy: (vh - contentH * s) / 2 - minY * s,
    contentW,
    contentH,
  };
}

export function worldToMini(x: number, y: number, t: MinimapTransform): { x: number; y: number } {
  return { x: x * t.s + t.ox, y: y * t.s + t.oy };
}

export function miniToWorld(x: number, y: number, t: MinimapTransform): { x: number; y: number } {
  return { x: (x - t.ox) / t.s, y: (y - t.oy) / t.s };
}

// ==================== EDGE GEOMETRY (shared draw + hit-test + export) ========

export interface Pt {
  x: number;
  y: number;
}

/** Curve style for connector routing (also a settings key). */
export type ConnectorCurve = 'orthogonal' | 'straight' | 'bezier';

/**
 * Shared connector geometry: polyline points used by the canvas draw pass,
 * hit-testing, minimap, and export. Sides are chosen by relative node
 * position: right→left, bottom→top, fallback left→right. Dangling edges use
 * targetCoords. Bezier sampling is numerically guarded (falls back to the
 * anchor when a control point overflows).
 */
export function edgePoints(
  edge: EdgeGeometryInput,
  nodes: { id: string; x: number; y: number; w: number; h: number }[],
  orthogonal: boolean,
  curve: ConnectorCurve = 'orthogonal',
): Pt[] | null {
  const fromNode = nodes.find((n) => n.id === edge.from);
  if (!fromNode) return null;
  let startX = fromNode.x + fromNode.w;
  let startY = fromNode.y + fromNode.h / 2;
  let endX: number;
  let endY: number;
  if (edge.to) {
    const toNode = nodes.find((n) => n.id === edge.to);
    if (!toNode) return null;
    if (toNode.x > fromNode.x + fromNode.w) {
      startX = fromNode.x + fromNode.w;
      startY = fromNode.y + fromNode.h / 2;
      endX = toNode.x;
      endY = toNode.y + toNode.h / 2;
    } else if (toNode.y > fromNode.y + fromNode.h) {
      startX = fromNode.x + fromNode.w / 2;
      startY = fromNode.y + fromNode.h;
      endX = toNode.x + toNode.w / 2;
      endY = toNode.y;
    } else {
      startX = fromNode.x;
      startY = fromNode.y + fromNode.h / 2;
      endX = toNode.x + toNode.w;
      endY = toNode.y + toNode.h / 2;
    }
  } else if (edge.targetCoords) {
    startX = fromNode.x + fromNode.w / 2;
    startY = fromNode.y + fromNode.h;
    endX = edge.targetCoords.x ?? 0;
    endY = edge.targetCoords.y ?? 0;
  } else {
    return null;
  }
  if (curve === 'bezier') {
    const dx = endX - startX;
    const c1x = startX + (dx ?? 0) * 0.4;
    const c1y = startY;
    const c2x = endX - (dx ?? 0) * 0.4;
    const c2y = endY;
    const steps = 16;
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const bx = mt * mt * mt * startX + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * endX;
      const by = mt * mt * mt * startY + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * endY;
      pts.push({
        x: isFinite(bx) ? bx : startX,
        y: isFinite(by) ? by : startY,
      });
    }
    return pts;
  }
  if (orthogonal && !edge.isDangling) {
    const midX = (startX + endX) / 2;
    return [
      { x: startX, y: startY },
      { x: isFinite(midX) ? midX : startX, y: startY },
      { x: isFinite(midX) ? midX : startX, y: isFinite(endY) ? endY : startY },
      { x: isFinite(endX) ? endX : 0, y: isFinite(endY) ? endY : 0 },
    ];
  }
  return [
    { x: isFinite(startX) ? startX : 0, y: isFinite(startY) ? startY : 0 },
    { x: isFinite(endX) ? endX : 0, y: isFinite(endY) ? endY : 0 },
  ];
}

/** Only the geometry fields of ArchEdge that edgePoints reads. */
export interface EdgeGeometryInput {
  from: string;
  to?: string | null;
  targetCoords?: { x: number; y: number };
  isDangling?: boolean;
}

/** Distance from a point to a segment (classic rule, lenSq degenerate case). */
export function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
