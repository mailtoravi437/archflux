/**
 * R1-E03-T03: collapsed-boundary visibility and edge rerouting. Pure: no React, no store.
 * A collapsed boundary draws as a chip; everything nested under it is hidden and not hit-testable.
 */
import type { ArchEdge, ArchNode } from '../types';

/** Ids hidden because an ancestor boundary is collapsed (the collapsed boundary itself stays visible). */
export function hiddenByCollapse(nodes: readonly ArchNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hidden = new Set<string>();
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    while (p && !seen.has(p.id)) {
      if (p.collapsed) {
        hidden.add(n.id);
        break;
      }
      seen.add(p.id);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
  }
  return hidden;
}

/** Nodes to draw and hit-test. */
export function visibleNodes(nodes: readonly ArchNode[]): ArchNode[] {
  const hidden = hiddenByCollapse(nodes);
  return hidden.size === 0 ? [...nodes] : nodes.filter((n) => !hidden.has(n.id));
}

/** Outermost collapsed ancestor of `id` (the chip an endpoint is drawn to), or `id` itself. */
export function chipFor(nodes: readonly ArchNode[], id: string): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let found = id;
  const seen = new Set<string>([id]);
  let p = byId.get(id)?.parentId ? byId.get(byId.get(id)?.parentId as string) : undefined;
  while (p && !seen.has(p.id)) {
    if (p.collapsed) found = p.id;
    seen.add(p.id);
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return found;
}

export interface RoutedEdge {
  /** The first underlying edge, with `from`/`to` remapped to chips where needed. */
  edge: ArchEdge;
  /** Number of underlying edges merged into this one; draw a "×N" badge when above 1. */
  count: number;
  /** Ids of every underlying edge (for selection and hit-testing). */
  sourceIds: string[];
}

/**
 * Edges to draw. Endpoints inside a collapsed boundary move to its chip, edges that become internal
 * to one chip vanish, and edges now sharing both endpoints merge into one with a count.
 */
export function routeEdges(nodes: readonly ArchNode[], edges: readonly ArchEdge[]): RoutedEdge[] {
  const anyCollapsed = nodes.some((n) => n.collapsed);
  if (!anyCollapsed) return edges.map((edge) => ({ edge, count: 1, sourceIds: [edge.id] }));
  const out: RoutedEdge[] = [];
  const merged = new Map<string, RoutedEdge>();
  for (const e of edges) {
    const from = chipFor(nodes, e.from);
    const to = e.to === null ? null : chipFor(nodes, e.to);
    if (from === to) continue; // internal to one chip
    if (from === e.from && to === e.to) {
      out.push({ edge: e, count: 1, sourceIds: [e.id] });
      continue;
    }
    const key = `${from}\u0000${to}`;
    const hit = merged.get(key);
    if (hit) {
      hit.count++;
      hit.sourceIds.push(e.id);
    } else {
      const r: RoutedEdge = { edge: { ...e, from, to }, count: 1, sourceIds: [e.id] };
      merged.set(key, r);
      out.push(r);
    }
  }
  return out;
}
