/**
 * R1-E02-T05: switch display style. Pure reducer: no React, no store.
 * Keeps id, text, icon, properties and edges; changes `displayStyle` and, unless the node was
 * custom sized, resets `w`/`h` to the new style's box. Returns the input state when nothing
 * changes, so `applyOp` records no undo step. Locked nodes (or nodes on locked layers) keep their style.
 */
import type { ArchNode, DisplayStyle } from '../../types';
import { SIZE_BOX } from '../../canvas/notation';
import { ICON_TILE } from '../../lib/canvasGeometry';
import type { DocOp } from './types';
import { isNodeLocked } from './arrange';

/** Box a node gets in `style`: card and shape use `SIZE_BOX[size]`; icon is the icon tile (S 48, M 64, L 96). */
export function boxForStyle(node: Pick<ArchNode, 'size'>, style: DisplayStyle): { w: number; h: number } {
  const size = node.size && SIZE_BOX[node.size] ? node.size : 'M';
  if (style === 'icon') return { w: ICON_TILE[size], h: ICON_TILE[size] };
  return { ...SIZE_BOX[size] };
}

export const setDisplayStyle: DocOp<[ids: string[], style: DisplayStyle]> = (s, ids, style) => {
  if (ids.length === 0) return s;
  const target = new Set(ids);
  let changed = false;
  const nodes = s.nodes.map((n) => {
    if (!target.has(n.id) || isNodeLocked(s, n) || n.kind === 'boundary') return n;
    const box = n.customSize === true ? { w: n.w, h: n.h } : boxForStyle(n, style);
    if (n.displayStyle === style && n.w === box.w && n.h === box.h) return n;
    changed = true;
    return { ...n, displayStyle: style, w: box.w, h: box.h };
  });
  return changed ? { ...s, nodes } : s;
};
