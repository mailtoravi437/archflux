/**
 * Server revision history + entity diff (PROD-020 reviewable diffs).
 *
 * Pure helpers: id/hash shortening, A/B pair guard, server-diff line
 * formatting. The RevisionsSection component consumes these; unit tests
 * assert them without network.
 */
import type { ArchEdge, ArchNode } from './types';

export interface ServerRevision {
  id: string;
  diagramId: string;
  parentRevisionId: string | null;
  contentHash: string;
  authorId: string;
  source: string;
  message: string;
  createdAt: string;
}

export interface ServerDiff {
  added: Array<{ id: string; label: string; type: string }>;
  removed: Array<{ id: string; label: string; type: string }>;
  changed: Array<{ id: string; fields: string[] }>;
}

/** First 8 chars of an id/hash for compact display. */
export function shortRef(ref: string | null | undefined): string {
  if (!ref) return '—';
  return ref.length > 8 ? ref.slice(0, 8) : ref;
}

/**
 * Guard for the A/B revision compare selects (mirrors the checkpoint
 * A≠B guard): returns an explanatory message when the pair is unusable,
 * null when the pair is comparable.
 */
export function validateRevisionPair(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a || !b) return 'Select two revisions to compare.';
  if (a === b) return 'No differences — same revision selected.';
  return null;
}

/** Render a server diff as mono list lines reusing the compare palette. */
export function formatServerDiff(diff: ServerDiff): string[] {
  const lines: string[] = [];
  for (const e of diff.added.slice(0, 8)) lines.push(`+ ${e.type}: ${e.label} (${shortRef(e.id)})`);
  for (const e of diff.removed.slice(0, 8)) lines.push(`- ${e.type}: ${e.label} (${shortRef(e.id)})`);
  for (const e of diff.changed.slice(0, 8)) lines.push(`~ ${e.id} [${e.fields.join(', ')}]`);
  if (lines.length === 0) lines.push('~ same entity set — no recorded changes');
  const hidden =
    Math.max(0, diff.added.length - 8) +
    Math.max(0, diff.removed.length - 8) +
    Math.max(0, diff.changed.length - 8);
  if (hidden > 0) lines.push(`… and ${hidden} more`);
  return lines;
}

export interface SnapshotGraph {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

/** Extract a renderable graph from a revision snapshot payload. */
export function snapshotGraph(snapshot: unknown): SnapshotGraph {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const graph = (s.graph ?? s) as Record<string, unknown>;
  const nodes = Array.isArray(graph.nodes) ? (graph.nodes as ArchNode[]) : [];
  const edges = Array.isArray(graph.edges) ? (graph.edges as ArchEdge[]) : [];
  return { nodes, edges };
}
