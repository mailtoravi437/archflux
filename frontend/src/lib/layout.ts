/**
 * Pure layered (DAG) layout. Copied from the 'dag' branch of `applyLayout` in
 * `state/store.tsx` (R1-E09-T02) so importers can lay out graphs without the
 * store. The store should call `layeredLayout(nodes, edges, 'LR')` instead of its
 * inline copy; with the default spacing that call reproduces it exactly.
 *
 * Coordinates are world space (canvas units). Nodes are columns (LR/RL) or rows
 * (TB/BT) by longest-path depth from the sources.
 */
import type { ArchEdge, ArchNode } from '../types';

export type LayoutDir = 'TB' | 'BT' | 'LR' | 'RL';

export interface LayeredLayoutOptions {
  /** Distance between ranks (depth levels). Store default: 220. */
  rankGap?: number;
  /** Distance between nodes in the same rank. Store default: 130. */
  nodeGap?: number;
  /** World x of the first rank or row. Store default: 80. */
  originX?: number;
  /** World y of the first rank or row. Store default: 110. */
  originY?: number;
}

const DEFAULTS: Required<LayeredLayoutOptions> = { rankGap: 220, nodeGap: 130, originX: 80, originY: 110 };

/**
 * Edges that close a cycle, found by an iterative DFS (R1-BUG-03). Roots are the
 * in-degree-0 sources in node order, then any node still unvisited in node order;
 * edges are followed in input order, so the result is deterministic. Returns the
 * set of edge indexes to ignore (back edges, including self loops) and the roots.
 */
function breakCycles(
  nodes: readonly ArchNode[],
  edges: readonly Pick<ArchEdge, 'from' | 'to'>[],
  indeg: Map<string, number>,
): { back: Set<number>; roots: string[] } {
  const out = new Map<string, number[]>();
  edges.forEach((e, i) => {
    if (e.to && indeg.has(e.to) && indeg.has(e.from)) out.set(e.from, [...(out.get(e.from) ?? []), i]);
  });
  const state = new Map<string, 1 | 2>(); // 1 = on the DFS stack, 2 = finished
  const back = new Set<number>();
  const roots: string[] = [];
  const order = [...nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0), ...nodes].map((n) => n.id);
  for (const root of order) {
    if (state.has(root)) continue;
    roots.push(root);
    state.set(root, 1);
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.id) ?? [];
      if (top.next >= list.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const idx = list[top.next++];
      const to = edges[idx].to as string;
      const st = state.get(to);
      if (st === 1) back.add(idx);
      else if (st === undefined) {
        state.set(to, 1);
        stack.push({ id: to, next: 0 });
      }
    }
  }
  return { back, roots };
}

/**
 * Longest-path depth per node id. Cycles are broken first by dropping DFS back
 * edges (see `breakCycles`), so the remaining graph is a DAG and the relaxation
 * below always terminates. Acyclic graphs have no back edges and are unchanged.
 */
export function layerDepths(nodes: readonly ArchNode[], edges: readonly Pick<ArchEdge, 'from' | 'to'>[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => {
    if (e.to && indeg.has(e.to)) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  });
  const { back, roots } = breakCycles(nodes, edges, indeg);
  const depth = new Map<string, number>();
  roots.forEach((id) => depth.set(id, 0));
  const order = [...roots];
  while (order.length) {
    const cur = order.shift() as string;
    const d = depth.get(cur) ?? 0;
    edges.forEach((e, i) => {
      if (e.from === cur && e.to && ids.has(e.to) && !back.has(i)) {
        const nd = d + 1;
        if ((depth.get(e.to) ?? -1) < nd) {
          depth.set(e.to, nd);
          if (!order.includes(e.to)) order.push(e.to);
        }
      }
    });
  }
  return depth;
}

/** Returns new node objects with x/y set; the inputs are not mutated. */
export function layeredLayout(
  nodes: readonly ArchNode[],
  edges: readonly Pick<ArchEdge, 'from' | 'to'>[],
  dir: LayoutDir,
  options: LayeredLayoutOptions = {},
): ArchNode[] {
  const { rankGap, nodeGap, originX, originY } = { ...DEFAULTS, ...options };
  const all = nodes.map((n) => ({ ...n }));
  const depth = layerDepths(all, edges);
  const maxD = Math.max(0, ...[...depth.values()]);
  for (let d = 0; d <= maxD; d++) {
    const rank = dir === 'RL' || dir === 'BT' ? maxD - d : d;
    const col = all.filter((n) => depth.get(n.id) === d);
    col.forEach((n, r) => {
      if (dir === 'LR' || dir === 'RL') {
        n.x = originX + rank * rankGap;
        n.y = originY + r * nodeGap;
      } else {
        n.x = originX + r * nodeGap;
        n.y = originY + rank * rankGap;
      }
    });
  }
  return all;
}
