/**
 * Per-page, per-layer view of a document (R1-E03-T04 / T05). Pure: no React, no store.
 * The canvas draws, hit-tests, minimaps and lints this view, never the raw document, so
 * elements of other pages and of hidden layers are neither drawn nor selectable.
 */
import type { ArchEdge, ArchNode, FreeStroke, FreeText, Layer, Page } from '../types';

export const DEFAULT_LAYER = 'ly-default';

export interface PageViewInput {
  nodes: readonly ArchNode[];
  edges: readonly ArchEdge[];
  strokes: readonly FreeStroke[];
  texts: readonly FreeText[];
  pages: readonly Page[];
  layers: readonly Layer[];
}

export interface PageView {
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
}

/** Id of the first page by `order`: elements without a `pageId` live there. */
export function firstPageId(pages: readonly Page[]): string {
  return [...pages].sort((a, b) => a.order - b.order)[0]?.id ?? '';
}

/** Ids of locked layers: their elements are drawn but cannot be selected or moved. */
export function lockedLayerIds(layers: readonly Layer[]): Set<string> {
  return new Set(layers.filter((l) => l.locked).map((l) => l.id));
}

/** True when the node is locked itself or sits on a locked layer. */
export function isEffectivelyLocked(n: Pick<ArchNode, 'locked' | 'layerId'>, locked: ReadonlySet<string>): boolean {
  return n.locked === true || locked.has(n.layerId ?? DEFAULT_LAYER);
}

/**
 * What the canvas shows for `activePageId`. Nodes come back in paint order: by layer `order`, then
 * `z`; elements that tie keep their document order (so a document without layers or z paints as before).
 */
export function pageView(doc: PageViewInput, activePageId: string): PageView {
  const first = firstPageId(doc.pages);
  const hidden = new Set(doc.layers.filter((l) => !l.visible).map((l) => l.id));
  const layerOrder = new Map(doc.layers.map((l) => [l.id, l.order]));
  const onPage = (e: { pageId?: string }) => (e.pageId ?? first) === activePageId;
  const shown = (e: { layerId?: string }) => !hidden.has(e.layerId ?? DEFAULT_LAYER);

  const nodes = doc.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => onPage(n) && shown(n))
    .sort(
      (a, b) =>
        (layerOrder.get(a.n.layerId ?? DEFAULT_LAYER) ?? 0) - (layerOrder.get(b.n.layerId ?? DEFAULT_LAYER) ?? 0) ||
        (a.n.z ?? 0) - (b.n.z ?? 0) ||
        a.i - b.i,
    )
    .map(({ n }) => n);
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: doc.edges.filter((e) => ids.has(e.from) && (e.to === null || ids.has(e.to))),
    strokes: doc.strokes.filter((s) => onPage(s) && shown(s)),
    texts: doc.texts.filter((t) => onPage(t) && shown(t)),
  };
}
