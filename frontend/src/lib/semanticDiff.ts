/**
 * Semantic diff between two document states (R1-E08-T01, REVIEW_VERSIONING_SPEC §2.3).
 *
 * Pure: no React, no store. Elements are compared by `id`, never by position.
 * Strokes and free texts are not part of the semantic model and are not diffed.
 */
import type { DocState } from '../state/ops/types';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';   // moved = only LAYOUT_FIELDS changed (layout split, RV-G8)
export interface FieldChange { field: string; before: unknown; after: unknown; }
export interface ElementChange { id: string; entity: 'node' | 'edge' | 'page' | 'layer'; kind: ChangeKind; label: string; fields: FieldChange[]; }
export interface SemanticDiff { changes: ElementChange[]; summary: { added: number; removed: number; changed: number; moved: number }; }

type Entity = ElementChange['entity'];
type Row = Record<string, unknown>;

/** Fields whose change alone is a layout change (`moved`), not a semantic one (REVIEW_VERSIONING §2.3). */
export const LAYOUT_FIELDS: ReadonlySet<string> = new Set([
  'x', 'y', 'w', 'h', 'size', 'customSize', 'waypoints', 'labelPos', 'z', 'collapsed',
  'stroke', 'fill', 'strokeWidth', 'displayStyle',
]);

/** Derived fields: never reported, skipped entirely. */
export const IGNORED_FIELDS: ReadonlySet<string> = new Set(['isOrphan', 'isDangling', 'targetCoords']);

const DEFAULT_LAYER_ID = 'ly-default';

const ENTITY_ORDER: Record<Entity, number> = { page: 0, layer: 1, node: 2, edge: 3 };
const KIND_ORDER: Record<ChangeKind, number> = { added: 0, removed: 1, changed: 2, moved: 3 };
const PROPS_PREFIX = 'properties.';

function asRow(v: object): Row {
  return v as unknown as Row;
}

function isPlainObject(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural equality for JSON-like values; `undefined` keys count as absent. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** Flattens an element into comparable fields: `properties` is split per key. */
function flatten(row: Row): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || v === undefined || IGNORED_FIELDS.has(k)) continue;
    if (k === 'properties' && isPlainObject(v)) {
      for (const [pk, pv] of Object.entries(v)) {
        if (pv !== undefined) out.set(PROPS_PREFIX + pk, pv);
      }
      continue;
    }
    out.set(k, v);
  }
  return out;
}

function fieldChanges(before: Row | undefined, after: Row | undefined): FieldChange[] {
  const b = before ? flatten(before) : new Map<string, unknown>();
  const a = after ? flatten(after) : new Map<string, unknown>();
  const keys = [...new Set([...b.keys(), ...a.keys()])].sort();
  const out: FieldChange[] = [];
  for (const field of keys) {
    const bv = b.get(field);
    const av = a.get(field);
    if (!deepEqual(bv, av)) out.push({ field, before: bv, after: av });
  }
  return out;
}

/** Every field of `before`, with the matching value in `after` (if the element still exists). */
function allFields(before: Row, after: Row | undefined): FieldChange[] {
  const b = flatten(before);
  const a = after ? flatten(after) : new Map<string, unknown>();
  const keys = [...new Set([...b.keys(), ...a.keys()])].sort();
  return keys.map((field) => ({ field, before: b.get(field), after: a.get(field) }));
}

function nodeLabel(nodes: Map<string, Row>, id: unknown): string {
  if (typeof id !== 'string') return '?';
  const n = nodes.get(id);
  return n && typeof n.label === 'string' && n.label ? n.label : id;
}

function labelOf(entity: Entity, row: Row, nodes: Map<string, Row>): string {
  if (entity === 'page' || entity === 'layer') {
    return typeof row.name === 'string' && row.name ? row.name : String(row.id);
  }
  if (typeof row.label === 'string' && row.label) return row.label;
  if (entity === 'edge') return `${nodeLabel(nodes, row.from)} → ${nodeLabel(nodes, row.to)}`;
  return String(row.id);
}

function byId(list: readonly object[]): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const item of list) {
    const row = asRow(item);
    if (typeof row.id === 'string') m.set(row.id, row);
  }
  return m;
}

function diffEntity(
  entity: Entity,
  beforeList: readonly object[],
  afterList: readonly object[],
  beforeNodes: Map<string, Row>,
  afterNodes: Map<string, Row>,
  out: ElementChange[],
): void {
  const b = byId(beforeList);
  const a = byId(afterList);
  for (const [id, before] of b) {
    const after = a.get(id);
    if (!after) {
      out.push({ id, entity, kind: 'removed', label: labelOf(entity, before, beforeNodes), fields: allFields(before, undefined) });
      continue;
    }
    // An edge whose endpoint node was removed is reported as removed, not changed.
    if (entity === 'edge') {
      const lostEndpoint = [after.from, after.to].some(
        (end) => typeof end === 'string' && beforeNodes.has(end) && !afterNodes.has(end),
      );
      if (lostEndpoint) {
        out.push({ id, entity, kind: 'removed', label: labelOf(entity, before, beforeNodes), fields: allFields(before, after) });
        continue;
      }
    }
    const fields = fieldChanges(before, after);
    if (fields.length === 0) continue;
    const kind: ChangeKind = fields.every((f) => LAYOUT_FIELDS.has(f.field)) ? 'moved' : 'changed';
    out.push({ id, entity, kind, label: labelOf(entity, after, afterNodes), fields });
  }
  for (const [id, after] of a) {
    if (b.has(id)) continue;
    out.push({ id, entity, kind: 'added', label: labelOf(entity, after, afterNodes), fields: fieldChanges(undefined, after) });
  }
}

export function semanticDiff(before: DocState, after: DocState): SemanticDiff {
  const beforeNodes = byId(before.nodes);
  const afterNodes = byId(after.nodes);
  const changes: ElementChange[] = [];
  diffEntity('page', before.pages, after.pages, beforeNodes, afterNodes, changes);
  diffEntity('layer', before.layers, after.layers, beforeNodes, afterNodes, changes);
  diffEntity('node', before.nodes, after.nodes, beforeNodes, afterNodes, changes);
  diffEntity('edge', before.edges, after.edges, beforeNodes, afterNodes, changes);
  changes.sort((x, y) =>
    ENTITY_ORDER[x.entity] - ENTITY_ORDER[y.entity]
    || KIND_ORDER[x.kind] - KIND_ORDER[y.kind]
    || x.label.localeCompare(y.label)
    || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  const summary = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const c of changes) summary[c.kind] += 1;
  return { changes, summary };
}

/** Writes the `before` side of each field onto a copy of `row` (undefined → key removed). */
function restoreFields(row: Row, fields: FieldChange[]): Row {
  const next: Row = { ...row };
  let props: Row | undefined = isPlainObject(row.properties) ? { ...row.properties } : undefined;
  for (const f of fields) {
    if (f.field.startsWith(PROPS_PREFIX)) {
      const key = f.field.slice(PROPS_PREFIX.length);
      props = props ?? {};
      if (f.before === undefined) delete props[key];
      else props[key] = f.before;
      continue;
    }
    if (f.before === undefined) delete next[f.field];
    else next[f.field] = f.before;
  }
  if (props !== undefined) {
    if (Object.keys(props).length > 0) next.properties = props;
    else delete next.properties;
  }
  return next;
}

function revertIn<T extends { id: string }>(list: T[], change: ElementChange): T[] {
  if (change.kind === 'added') return list.filter((item) => item.id !== change.id);
  const idx = list.findIndex((item) => item.id === change.id);
  const base: Row = idx >= 0 ? asRow(list[idx]) : { id: change.id };
  const restored = restoreFields(base, change.fields) as unknown as T;
  if (idx < 0) return [...list, restored];
  const next = list.slice();
  next[idx] = restored;
  return next;
}

/** Removes a page and everything on it (like deletePage). A missing `pageId` means the first page. */
function removePage(s: DocState, pageId: string): DocState {
  const first = [...s.pages].sort((a, b) => a.order - b.order)[0]?.id;
  const onPage = (p: string | undefined): boolean => (p ?? first) === pageId;
  const gone = new Set(s.nodes.filter((n) => onPage(n.pageId)).map((n) => n.id));
  const nodes = s.nodes.filter((n) => !gone.has(n.id));
  return {
    ...s,
    pages: s.pages.filter((p) => p.id !== pageId),
    nodes,
    edges: s.edges.filter((e) => !gone.has(e.from) && (e.to === null || !gone.has(e.to))),
    strokes: s.strokes.filter((t) => !onPage(t.pageId)),
    texts: s.texts.filter((t) => !onPage(t.pageId)),
  };
}

/** Removes a layer and moves its elements to the default layer (like deleteLayer). */
function removeLayer(s: DocState, layerId: string): DocState {
  const move = <T extends { layerId?: string }>(item: T): T =>
    item.layerId === layerId ? { ...item, layerId: DEFAULT_LAYER_ID } : item;
  return {
    ...s,
    layers: s.layers.filter((l) => l.id !== layerId),
    nodes: s.nodes.map(move),
    strokes: s.strokes.map(move),
    texts: s.texts.map(move),
  };
}

/**
 * "Revert this change": returns a copy of `current` with only this element put back to its
 * `before` side. Other edits in `current` are kept. Reverting an added node also removes the
 * edges attached to it; an added page takes its elements with it; an added layer's elements
 * move to the default layer.
 */
export function invertChange(change: ElementChange, current: DocState): DocState {
  switch (change.entity) {
    case 'page':
      return change.kind === 'added' ? removePage(current, change.id) : { ...current, pages: revertIn(current.pages, change) };
    case 'layer':
      return change.kind === 'added' ? removeLayer(current, change.id) : { ...current, layers: revertIn(current.layers, change) };
    case 'edge':
      return { ...current, edges: revertIn(current.edges, change) };
    case 'node': {
      const nodes = revertIn(current.nodes, change);
      const edges = change.kind === 'added'
        ? current.edges.filter((e) => e.from !== change.id && e.to !== change.id)
        : current.edges;
      return { ...current, nodes, edges };
    }
  }
}
