import type { useDiagram } from '../../state/useDiagram';

/** The diagram store surface (state + actions) as returned by `useDiagram()`. */
export type DiagramApi = ReturnType<typeof useDiagram>;

/** Inline text editor draft (Excalidraw-style click-to-type). `editingId` is set when editing existing text. */
export type TextDraft = { x: number; y: number; value: string; editingId: string | null };

/** A world-space point. */
export type Pt = { x: number; y: number };
