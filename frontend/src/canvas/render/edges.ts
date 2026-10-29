/** Edge render pass (connector body, arrowheads, label pill, step badge). Pure: no React, no store. */
import type { ArchEdge, ArchNode } from '../../types';
import { edgePoints, type ConnectorCurve } from '../../lib/canvasGeometry';
import { crossings } from '../../lib/edgeCrossings';
import { REL_NOTATION, type RelNotation } from '../notation';
import type { EdgePaintFlags } from './types';

export type { EdgePaintFlags } from './types';

type Pt = { x: number; y: number };

/**
 * Dash per explicit legacy `lineStyle`, mapped onto the §5A.4 patterns. Today's inspector still
 * writes `lineStyle`, so an explicit value wins over `relKind` until the Relationship control lands.
 */
const LINE_STYLE_DASH: Record<NonNullable<ArchEdge['lineStyle']>, number[]> = {
  solid: [],
  dashed: REL_NOTATION.async.dash,
  dotted: REL_NOTATION.replication.dash,
};

const LABEL_FONT = "11px 'Inter', -apple-system, sans-serif";
const STEP_FONT = "600 10px 'Inter', -apple-system, sans-serif";
const HEAD_LEN = 8;
const STEP_RADIUS = 9; // 18 px badge
const STEP_OFFSET = 16; // along the path from its start
const HOP_R = 6; // R1-E04-T04: line-jump semicircle radius
const LABEL_POS_MIN = 0.05;
const LABEL_POS_MAX = 0.95;
const HANDLE_R = 4; // R1-E04-T03: waypoint handle, 8 px across

/** Main.dc.html L92–L105 (R1-E14-T05): 1.5 px lines and pill labels. Light-theme values; dark keeps its own. */
const EDGE = {
  width: 1.5,
  widthSelected: 2.5,
  color: '#8A93A3',
  colorDark: '#4B5363',
  headDark: '#9CA3AF',
  accent: '#4F46E5',
  accentDark: '#8B83FF',
  pillText: '#3D4553',
  pillTextDark: '#D1D5DB',
  pillBorder: '#E3E6EB',
  pillBorderDark: '#4B5363',
  /** padding 2 8, 1 px border, 11 px Inter (13 px line). */
  pillPadX: 8,
  pillH: 19,
} as const;

/** Relationship notation for an edge; legacy edges without `relKind` read as sync. */
export function relNotationFor(edge: ArchEdge): RelNotation {
  return REL_NOTATION[edge.relKind ?? 'sync'] ?? REL_NOTATION.sync;
}

/** Dash for an edge: dangling [4,4], else explicit `lineStyle`, else legacy `dashed`, else `relKind`. */
export function edgeDash(edge: ArchEdge): number[] {
  if (edge.isDangling) return [4, 4];
  if (edge.lineStyle) return LINE_STYLE_DASH[edge.lineStyle] ?? [];
  if (!edge.relKind && edge.dashed) return LINE_STYLE_DASH.dashed;
  return relNotationFor(edge).dash;
}

/** Canvas text of the label pill: "<label> · <protocol>", either part alone, or '' for none. */
export function edgeLabelText(edge: ArchEdge): string {
  const label = (edge.label ?? '').trim();
  const protocol = (edge.protocol ?? '').trim();
  if (label && protocol) return `${label} · ${protocol}`;
  return label || protocol;
}

/** R1-E04-T04: label position clamped to 0.05–0.95 so a pill never sits on an arrowhead. */
export function clampLabelPos(t: number): number {
  return Math.min(LABEL_POS_MAX, Math.max(LABEL_POS_MIN, Number.isFinite(t) ? t : 0.5));
}

/** R1-E04-T04: `labelPos` for a pill dragged to (x, y): nearest point on the path as a clamped length fraction. */
export function labelPosFromPoint(pts: Pt[], x: number, y: number): number {
  const total = pathLength(pts);
  if (total === 0) return 0.5;
  let best = Infinity;
  let bestAt = 0;
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (len * len)));
    const d = Math.hypot(x - (a.x + dx * f), y - (a.y + dy * f));
    if (d < best) {
      best = d;
      bestAt = run + f * len;
    }
    run += len;
  }
  return clampLabelPos(bestAt / total);
}

/**
 * R1-E04-T04: per-edge hop points. `edges` is in draw order; an edge hops over the earlier ones it
 * crosses. Empty above 400 edges.
 */
export function edgeHops(
  edges: readonly ArchEdge[],
  nodes: ArchNode[],
  orthogonal: boolean,
  curve: ConnectorCurve,
): Map<string, Pt[]> {
  const paths: { edgeId: string; points: Pt[] }[] = [];
  for (const e of edges) {
    const points = edgePoints(e, nodes ?? [], orthogonal, curve);
    if (points) paths.push({ edgeId: e.id, points });
  }
  const out = new Map<string, Pt[]>();
  for (const c of crossings(paths)) {
    const list = out.get(c.edgeId);
    if (list) list.push({ x: c.x, y: c.y });
    else out.set(c.edgeId, [{ x: c.x, y: c.y }]);
  }
  return out;
}

/**
 * R1-E04-T03: control handles of a selected edge: its waypoints, and a "+" handle at the midpoint
 * between each pair of consecutive control points (port, waypoints, port). `insertIndex` is the
 * waypoint index a dragged "+" handle inserts at.
 */
export function edgeHandlePoints(
  edge: ArchEdge,
  pts: Pt[],
): { waypoints: Pt[]; mids: (Pt & { insertIndex: number })[] } {
  const waypoints = (edge.waypoints ?? []).map((w) => ({ x: w.x, y: w.y }));
  const control = [pts[0], ...waypoints, pts[pts.length - 1]].filter((p): p is Pt => Boolean(p));
  const mids: (Pt & { insertIndex: number })[] = [];
  for (let i = 1; i < control.length; i++) {
    mids.push({ x: (control[i - 1].x + control[i].x) / 2, y: (control[i - 1].y + control[i].y) / 2, insertIndex: i - 1 });
  }
  return { waypoints, mids };
}

/** Point at fraction `t` (0..1) of the polyline's length, plus the segment direction there. */
export function pointAlong(pts: Pt[], t: number): Pt & { angle: number } {
  return pointAtDistance(pts, Math.min(1, Math.max(0, t)) * pathLength(pts));
}

function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

function pointAtDistance(pts: Pt[], d: number): Pt & { angle: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= seg || i === pts.length - 1) {
      const f = Math.min(1, left / seg);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle };
    }
    left -= seg;
  }
  return { ...pts[0], angle: 0 };
}

/**
 * One connector (R1-E02-T09, UI_REVAMP_SPEC §5A.4): body dashed per relationship, filled triangle
 * (sync, replication) or open V (async) heads, both ends for bidirectional, a sans label pill at
 * `labelPos` and an optional step badge near the start.
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
  const rel = relNotationFor(edge);
  const start = pts[0];
  const end = pts[pts.length - 1];

  ctx.save();
  const accent = isDark ? EDGE.accentDark : EDGE.accent;
  ctx.strokeStyle = isEdgeSelected ? accent : (isDark ? EDGE.colorDark : EDGE.color);
  ctx.lineWidth = isEdgeSelected ? EDGE.widthSelected : EDGE.width;
  if (isEdgeSelected) {
    ctx.shadowColor = EDGE.accent;
    ctx.shadowBlur = 8;
  }
  ctx.setLineDash(edgeDash(edge));
  ctx.beginPath();
  traceWithHops(ctx, pts, opts.hops ?? []);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);

  // Arrowheads
  const headColor = isEdgeSelected ? EDGE.accent : (isDark ? EDGE.headDark : EDGE.color);
  ctx.fillStyle = headColor;
  ctx.strokeStyle = headColor;
  const drawHead = (hx: number, hy: number, angle: number): void => {
    const ax = hx - HEAD_LEN * Math.cos(angle - Math.PI / 6);
    const ay = hy - HEAD_LEN * Math.sin(angle - Math.PI / 6);
    const bx = hx - HEAD_LEN * Math.cos(angle + Math.PI / 6);
    const by = hy - HEAD_LEN * Math.sin(angle + Math.PI / 6);
    ctx.beginPath();
    if (rel.head === 'open') {
      ctx.moveTo(ax, ay);
      ctx.lineTo(hx, hy);
      ctx.lineTo(bx, by);
      ctx.lineWidth = EDGE.width;
      ctx.stroke();
    } else {
      ctx.moveTo(hx, hy);
      ctx.lineTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.closePath();
      ctx.fill();
    }
  };
  const arrowMode = edge.arrow ?? 'end';
  if (arrowMode !== 'none') {
    const prev = pts[pts.length - 2] ?? start;
    drawHead(end.x, end.y, Math.atan2(end.y - prev.y, end.x - prev.x));
    if (rel.both || arrowMode === 'both') {
      const first = pts[1] ?? start;
      drawHead(start.x, start.y, Math.atan2(start.y - first.y, start.x - first.x));
    }
  }

  if (isEdgeSelected) drawEdgeHandles(ctx, edge, pts, accent, isDark, opts.zoom ?? 1);

  // Label pill (unless the caller paints pills in a later pass, R1-E14-T02).
  if (opts.pill !== false) drawEdgePill(ctx, edge, pts, isDark, isEdgeSelected);

  // Step badge: 18 px circle with the number, 16 px along the path from its start.
  if (typeof edge.step === 'number' && Number.isFinite(edge.step)) {
    const at = pointAtDistance(pts, STEP_OFFSET);
    ctx.beginPath();
    ctx.arc(at.x, at.y, STEP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.font = STEP_FONT;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(edge.step), at.x, at.y);
  }
  ctx.restore();
}

/** Polyline path; where a hop lies on a segment (clear of its ends) the line arcs over it. */
function traceWithHops(ctx: CanvasRenderingContext2D, pts: Pt[], hops: Pt[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const on = len === 0 ? [] : hops
      .map((h) => ({ h, d: ((h.x - a.x) * dx + (h.y - a.y) * dy) / len, off: Math.abs((h.x - a.x) * dy - (h.y - a.y) * dx) / len }))
      .filter((c) => c.off < 0.5 && c.d > HOP_R * 2 && c.d < len - HOP_R * 2)
      .sort((p, q) => p.d - q.d);
    const angle = Math.atan2(dy, dx);
    let last = -Infinity;
    for (const c of on) {
      if (c.d - last < HOP_R * 2) continue;
      ctx.lineTo(c.h.x - (dx / len) * HOP_R, c.h.y - (dy / len) * HOP_R);
      ctx.arc(c.h.x, c.h.y, HOP_R, angle + Math.PI, angle, false);
      last = c.d;
    }
    ctx.lineTo(b.x, b.y);
  }
}

/** Selected-edge handles (R1-E04-T03): waypoint dots and hollow "+" midpoint dots, 8 screen px. */
function drawEdgeHandles(ctx: CanvasRenderingContext2D, edge: ArchEdge, pts: Pt[], accent: string, isDark: boolean, zoom: number): void {
  const { waypoints, mids } = edgeHandlePoints(edge, pts);
  const r = HANDLE_R / Math.max(zoom, 0.01);
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5 / Math.max(zoom, 0.01);
  ctx.shadowBlur = 0;
  for (const m of mids) {
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#191D25' : '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x - r / 2, m.y);
    ctx.lineTo(m.x + r / 2, m.y);
    ctx.moveTo(m.x, m.y - r / 2);
    ctx.lineTo(m.x, m.y + r / 2);
    ctx.stroke();
  }
  for (const w of waypoints) {
    ctx.beginPath();
    ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#191D25' : '#FFFFFF';
    ctx.stroke();
  }
}

/**
 * Label pill alone (R1-E14-T02): the canvas draws every pill in a separate pass after the nodes,
 * so a pill is never hidden under a node. Same look as the in-pass pill.
 */
export function drawEdgeLabelPass(
  ctx: CanvasRenderingContext2D,
  edge: ArchEdge,
  nodes: ArchNode[],
  opts: EdgePaintFlags,
): void {
  if (!edgeLabelText(edge)) return;
  const pts = edgePoints(edge, nodes ?? [], opts.orthogonal, opts.curve);
  if (!pts) return;
  ctx.save();
  drawEdgePill(ctx, edge, pts, opts.isDark, opts.selected);
  ctx.restore();
}

/** Label pill: 11 px sans #3D4553 on white, 1 px #E3E6EB border, radius 999, padding 2 8; never italic. */
function drawEdgePill(ctx: CanvasRenderingContext2D, edge: ArchEdge, pts: Pt[], isDark: boolean, isEdgeSelected: boolean): void {
  const accent = isDark ? EDGE.accentDark : EDGE.accent;
  const text = edgeLabelText(edge);
  if (!text) return;
  const at = pointAlong(pts, clampLabelPos(edge.labelPos ?? 0.5));
  ctx.font = LABEL_FONT;
  const w = ctx.measureText(text).width + EDGE.pillPadX * 2 + 2;
  const h = EDGE.pillH;
  ctx.beginPath();
  ctx.roundRect(at.x - w / 2, at.y - h / 2, w, h, h / 2);
  ctx.fillStyle = isDark ? '#191D25' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isEdgeSelected ? accent : (isDark ? EDGE.pillBorderDark : EDGE.pillBorder);
  ctx.stroke();
  ctx.fillStyle = isEdgeSelected ? (isDark ? '#C7C3FF' : '#4338CA') : (isDark ? EDGE.pillTextDark : EDGE.pillText);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x, at.y);
}
