import type { ArchEdge } from '../../types';
import { edgeHandlePoints, edgeLabelText, pointAlong, clampLabelPos } from '../../canvas/render/edges';

type Pt = { x: number; y: number };

/** What a pointer-down on a selected edge grabbed (R1-E04-T03 handles, R1-E04-T04 label pill). */
export type EdgeHandleHit =
  | { kind: 'wp'; index: number }
  | { kind: 'mid'; insertIndex: number }
  | { kind: 'label' };

/** Handle grab radius in screen px; matches the 8 px drawn handle plus a little slack. */
const GRAB_PX = 8;

/** Approximate label pill box (11 px text, 2 × 8 px padding), used only for hit-testing. */
function labelHalfWidth(text: string): number {
  return (text.length * 6 + 18) / 2;
}

/** Waypoint, "+" midpoint or label pill under world point (x, y) for a selected edge; waypoints win. */
export function hitEdgeHandle(edge: ArchEdge, pts: Pt[], x: number, y: number, zoom: number): EdgeHandleHit | null {
  const tol = GRAB_PX / Math.max(zoom, 0.01);
  const { waypoints, mids } = edgeHandlePoints(edge, pts);
  for (let i = waypoints.length - 1; i >= 0; i--) {
    if (Math.hypot(x - waypoints[i].x, y - waypoints[i].y) <= tol) return { kind: 'wp', index: i };
  }
  for (const m of mids) {
    if (Math.hypot(x - m.x, y - m.y) <= tol) return { kind: 'mid', insertIndex: m.insertIndex };
  }
  const text = edgeLabelText(edge);
  if (text) {
    const at = pointAlong(pts, clampLabelPos(edge.labelPos ?? 0.5));
    if (Math.abs(x - at.x) <= labelHalfWidth(text) && Math.abs(y - at.y) <= 10) return { kind: 'label' };
  }
  return null;
}

/** Waypoint list with `p` inserted at `index`. */
export function insertWaypoint(waypoints: readonly Pt[] | undefined, index: number, p: Pt): Pt[] {
  const list = (waypoints ?? []).map((w) => ({ x: w.x, y: w.y }));
  list.splice(Math.max(0, Math.min(index, list.length)), 0, p);
  return list;
}

/** Waypoint list with the point at `index` moved to `p`. */
export function moveWaypoint(waypoints: readonly Pt[] | undefined, index: number, p: Pt): Pt[] {
  return (waypoints ?? []).map((w, i) => (i === index ? p : { x: w.x, y: w.y }));
}

/** Snap a world coordinate to a 10 px grid. */
export function snapCoord(v: number, snap: boolean): number {
  return snap ? Math.round(v / 10) * 10 : Math.round(v);
}
