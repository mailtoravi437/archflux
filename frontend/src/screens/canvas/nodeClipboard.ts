import type { ArchEdge, ArchNode } from '../../types';

/**
 * In-memory canvas clipboard (R1-E04-T07): Cut, Copy and Paste of elements within the app. It holds
 * a deep copy of the copied nodes, the nodes nested under them, and the edges between those nodes.
 * It is deliberately not the system clipboard: nothing is written outside the tab.
 */
interface Clip {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

let clip: Clip | null = null;

const copyOf = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Copies `ids` (and their descendants) with the edges that connect copied nodes. Returns the node count. */
export function copyToClipboard(nodes: readonly ArchNode[], edges: readonly ArchEdge[], ids: readonly string[]): number {
  const picked = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (!picked.has(n.id) && n.parentId && picked.has(n.parentId)) {
        picked.add(n.id);
        grew = true;
      }
    }
  }
  const ns = nodes.filter((n) => picked.has(n.id));
  if (ns.length === 0) return 0;
  const es = edges.filter((e) => picked.has(e.from) && e.to !== null && picked.has(e.to));
  clip = { nodes: copyOf(ns as ArchNode[]), edges: copyOf(es as ArchEdge[]) };
  return ns.length;
}

/** A fresh deep copy of the clipboard content, or null when nothing was copied. */
export function readClipboard(): Clip | null {
  return clip ? copyOf(clip) : null;
}

export function hasClipboard(): boolean {
  return clip !== null;
}

/** Test hook: forget the clipboard. */
export function clearClipboard(): void {
  clip = null;
}
