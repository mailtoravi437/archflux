/**
 * R1-E03-T02: pure containment geometry (DATA_MODEL_R1 §2.2). No React, no store.
 * Containment is `parentId` → a boundary node. All walks are cycle-safe.
 */
import type { ArchNode } from '../types';
import { isBoundaryNode } from '../canvas/render/boundaries';

export const MAX_DEPTH = 6;
export const FIT_PADDING = 24;
export const LABEL_BAND = 28;
export const BORDER_BAND = 8;

export interface Rect { x: number; y: number; w: number; h: number }

function childrenIndex(nodes: readonly ArchNode[]): Map<string, ArchNode[]> {
  const kids = new Map<string, ArchNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  return kids;
}

/** Ids nested under `id` (children, grandchildren, …), parents before children. */
export function descendantsOf(nodes: readonly ArchNode[], id: string): string[] {
  const kids = childrenIndex(nodes);
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const queue = [...(kids.get(id) ?? [])];
  while (queue.length) {
    const cur = queue.shift() as ArchNode;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    out.push(cur.id);
    queue.push(...(kids.get(cur.id) ?? []));
  }
  return out;
}

/** Number of ancestors above `id` (a root node is 0). */
export function depthOf(nodes: readonly ArchNode[], id: string): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let depth = 0;
  const seen = new Set<string>([id]);
  let p = byId.get(id)?.parentId ? byId.get(byId.get(id)?.parentId as string) : undefined;
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    depth++;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return depth;
}

/** Ancestor ids of `id`, nearest first. */
export function ancestorsOf(nodes: readonly ArchNode[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let p = byId.get(id)?.parentId ? byId.get(byId.get(id)?.parentId as string) : undefined;
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    out.push(p.id);
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return out;
}

/** Deepest expanded boundary on `pageId` containing the point, ignoring `excludeIds` (and anything inside them). */
export function containerAt(nodes: readonly ArchNode[], x: number, y: number, excludeIds: Set<string>, pageId: string): ArchNode | null {
  const blocked = new Set<string>(excludeIds);
  for (const id of excludeIds) for (const d of descendantsOf(nodes, id)) blocked.add(d);
  let best: ArchNode | null = null;
  let bestDepth = -1;
  for (const n of nodes) {
    if (!isBoundaryNode(n) || n.collapsed || blocked.has(n.id)) continue;
    if ((n.pageId ?? pageId) !== pageId) continue;
    if (x < n.x || x > n.x + n.w || y < n.y || y > n.y + n.h) continue;
    const d = depthOf(nodes, n.id);
    if (d > bestDepth || (d === bestDepth && best && (n.z ?? 0) >= (best.z ?? 0))) {
      best = n;
      bestDepth = d;
    }
  }
  return best;
}

/** Tight box around the direct children: `padding` on three sides, label band on top. No children → current rect. */
export function fitBoundary(nodes: readonly ArchNode[], id: string, padding = FIT_PADDING): Rect {
  const self = nodes.find((n) => n.id === id);
  if (!self) return { x: 0, y: 0, w: 0, h: 0 };
  const kids = nodes.filter((n) => n.parentId === id && n.id !== id);
  if (kids.length === 0) return { x: self.x, y: self.y, w: self.w, h: self.h };
  const minX = Math.min(...kids.map((k) => k.x));
  const minY = Math.min(...kids.map((k) => k.y));
  const maxX = Math.max(...kids.map((k) => k.x + k.w));
  const maxY = Math.max(...kids.map((k) => k.y + k.h));
  const left = self.boundaryKind === 'swimlane' ? Math.max(padding, LABEL_BAND) : padding;
  const top = self.boundaryKind === 'swimlane' ? padding : Math.max(padding, LABEL_BAND);
  return { x: minX - left, y: minY - top, w: maxX - minX + left + padding, h: maxY - minY + top + padding };
}

/** True when (x, y) lies on a boundary's 8 px border band or in its label strip (not its empty interior). */
export function hitsBoundaryChrome(n: ArchNode, x: number, y: number): boolean {
  if (x < n.x || x > n.x + n.w || y < n.y || y > n.y + n.h) return false;
  if (n.collapsed) return true;
  const onBorder = x - n.x <= BORDER_BAND || n.x + n.w - x <= BORDER_BAND || y - n.y <= BORDER_BAND || n.y + n.h - y <= BORDER_BAND;
  const inLabel = n.boundaryKind === 'swimlane' ? x - n.x <= LABEL_BAND : y - n.y <= LABEL_BAND;
  return onBorder || inLabel;
}
