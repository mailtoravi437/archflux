/** R1-E03-T06: create frame / swimlane boundaries and add lanes. Pure reducers; one call = one undo step. */
import type { ArchNode } from '../../types';
import type { DocOp } from './types';
import { DEFAULT_LAYER_ID } from './layers';

export const MIN_BOUNDARY = 40;
const SNAP = 6;

export interface DragRect { x0: number; y0: number; x1: number; y1: number }

/**
 * Adds a `frame` or `swimlane` boundary from a dragged rect (any corner order). Rects under 40 px on a
 * side are refused. A new lane whose top or bottom edge lies within 6 px of an overlapping lane on the
 * same page snaps to share that edge (and its x/width).
 */
export const createBoundary: DocOp<[id: string, kind: 'frame' | 'swimlane', rect: DragRect, pageId: string, layerId?: string]> = (s, id, kind, rect, pageId, layerId) => {
  if (s.nodes.some((n) => n.id === id)) return s;
  let x = Math.min(rect.x0, rect.x1);
  let y = Math.min(rect.y0, rect.y1);
  let w = Math.abs(rect.x1 - rect.x0);
  let h = Math.abs(rect.y1 - rect.y0);
  if (w < MIN_BOUNDARY || h < MIN_BOUNDARY) return s;
  if (kind === 'swimlane') {
    const lanes = s.nodes.filter((n) => n.boundaryKind === 'swimlane' && (n.pageId ?? pageId) === pageId);
    const overlapsX = (n: ArchNode) => x < n.x + n.w && x + w > n.x;
    const below = lanes.find((n) => overlapsX(n) && Math.abs(y - (n.y + n.h)) <= SNAP);
    const above = lanes.find((n) => overlapsX(n) && Math.abs(y + h - n.y) <= SNAP);
    const mate = below ?? above;
    if (below) {
      y = below.y + below.h;
    } else if (above) {
      h = above.y - y;
    }
    if (mate) {
      x = mate.x;
      w = mate.w;
    }
    if (h < MIN_BOUNDARY) return s;
  }
  const node: ArchNode = {
    id, type: 'boundary', label: kind === 'frame' ? 'Frame' : 'Lane', tag: '', health: 'ok',
    x, y, w, h, stroke: '#C3C8D1', kind: 'boundary', boundaryKind: kind, pageId, layerId: layerId ?? DEFAULT_LAYER_ID,
  };
  return { ...s, nodes: [...s.nodes, node] };
};

/** Context-toolbar "Add lane below": a lane of equal width and height directly under `id`, sharing its bottom edge. */
export const addLaneBelow: DocOp<[id: string, newId: string]> = (s, id, newId) => {
  const lane = s.nodes.find((n) => n.id === id);
  if (!lane || lane.boundaryKind !== 'swimlane' || s.nodes.some((n) => n.id === newId)) return s;
  const copy: ArchNode = {
    ...lane, id: newId, label: 'Lane', x: lane.x, y: lane.y + lane.h, w: lane.w, h: lane.h,
    parentId: lane.parentId ?? null, collapsed: false, locked: false, z: (lane.z ?? 0),
  };
  return { ...s, nodes: [...s.nodes, copy] };
};

/** Frames of a page in reading order (top to bottom, then left to right) for the Outline list (SC-16). */
export function frameOutline(nodes: readonly ArchNode[], pageId: string): ArchNode[] {
  return nodes
    .filter((n) => n.boundaryKind === 'frame' && (n.pageId ?? pageId) === pageId)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
