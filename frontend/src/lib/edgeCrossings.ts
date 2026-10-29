/**
 * R1-E04-T04: where connector paths cross, for line jumps. Pure: no React, no store.
 * Paths are given in draw order; a crossing is attributed to the path drawn later (it hops).
 */
import type { Pt } from './canvasGeometry';

export interface EdgePathInput {
  edgeId: string;
  points: Pt[];
}

export interface Crossing {
  edgeId: string;
  x: number;
  y: number;
}

/** Above this many paths the O(n²) scan is skipped (no jumps are drawn). */
export const MAX_CROSSING_EDGES = 400;

const EPS = 1e-6;

/** Proper (interior) intersection of segments p1p2 and p3p4; shared endpoints and parallels return null. */
function intersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < EPS) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  const lo = EPS;
  const hi = 1 - EPS;
  if (t <= lo || t >= hi || u <= lo || u >= hi) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/** All crossings between different paths, each tagged with the later path's id. Empty above 400 paths. */
export function crossings(paths: readonly EdgePathInput[]): Crossing[] {
  if (paths.length > MAX_CROSSING_EDGES) return [];
  const out: Crossing[] = [];
  for (let j = 1; j < paths.length; j++) {
    const later = paths[j].points;
    for (let i = 0; i < j; i++) {
      const earlier = paths[i].points;
      for (let b = 0; b + 1 < later.length; b++) {
        for (let a = 0; a + 1 < earlier.length; a++) {
          const hit = intersect(earlier[a], earlier[a + 1], later[b], later[b + 1]);
          if (hit) out.push({ edgeId: paths[j].edgeId, x: hit.x, y: hit.y });
        }
      }
    }
  }
  return out;
}
