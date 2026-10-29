import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { CanvasEngine } from '../../canvas/CanvasEngine';
import type { useCollaboration } from '../../hooks/useCollaboration';

export interface RemoteCursorsDeps {
  collab: ReturnType<typeof useCollaboration>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Live pan/zoom for converting the pointer to world coordinates. */
  stateRef: { readonly current: { pan: { x: number; y: number }; zoom: number } };
  theme: string;
  pan: { x: number; y: number };
  zoom: number;
}

/**
 * Live remote cursors (LucidChart parity).
 * Own pointer → awareness (world coords, throttled); remote peers → engine
 * decorations layer, a screen-space canvas stacked above the content canvas.
 */
export function useRemoteCursors({ collab, canvasRef, viewportRef, stateRef, theme, pan, zoom }: RemoteCursorsDeps) {
  const lastCursorPub = useRef(0);
  const cursorsEngineRef = useRef<CanvasEngine | null>(null);
  const publishCursor = useCallback((clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const now = performance.now();
    if (now - lastCursorPub.current < 50) return;
    lastCursorPub.current = now;
    const s = stateRef.current;
    const rect = cv.getBoundingClientRect();
    collab.updateAwareness({
      cursor: {
        x: Math.round((clientX - rect.left - s.pan.x) / s.zoom),
        y: Math.round((clientY - rect.top - s.pan.y) / s.zoom),
      },
    });
    // canvasRef/stateRef are stable ref objects; listing them changes nothing.
  }, [collab.updateAwareness, canvasRef, stateRef]);
  const clearOwnCursor = useCallback(() => {
    collab.updateAwareness({ cursor: null });
  }, [collab.updateAwareness]);

  // Mount the decorations layer once (appended after the content canvas → on top).
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const engine = new CanvasEngine({
      viewport: { x: 0, y: 0, zoom: 1 },
      isDark: false,
      gridStyle: 'none',
      connectorCurve: 'orthogonal',
      orthogonal: true,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
    engine.mount(viewport, ['decorations']);
    const onResize = () => {
      engine.resize(viewport.clientWidth, viewport.clientHeight);
    };
    window.addEventListener('resize', onResize);
    window.setTimeout(onResize, 40);
    cursorsEngineRef.current = engine;
    return () => {
      window.removeEventListener('resize', onResize);
      engine.destroy();
      cursorsEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remote peers that currently publish a pointer (never includes this client).
  const cursors = useMemo(() => {
    let selfId = '';
    try {
      const awareness = collab.awareness;
      if (awareness && typeof awareness.clientID === 'number') selfId = String(awareness.clientID);
    } catch {
      /* awareness not ready */
    }
    return collab.users
      .filter((u) => String(u.id) !== selfId && u.cursor)
      .map((u) => ({ userId: u.id, userName: u.name, userColor: u.color, x: u.cursor!.x, y: u.cursor!.y }));
  }, [collab.users, collab.awareness]);

  // Repaint remote cursors when presence or the view transform changes.
  useEffect(() => {
    const engine = cursorsEngineRef.current;
    if (!engine) return;
    engine.setConfig({ isDark: theme === 'dark', devicePixelRatio: window.devicePixelRatio || 1 });
    engine.setViewport({ x: pan.x, y: pan.y, zoom });
    engine.render({
      nodes: [],
      edges: [],
      strokes: [],
      texts: [],
      selectedIds: [],
      selectedEdgeId: null,
      pendingFrom: null,
      showPorts: false,
      pendingInk: null,
      cursors,
      alignGuides: [],
    });
  }, [cursors, pan.x, pan.y, zoom, theme]);

  return { publishCursor, clearOwnCursor, remoteCursorCount: cursors.length };
}
