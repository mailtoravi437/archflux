/**
 * Pure page reducers (R1-E00-T04 / T08, DATA_MODEL_R1 §2.4). No React, no
 * store: ids are passed in so every op is deterministic. An op that cannot
 * apply returns the input state unchanged (same reference).
 */
import type { Page } from '../../types';
import type { DocOp, DocState } from './types';

/** Id generator for duplicated elements: `n` nodes, `e` edges, `s` strokes, `t` texts. */
export type ElementIdGen = (prefix: 'n' | 'e' | 's' | 't') => string;

const MAX_NAME = 80;
/** Matches ARCH_LIMITS.maxPages (lib/archFormat.ts). */
export const MAX_PAGES = 50;

/** Plain-JSON deep copy: doc elements are JSON data by contract (they persist as JSON). */
function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function renumber(pages: Page[]): Page[] {
  return pages.map((p, i) => (p.order === i ? p : { ...p, order: i }));
}

function sorted(pages: Page[]): Page[] {
  return [...pages].sort((a, b) => a.order - b.order);
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let k = 2;
  while (taken.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

function cleanName(name: string | undefined): string {
  return (name ?? '').trim().slice(0, MAX_NAME);
}

/** Appends a page named `name` (default "Page N"). */
export const addPage: DocOp<[id: string, name?: string]> = (s, id, name) => {
  if (s.pages.some((p) => p.id === id) || s.pages.length >= MAX_PAGES) return s;
  const taken = new Set(s.pages.map((p) => p.name));
  let label = cleanName(name);
  if (!label) {
    let k = s.pages.length + 1;
    while (taken.has(`Page ${k}`)) k++;
    label = `Page ${k}`;
  }
  const order = s.pages.reduce((m, p) => Math.max(m, p.order + 1), 0);
  return { ...s, pages: renumber(sorted([...s.pages, { id, name: label, order }])) };
};

export const renamePage: DocOp<[id: string, name: string]> = (s, id, name) => {
  const label = cleanName(name);
  const page = s.pages.find((p) => p.id === id);
  if (!label || !page || page.name === label) return s;
  return { ...s, pages: s.pages.map((p) => (p.id === id ? { ...p, name: label } : p)) };
};

/**
 * Removes a page with every node, edge, stroke and text on it. Edges that touch
 * a removed node go too, and `linkPageId`s to the page are cleared. The last
 * page is never removed.
 */
export const deletePage: DocOp<[id: string]> = (s, id) => {
  if (s.pages.length <= 1 || !s.pages.some((p) => p.id === id)) return s;
  const gone = new Set(s.nodes.filter((n) => n.pageId === id).map((n) => n.id));
  const nodes = s.nodes
    .filter((n) => !gone.has(n.id))
    .map((n) => {
      if (n.linkPageId !== id) return n;
      const next = { ...n };
      delete next.linkPageId;
      return next;
    });
  return {
    ...s,
    nodes,
    edges: s.edges.filter((e) => !gone.has(e.from) && !(e.to !== null && gone.has(e.to))),
    strokes: s.strokes.filter((x) => x.pageId !== id),
    texts: s.texts.filter((x) => x.pageId !== id),
    pages: renumber(sorted(s.pages.filter((p) => p.id !== id))),
  };
};

/** Reorders pages; ids not listed keep their relative order at the end. */
export const reorderPages: DocOp<[orderedIds: string[]]> = (s, orderedIds) => {
  const byId = new Map(s.pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const next: Page[] = [];
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      next.push(p);
      seen.add(id);
    }
  }
  for (const p of sorted(s.pages)) if (!seen.has(p.id)) next.push(p);
  const out = renumber(next);
  const same = out.length === s.pages.length && out.every((p, i) => p === s.pages[i]);
  return same ? s : { ...s, pages: out };
};

/**
 * Copies page `id` as `newPageId` (inserted right after it, named "<name> copy").
 * Every node, stroke and text on the page is deep-copied with a fresh id; edges
 * with both ends on the page are copied and remapped, as are `parentId`s.
 */
export const duplicatePage: DocOp<[id: string, newPageId: string, genId: ElementIdGen]> = (s, id, newPageId, genId) => {
  const ordered = sorted(s.pages);
  const idx = ordered.findIndex((p) => p.id === id);
  if (idx < 0 || s.pages.some((p) => p.id === newPageId) || s.pages.length >= MAX_PAGES) return s;
  const src = ordered[idx];
  const name = uniqueName(`${src.name} copy`.slice(0, MAX_NAME), new Set(s.pages.map((p) => p.name)));
  const pages = renumber([...ordered.slice(0, idx + 1), { id: newPageId, name, order: idx + 1 }, ...ordered.slice(idx + 1)]);

  const idMap = new Map<string, string>();
  const srcNodes = s.nodes.filter((n) => n.pageId === id);
  srcNodes.forEach((n) => idMap.set(n.id, genId('n')));
  const nodeCopies = srcNodes.map((n) => {
    const copy = deepCopy(n);
    copy.id = idMap.get(n.id)!;
    copy.pageId = newPageId;
    if (typeof n.parentId === 'string') {
      const pid = idMap.get(n.parentId);
      if (pid) copy.parentId = pid;
      else delete copy.parentId;
    }
    return copy;
  });
  const edgeCopies = s.edges
    .filter((e) => idMap.has(e.from) && (e.to === null || idMap.has(e.to)))
    .map((e) => {
      const copy = deepCopy(e);
      copy.id = genId('e');
      copy.from = idMap.get(e.from)!;
      copy.to = e.to === null ? null : idMap.get(e.to)!;
      return copy;
    });
  const strokeCopies = s.strokes
    .filter((x) => x.pageId === id)
    .map((x) => ({ ...deepCopy(x), id: genId('s'), pageId: newPageId }));
  const textCopies = s.texts
    .filter((x) => x.pageId === id)
    .map((x) => ({ ...deepCopy(x), id: genId('t'), pageId: newPageId }));
  const next: DocState = {
    ...s,
    pages,
    nodes: [...s.nodes, ...nodeCopies],
    edges: [...s.edges, ...edgeCopies],
    strokes: strokeCopies.length ? [...s.strokes, ...strokeCopies] : s.strokes,
    texts: textCopies.length ? [...s.texts, ...textCopies] : s.texts,
  };
  return next;
};

/** Imported content to append (R1-E09-T03): ids are the importer's, remapped here. */
export type ImportedContent = Pick<DocState, 'nodes' | 'edges' | 'texts' | 'pages' | 'layers'>;

/**
 * Appends every imported page (with its elements) after the existing pages.
 * Element ids are regenerated via `genId` and page ids via `genPageId`, so the
 * import can never collide with the target document. Layers the target does
 * not have are added; page names are made unique.
 */
export const appendImported: DocOp<[imp: ImportedContent, genPageId: () => string, genId: ElementIdGen]> = (s, imp, genPageId, genId) => {
  if (imp.pages.length === 0 || s.pages.length + imp.pages.length > 50) return s;
  const taken = new Set(s.pages.map((p) => p.name));
  const pageMap = new Map<string, string>();
  const newPages: Page[] = sorted(imp.pages).map((p, i) => {
    const id = genPageId();
    pageMap.set(p.id, id);
    const name = uniqueName(cleanName(p.name) || `Page ${s.pages.length + i + 1}`, taken);
    taken.add(name);
    return { id, name, order: s.pages.length + i };
  });
  const firstNew = newPages[0].id;
  const pageOf = (id: string | undefined): string => (id && pageMap.get(id)) || firstNew;
  const idMap = new Map<string, string>();
  imp.nodes.forEach((n) => idMap.set(n.id, genId('n')));
  const knownLayers = new Set(s.layers.map((l) => l.id));
  const extraLayers = imp.layers
    .filter((l) => !knownLayers.has(l.id))
    .map((l, i) => ({ ...deepCopy(l), order: s.layers.length + i }));
  const layerOf = <T extends { layerId?: string }>(x: T): T => {
    if (x.layerId && !knownLayers.has(x.layerId) && !extraLayers.some((l) => l.id === x.layerId)) delete x.layerId;
    return x;
  };
  const nodes = imp.nodes.map((n) => {
    const c = layerOf(deepCopy(n));
    c.id = idMap.get(n.id)!;
    c.pageId = pageOf(n.pageId);
    if (typeof n.parentId === 'string') {
      const pid = idMap.get(n.parentId);
      if (pid) c.parentId = pid;
      else delete c.parentId;
    }
    return c;
  });
  const edges = imp.edges
    .filter((e) => idMap.has(e.from) && (e.to === null || idMap.has(e.to)))
    .map((e) => {
      const c = deepCopy(e);
      c.id = genId('e');
      c.from = idMap.get(e.from)!;
      c.to = e.to === null ? null : idMap.get(e.to)!;
      return c;
    });
  const texts = imp.texts.map((t) => ({ ...layerOf(deepCopy(t)), id: genId('t'), pageId: pageOf(t.pageId) }));
  return {
    ...s,
    pages: renumber([...sorted(s.pages), ...newPages]),
    layers: extraLayers.length ? [...s.layers, ...extraLayers] : s.layers,
    nodes: [...s.nodes, ...nodes],
    edges: [...s.edges, ...edges],
    texts: texts.length ? [...s.texts, ...texts] : s.texts,
  };
};

/**
 * Moves nodes (and the nodes nested under them) to page `pageId`. Edges that would then cross
 * pages (exactly one end moved) are removed; edges with both ends moved, or neither, are kept.
 */
export const moveToPage: DocOp<[ids: string[], pageId: string]> = (s, ids, pageId) => {
  if (!s.pages.some((p) => p.id === pageId)) return s;
  const moving = new Set(ids);
  // Children travel with their boundary.
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of s.nodes) {
      if (!moving.has(n.id) && n.parentId && moving.has(n.parentId)) {
        moving.add(n.id);
        grew = true;
      }
    }
  }
  const pageOf = (n: { pageId?: string }) => n.pageId ?? s.pages[0]?.id;
  const moved = new Set(s.nodes.filter((n) => moving.has(n.id) && pageOf(n) !== pageId).map((n) => n.id));
  if (moved.size === 0) return s;
  const nodes = s.nodes.map((n) => {
    if (!moved.has(n.id)) return n;
    const next = { ...n, pageId };
    // Leaving a container on another page ends the containment.
    if (n.parentId && !moved.has(n.parentId)) delete next.parentId;
    // A link to the page the node now lives on would point at itself.
    if (next.linkPageId === pageId) delete next.linkPageId;
    return next;
  });
  const after = new Map(nodes.map((n) => [n.id, pageOf(n)]));
  const edges = s.edges.filter((e) => {
    if (e.to === null || (!moved.has(e.from) && !moved.has(e.to))) return true;
    return after.get(e.from) === after.get(e.to);
  });
  return { ...s, nodes, edges };
};
