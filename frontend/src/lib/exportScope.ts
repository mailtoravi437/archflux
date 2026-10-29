/** Pure export scoping: which page, selection and layers an export covers (R1-E09-T04). */
import type { DiagramDoc, Layer, Page } from '../types';

export type ExportScope = 'page' | 'all' | 'selection';

export interface ScopeOptions {
  scope?: ExportScope;
  /** Page for scope `page`; defaults to the first page. */
  pageId?: string;
  /** Element ids for scope `selection` (nodes, strokes and texts). */
  selectedIds?: string[];
  /** Hidden layers are skipped unless this is true. Only applied when set explicitly. */
  includeHiddenLayers?: boolean;
}

const DEFAULT_PAGE: Page = { id: 'pg-1', name: 'Page 1', order: 0 };
const DEFAULT_LAYER_ID = 'ly-default';

export function pagesOf(doc: Pick<DiagramDoc, 'pages'>): Page[] {
  const pages = doc.pages && doc.pages.length > 0 ? doc.pages : [DEFAULT_PAGE];
  return [...pages].sort((a, b) => a.order - b.order);
}

export function layersOf(doc: Pick<DiagramDoc, 'layers'>): Layer[] {
  return doc.layers ?? [];
}

/** Scoped copy of the doc. Without any scoping option the doc is returned unchanged. */
export function scopeDoc(doc: DiagramDoc, o: ScopeOptions): DiagramDoc {
  if (!o.scope && o.includeHiddenLayers === undefined) return doc;
  const pages = pagesOf(doc);
  const firstPage = pages[0].id;
  const hiddenLayers = new Set(
    o.includeHiddenLayers === true ? [] : layersOf(doc).filter((l) => !l.visible).map((l) => l.id),
  );
  const layerOk = (layerId: string | undefined) => !hiddenLayers.has(layerId ?? DEFAULT_LAYER_ID);
  const pageId = o.pageId ?? firstPage;
  const pageOk = (p: string | undefined) => o.scope !== 'page' || (p ?? firstPage) === pageId;
  const picked = o.scope === 'selection' ? new Set(o.selectedIds ?? []) : null;
  const pickOk = (id: string) => !picked || picked.has(id);

  const nodes = doc.nodes.filter((n) => pageOk(n.pageId) && layerOk(n.layerId) && pickOk(n.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => nodeIds.has(e.from) && (!e.to || nodeIds.has(e.to)));
  const strokes = (doc.strokes ?? []).filter((s) => pageOk(s.pageId) && layerOk(s.layerId) && pickOk(s.id));
  const texts = (doc.texts ?? []).filter((t) => pageOk(t.pageId) && layerOk(t.layerId) && pickOk(t.id));
  const outPages = o.scope === 'page' ? pages.filter((p) => p.id === pageId) : doc.pages;
  return { ...doc, nodes, edges, strokes, texts, pages: outPages };
}
