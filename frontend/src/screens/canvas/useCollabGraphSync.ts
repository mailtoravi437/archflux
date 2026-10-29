import { useEffect, useRef } from 'react';
import type { ArchEdge, ArchNode, FreeStroke, FreeText } from '../../types';
import type { useCollaboration } from '../../hooks/useCollaboration';
import type { DiagramApi } from './types';

export interface CollabGraphSyncDeps extends Pick<DiagramApi, 'loadGraph' | 'pushToast'> {
  collab: ReturnType<typeof useCollaboration>;
  activeDocId: string | null | undefined;
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
}

/**
 * Real-time collaboration graph sync: pushes the local graph (debounced) and
 * applies remote graph updates with an echo guard.
 */
export function useCollabGraphSync({ collab, activeDocId, nodes, edges, strokes, texts, loadGraph, pushToast }: CollabGraphSyncDeps): void {
  const applyingRemote = useRef(false);
  const lastPushed = useRef('');
  // Push local graph (debounced) — skipped while applying a remote update.
  useEffect(() => {
    if (!activeDocId || applyingRemote.current) return;
    const key = JSON.stringify([nodes, edges, strokes, texts]);
    if (key === lastPushed.current) return;
    const timer = window.setTimeout(() => {
      lastPushed.current = key;
      collab.pushLocalGraph({ nodes, edges, strokes, texts });
    }, 400);
    return () => window.clearTimeout(timer);
    // pushLocalGraph is stable; collab object identity changes per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, strokes, texts, activeDocId]);
  // Apply remote graph updates (nodes/edges) with echo guard.
  const lastRemoteVersion = useRef(0);
  useEffect(() => {
    const remote = collab.remoteGraph;
    if (!remote || remote.version <= lastRemoteVersion.current) return;
    lastRemoteVersion.current = remote.version;
    const sameNodes = JSON.stringify(remote.nodes) === JSON.stringify(nodes);
    const sameEdges = JSON.stringify(remote.edges) === JSON.stringify(edges);
    if (sameNodes && sameEdges) return;
    applyingRemote.current = true;
    try {
      loadGraph(remote.nodes, remote.edges, 'Remote update');
      lastPushed.current = JSON.stringify([remote.nodes, remote.edges, remote.strokes ?? strokes, remote.texts ?? texts]);
      pushToast('Applied remote changes');
    } finally {
      window.setTimeout(() => { applyingRemote.current = false; }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab.remoteGraph]);
}
