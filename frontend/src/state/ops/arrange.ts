/**
 * Pure arrange reducers (R1-E04-T01 / T02): align, distribute, match size,
 * z-order and lock. No React, no store. An op that cannot apply returns the
 * input state unchanged, so `applyOp` records no undo step for it.
 *
 * Locked rule: locked nodes, and nodes on locked layers, are never moved,
 * resized or restacked by these ops. `setLocked` is the only op that touches them.
 */
import type { ArchNode } from '../../types';
import type { DocOp, DocState } from './types';
import { DEFAULT_LAYER_ID } from './layers';

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** True when the node is locked itself or sits on a locked layer. */
export function isNodeLocked(s: DocState, n: ArchNode): boolean {
  if (n.locked) return true;
  const layerId = n.layerId ?? DEFAULT_LAYER_ID;
  return s.layers.some((l) => l.id === layerId && l.locked);
}

/**
 * Ids of every node nested under `id` via `parentId` (children, grandchildren, …).
 * Local stand-in until `lib/containment.ts` / `moveWithChildren` lands (R1-E03-T02).
 */
export function descendantIds(s: DocState, id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const n of s.nodes) {
    if (!n.parentId) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n.id);
    else kids.set(n.parentId, [n.id]);
  }
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue; // guards against parentId cycles
    seen.add(cur);
    out.push(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  return out;
}

/**
 * The unlocked nodes among `ids`, in the given order, without nodes whose
 * ancestor is also in the set (that ancestor carries them along).
 */
function movableTargets(s: DocState, ids: string[]): ArchNode[] {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const picked: ArchNode[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const n = byId.get(id);
    if (!n || seen.has(id) || isNodeLocked(s, n)) continue;
    seen.add(id);
    picked.push(n);
  }
  const pickedIds = new Set(picked.map((n) => n.id));
  const hasPickedAncestor = (n: ArchNode): boolean => {
    const visited = new Set<string>([n.id]);
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    while (p && !visited.has(p.id)) {
      if (pickedIds.has(p.id)) return true;
      visited.add(p.id);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return false;
  };
  return picked.filter((n) => !hasPickedAncestor(n));
}

/** Applies per-node translations; each moved node carries its unlocked descendants. */
function translate(s: DocState, moves: Map<string, { dx: number; dy: number }>): DocState {
  const delta = new Map<string, { dx: number; dy: number }>();
  for (const [id, d] of moves) {
    if (d.dx === 0 && d.dy === 0) continue;
    delta.set(id, d);
    for (const kid of descendantIds(s, id)) if (!delta.has(kid)) delta.set(kid, d);
  }
  let changed = false;
  const nodes = s.nodes.map((n) => {
    const d = delta.get(n.id);
    if (!d || isNodeLocked(s, n)) return n;
    changed = true;
    return { ...n, x: n.x + d.dx, y: n.y + d.dy };
  });
  return changed ? { ...s, nodes } : s;
}

/** Aligns ≥ 2 unlocked nodes to an edge or centre line of their joint bounds. */
export const align: DocOp<[ids: string[], edge: AlignEdge]> = (s, ids, edge) => {
  const list = movableTargets(s, ids);
  if (list.length < 2) return s;
  const minX = Math.min(...list.map((n) => n.x));
  const maxX = Math.max(...list.map((n) => n.x + n.w));
  const minY = Math.min(...list.map((n) => n.y));
  const maxY = Math.max(...list.map((n) => n.y + n.h));
  const moves = new Map<string, { dx: number; dy: number }>();
  for (const n of list) {
    let dx = 0;
    let dy = 0;
    switch (edge) {
      case 'left': dx = minX - n.x; break;
      case 'center': dx = (minX + maxX) / 2 - (n.x + n.w / 2); break;
      case 'right': dx = maxX - (n.x + n.w); break;
      case 'top': dy = minY - n.y; break;
      case 'middle': dy = (minY + maxY) / 2 - (n.y + n.h / 2); break;
      case 'bottom': dy = maxY - (n.y + n.h); break;
    }
    moves.set(n.id, { dx, dy });
  }
  return translate(s, moves);
};

/**
 * Spaces ≥ 3 unlocked nodes with equal gaps along an axis. Nodes are ordered by
 * position (centre on that axis); the first and last stay put.
 */
export const distribute: DocOp<[ids: string[], axis: 'h' | 'v']> = (s, ids, axis) => {
  const list = movableTargets(s, ids);
  if (list.length < 3) return s;
  const pos = (n: ArchNode) => (axis === 'h' ? n.x : n.y);
  const size = (n: ArchNode) => (axis === 'h' ? n.w : n.h);
  const sorted = [...list].sort((a, b) => pos(a) + size(a) / 2 - (pos(b) + size(b) / 2));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const total = sorted.reduce((sum, n) => sum + size(n), 0);
  const gap = (span - total) / (sorted.length - 1);
  const moves = new Map<string, { dx: number; dy: number }>();
  let cursor = pos(first);
  for (const n of sorted) {
    const d = cursor - pos(n);
    moves.set(n.id, axis === 'h' ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    cursor += size(n) + gap;
  }
  return translate(s, moves);
};

/** Sets width and/or height of the other unlocked nodes to the first (primary) id's. */
export const matchSize: DocOp<[ids: string[], dim: 'w' | 'h' | 'both']> = (s, ids, dim) => {
  const primary = s.nodes.find((n) => n.id === ids[0]);
  if (!primary) return s;
  const targets = new Set(ids.slice(1));
  let changed = false;
  const nodes = s.nodes.map((n) => {
    if (!targets.has(n.id) || n.id === primary.id || isNodeLocked(s, n)) return n;
    const w = dim === 'h' ? n.w : primary.w;
    const h = dim === 'w' ? n.h : primary.h;
    if (w === n.w && h === n.h) return n;
    changed = true;
    return { ...n, w, h, customSize: true };
  });
  return changed ? { ...s, nodes } : s;
};

/**
 * Restacks unlocked nodes within their page and layer.
 * - front / back: the selection gets z above the max (below the min) of its
 *   page+layer group, keeping its relative order; other nodes keep their z.
 * - forward / backward: each selected node swaps one step with the next
 *   unselected node above (below); the group's z is then renumbered 0..n-1.
 * Effective z is `z ?? 0`, ties broken by array order (paint order).
 */
export const zOrder: DocOp<[ids: string[], cmd: 'front' | 'back' | 'forward' | 'backward']> = (s, ids, cmd) => {
  const sel = new Set(ids);
  const firstPage = [...s.pages].sort((a, b) => a.order - b.order)[0]?.id ?? '';
  const groups = new Map<string, number[]>(); // key → node indices
  s.nodes.forEach((n, i) => {
    const key = `${n.pageId ?? firstPage}\u0000${n.layerId ?? DEFAULT_LAYER_ID}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });
  const newZ = new Map<number, number>();
  for (const idx of groups.values()) {
    const ordered = [...idx].sort((a, b) => (s.nodes[a].z ?? 0) - (s.nodes[b].z ?? 0) || a - b);
    const isTarget = (i: number) => sel.has(s.nodes[i].id) && !isNodeLocked(s, s.nodes[i]);
    const targets = ordered.filter(isTarget);
    if (targets.length === 0) continue;
    if (cmd === 'front' || cmd === 'back') {
      const others = ordered.filter((i) => !isTarget(i));
      if (others.length === 0) continue;
      const zs = others.map((i) => s.nodes[i].z ?? 0);
      if (cmd === 'front') {
        const top = Math.max(...zs);
        targets.forEach((i, k) => newZ.set(i, top + 1 + k));
      } else {
        const bottom = Math.min(...zs);
        targets.forEach((i, k) => newZ.set(i, bottom - targets.length + k));
      }
    } else {
      const arr = [...ordered];
      if (cmd === 'forward') {
        for (let k = arr.length - 2; k >= 0; k--) {
          if (isTarget(arr[k]) && !isTarget(arr[k + 1])) [arr[k], arr[k + 1]] = [arr[k + 1], arr[k]];
        }
      } else {
        for (let k = 1; k < arr.length; k++) {
          if (isTarget(arr[k]) && !isTarget(arr[k - 1])) [arr[k], arr[k - 1]] = [arr[k - 1], arr[k]];
        }
      }
      if (arr.every((v, k) => v === ordered[k])) continue;
      arr.forEach((i, k) => newZ.set(i, k));
    }
  }
  let changed = false;
  const nodes = s.nodes.map((n, i) => {
    const z = newZ.get(i);
    if (z === undefined || z === n.z) return n;
    changed = true;
    return { ...n, z };
  });
  return changed ? { ...s, nodes } : s;
};

/** Locks or unlocks nodes. Unlocking removes the flag. */
export const setLocked: DocOp<[ids: string[], locked: boolean]> = (s, ids, locked) => {
  const set = new Set(ids);
  let changed = false;
  const nodes = s.nodes.map((n) => {
    if (!set.has(n.id) || !!n.locked === locked) return n;
    changed = true;
    if (locked) return { ...n, locked: true };
    const rest: ArchNode = { ...n };
    delete rest.locked;
    return rest;
  });
  return changed ? { ...s, nodes } : s;
};
