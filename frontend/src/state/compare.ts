/**
 * Compare-mode scene (R1-E08-T04, SC-28). Pure: turns two document states and their semantic diff
 * into what the read-only canvas draws. No React, no store, no canvas.
 */
import type { ArchEdge, ArchNode } from '../types';
import type { NodeStatus } from '../canvas/render/types';
import type { DocState } from './ops/types';
import { normalizeDoc } from '../lib/docModel';
import { semanticDiff, type ChangeKind, type ElementChange, type SemanticDiff } from '../lib/semanticDiff';

export interface CompareNode { node: ArchNode; status: NodeStatus }
export interface CompareEdge { edge: ArchEdge; diff: 'added' | 'removed' | 'changed' | null }
export interface MoveArrow { id: string; from: { x: number; y: number }; to: { x: number; y: number } }

export interface CompareScene {
  /** After-state nodes with their diff flag, then ghosts of nodes removed since `before`. */
  nodes: CompareNode[];
  edges: CompareEdge[];
  /** Old to new centre of each moved node; empty unless "Show layout changes" is on. */
  moves: MoveArrow[];
  diff: SemanticDiff;
}

/** Order of the grouped change list. */
export const KIND_ORDER: ChangeKind[] = ['added', 'removed', 'changed', 'moved'];

function centre(n: ArchNode): { x: number; y: number } {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

export function buildCompareScene(before: DocState, after: DocState, showLayout: boolean): CompareScene {
  const diff = semanticDiff(before, after);
  const flag = new Map<string, ChangeKind>();
  for (const c of diff.changes) if (c.entity === 'node' || c.entity === 'edge') flag.set(`${c.entity}:${c.id}`, c.kind);

  const nodes: CompareNode[] = after.nodes.map((node) => {
    const k = flag.get(`node:${node.id}`);
    const status: NodeStatus = { diff: k === 'added' ? 'added' : k === 'changed' ? 'changed' : null };
    return { node, status };
  });
  const afterIds = new Set(after.nodes.map((n) => n.id));
  for (const node of before.nodes) {
    if (!afterIds.has(node.id)) nodes.push({ node, status: { diff: 'removed' } });
  }

  const edges: CompareEdge[] = after.edges.map((edge) => {
    const k = flag.get(`edge:${edge.id}`);
    return { edge, diff: k === 'added' ? 'added' : k === 'changed' ? 'changed' : null };
  });
  const afterEdgeIds = new Set(after.edges.map((e) => e.id));
  for (const edge of before.edges) {
    if (!afterEdgeIds.has(edge.id)) edges.push({ edge, diff: 'removed' });
  }

  const moves: MoveArrow[] = [];
  if (showLayout) {
    const beforeById = new Map(before.nodes.map((n) => [n.id, n] as const));
    for (const c of diff.changes) {
      if (c.entity !== 'node' || c.kind !== 'moved') continue;
      const was = beforeById.get(c.id);
      const now = after.nodes.find((n) => n.id === c.id);
      if (was && now) moves.push({ id: c.id, from: centre(was), to: centre(now) });
    }
  }
  return { nodes, edges, moves, diff };
}

export interface ChangeGroup { kind: ChangeKind; label: string; changes: ElementChange[] }

const GROUP_LABEL: Record<ChangeKind, string> = { added: 'Added', removed: 'Removed', changed: 'Changed', moved: 'Moved' };

/** Changes grouped by kind with counts; "Moved" only when layout changes are shown. */
export function groupChanges(diff: SemanticDiff, showLayout: boolean): ChangeGroup[] {
  return KIND_ORDER
    .filter((k) => showLayout || k !== 'moved')
    .map((kind) => ({ kind, label: GROUP_LABEL[kind], changes: diff.changes.filter((c) => c.kind === kind) }))
    .filter((g) => g.changes.length > 0);
}

/** Flat list in display order, for J / K stepping. */
export function visibleChanges(diff: SemanticDiff, showLayout: boolean): ElementChange[] {
  return groupChanges(diff, showLayout).flatMap((g) => g.changes);
}

/** Pan that puts a node's centre in the middle of the viewport. */
export function panToNode(node: ArchNode, zoom: number, viewport: { w: number; h: number }): { x: number; y: number } {
  const c = centre(node);
  return { x: viewport.w / 2 - c.x * zoom, y: viewport.h / 2 - c.y * zoom };
}

/** Node (current or ghost) for a change, when it is one. */
export function nodeForChange(scene: CompareScene, change: ElementChange): ArchNode | null {
  if (change.entity === 'node') return scene.nodes.find((n) => n.node.id === change.id)?.node ?? null;
  if (change.entity === 'edge') {
    const e = scene.edges.find((x) => x.edge.id === change.id)?.edge;
    if (!e) return null;
    return scene.nodes.find((n) => n.node.id === e.from)?.node ?? null;
  }
  return null;
}

/** Bounds of every drawn node (current and ghost), for fit-to-content. */
export function sceneBounds(scene: CompareScene): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (scene.nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { node } of scene.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  return { minX, minY, maxX, maxY };
}

/** A normalised document state from a revision / checkpoint snapshot (`{graph}` or the graph itself). */
export function docStateFromSnapshot(snapshot: unknown): DocState {
  const s = (typeof snapshot === 'object' && snapshot !== null ? snapshot : {}) as Record<string, unknown>;
  const graph = (typeof s.graph === 'object' && s.graph !== null ? s.graph : s) as Record<string, unknown>;
  const doc = normalizeDoc(graph);
  return {
    nodes: doc?.nodes ?? [],
    edges: doc?.edges ?? [],
    strokes: doc?.strokes ?? [],
    texts: doc?.texts ?? [],
    pages: doc?.pages ?? [],
    layers: doc?.layers ?? [],
  };
}
