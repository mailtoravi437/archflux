/**
 * R1-E03-T02: containment reducers (reparent, move with children, auto-fit, delete boundary).
 * Pure: no React, no store. An op that cannot apply returns the input state unchanged, so
 * `applyOp` records no undo step for it.
 */
import type { ArchNode } from '../../types';
import type { DocOp, DocState } from './types';
import { isNodeLocked } from './arrange';
import { MAX_DEPTH, ancestorsOf, depthOf, descendantsOf, fitBoundary } from '../../lib/containment';
import { isBoundaryNode } from '../../canvas/render/boundaries';

/** Height of the subtree under `id` (a leaf is 0). */
function subtreeHeight(nodes: readonly ArchNode[], id: string): number {
  const kids = new Map<string, string[]>();
  for (const n of nodes) if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n.id]);
  const walk = (cur: string, seen: Set<string>): number => {
    let h = 0;
    for (const k of kids.get(cur) ?? []) if (!seen.has(k)) h = Math.max(h, 1 + walk(k, new Set(seen).add(k)));
    return h;
  };
  return walk(id, new Set([id]));
}

/** Grows (never shrinks) each ancestor of `ids` to contain its children. */
export const growAncestors: DocOp<[ids: string[]]> = (s, ids) => {
  const chain: string[] = [];
  for (const id of ids) for (const a of ancestorsOf(s.nodes, id)) if (!chain.includes(a)) chain.push(a);
  // nearest ancestors first, so a grown parent is seen by its own parent in the same pass
  chain.sort((a, b) => depthOf(s.nodes, b) - depthOf(s.nodes, a));
  let nodes = s.nodes;
  for (const id of chain) {
    const cur = nodes.find((n) => n.id === id);
    if (!cur || cur.collapsed || isNodeLocked(s, cur)) continue;
    const fit = fitBoundary(nodes, id);
    const x = Math.min(cur.x, fit.x);
    const y = Math.min(cur.y, fit.y);
    const w = Math.max(cur.x + cur.w, fit.x + fit.w) - x;
    const h = Math.max(cur.y + cur.h, fit.y + fit.h) - y;
    if (x === cur.x && y === cur.y && w === cur.w && h === cur.h) continue;
    nodes = nodes.map((n) => (n.id === id ? { ...n, x, y, w, h } : n));
  }
  return nodes === s.nodes ? s : { ...s, nodes };
};

/** Explicit "Fit to contents": sets the boundary to the tight fit (may shrink). */
export const fitToContents: DocOp<[id: string]> = (s, id) => {
  const cur = s.nodes.find((n) => n.id === id);
  if (!cur || !isBoundaryNode(cur) || isNodeLocked(s, cur) || !s.nodes.some((n) => n.parentId === id)) return s;
  const fit = fitBoundary(s.nodes, id);
  if (fit.x === cur.x && fit.y === cur.y && fit.w === cur.w && fit.h === cur.h) return s;
  return grow({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...fit } : n)) }, id);
};

function grow(s: DocState, id: string): DocState {
  return growAncestors(s, [id]);
}

/**
 * Sets `parentId` of `ids` (null = top level). Rejects the whole change on a cycle, a non-boundary
 * or cross-page parent, or nesting deeper than 6. Locked nodes keep their parent. The new parent grows to fit.
 */
export const reparent: DocOp<[ids: string[], parentId: string | null]> = (s, ids, parentId) => {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const parent = parentId === null ? null : byId.get(parentId);
  if (parentId !== null && (!parent || !isBoundaryNode(parent))) return s;
  const movers = [...new Set(ids)].map((id) => byId.get(id)).filter((n): n is ArchNode => !!n);
  if (movers.length === 0) return s;
  const blocked = new Set<string>();
  for (const m of movers) {
    blocked.add(m.id);
    for (const d of descendantsOf(s.nodes, m.id)) blocked.add(d);
  }
  if (parentId !== null && blocked.has(parentId)) return s; // cycle
  if (parent) {
    const base = depthOf(s.nodes, parent.id) + 1;
    for (const m of movers) {
      if ((m.pageId ?? parent.pageId) !== parent.pageId) return s;
      if (base + subtreeHeight(s.nodes, m.id) > MAX_DEPTH) return s;
    }
  }
  const targets = new Set(movers.filter((m) => (m.parentId ?? null) !== parentId && !isNodeLocked(s, m)).map((m) => m.id));
  if (targets.size === 0) return s;
  const next: DocState = { ...s, nodes: s.nodes.map((n) => (targets.has(n.id) ? { ...n, parentId } : n)) };
  return parentId === null ? next : growAncestors(next, [...targets]);
};

/** Moves `id` and every unlocked descendant by (dx, dy); ancestors then grow to keep it inside unless `grow` is false (live drag: the drop decides the parent). */
export const moveWithChildren: DocOp<[id: string, dx: number, dy: number, grow?: boolean]> = (s, id, dx, dy, grow = true) => {
  if ((dx === 0 && dy === 0) || !s.nodes.some((n) => n.id === id)) return s;
  const moving = new Set<string>([id, ...descendantsOf(s.nodes, id)]);
  let changed = false;
  const nodes = s.nodes.map((n) => {
    if (!moving.has(n.id) || isNodeLocked(s, n)) return n;
    changed = true;
    return { ...n, x: n.x + dx, y: n.y + dy };
  });
  if (!changed) return s;
  return grow ? growAncestors({ ...s, nodes }, [id]) : { ...s, nodes };
};

/**
 * Deletes a boundary. 'only' re-parents its children to the boundary's parent; 'with' also deletes
 * every descendant. Edges touching a deleted node are removed.
 */
export const deleteBoundary: DocOp<[id: string, mode: 'only' | 'with']> = (s, id, mode) => {
  const b = s.nodes.find((n) => n.id === id);
  if (!b || !isBoundaryNode(b) || isNodeLocked(s, b)) return s;
  const gone = new Set<string>([id]);
  if (mode === 'with') for (const d of descendantsOf(s.nodes, id)) gone.add(d);
  const nodes = s.nodes
    .filter((n) => !gone.has(n.id))
    .map((n) => (n.parentId === id ? (b.parentId ? { ...n, parentId: b.parentId } : { ...n, parentId: null }) : n));
  const edges = s.edges.filter((e) => !gone.has(e.from) && !(e.to !== null && gone.has(e.to)));
  return { ...s, nodes, edges };
};
