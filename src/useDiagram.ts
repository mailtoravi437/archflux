import { useContext } from 'react';
import { DiagramContext } from './store';
import type { DiagramContextValue, CanvasTool, LayoutKind } from './store';

export function useDiagram(): DiagramContextValue {
  const ctx = useContext(DiagramContext);
  if (!ctx) throw new Error('useDiagram must be used within DiagramProvider');
  return ctx ?? { nodes: [], edges: [], strokes: [], texts: [], selectedId: null, setSelectedId: (_: string | null) => {}, freshness: 'drift', freshnessLabel: 'Out of sync — review changes', driftCount: 1, toasts: [], pushToast: () => {}, resync: () => {}, healOrphan: () => {}, pruneWire: () => {}, healAll: () => {}, exportArch: () => {}, exportPNG: () => {}, importArch: () => {}, zoom: 1.0, pan: { x: 0, y: 0 }, setPan: (_: { x: number; y: number }) => {}, tool: 'select', setTool: (_: CanvasTool) => {}, orthogonal: true, setOrthogonal: (_: boolean) => {}, snapGrid: false, setSnapGrid: (_: boolean) => {}, zoomBy: (_: number) => {}, zoomTo: (_: number) => {}, resetView: () => {}, applyLayout: () => {}, resetDefaultNodes: () => {}, panToNode: (_: string) => {}, docTitle: '', setDocTitle: (_: string) => {}, dirty: false, docs: [], activeDocId: '', canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, addNode: () => {}, deleteSelected: () => {}, deleteNodes: () => {}, duplicateSelected: () => {}, updateNode: () => {}, moveNode: () => {}, deleteEdge: () => {}, updateEdge: () => {}, checkpoint: () => {}, connectNodes: () => {}, loadGraph: () => {}, mergeGraph: () => {}, threads: [], addThread: () => {}, replyThread: () => {}, toggleResolveThread: () => {}, deleteThread: () => {}, displayName: 'You', setDisplayName: (_: string) => {}, checkpoints: [], tagCheckpoint: () => {}, restoreCheckpoint: () => {}, deleteCheckpoint: () => {}, syncLog: [], pushLog: () => {}, isOnline: true };
}

export type { CanvasTool, LayoutKind };