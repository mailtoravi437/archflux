import { useState } from 'react';
import type { DocState } from '../../state/ops/types';
import type { ElementChange } from '../../lib/semanticDiff';
import CompareView from './CompareView';

/** One resolved side of a compare: a label, its document state, and whether it is the current version. */
export interface ResolvedSide {
  label: string;
  doc: DocState;
  isCurrent: boolean;
}

export interface PairCompareProps {
  /** Older side by default. */
  left: ResolvedSide;
  /** Newer side by default. */
  right: ResolvedSide;
  canEdit: boolean;
  isDark: boolean;
  onRevert: (change: ElementChange) => Promise<void> | void;
  onExit: () => void;
}

/**
 * Two-entry compare (R1-E08-T04): the diff runs between the two picked versions. Swap flips the
 * sides. "Revert this change" applies to the current doc, so it is offered only when the right
 * (after) side is the current version.
 */
export default function PairCompare({ left, right, canEdit, isDark, onRevert, onExit }: PairCompareProps) {
  const [swapped, setSwapped] = useState(false);
  const a = swapped ? right : left;
  const b = swapped ? left : right;
  return (
    <CompareView
      before={a.doc}
      after={b.doc}
      beforeLabel={a.label}
      afterLabel={b.label}
      isDark={isDark}
      canRevert={canEdit && b.isCurrent}
      onSwap={() => setSwapped((s) => !s)}
      onExit={onExit}
      onRevert={onRevert}
    />
  );
}
