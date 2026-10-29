/**
 * Pure style reducers (R1-E04-T06): format painter and multi-select styling.
 * No React, no store. An op that changes nothing returns the input state, so
 * `applyOp` records no undo step. Locked nodes (or nodes on locked layers) keep their style.
 */
import type { ArchNode } from '../../types';
import type { DocOp } from './types';
import { isNodeLocked } from './arrange';

export const STYLE_KEYS = ['stroke', 'fill', 'strokeWidth', 'displayStyle', 'size'] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];
export type NodeStyle = Pick<ArchNode, StyleKey>;

/** The style of a node. Every key is present; an unset one is `undefined`, and pasting it clears the target's value. */
export const copyStyle = (n: ArchNode): NodeStyle => ({
  stroke: n.stroke,
  fill: n.fill,
  strokeWidth: n.strokeWidth,
  displayStyle: n.displayStyle,
  size: n.size,
});

/**
 * Applies the style keys present in `style` to the listed nodes. Keys outside
 * `STYLE_KEYS` are ignored. A key present with value `undefined` clears it.
 */
export const pasteStyle: DocOp<[ids: string[], style: Partial<ArchNode>]> = (s, ids, style) => {
  const keys = STYLE_KEYS.filter((k) => k in style);
  if (keys.length === 0 || ids.length === 0) return s;
  const target = new Set(ids);
  let changed = false;
  const nodes = s.nodes.map((n) => {
    if (!target.has(n.id) || isNodeLocked(s, n)) return n;
    const next: ArchNode = { ...n };
    let touched = false;
    for (const k of keys) {
      const v = style[k];
      if (v === undefined) {
        if (k in next && next[k] !== undefined) {
          delete next[k];
          touched = true;
        }
      } else if (next[k] !== v) {
        (next as unknown as Record<string, unknown>)[k] = v;
        touched = true;
      }
    }
    if (!touched) return n;
    changed = true;
    return next;
  });
  return changed ? { ...s, nodes } : s;
};

export type StyleValue<K extends StyleKey> = { mixed: false; value: ArchNode[K] } | { mixed: true };

/** The shared value of one style key across the nodes, or `{ mixed: true }` when they differ. */
export function sharedStyle<K extends StyleKey>(nodes: readonly ArchNode[], key: K): StyleValue<K> {
  if (nodes.length === 0) return { mixed: false, value: undefined as ArchNode[K] };
  const first = nodes[0][key];
  return nodes.every((n) => n[key] === first) ? { mixed: false, value: first } : { mixed: true };
}
