/**
 * The one document normaliser (DATA_MODEL_R1 §1.2, §2.5). Every load path
 * (localStorage, server, `.arch` import, templates) runs docs through here so
 * state always holds one well-defined shape. Pure: no React, no store.
 */
import type {
  ArchEdge,
  ArchNode,
  DiagramDoc,
  DisplayStyle,
  ElementKind,
  ElementSize,
  FreeStroke,
  FreeText,
  Layer,
  Page,
  RelationshipKind,
} from '../types';

export const DOC_SCHEMA_VERSION = 2;

const DEFAULT_PAGE_ID = 'pg-1';
const DEFAULT_LAYER_ID = 'ly-default';

const ELEMENT_KINDS: ReadonlySet<string> = new Set<ElementKind>([
  'person', 'client', 'external', 'gateway', 'service', 'function',
  'database', 'document-db', 'cache', 'queue', 'stream', 'object-storage',
  'search', 'cdn', 'scheduler', 'observability', 'boundary', 'note',
]);
const DISPLAY_STYLES: ReadonlySet<string> = new Set<DisplayStyle>(['icon', 'card', 'shape']);
const SIZES: ReadonlySet<string> = new Set<ElementSize>(['S', 'M', 'L']);
const REL_KINDS: ReadonlySet<string> = new Set<RelationshipKind>(['sync', 'async', 'replication', 'bidirectional']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isKind = (v: unknown): v is ElementKind => typeof v === 'string' && ELEMENT_KINDS.has(v);
const isStyle = (v: unknown): v is DisplayStyle => typeof v === 'string' && DISPLAY_STYLES.has(v);
const isSize = (v: unknown): v is ElementSize => typeof v === 'string' && SIZES.has(v);
const isRelKind = (v: unknown): v is RelationshipKind => typeof v === 'string' && REL_KINDS.has(v);

export function defaultPage(): Page {
  return { id: DEFAULT_PAGE_ID, name: 'Page 1', order: 0 };
}

export function defaultLayer(): Layer {
  return { id: DEFAULT_LAYER_ID, name: 'Default', order: 0, visible: true, locked: false };
}

export function newId(prefix: 'n' | 'e' | 'pg' | 'ly' | 'fd'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Legacy `type` / `shape` → kind + display style (DATA_MODEL_R1 §2.1 table). */
function legacyKind(n: ArchNode): { kind: ElementKind; displayStyle: DisplayStyle } {
  let kind: ElementKind;
  let displayStyle: DisplayStyle;
  if (n.type === 'db' || n.shape === 'cylinder') {
    kind = 'database';
    displayStyle = 'shape';
  } else if (n.type === 'stream') {
    kind = 'stream';
    displayStyle = 'shape';
  } else if (n.type === 'gateway') {
    kind = 'gateway';
    displayStyle = 'card';
  } else if (n.type === 'note') {
    kind = 'note';
    displayStyle = 'card';
  } else {
    kind = 'service';
    displayStyle = 'card';
  }
  if (n.shape === 'logo') displayStyle = 'icon';
  return { kind, displayStyle };
}

function firstPageId(doc: DiagramDoc): string {
  const first = doc.pages && doc.pages.length > 0 ? doc.pages[0] : undefined;
  return first ? first.id : DEFAULT_PAGE_ID;
}

export function normalizeNode(n: ArchNode, doc: DiagramDoc): ArchNode {
  const out: ArchNode = { ...n };
  if (!isKind(out.kind)) {
    const legacy = legacyKind(out);
    out.kind = legacy.kind;
    if (!isStyle(out.displayStyle)) out.displayStyle = legacy.displayStyle;
  } else if (out.displayStyle !== undefined && !isStyle(out.displayStyle)) {
    delete out.displayStyle;
  }
  // `tag` stays as-is: the current renderer still reads it.
  if (typeof out.technology !== 'string' && typeof out.tag === 'string' && out.tag !== '') {
    out.technology = out.tag;
  }
  if (typeof out.pageId !== 'string' || out.pageId === '') out.pageId = firstPageId(doc);
  if (typeof out.layerId !== 'string' || out.layerId === '') out.layerId = DEFAULT_LAYER_ID;
  if (out.size !== undefined && !isSize(out.size)) out.size = 'M';
  if (out.parentId !== undefined && out.parentId !== null && typeof out.parentId !== 'string') delete out.parentId;
  return out;
}

export function normalizeEdge(e: ArchEdge): ArchEdge {
  const out: ArchEdge = { ...e };
  if (!isRelKind(out.relKind)) {
    const style = out.lineStyle ?? (out.dashed ? 'dashed' : 'solid');
    if (style === 'dotted') out.relKind = 'replication';
    else if (style === 'dashed' || out.dashed === true) out.relKind = 'async';
    else if (out.arrow === 'both') out.relKind = 'bidirectional';
    else out.relKind = 'sync';
  }
  if (out.labelPos !== undefined) {
    if (typeof out.labelPos !== 'number' || !Number.isFinite(out.labelPos)) delete out.labelPos;
    else out.labelPos = Math.min(1, Math.max(0, out.labelPos));
  }
  if (out.waypoints !== undefined) {
    if (!Array.isArray(out.waypoints)) delete out.waypoints;
    else
      out.waypoints = out.waypoints
        .filter((p) => isRecord(p) && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({ x: p.x, y: p.y }));
  }
  return out;
}

function sanitizePages(v: unknown): Page[] {
  const pages = Array.isArray(v)
    ? v.filter((p): p is Page => isRecord(p) && typeof p.id === 'string' && p.id !== '' && typeof p.name === 'string' && Number.isFinite(p.order))
    : [];
  return pages.length > 0 ? pages.map((p) => ({ ...p })) : [defaultPage()];
}

function sanitizeLayers(v: unknown): Layer[] {
  const layers = Array.isArray(v)
    ? v
        .filter((l): l is Layer => isRecord(l) && typeof l.id === 'string' && l.id !== '' && typeof l.name === 'string' && Number.isFinite(l.order))
        .map((l) => ({ ...l, visible: l.visible !== false, locked: l.locked === true }))
    : [];
  return layers.length > 0 ? layers : [defaultLayer()];
}

function sanitizeDefaults(v: unknown): DiagramDoc['defaults'] | undefined {
  if (!isRecord(v)) return undefined;
  const out: NonNullable<DiagramDoc['defaults']> = {};
  if (isStyle(v.displayStyle)) out.displayStyle = v.displayStyle;
  if (isSize(v.size)) out.size = v.size;
  if (typeof v.propertyLine === 'string') out.propertyLine = v.propertyLine;
  return out;
}

/** Drop parentIds to missing nodes / other pages / self, then break cycles. */
function fixParents(nodes: ArchNode[]): ArchNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (typeof n.parentId !== 'string') continue;
    const parent = byId.get(n.parentId);
    if (!parent || parent === n || parent.pageId !== n.pageId) delete n.parentId;
  }
  const settled = new Set<string>();
  for (const start of nodes) {
    const path = new Set<string>();
    let cur: ArchNode | undefined = start;
    while (cur && !settled.has(cur.id)) {
      path.add(cur.id);
      const pid: string | null | undefined = cur.parentId;
      if (typeof pid !== 'string') break;
      if (path.has(pid)) {
        // The link that closes the loop is cleared on the child.
        delete cur.parentId;
        break;
      }
      cur = byId.get(pid);
    }
    for (const id of path) settled.add(id);
  }
  return nodes;
}

function withPlacement<T extends FreeStroke | FreeText>(item: T, pageId: string): T {
  const out = { ...item };
  if (typeof out.pageId !== 'string' || out.pageId === '') out.pageId = pageId;
  if (typeof out.layerId !== 'string' || out.layerId === '') out.layerId = DEFAULT_LAYER_ID;
  return out;
}

export function normalizeDoc(raw: unknown): DiagramDoc | null {
  if (!isRecord(raw)) return null;
  const pages = sanitizePages(raw.pages);
  const layers = sanitizeLayers(raw.layers);
  const doc: DiagramDoc = {
    ...(raw as Partial<DiagramDoc>),
    id: typeof raw.id === 'string' ? raw.id : '',
    title: typeof raw.title === 'string' ? raw.title : 'untitled.arch',
    nodes: [],
    edges: [],
    createdAt: Number.isFinite(raw.createdAt) ? (raw.createdAt as number) : 0,
    updatedAt: Number.isFinite(raw.updatedAt) ? (raw.updatedAt as number) : 0,
    pages,
    layers,
    schemaVersion: DOC_SCHEMA_VERSION,
  };
  const defaults = sanitizeDefaults(raw.defaults);
  if (defaults) doc.defaults = defaults;
  else delete doc.defaults;

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes.filter(isRecord) : [];
  doc.nodes = fixParents(rawNodes.map((n) => normalizeNode(n as unknown as ArchNode, doc)));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges.filter(isRecord) : [];
  doc.edges = rawEdges.map((e) => normalizeEdge(e as unknown as ArchEdge));

  const pageId = pages[0].id;
  const rawStrokes = Array.isArray(raw.strokes) ? raw.strokes.filter(isRecord) : [];
  doc.strokes = rawStrokes.map((s) => withPlacement(s as unknown as FreeStroke, pageId));
  const rawTexts = Array.isArray(raw.texts) ? raw.texts.filter(isRecord) : [];
  doc.texts = rawTexts.map((t) => withPlacement(t as unknown as FreeText, pageId));
  return doc;
}
