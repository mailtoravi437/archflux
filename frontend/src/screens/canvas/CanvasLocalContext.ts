import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { ArchEdge, ArchNode, FreeText } from '../../types';

/**
 * Editor-local selection state that lives in CanvasScreen (not in the diagram
 * store) and is shared with the extracted dock parts, e.g. the Inspector.
 */
export interface CanvasLocalValue {
  selected: ArchNode | null;
  selectedEdge: ArchEdge | null;
  selectedText: FreeText | null;
  /** Position of the floating selection toolbar, or null when none is shown. */
  selToolbarPos: { left: number; top: number } | null;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
  setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  /** Opens the inline on-canvas editor for an existing text label. */
  beginTextEdit: (t: FreeText) => void;
}

export const CanvasLocalContext = createContext<CanvasLocalValue | null>(null);

export function useCanvasLocal(): CanvasLocalValue {
  const ctx = useContext(CanvasLocalContext);
  if (!ctx) throw new Error('useCanvasLocal must be used within CanvasScreen');
  return ctx;
}
