import { useEffect, useSyncExternalStore } from 'react';
import { useCoreDiagram, useDiagramActions, useDiagramDocs, useDiagramUI } from '../../state/useDiagram';
import { getPendingReveal, setPendingReveal, subscribePendingReveal } from './reveal';

/** Completes a pending search reveal once the target doc is active and the element is loaded. Mount once (AppShell). */
export function SearchReveal() {
  const target = useSyncExternalStore(subscribePendingReveal, getPendingReveal, getPendingReveal);
  const { activeDocId } = useDiagramDocs();
  const { nodes, setSelectedId } = useCoreDiagram();
  const { panToNode } = useDiagramActions();
  const { setActivePageId } = useDiagramUI();

  useEffect(() => {
    if (!target || target.docId !== activeDocId) return;
    if (!nodes.some((n) => n.id === target.nodeId)) return;
    setPendingReveal(null);
    setActivePageId(target.pageId);
    setSelectedId(target.nodeId);
    panToNode(target.nodeId);
  }, [target, activeDocId, nodes, setActivePageId, setSelectedId, panToNode]);

  return null;
}
