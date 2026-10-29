/**
 * Find and replace, select similar (R1-E10-T05, CAP-C9). Pure functions over
 * DocState; no React, no store.
 */
import type { ArchEdge, ArchNode } from '../../types';
import type { DocOp, DocState } from './types';

export interface FindQuery {
  text: string;
  fields: Array<'label' | 'technology' | 'edgeLabel' | 'properties'>;
  caseSensitive: boolean;
  wholeWord: boolean;
  pageScope: 'page' | 'all';
}

/** One matching field. `field` is 'label', 'technology', 'edgeLabel' or 'properties.<key>'. */
export interface FindMatch { id: string; entity: 'node' | 'edge'; field: string; }

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A global regex for the query, or null when the text is empty. */
function queryRegex(q: FindQuery): RegExp | null {
  if (!q.text) return null;
  const body = escapeRe(q.text);
  const src = q.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(src, q.caseSensitive ? 'gu' : 'giu');
}

const firstPageId = (s: DocState): string => [...s.pages].sort((a, b) => a.order - b.order)[0]?.id ?? '';

function scopedNodes(s: DocState, q: FindQuery, activePageId: string): ArchNode[] {
  if (q.pageScope === 'all') return s.nodes;
  const first = firstPageId(s);
  return s.nodes.filter((n) => (n.pageId ?? first) === activePageId);
}

/** Edges belong to the page of their source node. */
function scopedEdges(s: DocState, q: FindQuery, activePageId: string): ArchEdge[] {
  if (q.pageScope === 'all') return s.edges;
  const onPage = new Set(scopedNodes(s, q, activePageId).map((n) => n.id));
  return s.edges.filter((e) => onPage.has(e.from));
}

const hits = (re: RegExp, value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  re.lastIndex = 0;
  return re.test(value);
};

/** Matching fields in doc order: nodes (label, technology, properties), then edges. */
export function findMatches(s: DocState, q: FindQuery, activePageId: string): FindMatch[] {
  const re = queryRegex(q);
  if (!re || q.fields.length === 0) return [];
  const f = new Set(q.fields);
  const out: FindMatch[] = [];
  if (f.has('label') || f.has('technology') || f.has('properties')) {
    for (const n of scopedNodes(s, q, activePageId)) {
      if (f.has('label') && hits(re, n.label)) out.push({ id: n.id, entity: 'node', field: 'label' });
      if (f.has('technology') && hits(re, n.technology)) out.push({ id: n.id, entity: 'node', field: 'technology' });
      if (f.has('properties') && n.properties) {
        for (const [k, v] of Object.entries(n.properties)) {
          if (hits(re, v)) out.push({ id: n.id, entity: 'node', field: `properties.${k}` });
        }
      }
    }
  }
  if (f.has('edgeLabel')) {
    for (const e of scopedEdges(s, q, activePageId)) {
      if (hits(re, e.label)) out.push({ id: e.id, entity: 'edge', field: 'edgeLabel' });
    }
  }
  return out;
}

/** Replaces every occurrence in every matching field. The replacement is literal (no `$1`). */
export const replaceAll: DocOp<[q: FindQuery, replacement: string, activePageId: string]> = (s, q, replacement, activePageId) => {
  const matches = findMatches(s, q, activePageId);
  const re = queryRegex(q);
  if (!re || matches.length === 0) return s;
  const sub = (v: string) => v.replace(re, () => replacement);
  const nodeFields = new Map<string, string[]>();
  const edgeIds = new Set<string>();
  for (const m of matches) {
    if (m.entity === 'edge') edgeIds.add(m.id);
    else nodeFields.set(m.id, [...(nodeFields.get(m.id) ?? []), m.field]);
  }
  let nodesChanged = false;
  const nodes = s.nodes.map((n) => {
    const fields = nodeFields.get(n.id);
    if (!fields) return n;
    const next: ArchNode = { ...n };
    for (const field of fields) {
      if (field === 'label') next.label = sub(n.label);
      else if (field === 'technology' && typeof n.technology === 'string') next.technology = sub(n.technology);
      else if (field.startsWith('properties.')) {
        const key = field.slice('properties.'.length);
        const v = next.properties?.[key];
        if (typeof v === 'string') next.properties = { ...next.properties, [key]: sub(v) };
      }
    }
    nodesChanged = true;
    return next;
  });
  let edgesChanged = false;
  const edges = s.edges.map((e) => {
    if (!edgeIds.has(e.id)) return e;
    edgesChanged = true;
    return { ...e, label: sub(e.label) };
  });
  if (!nodesChanged && !edgesChanged) return s;
  return { ...s, nodes: nodesChanged ? nodes : s.nodes, edges: edgesChanged ? edges : s.edges };
}

/**
 * Ids of nodes on the same page as `id` with the same kind and displayStyle
 * (and the same iconRef when `id` has one set). Includes `id` itself.
 */
export function similarTo(s: DocState, id: string): string[] {
  const src = s.nodes.find((n) => n.id === id);
  if (!src) return [];
  const first = firstPageId(s);
  const page = src.pageId ?? first;
  const kind = src.kind ?? src.type;
  const style = src.displayStyle ?? 'card';
  const icon = src.iconRef ?? null;
  return s.nodes
    .filter(
      (n) =>
        (n.pageId ?? first) === page &&
        (n.kind ?? n.type) === kind &&
        (n.displayStyle ?? 'card') === style &&
        (!icon || (n.iconRef?.set === icon.set && n.iconRef?.id === icon.id)),
    )
    .map((n) => n.id);
}
