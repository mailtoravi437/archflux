/** R1-E03-T03: collapse / expand a boundary. One call is one undo step via `applyOp`. */
import type { DocOp } from './types';
import { isBoundaryNode } from '../../canvas/render/boundaries';

export const toggleCollapse: DocOp<[id: string]> = (s, id) => {
  const b = s.nodes.find((n) => n.id === id);
  if (!b || !isBoundaryNode(b)) return s;
  return { ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, collapsed: !n.collapsed } : n)) };
};
