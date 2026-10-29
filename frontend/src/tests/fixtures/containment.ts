import type { ArchNode } from '../../types';
import type { DocState } from '../../state/ops/types';

export function box(id: string, x: number, y: number, w: number, h: number, extra: Partial<ArchNode> = {}): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x, y, w, h, stroke: '#000', pageId: 'pg-1', layerId: 'ly-default', ...extra };
}
export const bnd = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ArchNode> = {}) =>
  box(id, x, y, w, h, { kind: 'boundary', boundaryKind: 'vpc', ...extra });
export function doc(nodes: ArchNode[]): DocState {
  return {
    nodes, edges: [], strokes: [], texts: [],
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }],
  };
}
