import { useCallback } from 'react';
import { useDiagramActions } from '../state/useDiagram';
import type { ArchNode, ElementKind, IconRef } from '../types';
import { IconPicker } from './IconPicker';

/**
 * R1-E05-T03: IconPicker bound to a node. A pick is one undo step: `checkpoint()` once, then the
 * silent `updateNode`. "No icon" stores `iconRef: null`. Closes after a pick.
 */
export function NodeIconPicker({ node, position, onClose }: {
  node: Pick<ArchNode, 'id' | 'kind' | 'technology' | 'tag' | 'iconRef'>;
  position?: { x: number; y: number };
  onClose: () => void;
}) {
  const { checkpoint, updateNode } = useDiagramActions();
  const onPick = useCallback((ref: IconRef | null) => {
    checkpoint();
    updateNode(node.id, { iconRef: ref });
    onClose();
  }, [checkpoint, updateNode, node.id, onClose]);
  // normalizeDoc fills `kind` on load; the fallback only covers nodes not yet normalised.
  const kind: ElementKind = node.kind ?? 'service';
  return (
    <IconPicker
      kind={kind}
      technology={node.technology ?? node.tag}
      current={node.iconRef}
      position={position}
      onPick={onPick}
      onClose={onClose}
    />
  );
}

export default NodeIconPicker;
