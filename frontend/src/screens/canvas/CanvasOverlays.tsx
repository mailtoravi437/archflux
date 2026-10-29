import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ArchEdge, ArchNode } from '../../types';
import { useDiagram } from '../../state/useDiagram';
import { pageView } from '../../lib/pageView';
import { routeEdges, visibleNodes } from '../../lib/containmentCollapse';

/** Empty-state card shown over the canvas while the diagram has no nodes. */
export function EmptyCanvasOverlay() {
  const navigate = useNavigate();
  const { setTool, pushToast, newDoc } = useDiagram();
  return (
    <div className="empty-canvas-overlay">
      <div className="content-card" style={{ maxWidth: 380, textAlign: 'center', pointerEvents: 'auto' }} role="status" aria-label="Empty canvas">
        <img src="/icons/tools/select.svg" alt="" style={{ width: 28, height: 28, marginBottom: 4 }} />
        <div className="card-title" style={{ marginBottom: 4 }}>Empty canvas</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Start with a building block or load a blueprint.
        </p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--sm btn--primary" onClick={() => { setTool('service'); pushToast('Service tool active — click anywhere to place'); }}>+ Add service</button>
          <button className="btn btn--sm btn--secondary" onClick={() => navigate('/blueprints')}>Browse blueprints</button>
          <button className="btn btn--sm btn--secondary" onClick={() => { newDoc(); pushToast('Started a blank diagram'); }}>New diagram</button>
        </div>
      </div>
    </div>
  );
}

/** Fallback shown when the browser cannot provide a 2D canvas context. */
export function CanvasUnavailable() {
  const navigate = useNavigate();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45 }}>
      <div className="content-card" style={{ maxWidth: 400, textAlign: 'center' }} role="alert">
        <div className="card-title" style={{ marginBottom: 4 }}>Canvas unavailable</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          This browser could not provide a 2D drawing context. Your diagrams are
          safe in local storage — try another browser, or export your work from
          the Sync screen&apos;s file transfer.
        </p>
        <button className="btn btn--sm btn--primary" onClick={() => navigate('/living')}>Go to file transfer</button>
      </div>
    </div>
  );
}

/** Screen-reader traversal: full node + route list, keyboard native. */
export function DiagramNodeList({ onSelectNode }: { onSelectNode: (id: string) => void }) {
  const { nodes: allNodes, edges: allEdges, strokes, texts, pages, layers, activePageId } = useDiagram();
  // Same page and layer view as the canvas: hidden or off-page elements are not announced.
  // Memoized on the document arrays so a pan or zoom (which re-renders this component) does no work.
  const { nodes, edges } = useMemo(() => {
    const view = pageView({ nodes: allNodes, edges: allEdges, strokes, texts, pages, layers }, activePageId);
    return {
      // Children of a collapsed boundary are not announced either; edges run to the chip.
      nodes: visibleNodes(view.nodes),
      edges: routeEdges(view.nodes, view.edges).map((r) => r.edge),
    };
  }, [allNodes, allEdges, strokes, texts, pages, layers, activePageId]);
  // Latest callback behind a stable one, so the memoized list below is not re-rendered by a new closure.
  const selectRef = useRef(onSelectNode);
  useEffect(() => {
    selectRef.current = onSelectNode;
  });
  const select = useCallback((id: string) => selectRef.current(id), []);
  return <NodeListBody nodes={nodes} edges={edges} onSelectNode={select} />;
}

const NodeListBody = memo(function NodeListBody({ nodes, edges, onSelectNode }: { nodes: ArchNode[]; edges: ArchEdge[]; onSelectNode: (id: string) => void }) {
  // One pass for every node's connection count (was a filter over all edges per node).
  const connections = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      m.set(e.from, (m.get(e.from) ?? 0) + 1);
      if (e.to && e.to !== e.from) m.set(e.to, (m.get(e.to) ?? 0) + 1);
    }
    return m;
  }, [edges]);
  return (
    <nav className="sr-only" aria-label="Diagram nodes and routes">
      <ul>
        {nodes.map((n) => (
          <li key={n.id} data-testid={`canvas-node-${n.id}`}>
            <button
              type="button"
              onClick={() => onSelectNode(n.id)}
            >
              {n.label}, {n.tag}, health {n.health}, {connections.get(n.id) ?? 0} connections{n.isOrphan ? ', isolated' : ''}
            </button>
          </li>
        ))}
      </ul>
      <ul aria-label="Routes">
        {edges.map((e) => (
          <li key={e.id} data-testid={`canvas-route-${e.id}`}>
            Route {e.label}: {e.from} to {e.to ?? 'unresolved'}
          </li>
        ))}
      </ul>
    </nav>
  );
});
