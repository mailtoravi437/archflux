/**
 * `.arch` file format helpers (PROD-006 import safety, PROD-007 portability).
 *
 * Pure, dependency-free validation + export construction shared by every
 * import path (Dashboard, Living file-transfer) so warning behavior is
 * identical everywhere. Validation runs fully BEFORE any mutation: a hard
 * failure returns `{ ok: false }` and the caller must leave the previous
 * graph untouched.
 */
import type { ArchEdge, ArchNode, DiagramDoc, FreeStroke, FreeText, Layer, Page } from '../types';
import { normalizeDoc } from './docModel';

/** Highest `.arch` payload version this client understands. */
export const SUPPORTED_ARCH_VERSION = 2;

/** Hard import size/count gates (PROD-006). */
export const ARCH_LIMITS = {
  maxNodes: 2000,
  maxEdges: 5000,
  maxStrokes: 500,
  maxTexts: 500,
  maxPages: 50,
  maxLayers: 20,
} as const;

export interface ArchImportSuccess {
  ok: true;
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
  /** v2 pages / layers (defaulted for v1 files by normalizeDoc). */
  pages: Page[];
  layers: Layer[];
  defaults?: DiagramDoc['defaults'];
  /** Non-fatal notes: unknown keys, defaulted fields, dropped duplicates. */
  warnings: string[];
}

export interface ArchImportFailure {
  ok: false;
  /** Human-readable reason; nothing was imported. */
  error: string;
}

export type ArchImportResult = ArchImportSuccess | ArchImportFailure;

const KNOWN_TOP_LEVEL = new Set([
  'app', 'version', 'spec', 'nodes', 'edges', 'strokes', 'texts', 'pages', 'layers', 'defaults', 'metadata',
]);

const NUM = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

/**
 * Optional fields carried through import with a primitive type check. Enum
 * values (kind, displayStyle, size, relKind, …) are re-validated by
 * normalizeDoc; everything else not listed here is dropped.
 */
const NODE_OPTIONAL: Record<string, 'string' | 'number' | 'boolean' | 'string|null'> = {
  fill: 'string', icon: 'string', iconSrc: 'string', shape: 'string', strokeWidth: 'number', isOrphan: 'boolean',
  port: 'string', repo: 'string', source: 'string', details: 'string',
  kind: 'string', displayStyle: 'string', size: 'string', technology: 'string', parentId: 'string|null',
  pageId: 'string', layerId: 'string', locked: 'boolean', z: 'number', boundaryKind: 'string',
  collapsed: 'boolean', customSize: 'boolean', linkPageId: 'string',
};
const EDGE_OPTIONAL: Record<string, 'string' | 'number' | 'boolean' | 'string|null' | 'number|null'> = {
  dashed: 'boolean', lineStyle: 'string', arrow: 'string', relKind: 'string', labelPos: 'number',
  step: 'number|null', fromPort: 'string|null', toPort: 'string|null',
};

function pickOptional(src: Record<string, unknown>, spec: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(spec)) {
    const v = src[key];
    if (v === undefined) continue;
    const ok = type.split('|').some((t) => (t === 'null' ? v === null : t === 'number' ? NUM(v) : typeof v === t));
    if (ok) out[key] = v;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function nodeExtras(n: Record<string, unknown>): Partial<ArchNode> {
  const out = pickOptional(n, NODE_OPTIONAL) as Partial<ArchNode>;
  if (n.iconRef === null) out.iconRef = null;
  else if (isRecord(n.iconRef) && typeof n.iconRef.set === 'string' && typeof n.iconRef.id === 'string') {
    out.iconRef = { set: n.iconRef.set, id: n.iconRef.id } as ArchNode['iconRef'];
  }
  if (isRecord(n.properties)) {
    const props: NonNullable<ArchNode['properties']> = {};
    for (const [k, v] of Object.entries(n.properties)) {
      if (v === null || typeof v === 'string' || typeof v === 'boolean' || NUM(v)) props[k] = v as string | number | boolean | null;
    }
    out.properties = props;
  }
  return out;
}

function edgeExtras(r: Record<string, unknown>): Partial<ArchEdge> {
  const out = pickOptional(r, EDGE_OPTIONAL) as Partial<ArchEdge>;
  if (isRecord(r.targetCoords) && NUM(r.targetCoords.x) && NUM(r.targetCoords.y)) {
    out.targetCoords = { x: r.targetCoords.x as number, y: r.targetCoords.y as number };
  }
  // Non-finite points are dropped by normalizeEdge.
  if (Array.isArray(r.waypoints)) out.waypoints = r.waypoints as ArchEdge['waypoints'];
  return out;
}

function nodeDefaults(n: Record<string, unknown>, warnings: string[], seen: Set<string>): ArchNode | null {
  if (typeof n.id !== 'string' || !n.id) return null;
  if (seen.has(n.id)) {
    warnings.push(`Dropped duplicate node id "${n.id}" (kept first occurrence)`);
    return null;
  }
  seen.add(n.id);
  if (typeof n.label !== 'string') {
    warnings.push(`Node "${n.id}": missing label — defaulted to id`);
  }
  if (!NUM(n.x) || !NUM(n.y) || !NUM(n.w) || !NUM(n.h)) return null;
  return {
    ...nodeExtras(n),
    id: n.id,
    type: typeof n.type === 'string' ? n.type : 'service',
    label: typeof n.label === 'string' ? n.label : n.id,
    tag: typeof n.tag === 'string' ? n.tag : '',
    health: typeof n.health === 'string' ? n.health : 'Unknown',
    x: n.x as number,
    y: n.y as number,
    w: n.w as number,
    h: n.h as number,
    stroke: typeof n.stroke === 'string' ? n.stroke : '#2563EB',
    ...(typeof n.icon === 'string' ? { icon: n.icon } : {}),
    ...(typeof n.iconSrc === 'string' ? { iconSrc: n.iconSrc } : {}),
  };
}

/**
 * Validate an untrusted `.arch` payload. Never throws; never mutates.
 * Hard failures (missing nodes/edges, wrong shapes, over limits) return
 * `{ ok: false }`. Soft issues accumulate in `warnings`.
 */
export function validateArchImport(data: unknown): ArchImportResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'Invalid .arch file: expected a JSON object' };
  }
  const v = data as Record<string, unknown>;

  const warnings: string[] = [];
  for (const key of Object.keys(v)) {
    if (!KNOWN_TOP_LEVEL.has(key)) warnings.push(`Unknown top-level key "${key}" ignored`);
  }

  const rawVersion = v.version;
  if (typeof rawVersion === 'number' && rawVersion > SUPPORTED_ARCH_VERSION) {
    warnings.push(
      `File version ${rawVersion} is newer than supported (${SUPPORTED_ARCH_VERSION}) — unknown fields may have been ignored`,
    );
  }

  const { nodes, edges, strokes, texts } = v;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { ok: false, error: 'Invalid .arch file: missing nodes/edges' };
  }
  if (nodes.length > ARCH_LIMITS.maxNodes || edges.length > ARCH_LIMITS.maxEdges) {
    return {
      ok: false,
      error: `Import too large: ${nodes.length} nodes / ${edges.length} edges exceed limits (${ARCH_LIMITS.maxNodes}/${ARCH_LIMITS.maxEdges})`,
    };
  }
  if (Array.isArray(strokes) && strokes.length > ARCH_LIMITS.maxStrokes) {
    return { ok: false, error: `Import too large: ${strokes.length} strokes exceed limit (${ARCH_LIMITS.maxStrokes})` };
  }
  if (Array.isArray(texts) && texts.length > ARCH_LIMITS.maxTexts) {
    return { ok: false, error: `Import too large: ${texts.length} text labels exceed limit (${ARCH_LIMITS.maxTexts})` };
  }
  const { pages, layers, defaults } = v;
  if (Array.isArray(pages) && pages.length > ARCH_LIMITS.maxPages) {
    return { ok: false, error: `Import too large: ${pages.length} pages exceed limit (${ARCH_LIMITS.maxPages})` };
  }
  if (Array.isArray(layers) && layers.length > ARCH_LIMITS.maxLayers) {
    return { ok: false, error: `Import too large: ${layers.length} layers exceed limit (${ARCH_LIMITS.maxLayers})` };
  }

  const seen = new Set<string>();
  const validNodes: ArchNode[] = [];
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) {
      warnings.push('Dropped a malformed node entry (not an object)');
      continue;
    }
    const clean = nodeDefaults(n as Record<string, unknown>, warnings, seen);
    if (clean) validNodes.push(clean);
    else if (typeof (n as Record<string, unknown>).id === 'string') {
      warnings.push(`Dropped node "${(n as Record<string, unknown>).id}" (invalid geometry)`);
    } else {
      warnings.push('Dropped a node entry with missing id');
    }
  }
  if (validNodes.length === 0) {
    return { ok: false, error: 'Invalid .arch file: no usable nodes' };
  }

  const ids = new Set(validNodes.map((n) => n.id));
  const seenEdges = new Set<string>();
  const validEdges: ArchEdge[] = [];
  for (const e of edges) {
    if (typeof e !== 'object' || e === null || typeof (e as Record<string, unknown>).id !== 'string') {
      warnings.push('Dropped a malformed route entry');
      continue;
    }
    const r = e as Record<string, unknown>;
    if (seenEdges.has(r.id as string)) {
      warnings.push(`Dropped duplicate route id "${r.id as string}" (kept first occurrence)`);
      continue;
    }
    if (typeof r.from !== 'string' || !ids.has(r.from) || (r.to !== null && (typeof r.to !== 'string' || !ids.has(r.to)))) {
      warnings.push(`Dropped route "${r.id as string}" (dangling or unknown endpoint)`);
      continue;
    }
    seenEdges.add(r.id as string);
    validEdges.push({
      ...edgeExtras(r),
      id: r.id as string,
      from: r.from,
      to: r.to as string | null,
      label: typeof r.label === 'string' ? r.label : 'route',
      color: typeof r.color === 'string' ? r.color : '#2563EB',
      ...(r.isDangling === true ? { isDangling: true as const } : {}),
      ...(typeof r.protocol === 'string' ? { protocol: r.protocol } : {}),
    });
  }

  const validStrokes: FreeStroke[] = Array.isArray(strokes)
    ? (strokes as unknown[]).filter(
        (s): s is FreeStroke =>
          typeof s === 'object' && s !== null &&
          typeof (s as Record<string, unknown>).id === 'string' &&
          Array.isArray((s as Record<string, unknown>).pts),
      )
    : [];
  if (Array.isArray(strokes) && validStrokes.length < strokes.length) {
    warnings.push(`Dropped ${strokes.length - validStrokes.length} malformed ink strokes`);
  }
  const validTexts: FreeText[] = Array.isArray(texts)
    ? (texts as unknown[]).filter(
        (t): t is FreeText =>
          typeof t === 'object' && t !== null &&
          typeof (t as Record<string, unknown>).id === 'string' &&
          typeof (t as Record<string, unknown>).text === 'string' &&
          NUM((t as Record<string, unknown>).x) && NUM((t as Record<string, unknown>).y),
      )
    : [];
  if (Array.isArray(texts) && validTexts.length < texts.length) {
    warnings.push(`Dropped ${texts.length - validTexts.length} malformed text labels`);
  }

  // Every load path runs through the one normaliser (DATA_MODEL_R1 §1.2).
  // v1 files have no pages/layers: normalizeDoc fills the defaults.
  const doc = normalizeDoc({ nodes: validNodes, edges: validEdges, strokes: validStrokes, texts: validTexts, pages, layers, defaults });
  if (!doc) return { ok: false, error: 'Invalid .arch file: expected a JSON object' };
  const result: ArchImportSuccess = {
    ok: true,
    nodes: doc.nodes,
    edges: doc.edges,
    strokes: doc.strokes ?? [],
    texts: doc.texts ?? [],
    pages: doc.pages ?? [],
    layers: doc.layers ?? [],
    warnings,
  };
  if (doc.defaults) result.defaults = doc.defaults;
  return result;
}

export interface ArchExportInput {
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
  pages?: Page[];
  layers?: Layer[];
  defaults?: DiagramDoc['defaults'];
  docTitle: string;
  embedMetadata?: boolean;
}

/**
 * Build the deterministic local `.arch` payload. Stable element ids are
 * preserved verbatim so export → import round-trips without remapping
 * (PROD-007).
 */
export function buildArchExport(input: ArchExportInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    app: 'ArchFlux',
    version: SUPPORTED_ARCH_VERSION,
    spec: 'RFC-Architecture-Graph',
    nodes: input.nodes.map((n) => ({ ...n })),
    edges: input.edges.map((e) => ({ ...e })),
    strokes: input.strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })) })),
    texts: input.texts.map((t) => ({ ...t })),
  };
  if (input.pages) payload.pages = input.pages.map((p) => ({ ...p }));
  if (input.layers) payload.layers = input.layers.map((l) => ({ ...l }));
  if (input.defaults) payload.defaults = { ...input.defaults };
  if (input.embedMetadata !== false) {
    payload.metadata = {
      exportedAt: new Date().toISOString(),
      docTitle: input.docTitle,
      nodeCount: input.nodes.length,
      edgeCount: input.edges.length,
      strokeCount: input.strokes.length,
    };
  }
  return payload;
}
