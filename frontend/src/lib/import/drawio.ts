/**
 * draw.io (.drawio / mxGraph XML) importer (R1-E09-T01). Pure: no store, no
 * network. Each `<diagram>` becomes a page; cells map per the EPIC-09 table.
 * Output coordinates are absolute world coordinates.
 */
import type { ArchEdge, ArchNode, BoundaryKind, ElementKind, FreeText, Layer, Page } from '../../types';
import { DEFAULT_ICON_LOOKUP, resolveDrawioAwsIcon, type IconLookup } from './drawioIcons';
import {
  DEFAULT_BOUNDARY_STROKE,
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_STROKE,
  failure,
  finish,
  splitNameTechnology,
  titleFromFileName,
  tooLarge,
} from './shared';
import type { ImportResult, ImportWarning } from './types';

export type InflateRaw = (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>;

export interface DrawioImportOptions {
  /** Resolves manifest ids; defaults to the built-in AWS subset (no fetch). */
  iconLookup?: IconLookup;
  /** Raw-DEFLATE inflater; defaults to `DecompressionStream('deflate-raw')` when available. */
  inflateRaw?: InflateRaw;
}

const ELEMENT_KINDS: ReadonlySet<string> = new Set<ElementKind>([
  'person', 'client', 'external', 'gateway', 'service', 'function',
  'database', 'document-db', 'cache', 'queue', 'stream', 'object-storage',
  'search', 'cdn', 'scheduler', 'observability', 'note',
]);
const isElementKind = (k: string): k is ElementKind => ELEMENT_KINDS.has(k);

const SHORT_LABEL = 24;
const DEFAULT_LAYER_ID = 'ly-default';

// ── Decoding ────────────────────────────────────────────────────────────────

async function defaultInflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const input = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
  const reader = input.pipeThrough(ds).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function pickInflater(options: DrawioImportOptions): InflateRaw | null {
  if (options.inflateRaw) return options.inflateRaw;
  if (typeof DecompressionStream === 'function' && typeof ReadableStream === 'function') return defaultInflateRaw;
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** base64 → raw DEFLATE → URI-encoded XML (draw.io's compressed diagram body). */
export async function decodeCompressedDiagram(body: string, inflate: InflateRaw): Promise<string> {
  const inflated = await inflate(base64ToBytes(body));
  const text = new TextDecoder().decode(inflated);
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  return doc;
}

// ── Cells ───────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

interface Cell {
  id: string;
  parent?: string;
  value: string;
  html: boolean;
  tokens: Set<string>;
  style: Map<string, string>;
  vertex: boolean;
  edge: boolean;
  source?: string;
  target?: string;
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  points: Pt[];
  targetPoint?: Pt;
}

function num(el: Element | null | undefined, attr: string, fallback = 0): number {
  const v = el?.getAttribute(attr);
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseStyle(raw: string): { tokens: Set<string>; style: Map<string, string> } {
  const tokens = new Set<string>();
  const style = new Map<string, string>();
  for (const part of raw.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq < 0) tokens.add(p);
    else style.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
  }
  return { tokens, style };
}

function readCell(el: Element): Cell {
  const wrapper = el.parentElement;
  const wrapped = wrapper !== null && (wrapper.tagName === 'UserObject' || wrapper.tagName === 'object');
  const id = (wrapped ? wrapper.getAttribute('id') : null) ?? el.getAttribute('id') ?? '';
  const value = (wrapped ? wrapper.getAttribute('label') : null) ?? el.getAttribute('value') ?? '';
  const { tokens, style } = parseStyle(el.getAttribute('style') ?? '');
  let geo: Element | null = null;
  for (const c of Array.from(el.children)) if (c.tagName === 'mxGeometry') geo = c;
  const points: Pt[] = [];
  let targetPoint: Pt | undefined;
  if (geo) {
    for (const c of Array.from(geo.children)) {
      if (c.tagName === 'Array' && c.getAttribute('as') === 'points') {
        for (const p of Array.from(c.children)) if (p.tagName === 'mxPoint') points.push({ x: num(p, 'x'), y: num(p, 'y') });
      } else if (c.tagName === 'mxPoint' && c.getAttribute('as') === 'targetPoint') {
        targetPoint = { x: num(c, 'x'), y: num(c, 'y') };
      }
    }
  }
  return {
    id,
    parent: el.getAttribute('parent') ?? undefined,
    value,
    html: style.get('html') === '1',
    tokens,
    style,
    vertex: el.getAttribute('vertex') === '1',
    edge: el.getAttribute('edge') === '1',
    source: el.getAttribute('source') ?? undefined,
    target: el.getAttribute('target') ?? undefined,
    visible: el.getAttribute('visible') !== '0',
    x: num(geo, 'x'),
    y: num(geo, 'y'),
    w: num(geo, 'width', 120),
    h: num(geo, 'height', 60),
    points,
    targetPoint,
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Strips HTML tags, decodes entities and keeps line breaks (`<br>`, block elements). */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let out = '';
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += child.textContent ?? '';
      else if (child.nodeType === 1) {
        const tag = (child as Element).tagName;
        if (tag === 'BR') {
          out += '\n';
          continue;
        }
        const block = BLOCK_TAGS.has(tag);
        if (block && out !== '' && !out.endsWith('\n')) out += '\n';
        walk(child);
        if (block && !out.endsWith('\n')) out += '\n';
      }
    }
  };
  walk(doc.body);
  return out
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l !== '')
    .join('\n');
}

function cellText(c: Cell): string {
  const text = c.html ? htmlToText(c.value) : c.value;
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join('\n');
}

// ── Classification ──────────────────────────────────────────────────────────

type Mapping =
  | { as: 'skip'; code: string; message: string }
  | { as: 'transparent' }
  | { as: 'text' }
  | { as: 'edgeLabel' }
  | { as: 'node'; kind: ElementKind | 'boundary'; boundaryKind?: BoundaryKind; displayStyle?: 'icon' | 'card' | 'shape'; iconId?: string; warn?: { code: string; message: string } };

function shapeOf(c: Cell): string {
  return c.style.get('shape') ?? '';
}

function hasToken(c: Cell, name: string): boolean {
  return c.tokens.has(name) || shapeOf(c) === name;
}

function boundaryKindFor(name: string, label: string): BoundaryKind {
  const n = name.toLowerCase();
  const l = label.toLowerCase();
  if (n.includes('public_subnet') || l.includes('public subnet')) return 'subnet-public';
  if (n.includes('private_subnet') || l.includes('private subnet')) return 'subnet-private';
  if (n.includes('vpc')) return 'vpc';
  if (n.includes('region')) return 'region';
  if (n.includes('availability_zone')) return 'az';
  if (n.includes('security_group')) return 'security-group';
  if (n.includes('cloud')) return 'cloud';
  return 'c4-system';
}

function classify(c: Cell, cells: Map<string, Cell>, lookup: IconLookup): Mapping {
  const parent = c.parent ? cells.get(c.parent) : undefined;
  if (parent?.edge) return { as: 'edgeLabel' };
  const shape = shapeOf(c);
  const ref = c.id;
  if (hasToken(c, 'image') || c.style.has('image'))
    return { as: 'skip', code: 'unsupported_image', message: `Image cell ${ref} was skipped.` };
  if (shape === 'table' || shape === 'tableRow' || hasToken(c, 'table') || c.style.get('childLayout') === 'tableLayout')
    return { as: 'skip', code: 'unsupported_table', message: `Table cell ${ref} was skipped.` };
  if (shape.startsWith('stencil('))
    return { as: 'skip', code: 'unsupported_stencil', message: `Custom stencil cell ${ref} was skipped.` };
  if (hasToken(c, 'group')) return { as: 'transparent' };
  if (hasToken(c, 'text')) return { as: 'text' };
  if (hasToken(c, 'edgeLabel')) return { as: 'edgeLabel' };

  const label = cellText(c);
  const grIcon = c.style.get('grIcon') ?? c.style.get('groupIcon') ?? '';
  if (shape.startsWith('mxgraph.aws4.group') || grIcon !== '')
    return { as: 'node', kind: 'boundary', boundaryKind: boundaryKindFor(grIcon || shape, label) };
  if (hasToken(c, 'swimlane')) return { as: 'node', kind: 'boundary', boundaryKind: 'swimlane' };
  if (c.style.get('container') === '1') return { as: 'node', kind: 'boundary', boundaryKind: boundaryKindFor('', label) };

  if (shape.startsWith('cylinder') || c.tokens.has('cylinder') || shape === 'mxgraph.flowchart.database')
    return { as: 'node', kind: 'database', displayStyle: 'shape' };

  const resIcon = c.style.get('resIcon') ?? '';
  const awsName = resIcon.startsWith('mxgraph.aws4.')
    ? resIcon.slice('mxgraph.aws4.'.length)
    : shape.startsWith('mxgraph.aws4.') && shape !== 'mxgraph.aws4.resourceIcon' && shape !== 'mxgraph.aws4.productIcon'
      ? shape.slice('mxgraph.aws4.'.length)
      : '';
  if (awsName) {
    const hit = resolveDrawioAwsIcon(awsName, lookup);
    if (hit) {
      const k = hit.kinds.find(isElementKind) ?? 'service';
      return { as: 'node', kind: k, displayStyle: 'icon', iconId: hit.id };
    }
    return {
      as: 'node',
      kind: 'service',
      displayStyle: 'card',
      warn: { code: 'icon_not_found', message: `No icon for aws4 "${awsName}" (cell ${ref}); imported as a service.` },
    };
  }

  if (hasToken(c, 'actor') || hasToken(c, 'umlActor')) return { as: 'node', kind: 'person', displayStyle: 'shape' };
  if (hasToken(c, 'ellipse') && label !== '' && !label.includes('\n') && label.length <= SHORT_LABEL)
    return { as: 'node', kind: 'person', displayStyle: 'shape' };

  if (shape.startsWith('mxgraph.'))
    return {
      as: 'node',
      kind: 'service',
      displayStyle: 'card',
      warn: { code: 'shape_approximated', message: `Shape "${shape}" (cell ${ref}) was imported as a service card.` },
    };
  return { as: 'node', kind: 'service', displayStyle: 'card' };
}

function fontSizeOf(c: Cell): number {
  const n = Number(c.style.get('fontSize'));
  return Number.isFinite(n) && n > 0 ? n : 12;
}

function color(c: Cell, key: string): string | undefined {
  const v = c.style.get(key);
  return v && v !== 'none' && v !== 'default' ? v : undefined;
}

function legacyType(kind: ElementKind | 'boundary'): string {
  if (kind === 'database') return 'db';
  if (kind === 'gateway' || kind === 'stream' || kind === 'note' || kind === 'boundary') return kind;
  return 'service';
}

// ── Pages ───────────────────────────────────────────────────────────────────

interface PageOut {
  nodes: ArchNode[];
  edges: ArchEdge[];
  texts: FreeText[];
  skipped: number;
}

interface LayerRegistry {
  layers: Layer[];
  byName: Map<string, string>;
}

function layerFor(reg: LayerRegistry, name: string, index: number, visible: boolean): string {
  if (index === 0) return DEFAULT_LAYER_ID;
  const key = name || `Layer ${index + 1}`;
  const existing = reg.byName.get(key);
  if (existing) return existing;
  const id = `ly-${reg.layers.length + 1}`;
  reg.layers.push({ id, name: key, order: reg.layers.length, visible, locked: false });
  reg.byName.set(key, id);
  return id;
}

function importPage(
  model: Element,
  pageIdx: number,
  pageId: string,
  lookup: IconLookup,
  reg: LayerRegistry,
  warnings: ImportWarning[],
): PageOut {
  const cellEls = Array.from(model.getElementsByTagName('mxCell'));
  const list = cellEls.map(readCell).filter((c) => c.id !== '');
  const cells = new Map(list.map((c) => [c.id, c]));
  const prefix = `d${pageIdx + 1}`;
  const out: PageOut = { nodes: [], edges: [], texts: [], skipped: 0 };

  // Layers: children of the root cell that are neither vertices nor edges.
  const rootIds = new Set(list.filter((c) => c.parent === undefined).map((c) => c.id));
  const layerOf = new Map<string, string>();
  let layerIdx = 0;
  for (const c of list) {
    if (c.parent !== undefined && rootIds.has(c.parent) && !c.vertex && !c.edge) {
      layerOf.set(c.id, layerFor(reg, c.value, layerIdx, c.visible));
      layerIdx++;
    }
  }
  const layerIdOf = (c: Cell): string => {
    let cur: Cell | undefined = c;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const l = layerOf.get(cur.id);
      if (l) return l;
      cur = cur.parent ? cells.get(cur.parent) : undefined;
    }
    return DEFAULT_LAYER_ID;
  };

  // Absolute position: draw.io vertex geometry is relative to a vertex parent.
  const absMemo = new Map<string, Pt>();
  const absOrigin = (id: string | undefined, depth = 0): Pt => {
    const c = id ? cells.get(id) : undefined;
    if (!c || !c.vertex || depth > 100) return { x: 0, y: 0 };
    const memo = absMemo.get(c.id);
    if (memo) return memo;
    const p = absOrigin(c.parent, depth + 1);
    const pt = { x: p.x + c.x, y: p.y + c.y };
    absMemo.set(c.id, pt);
    return pt;
  };

  // Classify vertices, then propagate skips to descendants.
  const mapping = new Map<string, Mapping>();
  for (const c of list) if (c.vertex) mapping.set(c.id, classify(c, cells, lookup));
  const skippedAncestor = (c: Cell): Cell | undefined => {
    let cur = c.parent ? cells.get(c.parent) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (mapping.get(cur.id)?.as === 'skip') return cur;
      cur = cur.parent ? cells.get(cur.parent) : undefined;
    }
    return undefined;
  };

  const nodeIdOf = new Map<string, string>();
  const boundaryIds = new Set<string>();
  const vertexCells = list.filter((c) => c.vertex);
  for (const c of vertexCells) {
    const m = mapping.get(c.id);
    if (!m) continue;
    const skippedBy = skippedAncestor(c);
    if (skippedBy) {
      out.skipped++;
      // Covered by the ancestor's warning; counted only.
      mapping.set(c.id, { as: 'skip', code: 'unsupported_child', message: `Cell ${c.id} is inside skipped cell ${skippedBy.id}.` });
      continue;
    }
    if (m.as === 'skip') {
      out.skipped++;
      warnings.push({ code: m.code, message: m.message, sourceRef: c.id });
    } else if (m.as === 'node') {
      nodeIdOf.set(c.id, `n-${prefix}-${c.id}`);
      if (m.kind === 'boundary') boundaryIds.add(c.id);
    }
  }
  const parentBoundary = (c: Cell): string | undefined => {
    let cur = c.parent ? cells.get(c.parent) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (boundaryIds.has(cur.id)) return nodeIdOf.get(cur.id);
      cur = cur.parent ? cells.get(cur.parent) : undefined;
    }
    return undefined;
  };

  const edgeLabels = new Map<string, string[]>();
  let z = 0;
  for (const c of vertexCells) {
    const m = mapping.get(c.id);
    if (!m || m.as === 'skip' || m.as === 'transparent') continue;
    const pos = absOrigin(c.id);
    if (m.as === 'edgeLabel') {
      const text = cellText(c).replace(/\n/g, ' ');
      if (text && c.parent) edgeLabels.set(c.parent, [...(edgeLabels.get(c.parent) ?? []), text]);
      continue;
    }
    if (m.as === 'text') {
      const text = cellText(c);
      if (!text) continue;
      out.texts.push({
        id: `t-${prefix}-${c.id}`,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        text,
        fontSize: fontSizeOf(c),
        color: color(c, 'fontColor') ?? '#1F2937',
        pageId,
        layerId: layerIdOf(c),
      });
      continue;
    }
    if (m.warn) warnings.push({ ...m.warn, sourceRef: c.id });
    const text = cellText(c);
    const { label, technology } = m.kind === 'boundary' ? { label: text.replace(/\n/g, ' '), technology: '' } : splitNameTechnology(text);
    const node: ArchNode = {
      id: nodeIdOf.get(c.id) as string,
      type: legacyType(m.kind),
      label,
      tag: technology,
      technology,
      health: '',
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      w: Math.round(c.w),
      h: Math.round(c.h),
      stroke: color(c, 'strokeColor') ?? (m.kind === 'boundary' ? DEFAULT_BOUNDARY_STROKE : DEFAULT_NODE_STROKE),
      kind: m.kind,
      pageId,
      layerId: layerIdOf(c),
      z: z++,
    };
    const fill = color(c, 'fillColor');
    if (fill) node.fill = fill;
    if (m.displayStyle) node.displayStyle = m.displayStyle;
    if (m.boundaryKind) node.boundaryKind = m.boundaryKind;
    if (m.iconId) node.iconRef = { set: 'aws', id: m.iconId };
    const pb = parentBoundary(c);
    if (pb) node.parentId = pb;
    out.nodes.push(node);
  }

  for (const c of list) {
    if (!c.edge) continue;
    if (skippedAncestor(c)) {
      out.skipped++;
      continue;
    }
    const from = c.source ? nodeIdOf.get(c.source) : undefined;
    const to = c.target ? nodeIdOf.get(c.target) : undefined;
    const offset = absOrigin(c.parent);
    if (!from || (c.target && !to) || (!c.target && !c.targetPoint)) {
      out.skipped++;
      warnings.push({
        code: 'edge_unconnected',
        message: `Connection ${c.id} is not attached to two imported elements and was skipped.`,
        sourceRef: c.id,
      });
      continue;
    }
    const dashed = c.style.get('dashed') === '1';
    const endArrow = c.style.get('endArrow');
    const startArrow = c.style.get('startArrow');
    const endOn = endArrow !== 'none';
    const startOn = startArrow !== undefined && startArrow !== 'none' && startArrow !== '';
    let src = from;
    let dst: string | null = to ?? null;
    let arrow: ArchEdge['arrow'] = 'end';
    let relKind: ArchEdge['relKind'] = dashed ? 'async' : 'sync';
    if (startOn && endOn) {
      arrow = 'both';
      if (!dashed) relKind = 'bidirectional';
    } else if (!startOn && !endOn) {
      arrow = 'none';
    } else if (startOn && dst) {
      // Only the start has a head: flip so the arrow points at `to`.
      src = dst;
      dst = from;
    }
    const labels = [cellText(c).replace(/\n/g, ' '), ...(edgeLabels.get(c.id) ?? [])].filter((l) => l !== '');
    const edge: ArchEdge = {
      id: `e-${prefix}-${c.id}`,
      from: src,
      to: dst,
      label: labels.join(' '),
      color: color(c, 'strokeColor') ?? DEFAULT_EDGE_COLOR,
      relKind,
      arrow,
    };
    if (dashed) {
      edge.dashed = true;
      edge.lineStyle = 'dashed';
    }
    if (!to && c.targetPoint) {
      edge.targetCoords = { x: Math.round(c.targetPoint.x + offset.x), y: Math.round(c.targetPoint.y + offset.y) };
      edge.isDangling = true;
    }
    if (c.points.length > 0) {
      const pts = c.points.map((p) => ({ x: Math.round(p.x + offset.x), y: Math.round(p.y + offset.y) }));
      edge.waypoints = src === from ? pts : pts.reverse();
    }
    out.edges.push(edge);
  }
  return out;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function importDrawio(xml: string, fileName: string, options: DrawioImportOptions = {}): Promise<ImportResult> {
  const big = tooLarge('drawio', xml);
  if (big) return big;
  const doc = parseXml(xml);
  if (!doc) return failure('drawio', 'The file is not valid XML.');
  const root = doc.documentElement;
  const lookup = options.iconLookup ?? DEFAULT_ICON_LOOKUP;
  const warnings: ImportWarning[] = [];

  const bodies: { name: string; model: Element | null; compressed?: string }[] = [];
  if (root.tagName === 'mxGraphModel') {
    bodies.push({ name: 'Page 1', model: root });
  } else if (root.tagName === 'mxfile') {
    const diagrams = Array.from(root.children).filter((c) => c.tagName === 'diagram');
    diagrams.forEach((d, i) => {
      const name = d.getAttribute('name') || `Page ${i + 1}`;
      const model = Array.from(d.children).find((c) => c.tagName === 'mxGraphModel') ?? null;
      bodies.push(model ? { name, model } : { name, model: null, compressed: (d.textContent ?? '').trim() });
    });
  } else {
    return failure('drawio', 'This is not a draw.io file (no <mxfile> or <mxGraphModel> root).');
  }
  if (bodies.length === 0) return failure('drawio', 'The file has no diagrams.');

  const pages: Page[] = [];
  const reg: LayerRegistry = {
    layers: [{ id: DEFAULT_LAYER_ID, name: 'Default', order: 0, visible: true, locked: false }],
    byName: new Map(),
  };
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const texts: FreeText[] = [];
  let skipped = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    let model = b.model;
    if (!model) {
      if (!b.compressed) {
        warnings.push({ code: 'page_empty', message: `Page "${b.name}" is empty.`, sourceRef: b.name });
      } else {
        const inflate = pickInflater(options);
        if (!inflate)
          return failure('drawio', 'This browser cannot decompress draw.io diagrams. Save the file uncompressed and try again.', warnings);
        try {
          const inner = parseXml(await decodeCompressedDiagram(b.compressed, inflate));
          model = inner && inner.documentElement.tagName === 'mxGraphModel' ? inner.documentElement : null;
        } catch {
          model = null;
        }
        if (!model) {
          warnings.push({ code: 'page_unreadable', message: `Page "${b.name}" could not be decompressed and was skipped.`, sourceRef: b.name });
          skipped++;
          continue;
        }
      }
    }
    const pageId = `pg-${pages.length + 1}`;
    pages.push({ id: pageId, name: b.name, order: pages.length });
    if (!model) continue;
    const res = importPage(model, i, pageId, lookup, reg, warnings);
    nodes.push(...res.nodes);
    edges.push(...res.edges);
    texts.push(...res.texts);
    skipped += res.skipped;
  }
  if (pages.length === 0) return failure('drawio', 'No page of this file could be read.', warnings);

  return finish({
    format: 'drawio',
    title: titleFromFileName(fileName, 'Imported diagram'),
    nodes,
    edges,
    pages,
    layers: reg.layers,
    texts,
    warnings,
    skipped,
  });
}
