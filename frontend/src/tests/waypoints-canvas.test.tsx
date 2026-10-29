import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { hitEdgeHandle, insertWaypoint } from '../screens/canvas/edgeHandles';
import { edgePoints } from '../lib/canvasGeometry';

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() { latest.v = useDiagram(); return null; }
const api = () => latest.v!;

describe('waypoints on the canvas', () => {
  it('drag midpoint handle inserts waypoint; one undo removes it', () => {
    localStorage.clear();
    render(<DiagramProvider><Probe /></DiagramProvider>);
    act(() => api().addNode('service', 0, 0));
    act(() => api().addNode('db', 400, 0));
    const [a, b] = api().nodes;
    act(() => api().connectNodes(a.id, b.id));
    const edge = api().edges[0];
    const pts = edgePoints(edge, api().nodes, false, 'straight')!;
    const mid = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
    const grab = hitEdgeHandle(edge, pts, mid.x, mid.y, 1);
    expect(grab).toEqual({ kind: 'mid', insertIndex: 0 });
    // The gesture: one checkpoint on the first move, then silent edge updates.
    act(() => { api().checkpoint(false); api().updateEdge(edge.id, { waypoints: insertWaypoint(edge.waypoints, 0, { x: mid.x, y: mid.y + 60 }) }); });
    act(() => { api().updateEdge(edge.id, { waypoints: insertWaypoint(undefined, 0, { x: mid.x, y: mid.y + 80 }) }); });
    expect(api().edges[0].waypoints).toHaveLength(1);
    act(() => api().undo());
    expect(api().edges[0].waypoints ?? []).toHaveLength(0);
  });
});
