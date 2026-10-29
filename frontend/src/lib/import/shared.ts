/** Helpers shared by the importers (EPIC-09). Pure: no React, no store. */
import { normalizeDoc } from '../docModel';
import type { ArchEdge, ArchNode, FreeText, Layer, Page } from '../../types';
import { IMPORT_LIMITS, type ImportFormat, type ImportResult, type ImportStats, type ImportWarning } from './types';

/** fitBoundary-like padding: 24 px around the children, plus a 28 px label band on top. */
export const BOUNDARY_PADDING = 24;
export const BOUNDARY_LABEL_BAND = 28;

export const DEFAULT_NODE_STROKE = '#2563EB';
export const DEFAULT_BOUNDARY_STROKE = '#64748B';
export const DEFAULT_EDGE_COLOR = '#64748B';

export function emptyStats(): ImportStats {
  return { pages: 0, nodes: 0, edges: 0, boundaries: 0, skipped: 0 };
}

export function failure(format: ImportFormat, error: string, warnings: ImportWarning[] = []): ImportResult {
  return { ok: false, format, stats: emptyStats(), warnings, error };
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function tooLarge(format: ImportFormat, src: string): ImportResult | null {
  const bytes = byteLength(src);
  if (bytes <= IMPORT_LIMITS.bytes) return null;
  return failure(format, `File is ${bytes} bytes; the limit is ${IMPORT_LIMITS.bytes} bytes.`);
}

export function titleFromFileName(fileName: string, fallback: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]+$/, '').trim();
  return stem || fallback;
}

/** First non-empty line is the name; the remaining lines become the technology. */
export function splitNameTechnology(text: string): { label: string; technology: string } {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
  return { label: lines[0] ?? '', technology: lines.slice(1).join(' ') };
}

/**
 * Fits every boundary around its direct children (nodes whose parentId is the
 * boundary), innermost first so nested boundaries grow their parents. A boundary
 * with no children keeps its geometry. Mutates and returns `nodes`. World coords.
 */
export function fitBoundaries(nodes: ArchNode[]): ArchNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (n: ArchNode): number => {
    let d = 0;
    let cur: ArchNode | undefined = n;
    const seen = new Set<string>();
    while (cur && typeof cur.parentId === 'string' && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      d++;
    }
    return d;
  };
  const boundaries = nodes.filter((n) => n.kind === 'boundary').sort((a, b) => depthOf(b) - depthOf(a));
  for (const b of boundaries) {
    const kids = nodes.filter((n) => n.parentId === b.id);
    if (kids.length === 0) continue;
    const minX = Math.min(...kids.map((k) => k.x));
    const minY = Math.min(...kids.map((k) => k.y));
    const maxX = Math.max(...kids.map((k) => k.x + k.w));
    const maxY = Math.max(...kids.map((k) => k.y + k.h));
    b.x = minX - BOUNDARY_PADDING;
    b.y = minY - BOUNDARY_PADDING - BOUNDARY_LABEL_BAND;
    b.w = maxX - minX + BOUNDARY_PADDING * 2;
    b.h = maxY - minY + BOUNDARY_PADDING * 2 + BOUNDARY_LABEL_BAND;
  }
  return nodes;
}

export interface FinishInput {
  format: ImportFormat;
  title: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  pages: Page[];
  layers?: Layer[];
  texts?: FreeText[];
  warnings: ImportWarning[];
  skipped: number;
}

/** Applies IMPORT_LIMITS, runs normalizeDoc and builds the stats. */
export function finish(input: FinishInput): ImportResult {
  const { format, warnings } = input;
  if (input.pages.length > IMPORT_LIMITS.pages)
    return failure(format, `File has ${input.pages.length} pages; the limit is ${IMPORT_LIMITS.pages}.`, warnings);
  if (input.nodes.length > IMPORT_LIMITS.nodes)
    return failure(format, `File has ${input.nodes.length} elements; the limit is ${IMPORT_LIMITS.nodes}.`, warnings);
  if (input.edges.length > IMPORT_LIMITS.edges)
    return failure(format, `File has ${input.edges.length} connections; the limit is ${IMPORT_LIMITS.edges}.`, warnings);
  const doc = normalizeDoc({
    title: input.title,
    nodes: input.nodes,
    edges: input.edges,
    pages: input.pages,
    layers: input.layers,
    texts: input.texts ?? [],
  });
  if (!doc) return failure(format, 'The imported document could not be normalised.', warnings);
  const boundaries = doc.nodes.filter((n) => n.kind === 'boundary').length;
  return {
    ok: true,
    format,
    doc: {
      title: doc.title,
      nodes: doc.nodes,
      edges: doc.edges,
      pages: doc.pages,
      layers: doc.layers,
      texts: doc.texts,
    },
    stats: {
      pages: doc.pages?.length ?? 1,
      nodes: doc.nodes.length - boundaries,
      edges: doc.edges.length,
      boundaries,
      skipped: input.skipped,
    },
    warnings,
  };
}
