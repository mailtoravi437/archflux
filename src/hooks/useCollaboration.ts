import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface CollaborationState {
  connected: boolean;
  synced: boolean;
  users: Map<string, { name: string; color: string; cursor?: { x: number; y: number } }>;
  awareness: Map<string, any>;
}

export interface SharedGraph {
  nodes: any[];
  edges: any[];
  strokes: any[];
  texts: any[];
  version: number;
}

// Shared Y.Doc per diagram so multiple hook instances (panel + canvas)
// reuse one provider instead of opening duplicate WebSocket sessions.
interface SharedSession {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  refs: number;
  yNodes: Y.Map<any>;
  yEdges: Y.Map<any>;
  yStrokes: Y.Map<any>;
  yTexts: Y.Map<any>;
}

const sessions = new Map<string, SharedSession>();

function getSession(diagramId: string, auth_token: string): SharedSession {
  const existing = sessions.get(diagramId);
  if (existing) {
    existing.refs += 1;
    return existing;
  }
  const ydoc = new Y.Doc();
  const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:3001'}/ws`;
  const provider = new WebsocketProvider(
    wsUrl,
    `diagram-${diagramId}`,
    ydoc,
    {
      connect: true,
      params: {
        token: auth_token,
        diagramId: diagramId,
      }
    }
  );
  const session: SharedSession = {
    ydoc,
    provider,
    refs: 1,
    yNodes: ydoc.getMap('nodes'),
    yEdges: ydoc.getMap('edges'),
    yStrokes: ydoc.getMap('strokes'),
    yTexts: ydoc.getMap('texts'),
  };
  sessions.set(diagramId, session);
  return session;
}

function releaseSession(diagramId: string) {
  const session = sessions.get(diagramId);
  if (!session) return;
  session.refs -= 1;
  if (session.refs <= 0) {
    sessions.delete(diagramId);
    try {
      session.provider.disconnect();
      session.provider.destroy();
    } catch {
      /* ignore */
    }
    try {
      session.ydoc.destroy();
    } catch {
      /* ignore */
    }
  }
}

function snapshotMaps(session: SharedSession): Omit<SharedGraph, 'version'> {
  return {
    nodes: Array.from(session.yNodes.values()),
    edges: Array.from(session.yEdges.values()),
    strokes: Array.from(session.yStrokes.values()),
    texts: Array.from(session.yTexts.values()),
  };
}

export function useCollaboration(diagramId: string | null) {
  const auth_token = localStorage.getItem('archflux:auth_token');

  const [state, setState] = useState<CollaborationState>({
    connected: false,
    synced: false,
    users: new Map(),
    awareness: new Map(),
  });
  const [remoteGraph, setRemoteGraph] = useState<SharedGraph | null>(null);

  const sessionRef = useRef<SharedSession | null>(null);
  const awarenessRef = useRef<any | null>(null);
  const hydratedRef = useRef(false);

  // Initialize shared session + presence + graph observers
  useEffect(() => {
    if (!diagramId || !auth_token) return;
    hydratedRef.current = false;

    const session = getSession(diagramId, auth_token);
    sessionRef.current = session;

    // Set up awareness
    const awareness = session.provider.awareness;
    awarenessRef.current = awareness;

    // Set local user info
    awareness.setLocalState({
      user: {
        id: 'current-user',
        name: 'Current User',
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      },
    });

    // Handle connection status
    const onStatus = (event: { status: string }) => {
      setState(prev => ({
        ...prev,
        connected: event.status === 'connected',
        synced: event.status === 'synced',
      }));
      if (event.status === 'synced' && !hydratedRef.current) {
        hydratedRef.current = true;
        void hydrateFromServer(session, diagramId, auth_token);
      }
    };
    session.provider.on('status', onStatus);

    // Handle awareness updates
    const onAwarenessChange = () => {
      const states = new Map();
      awareness.getStates().forEach((st, clientId) => {
        if (st && st.user) {
          states.set(clientId, st.user);
        }
      });
      setState(prev => ({ ...prev, users: states }));
    };
    awareness.on('change', onAwarenessChange);

    // Remote graph updates (skip echoes of our own local transactions)
    const onGraphChange = (_e: unknown, txn: Y.Transaction) => {
      if (txn.origin === 'local') return;
      const snap = snapshotMaps(session);
      setRemoteGraph((prev) => ({ ...snap, version: (prev?.version ?? 0) + 1 }));
    };
    session.yNodes.observeDeep(onGraphChange);
    session.yEdges.observeDeep(onGraphChange);
    session.yStrokes.observeDeep(onGraphChange);
    session.yTexts.observeDeep(onGraphChange);

    // Publish current shared state immediately (covers late joiners)
    const initial = snapshotMaps(session);
    if (initial.nodes.length + initial.edges.length + initial.strokes.length + initial.texts.length > 0) {
      setRemoteGraph({ ...initial, version: 1 });
    }

    // Cleanup
    return () => {
      try {
        session.provider.off('status', onStatus);
      } catch {
        /* ignore */
      }
      try {
        awareness.off('change', onAwarenessChange);
      } catch {
        /* ignore */
      }
      try {
        session.yNodes.unobserveDeep(onGraphChange);
        session.yEdges.unobserveDeep(onGraphChange);
        session.yStrokes.unobserveDeep(onGraphChange);
        session.yTexts.unobserveDeep(onGraphChange);
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
      releaseSession(diagramId);
    };
  }, [diagramId, auth_token]);

  // Push the local canvas graph into the shared Y.Doc (debounced by caller).
  const pushLocalGraph = useCallback((graph: { nodes: any[]; edges: any[]; strokes?: any[]; texts?: any[] }) => {
    const session = sessionRef.current;
    if (!session) return;
    session.ydoc.transact(() => {
      syncMap(session.yNodes, graph.nodes, (n: any) => n.id);
      syncMap(session.yEdges, graph.edges, (e: any) => e.id);
      syncMap(session.yStrokes, graph.strokes ?? [], (s: any, i: number) => s.id ?? `stroke-${i}`);
      syncMap(session.yTexts, graph.texts ?? [], (t: any, i: number) => t.id ?? `text-${i}`);
    }, 'local');
  }, []);

  // Apply remote updates to local document
  const applyRemoteUpdate = useCallback((update: Uint8Array) => {
    const session = sessionRef.current;
    if (session) {
      Y.applyUpdate(session.ydoc, update);
    }
  }, []);

  // Update awareness (cursor position, selection)
  const updateAwareness = useCallback((awareness: Partial<{ cursor: { x: number; y: number }; selection: any }>) => {
    if (awarenessRef.current) {
      awarenessRef.current.setLocalStateField('user', {
        ...awarenessRef.current.getLocalState()?.user,
        ...awareness,
      });
    }
  }, []);

  // Get all connected users
  const getConnectedUsers = useCallback(() => {
    return Array.from(state.users.entries()).map(([id, user]) => ({
      id,
      ...user,
    }));
  }, [state.users]);

  return {
    state,
    ydoc: sessionRef.current?.ydoc ?? null,
    provider: sessionRef.current?.provider ?? null,
    awareness: awarenessRef.current,
    connected: state.connected,
    synced: state.synced,
    users: getConnectedUsers(),
    updateAwareness,
    applyRemoteUpdate,
    pushLocalGraph,
    remoteGraph,
  };
}

// Sync a plain array into a Y.Map keyed by id (add/update/delete, single transaction by caller).
// Exported for unit testing the CRDT sync primitive.
export function syncMap(map: Y.Map<any>, items: any[], keyOf: (item: any, index: number) => string) {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const key = keyOf(item, i);
    seen.add(key);
    map.set(key, structuredCloneSafe(item));
  });
  Array.from(map.keys()).forEach((key) => {
    if (!seen.has(key)) map.delete(key);
  });
}

function structuredCloneSafe<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

// Hydrate empty shared maps from the server snapshot on first sync.
async function hydrateFromServer(session: SharedSession, diagramId: string, auth_token: string) {
  try {
    // Skip when collaborators already populated the doc.
    if (session.yNodes.size + session.yEdges.size + session.yStrokes.size + session.yTexts.size > 0) return;
    const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/v1/diagrams/${diagramId}`, {
      headers: { 'Authorization': `Bearer ${auth_token}` }
    });
    if (!response.ok) return;
    const body = await response.json();
    const data = body?.data ?? body;
    const graph = data?.graph ?? data ?? {};
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const strokes = Array.isArray(graph.strokes) ? graph.strokes : [];
    const texts = Array.isArray(graph.texts) ? graph.texts : [];
    if (nodes.length + edges.length + strokes.length + texts.length === 0) return;
    session.ydoc.transact(() => {
      syncMap(session.yNodes, nodes, (n: any) => n.id);
      syncMap(session.yEdges, edges, (e: any) => e.id);
      syncMap(session.yStrokes, strokes, (s: any, i: number) => s.id ?? `stroke-${i}`);
      syncMap(session.yTexts, texts, (t: any, i: number) => t.id ?? `text-${i}`);
    }, 'hydrate');
  } catch (error) {
    console.error('Failed to sync diagram:', error);
  }
}

// Hook for presence/awareness only (lighter weight, shares the session doc)
export function usePresence(diagramId: string | null) {
  const auth_token = localStorage.getItem('archflux:auth_token');
  const [users, setUsers] = useState<Map<string, any>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!diagramId || !auth_token) return;

    const session = getSession(diagramId, auth_token);
    const awareness = session.provider.awareness;

    const onStatus = (event: { status: string }) => {
      setConnected(event.status === 'connected');
    };
    session.provider.on('status', onStatus);

    const onChange = () => {
      const states = new Map();
      awareness.getStates().forEach((st, clientId) => {
        if (st && st.user) {
          states.set(clientId, st.user);
        }
      });
      setUsers(states);
    };
    awareness.on('change', onChange);

    return () => {
      try {
        session.provider.off('status', onStatus);
      } catch {
        /* ignore */
      }
      try {
        awareness.off('change', onChange);
      } catch {
        /* ignore */
      }
      releaseSession(diagramId);
    };
  }, [diagramId, auth_token]);

  return { users: Array.from(users.values()), connected };
}
