/**
 * Global search engine (R1-E10-T04): pure matching and merging, no React, no store.
 * Elements are searched only in docs that are loaded in this browser; workspace-wide
 * element search is R3 (catalog, CAP-M4), and the UI says so.
 */
import type { ArchNode, DiagramDoc } from '../../types';
import type { DiagramListItem } from '../../lib/contracts';

export const SEARCH_DEBOUNCE_MS = 150;

export interface DiagramHit {
  kind: 'diagram';
  /** Local doc id, or the server id for a diagram that is not loaded here. */
  id: string;
  title: string;
  sub: string;
  meta: string;
  /** True when the doc is loaded in this browser, so it can be opened right away. */
  loaded: boolean;
}

export interface ElementHit {
  kind: 'element';
  /** `${docId}:${nodeId}` */
  key: string;
  docId: string;
  nodeId: string;
  pageId: string;
  title: string;
  /** e.g. "Aurora PostgreSQL · database" */
  sub: string;
  /** e.g. "payments-saga.arch · Page 2" */
  meta: string;
  /** The element's own stroke colour, for the row dot. */
  dot?: string;
}

export interface TemplateHit {
  kind: 'template';
  id: string;
  title: string;
  sub: string;
}

export type SearchHit = DiagramHit | ElementHit | TemplateHit;
export type SearchGroup = 'Elements' | 'Diagrams' | 'Templates';

export interface SearchResults {
  elements: ElementHit[];
  diagrams: DiagramHit[];
  templates: TemplateHit[];
}

export const EMPTY_RESULTS: SearchResults = { elements: [], diagrams: [], templates: [] };

const norm = (s: string) => s.trim().toLowerCase();

/** Every whitespace-separated term must appear somewhere in the haystack. */
export function matchesAll(haystack: string, query: string): boolean {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  const h = haystack.toLowerCase();
  return terms.every((t) => h.includes(t));
}

function propertyText(n: ArchNode): string {
  if (!n.properties) return '';
  return Object.values(n.properties)
    .filter((v) => v !== null && v !== undefined)
    .map(String)
    .join(' ');
}

function nodeHaystack(n: ArchNode): string {
  return [n.label, n.technology, n.tag, n.kind, n.type, propertyText(n)].filter(Boolean).join(' ');
}

function pageName(doc: DiagramDoc, pageId: string | undefined): string {
  const pages = doc.pages ?? [];
  const id = pageId ?? pages[0]?.id;
  return pages.find((p) => p.id === id)?.name ?? 'Page 1';
}

export function searchLocalDiagrams(docs: DiagramDoc[], q: string): DiagramHit[] {
  return docs
    .filter((d) => matchesAll(`${d.title} ${(d.tags ?? []).join(' ')}`, q))
    .map((d) => ({
      kind: 'diagram' as const,
      id: d.id,
      title: d.title,
      sub: (d.tags ?? []).length ? (d.tags ?? []).join(' · ') : 'This browser',
      meta: `${d.nodes.length} element${d.nodes.length === 1 ? '' : 's'}`,
      loaded: true,
    }));
}

/**
 * Merges server rows into local hits without duplicates. A server row whose id is a local
 * doc id is the same diagram; a row is also dropped when it is tagged as a team template.
 */
export function mergeDiagramHits(local: DiagramHit[], server: DiagramListItem[], localIds: Set<string>): DiagramHit[] {
  const seen = new Set(local.map((h) => h.id));
  const out = [...local];
  for (const row of server) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      kind: 'diagram',
      id: row.id,
      title: row.title,
      sub: (row.tags ?? []).length ? (row.tags ?? []).join(' · ') : 'Workspace',
      meta: typeof row.version === 'number' ? `v${row.version}` : '',
      loaded: localIds.has(row.id),
    });
  }
  return out;
}

export function searchLocalElements(docs: DiagramDoc[], q: string, limit = 50): ElementHit[] {
  const out: ElementHit[] = [];
  for (const d of docs) {
    for (const n of d.nodes) {
      if (n.kind === 'boundary' && !n.label) continue;
      if (!matchesAll(nodeHaystack(n), q)) continue;
      const pageId = n.pageId ?? d.pages?.[0]?.id ?? 'pg-1';
      out.push({
        kind: 'element',
        key: `${d.id}:${n.id}`,
        docId: d.id,
        nodeId: n.id,
        pageId,
        title: n.label || n.id,
        sub: [n.technology ?? n.tag, n.kind ?? n.type].filter(Boolean).join(' · '),
        meta: `${d.title} · ${pageName(d, n.pageId)}`,
        dot: n.stroke,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function searchTemplates(templates: Array<{ id: string; title: string; category: string }>, q: string): TemplateHit[] {
  return templates
    .filter((t) => matchesAll(`${t.title} ${t.category}`, q))
    .map((t) => ({ kind: 'template' as const, id: t.id, title: t.title, sub: t.category }));
}

export type SearchFilter = 'all' | 'elements' | 'diagrams' | 'templates';

/** Flat, keyboard-ordered list: Elements, Diagrams, Templates. */
export function flattenResults(r: SearchResults, filter: SearchFilter = 'all'): SearchHit[] {
  return [
    ...(filter === 'all' || filter === 'elements' ? r.elements : []),
    ...(filter === 'all' || filter === 'diagrams' ? r.diagrams : []),
    ...(filter === 'all' || filter === 'templates' ? r.templates : []),
  ];
}

export function hitKey(h: SearchHit): string {
  return h.kind === 'element' ? h.key : `${h.kind}:${h.id}`;
}

export const FILTER_ORDER: SearchFilter[] = ['all', 'elements', 'diagrams', 'templates'];

/** DOM id of a result option, for aria-activedescendant. */
export const searchOptionId = (h: SearchHit): string => `gs-${hitKey(h).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
