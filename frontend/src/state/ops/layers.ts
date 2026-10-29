/**
 * Pure layer reducers (R1-E00-T04 / T08, DATA_MODEL_R1 §2.4). No React, no
 * store. An op that cannot apply returns the input state unchanged.
 */
import type { Layer } from '../../types';
import type { DocOp } from './types';

export const DEFAULT_LAYER_ID = 'ly-default';

const MAX_NAME = 80;
/** Matches ARCH_LIMITS.maxLayers (lib/archFormat.ts). */
export const MAX_LAYERS = 20;

/** Appends a layer named `name` (default "Layer N"), visible and unlocked. */
export const addLayer: DocOp<[id: string, name?: string]> = (s, id, name) => {
  if (s.layers.some((l) => l.id === id) || s.layers.length >= MAX_LAYERS) return s;
  let label = (name ?? '').trim().slice(0, MAX_NAME);
  if (!label) {
    const taken = new Set(s.layers.map((l) => l.name));
    let k = s.layers.length + 1;
    while (taken.has(`Layer ${k}`)) k++;
    label = `Layer ${k}`;
  }
  const order = s.layers.reduce((m, l) => Math.max(m, l.order + 1), 0);
  return { ...s, layers: [...s.layers, { id, name: label, order, visible: true, locked: false }] };
};

export const updateLayer: DocOp<[id: string, patch: Partial<Omit<Layer, 'id'>>]> = (s, id, patch) => {
  const layer = s.layers.find((l) => l.id === id);
  if (!layer) return s;
  const next: Layer = { ...layer };
  if (typeof patch.name === 'string') {
    const label = patch.name.trim().slice(0, MAX_NAME);
    if (label) next.name = label;
  }
  if (typeof patch.order === 'number' && Number.isFinite(patch.order)) next.order = patch.order;
  if (typeof patch.visible === 'boolean') next.visible = patch.visible;
  if (typeof patch.locked === 'boolean') next.locked = patch.locked;
  const changed = next.name !== layer.name || next.order !== layer.order || next.visible !== layer.visible || next.locked !== layer.locked;
  return changed ? { ...s, layers: s.layers.map((l) => (l.id === id ? next : l)) } : s;
};

/** Removes a layer; its nodes, strokes and texts move to 'ly-default'. 'ly-default' is never removed. */
export const deleteLayer: DocOp<[id: string]> = (s, id) => {
  if (id === DEFAULT_LAYER_ID || !s.layers.some((l) => l.id === id)) return s;
  const rehome = <T extends { layerId?: string }>(list: T[]): T[] =>
    list.some((x) => x.layerId === id) ? list.map((x) => (x.layerId === id ? { ...x, layerId: DEFAULT_LAYER_ID } : x)) : list;
  return {
    ...s,
    layers: s.layers.filter((l) => l.id !== id),
    nodes: rehome(s.nodes),
    strokes: rehome(s.strokes),
    texts: rehome(s.texts),
  };
};

/** Moves the nodes, strokes and texts with the given ids onto `layerId`. */
export const moveToLayer: DocOp<[ids: string[], layerId: string]> = (s, ids, layerId) => {
  if (!s.layers.some((l) => l.id === layerId)) return s;
  const set = new Set(ids);
  const move = <T extends { id: string; layerId?: string }>(list: T[]): T[] =>
    list.some((x) => set.has(x.id) && x.layerId !== layerId)
      ? list.map((x) => (set.has(x.id) && x.layerId !== layerId ? { ...x, layerId } : x))
      : list;
  const nodes = move(s.nodes);
  const strokes = move(s.strokes);
  const texts = move(s.texts);
  if (nodes === s.nodes && strokes === s.strokes && texts === s.texts) return s;
  return { ...s, nodes, strokes, texts };
};

/**
 * Sets the stacking order from `bottomToTop` ids: the first id gets order 0 (drawn first, lowest).
 * Layers not listed keep their relative order above the listed ones.
 */
export const reorderLayers: DocOp<[bottomToTop: string[]]> = (s, bottomToTop) => {
  const byId = new Map(s.layers.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const ordered: Layer[] = [];
  for (const id of bottomToTop) {
    const l = byId.get(id);
    if (l && !seen.has(id)) {
      ordered.push(l);
      seen.add(id);
    }
  }
  for (const l of [...s.layers].sort((a, b) => a.order - b.order)) if (!seen.has(l.id)) ordered.push(l);
  const next = ordered.map((l, i) => (l.order === i ? l : { ...l, order: i }));
  const same = next.every((l) => l.order === byId.get(l.id)?.order);
  return same ? s : { ...s, layers: next };
};
