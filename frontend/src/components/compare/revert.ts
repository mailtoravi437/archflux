import { api } from '../../lib/api';
import { invertChange, type ElementChange } from '../../lib/semanticDiff';
import type { DocState } from '../../state/ops/types';

/**
 * "Revert this change" (R1-E08-T04): puts one element back to its `before` side on the current
 * document, keeps every other edit, and saves with `source: 'revert'`. The server records a new
 * revision on top; history is never rewritten. Keys of the stored graph this screen does not own
 * (for example `defaults`) are carried over from the server copy.
 */
export async function revertChangeAndSave(
  diagramId: string,
  change: ElementChange,
  current: DocState,
  version: number | null,
): Promise<DocState> {
  const next = invertChange(change, current);
  const existing = (await api.getDiagram(diagramId)).data as { graph?: Record<string, unknown> } | null;
  const graph = {
    ...(existing?.graph ?? {}),
    nodes: next.nodes,
    edges: next.edges,
    strokes: next.strokes,
    texts: next.texts,
    pages: next.pages,
    layers: next.layers,
  };
  await api.updateDiagram(
    diagramId,
    { graph, nodes: graph.nodes, edges: graph.edges, strokes: graph.strokes, texts: graph.texts, source: 'revert' },
    version !== null ? { version } : undefined,
  );
  return next;
}
