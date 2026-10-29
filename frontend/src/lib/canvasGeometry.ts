/**
 * Pure canvas geometry helpers: resize handles, alignment snapping, minimap
 * transforms, node size clamps. No React, no canvas — fully unit-testable.
 * CanvasScreen wires these into pointer handlers and the draw pass.
 */

import type { ArchNode, ElementSize } from '../types';

export type ResizeHandleId = 'nw' | 'ne' | 'sw' | 'se';

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

/**
 * R1-E14-T02: the four corner handles the renderer draws (`drawSelectionHandles`), 8 px on
 * screen. Skipped for multi-select.
 */
export function resizeHandles(node: Box, zoom: number): ResizeHandle[] {
  const size = 8 / Math.max(zoom, 0.1);
  return [
    { id: 'nw', x: node.x, y: node.y, size },
    { id: 'ne', x: node.x + node.w, y: node.y, size },
    { id: 'sw', x: node.x, y: node.y + node.h, size },
    { id: 'se', x: node.x + node.w, y: node.y + node.h, size },
  ];
}

/**
 * Corner hit test with a 24 px screen hit area (CAN-R11) so touch and coarse
 * pointers can grab the 8 px visual handle.
 */
export function hitResizeHandle(px: number, py: number, node: Box, zoom: number): ResizeHandleId | null {
  const tol = 24 / Math.max(zoom, 0.1) / 2;
  for (const h of resizeHandles(node, zoom)) {
    if (Math.abs(px - h.x) <= tol && Math.abs(py - h.y) <= tol) return h.id;
  }
  return null;
}

/**
 * New box for a corner drag: the opposite corner stays put, the size is clamped, and Shift
 * (`keepRatio`) locks the grab-time aspect ratio.
 */
export function resizeFromCorner(start: Box, handle: ResizeHandleId, dw: number, dh: number, keepRatio: boolean): Box {
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';
  let w = start.w + (west ? -dw : dw);
  let h = start.h + (north ? -dh : dh);
  if (keepRatio && start.w > 0 && start.h > 0) h = w / (start.w / start.h);
  const c = clampNodeSize(w, h);
  w = Math.round(c.w);
  h = Math.round(c.h);
  return {
    x: west ? start.x + start.w - w : start.x,
    y: north ? start.y + start.h - h : start.y,
    w,
    h,
  };
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
 * id → node index per nodes array (keyed on the array identity; the store replaces arrays immutably,
 * and `length` guards an in-place push). Turns the per-edge `find` (O(nodes)) into O(1), which
 * dominated pan and zoom at 5,000 elements and 6,000 edges (R1-BUG-09).
 */
const nodeIndexCache = new WeakMap<object, { length: number; byId: Map<string, GeometryNode> }>();
function nodeIndex(nodes: GeometryNode[]): Map<string, GeometryNode> {
  const hit = nodeIndexCache.get(nodes);
  if (hit && hit.length === nodes.length) return hit.byId;
  const byId = new Map<string, GeometryNode>();
  // First match wins, like Array.find.
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  nodeIndexCache.set(nodes, { length: nodes.length, byId });
  return byId;
}

/**
 * Shared connector geometry: polyline points used by the canvas draw pass,
 * hit-testing, minimap, and export. Sides are chosen by relative node
 * position: right→left, bottom→top, fallback left→right. Dangling edges use
 * targetCoords. Bezier sampling is numerically guarded (falls back to the
 * anchor when a control point overflows).
 */
export function edgePoints(
  edge: EdgeGeometryInput,
  nodes: GeometryNode[],
  orthogonal: boolean,
  curve: ConnectorCurve = 'orthogonal',
): Pt[] | null {
  const byId = nodes.length > 32 ? nodeIndex(nodes) : null;
  const fromNode = byId ? byId.get(edge.from) : nodes.find((n) => n.id === edge.from);
  if (!fromNode) return null;
  let toNode: GeometryNode | null = null;
  if (edge.to) {
    toNode = (byId ? byId.get(edge.to) : nodes.find((n) => n.id === edge.to)) ?? null;
    if (!toNode) return null;
  } else if (!edge.targetCoords) {
    return null;
  }
  // Ports sit on `nodeBounds` (icon style: tile + label), so a ported end uses those bounds.
  const fromBox = edge.fromPort ? portBox(fromNode) : fromNode;
  const toBox = toNode ? (edge.toPort ? portBox(toNode) : toNode) : null;
  return edgePath(edge, fromBox, toBox, { orthogonal, curve });
}

/** Node fields edge geometry reads; the display fields are optional (they only matter for ports). */
export type GeometryNode = Box & { id: string } & Partial<Pick<ArchNode, 'displayStyle' | 'shape' | 'size' | 'label' | 'technology' | 'tag'>>;

function portBox(n: GeometryNode): Box {
  return nodeBounds({ ...n, label: n.label ?? '', tag: n.tag ?? '' });
}

// ==================== PORTS (R1-E04-T05) ====================

export type PortSide = 'n' | 'e' | 's' | 'w';
export const PORT_SIDES: readonly PortSide[] = ['n', 'e', 's', 'w'];
/** Port dot diameter on screen, px. */
export const PORT_SIZE = 8;

/** Mid-edge point of `box` for `side`. */
export function portPoint(box: Box, side: PortSide): Pt {
  switch (side) {
    case 'e': return { x: box.x + box.w, y: box.y + box.h / 2 };
    case 'w': return { x: box.x, y: box.y + box.h / 2 };
    case 's': return { x: box.x + box.w / 2, y: box.y + box.h };
    default: return { x: box.x + box.w / 2, y: box.y };
  }
}

/** The four port points of a node, on `nodeBounds`. */
export function nodePorts(node: GeometryNode): { side: PortSide; x: number; y: number }[] {
  const b = portBox(node);
  return PORT_SIDES.map((side) => ({ side, ...portPoint(b, side) }));
}

/** Port of `node` nearest to the world point (ties go to n, e, s, w order). */
export function nearestPort(node: GeometryNode, x: number, y: number): PortSide {
  let best: PortSide = 'n';
  let bestD = Infinity;
  for (const p of nodePorts(node)) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p.side;
    }
  }
  return best;
}

/** Port whose dot (plus a small grab margin) contains the world point; null when none. */
export function hitPort(node: GeometryNode, x: number, y: number, zoom: number): PortSide | null {
  const r = (PORT_SIZE / 2 + 4) / Math.max(zoom, 0.1);
  let best: PortSide | null = null;
  let bestD = r;
  for (const p of nodePorts(node)) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = p.side;
    }
  }
  return best;
}

const PORT_TO_SIDE: Record<PortSide, 't' | 'r' | 'b' | 'l'> = { n: 't', e: 'r', s: 'b', w: 'l' };

/** Route between two port-anchored points. `a`/`b` sides are the leaving/entering sides. */
function portRoute(a: Pt, aSide: Side, b: Pt, bSide: Side | null, orthogonal: boolean, curve: ConnectorCurve): Pt[] {
  if (curve === 'bezier') {
    const pts: Pt[] = [];
    sampleBezier(a, b, pts, true);
    return pts;
  }
  if (!orthogonal) return [a, b];
  const aH = aSide === 'l' || aSide === 'r';
  const bH = bSide === null ? aH : bSide === 'l' || bSide === 'r';
  if (aH && bH) {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (!aH && !bH) {
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  return aH ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}

type Side = 'l' | 'r' | 't' | 'b';

function sideAnchor(box: Box, side: Side): Pt {
  switch (side) {
    case 'r': return { x: box.x + box.w, y: box.y + box.h / 2 };
    case 'l': return { x: box.x, y: box.y + box.h / 2 };
    case 'b': return { x: box.x + box.w / 2, y: box.y + box.h };
    default: return { x: box.x + box.w / 2, y: box.y };
  }
}

/** Side of `box` that faces point `p` (horizontal when the offset is wider than tall). */
function sideToward(box: Box, p: Pt): Side {
  const dx = p.x - (box.x + box.w / 2);
  const dy = p.y - (box.y + box.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l';
  return dy >= 0 ? 'b' : 't';
}

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

function sampleBezier(a: Pt, b: Pt, out: Pt[], includeFirst: boolean): void {
  const dx = b.x - a.x;
  const c1x = a.x + dx * 0.4;
  const c2x = b.x - dx * 0.4;
  const steps = 16;
  for (let i = includeFirst ? 0 : 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const bx = mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x;
    const by = mt * mt * mt * a.y + 3 * mt * mt * t * a.y + 3 * mt * t * t * b.y + t * t * t * b.y;
    out.push({ x: finite(bx, a.x), y: finite(by, a.y) });
  }
}

/**
 * R1-E04-T03: connector polyline from `from` to `to` (or `edge.targetCoords` when `to` is null).
 * Without waypoints this is the automatic route. With waypoints the path runs from-port, waypoint 1
 * ... waypoint n, to-port; the ports are the sides facing the nearest waypoint, so moving a node
 * re-routes only the first and last segments. Orthogonal mode inserts an elbow between consecutive
 * points; bezier mode curves each leg; straight is the polyline itself.
 */
export function edgePath(
  edge: EdgeGeometryInput,
  from: Box,
  to: Box | null,
  opts: { orthogonal: boolean; curve: ConnectorCurve },
): Pt[] {
  const { orthogonal, curve } = opts;
  const wps = (edge.waypoints ?? []).filter((w) => Number.isFinite(w.x) && Number.isFinite(w.y));
  const dangling = !to;
  const target: Pt | null = to ? null : { x: finite(edge.targetCoords?.x ?? 0, 0), y: finite(edge.targetCoords?.y ?? 0, 0) };

  if (wps.length > 0) {
    const startSide = edge.fromPort ? PORT_TO_SIDE[edge.fromPort] : sideToward(from, wps[0]);
    const start = sideAnchor(from, startSide);
    let endSide: Side | null = null;
    let end: Pt;
    if (to) {
      endSide = edge.toPort ? PORT_TO_SIDE[edge.toPort] : sideToward(to, wps[wps.length - 1]);
      end = sideAnchor(to, endSide);
    } else {
      end = target as Pt;
    }
    const through: Pt[] = [start, ...wps.map((w) => ({ x: w.x, y: w.y })), end];
    if (curve === 'bezier') {
      const out: Pt[] = [];
      for (let i = 1; i < through.length; i++) sampleBezier(through[i - 1], through[i], out, i === 1);
      return out;
    }
    if (orthogonal && !edge.isDangling && !dangling) {
      const out: Pt[] = [through[0]];
      let horizontalFirst = startSide === 'l' || startSide === 'r';
      for (let i = 1; i < through.length; i++) {
        const a = through[i - 1];
        const b = through[i];
        if (i === through.length - 1 && endSide) horizontalFirst = endSide === 't' || endSide === 'b';
        if (a.x !== b.x && a.y !== b.y) out.push(horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
        out.push(b);
      }
      return out;
    }
    return through;
  }

  if (edge.fromPort || edge.toPort) {
    const fromCentre = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const toCentre: Pt = to ? { x: to.x + to.w / 2, y: to.y + to.h / 2 } : (target as Pt);
    const aSide: Side = edge.fromPort ? PORT_TO_SIDE[edge.fromPort] : sideToward(from, toCentre);
    const a = sideAnchor(from, aSide);
    if (to) {
      const bSide: Side = edge.toPort ? PORT_TO_SIDE[edge.toPort] : sideToward(to, fromCentre);
      return portRoute(a, aSide, sideAnchor(to, bSide), bSide, orthogonal && !edge.isDangling, curve);
    }
    return portRoute(a, aSide, target as Pt, null, orthogonal && !edge.isDangling, curve);
  }

  let startX = from.x + from.w;
  let startY = from.y + from.h / 2;
  let endX: number;
  let endY: number;
  if (to) {
    if (to.x > from.x + from.w) {
      startX = from.x + from.w;
      startY = from.y + from.h / 2;
      endX = to.x;
      endY = to.y + to.h / 2;
    } else if (to.y > from.y + from.h) {
      startX = from.x + from.w / 2;
      startY = from.y + from.h;
      endX = to.x + to.w / 2;
      endY = to.y;
    } else {
      startX = from.x;
      startY = from.y + from.h / 2;
      endX = to.x + to.w;
      endY = to.y + to.h / 2;
    }
  } else {
    startX = from.x + from.w / 2;
    startY = from.y + from.h;
    endX = (target as Pt).x;
    endY = (target as Pt).y;
  }
  if (curve === 'bezier') {
    const pts: Pt[] = [];
    sampleBezier({ x: startX, y: startY }, { x: endX, y: endY }, pts, true);
    return pts;
  }
  if (orthogonal && !edge.isDangling) {
    const midX = (startX + endX) / 2;
    return [
      { x: startX, y: startY },
      { x: finite(midX, startX), y: startY },
      { x: finite(midX, startX), y: finite(endY, startY) },
      { x: finite(endX, 0), y: finite(endY, 0) },
    ];
  }
  return [
    { x: finite(startX, 0), y: finite(startY, 0) },
    { x: finite(endX, 0), y: finite(endY, 0) },
  ];
}

/**
 * Nearest segment of `path` within `tol` of (px, py): `index` is the segment's start point and `t`
 * (0..1) the position along it. Null when nothing is within `tol`.
 */
export function hitEdgeSegment(path: Pt[], px: number, py: number, tol: number): { index: number; t: number } | null {
  let best: { index: number; t: number } | null = null;
  let bestD = tol;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const d = distToSegment(px, py, a, b);
    if (d > bestD) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
    best = { index: i, t };
    bestD = d;
  }
  return best;
}

/** Only the geometry fields of ArchEdge that edgePoints reads. */
export interface EdgeGeometryInput {
  from: string;
  to?: string | null;
  targetCoords?: { x: number; y: number };
  isDangling?: boolean;
  /** R1-E04-T03: user-placed bends, world coords. */
  waypoints?: { x: number; y: number }[];
  /** R1-E04-T05: sides the edge leaves / enters. Null or unset = automatic. */
  fromPort?: PortSide | null;
  toPort?: PortSide | null;
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

// ── R1-E02-T04 · Icon style layout and node bounds ──

/** What the renderer draws for a node: an explicit style, legacy `shape: 'logo'` = icon, else legacy. */
export type EffectiveNodeStyle = 'icon' | 'card' | 'shape' | 'legacy';

export function effectiveNodeStyle(node: Pick<ArchNode, 'displayStyle' | 'shape'>): EffectiveNodeStyle {
  if (node.displayStyle) return node.displayStyle;
  return node.shape === 'logo' ? 'icon' : 'legacy';
}

/** The display style every node shares, or null when they differ or any node is unstyled (mixed selection). */
export function sharedNodeStyle(nodes: readonly Pick<ArchNode, 'displayStyle' | 'shape'>[]): 'icon' | 'card' | 'shape' | null {
  let shared: 'icon' | 'card' | 'shape' | null = null;
  for (const n of nodes) {
    const style = effectiveNodeStyle(n);
    if (style === 'legacy') return null;
    if (shared !== null && shared !== style) return null;
    shared = style;
  }
  return shared;
}

/** Icon tile edge by element size (UI_REVAMP_SPEC §5A.1b): S 48, M 64, L 96. */
export const ICON_TILE: Record<ElementSize, number> = { S: 48, M: 64, L: 96 };
/** Gap between the icon tile and the name below it. */
export const ICON_LABEL_GAP = 6;
export const ICON_NAME_LINE_H = 17;
export const ICON_TECH_LINE_H = 13;
/** Widest the label under an icon grows before the name wraps (DisplayStyles.dc.html: 150 px). */
export const ICON_LABEL_MAX_W = 150;
/** Rough label glyph width, only for bounds; the renderer measures the real text. */
const LABEL_CHAR_W = 7;

/**
 * Icon tile edge for a node: `size` S/M/L when set, otherwise the node's own box clamped to 48–96
 * (legacy `logo` nodes carry a free w/h).
 */
export function iconTileSize(node: Pick<ArchNode, 'size' | 'w' | 'h'>): number {
  if (node.size && ICON_TILE[node.size]) return ICON_TILE[node.size];
  const edge = Math.min(node.w, node.h);
  if (!Number.isFinite(edge) || edge <= 0) return ICON_TILE.M;
  return Math.max(ICON_TILE.S, Math.min(ICON_TILE.L, edge));
}

/** Number of name lines (1–2) the icon label needs, estimated from the text length. */
function estimatedNameLines(label: string): number {
  return Math.max(1, Math.min(2, Math.ceil((label.length * LABEL_CHAR_W) / ICON_LABEL_MAX_W)));
}

/**
 * Box a node occupies for hit testing and selection. Card and shape styles: the node box. Icon
 * style: the union of the icon tile (centred horizontally in the node box, at its top) and the
 * label below it, so clicking the name selects the node.
 */
export function nodeBounds(node: Pick<ArchNode, 'displayStyle' | 'shape' | 'size' | 'x' | 'y' | 'w' | 'h' | 'label' | 'technology' | 'tag'>): Box {
  if (effectiveNodeStyle(node) !== 'icon') return { x: node.x, y: node.y, w: node.w, h: node.h };
  const tile = iconTileSize(node);
  const cx = node.x + node.w / 2;
  const lines = estimatedNameLines(node.label ?? '');
  const hasTech = Boolean((node.technology ?? node.tag ?? '').trim());
  const labelW = Math.max(tile, Math.min(ICON_LABEL_MAX_W, (node.label ?? '').length * LABEL_CHAR_W));
  const labelH = ICON_LABEL_GAP + lines * ICON_NAME_LINE_H + (hasTech ? ICON_TECH_LINE_H : 0);
  return { x: cx - labelW / 2, y: node.y, w: labelW, h: tile + labelH };
}

/** True when the world point lies inside `nodeBounds(node)`. */
export function hitsNode(node: Parameters<typeof nodeBounds>[0], x: number, y: number): boolean {
  const b = nodeBounds(node);
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** R1-E03-T04: the "↗" page-link badge sits on the top-right corner of `nodeBounds`; 18 px on screen. */
export function pageLinkBadge(node: Parameters<typeof nodeBounds>[0], zoom: number): { x: number; y: number; r: number } {
  const b = nodeBounds(node);
  return { x: b.x + b.w, y: b.y, r: 9 / Math.max(zoom, 0.1) };
}

/** True when the world point is on the node's page-link badge. */
export function hitsPageLinkBadge(node: Parameters<typeof nodeBounds>[0], x: number, y: number, zoom: number): boolean {
  const k = pageLinkBadge(node, zoom);
  return Math.hypot(x - k.x, y - k.y) <= k.r + 2 / Math.max(zoom, 0.1);
}
