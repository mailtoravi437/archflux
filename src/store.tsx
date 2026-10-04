import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ArchEdge, ArchNode, DiagramDoc, FreeStroke, FreeText, FreshnessState, LibraryShape, TextFont, ThemeName } from './types';
import { billingHealEdge, fraudEdge, fraudWorkerNode, mockCheckpoints, mockComment, mockEdges, mockNodes, mockStrokes } from './mocks';
import type { Checkpoint } from './types';
import { api } from './api';

export interface Toast {
  id: number;
  text: string;
}

export interface ReviewThread {
  id: string;
  author: string;
  role: string;
  time: string;
  pinnedTo: string;
  pinnedLabel: string;
  text: string;
  resolved: boolean;
  replies: { author: string; text: string; time: string }[];
}

export interface SnapshotCheckpoint extends Checkpoint {
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
}

export interface SyncLog {
  id: number;
  text: string;
  time: string;
}

export type CanvasTool = 'select' | 'pan' | 'draw' | 'text' | 'service' | 'gateway' | 'db' | 'stream' | 'connector' | 'comment';
export type LayoutKind = 'dag' | 'tree' | 'matrix';

export interface DiagramContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  nodes: ArchNode[];
  edges: ArchEdge[];
  setNodes: React.Dispatch<React.SetStateAction<ArchNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<ArchEdge[]>>;
  strokes: FreeStroke[];
  addStroke: (pts: { x: number; y: number }[], color: string, width: number) => void;
  updateStroke: (id: string, patch: Partial<FreeStroke>) => void;
  moveStroke: (id: string, dx: number, dy: number) => void;
  deleteStroke: (id: string) => void;
  texts: FreeText[];
  addText: (x: number, y: number, text: string, fontSize: number, color: string) => string | null;
  updateText: (id: string, patch: Partial<FreeText>) => void;
  moveText: (id: string, dx: number, dy: number) => void;
  deleteText: (id: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  freshness: FreshnessState;
  freshnessLabel: string;
  driftCount: number;
  toasts: Toast[];
  pushToast: (text: string) => void;
  resync: () => void;
  healOrphan: (id?: string | null, silent?: boolean) => void;
  pruneWire: (id?: string | null, silent?: boolean) => void;
  healAll: () => void;
  exportArch: () => void;
  exportPNG: () => void;
  importArch: (data: { nodes: ArchNode[]; edges: ArchEdge[] }) => void;
  zoom: number;
  pan: { x: number; y: number };
  setPan: (p: { x: number; y: number }) => void;
  tool: CanvasTool;
  setTool: (t: CanvasTool) => void;
  orthogonal: boolean;
  setOrthogonal: (v: boolean) => void;
  snapGrid: boolean;
  setSnapGrid: (v: boolean) => void;
  zoomBy: (delta: number) => void;
  zoomTo: (z: number) => void;
  resetView: () => void;
  applyLayout: (kind: LayoutKind) => void;
  resetDefaultNodes: () => void;
  panToNode: (id: string) => void;
  docTitle: string;
  setDocTitle: (t: string) => void;
  dirty: boolean;
  // Multi-document model: each doc owns its graph; switching clears undo.
  docs: DiagramDoc[];
  activeDocId: string;
  openDoc: (id: string) => void;
  newDoc: () => void;
  renameDoc: (id: string, title: string) => void;
  setDocTags: (id: string, tags: string[]) => void;
  duplicateDoc: (id: string) => void;
  deleteDoc: (id: string) => void;
  placeShape: (shape: LibraryShape, x: number, y: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  addNode: (type: CanvasTool, x: number, y: number) => void;
  deleteSelected: () => void;
  deleteNodes: (ids: string[]) => void;
  duplicateSelected: () => void;
  updateNode: (id: string, patch: Partial<ArchNode>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  deleteEdge: (id: string) => void;
  updateEdge: (id: string, patch: Partial<ArchEdge>) => void;
  checkpoint: (markDrift?: boolean) => void;
  connectNodes: (from: string, to: string | null, targetCoords?: { x: number; y: number }) => void;
  loadGraph: (nodes: ArchNode[], edges: ArchEdge[], label?: string) => void;
  mergeGraph: (nodes: ArchNode[], edges: ArchEdge[], label?: string) => void;
  threads: ReviewThread[];
  addThread: (pinnedTo: string, text: string, label?: string) => void;
  replyThread: (id: string, text: string) => void;
  toggleResolveThread: (id: string) => void;
  deleteThread: (id: string) => void;
  displayName: string;
  setDisplayName: (t: string) => void;
  checkpoints: SnapshotCheckpoint[];
  tagCheckpoint: (title: string) => void;
  restoreCheckpoint: (id: string) => void;
  deleteCheckpoint: (id: string) => void;
  syncLog: SyncLog[];
  pushLog: (text: string) => void;
  /** Real browser connectivity — sync refuses to pretend while offline. */
  isOnline: boolean;
}

export const DiagramContext = createContext<DiagramContextValue | null>(null);

let toastSeq = 1;
let logSeq = 1;

const DEFAULT_PAN = { x: 50, y: 40 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4.0;
const STORE_KEY = 'archflux:v2-light';

function cloneNodes(src: ArchNode[]): ArchNode[] {
  return src.map((n) => ({ ...n }));
}

function cloneEdges(src: ArchEdge[]): ArchEdge[] {
  return src.map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
}

function cloneStrokes(src: FreeStroke[]): FreeStroke[] {
  return src.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })) }));
}

function cloneTexts(src: FreeText[]): FreeText[] {
  return src.map((t) => ({ ...t }));
}

function isValidText(t: unknown): t is FreeText {
  if (typeof t !== 'object' || t === null) return false;
  const v = t as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    Number.isFinite(v.x) === false ||
    Number.isFinite(v.y) === false ||
    typeof v.text !== 'string' ||
    Number.isFinite(v.fontSize) === false ||
    typeof v.color !== 'string'
  ) return false;
  const fonts: TextFont[] = ['Caveat', 'Patrick Hand', 'Plus Jakarta Sans', 'Fira Code'];
  if (v.fontFamily !== undefined && !fonts.includes(v.fontFamily as TextFont)) return false;
  if (v.bold !== undefined && typeof v.bold !== 'boolean') return false;
  if (v.italic !== undefined && typeof v.italic !== 'boolean') return false;
  if (v.fill !== undefined && typeof v.fill !== 'string') return false;
  if (v.border !== undefined && typeof v.border !== 'boolean') return false;
  return true;
}

function isValidStroke(s: unknown): s is FreeStroke {
  if (typeof s !== 'object' || s === null) return false;
  const v = s as Record<string, unknown>;
  if (typeof v.id !== 'string' || !Array.isArray(v.pts) || v.pts.length < 1 || v.pts.length > 2000) return false;
  return (v.pts as unknown[]).every(
    (p) => typeof p === 'object' && p !== null && Number.isFinite((p as Record<string, unknown>).x) && Number.isFinite((p as Record<string, unknown>).y),
  );
}

function isValidThread(t: unknown): t is ReviewThread {
  if (typeof t !== 'object' || t === null) return false;
  const v = t as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    typeof v.pinnedTo === 'string' &&
    typeof v.resolved === 'boolean' &&
    Array.isArray(v.replies) &&
    v.replies.every(
      (r) => typeof r === 'object' && r !== null && typeof (r as Record<string, unknown>).text === 'string',
    )
  );
}

function sanitizeCheckpoint(c: unknown): SnapshotCheckpoint | null {
  if (typeof c !== 'object' || c === null) return null;
  const v = c as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.title !== 'string' || !Array.isArray(v.nodes) || !Array.isArray(v.edges)) {
    return null;
  }
  const nodes = (v.nodes as unknown[]).filter(isValidNode) as ArchNode[];
  if (nodes.length === 0) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (v.edges as unknown[])
    .filter((e): e is ArchEdge => isValidEdge(e, ids))
    .map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
  return {
    id: v.id,
    title: v.title,
    meta: typeof v.meta === 'string' ? v.meta : 'Restored snapshot',
    active: v.active === true,
    badge: typeof v.badge === 'string' ? v.badge : undefined,
    nodes: reconcileOrphans(nodes, edges),
    edges,
    strokes: Array.isArray(v.strokes) ? (v.strokes as unknown[]).filter(isValidStroke) : [],
  texts: Array.isArray(v.texts) ? (v.texts as unknown[]).filter(isValidText) : [],
  };
}

function loadPersisted(): {
  nodes: ArchNode[];
  edges: ArchEdge[];
  theme: ThemeName;
  docTitle: string;
  docs?: DiagramDoc[];
  activeDocId?: string;
  threads?: ReviewThread[];
  checkpoints?: SnapshotCheckpoint[];
  threadsByDoc?: Record<string, ReviewThread[]>;
  cpsByDoc?: Record<string, SnapshotCheckpoint[]>;
  syncLog?: SyncLog[];
  pan?: { x: number; y: number };
  zoom?: number;
  freshness?: FreshnessState;
  freshnessLabel?: string;
  driftCount?: number;
  displayName?: string;
} | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.docs) && parsed.docs.length > 0) {
      const docs = (parsed.docs as unknown[])
        .filter((d): d is DiagramDoc => {
          if (typeof d !== 'object' || d === null) return false;
          const v = d as Record<string, unknown>;
          return typeof v.id === 'string' && typeof v.title === 'string' && Array.isArray(v.nodes) && Array.isArray(v.edges);
        })
        .map((d) => {
          const nodes = (d.nodes as unknown[]).filter(isValidNode) as ArchNode[];
          const ids = new Set(nodes.map((n) => n.id));
          const edges = (d.edges as unknown[])
            .filter((e): e is ArchEdge => isValidEdge(e, ids))
            .map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
          const strokes = Array.isArray((d as { strokes?: unknown }).strokes)
            ? ((d as { strokes?: unknown }).strokes as unknown[]).filter(isValidStroke)
            : [];
          const texts = Array.isArray((d as { texts?: unknown }).texts)
            ? ((d as { texts?: unknown }).texts as unknown[]).filter(isValidText)
            : [];
          return { ...d, nodes: reconcileOrphans(nodes, edges), edges, strokes, texts };
        });
      // Blank docs (0 nodes) are valid designs — keep them all.
      if (docs.length === 0) return null;
      const activeDocId = typeof parsed.activeDocId === 'string' && docs.some((d) => d.id === parsed.activeDocId)
        ? parsed.activeDocId
        : docs[0].id;
      const active = docs.find((d) => d.id === activeDocId)!;
      return {
        ...parsed,
        docs,
        activeDocId,
        nodes: active.nodes,
        edges: active.edges,
        docTitle: active.title,
        threadsByDoc: sanitizeThreadMap(parsed.threadsByDoc),
        cpsByDoc: sanitizeCpMap(parsed.cpsByDoc),
      };
    }
    // Legacy single-graph payloads (v1–v3): wrap into one document.
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    const nodes = (parsed.nodes as unknown[]).filter(isValidNode) as ArchNode[];
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (parsed.edges as unknown[])
      .filter((e): e is ArchEdge => isValidEdge(e, ids))
      .map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
    if (nodes.length === 0) return null;
    const now = Date.now();
    const title = typeof parsed.docTitle === 'string' && parsed.docTitle ? parsed.docTitle : 'checkout-event-driven-mesh.arch';
    const doc: DiagramDoc = { id: `doc-${now.toString(36)}`, title, nodes: reconcileOrphans(nodes, edges), edges, strokes: [], createdAt: now, updatedAt: now };
    return { ...parsed, docs: [doc], activeDocId: doc.id, nodes: doc.nodes, edges: doc.edges, docTitle: title };
  } catch {
    return null;
  }
}

function sanitizeThreadMap(v: unknown): Record<string, ReviewThread[]> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const clean: Record<string, ReviewThread[]> = {};
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k !== 'string' || !Array.isArray(list)) continue;
    const items = (list as unknown[]).filter(isValidThread);
    if (items.length > 0) clean[k] = items;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function sanitizeCpMap(v: unknown): Record<string, SnapshotCheckpoint[]> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const clean: Record<string, SnapshotCheckpoint[]> = {};
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k !== 'string' || !Array.isArray(list)) continue;
    const items = (list as unknown[])
      .map(sanitizeCheckpoint)
      .filter((c): c is SnapshotCheckpoint => c !== null);
    if (items.length > 0) clean[k] = items;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function isValidNode(n: unknown): boolean {
  if (typeof n !== 'object' || n === null) return false;
  const v = n as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.label === 'string' &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.w) &&
    Number.isFinite(v.h)
  );
}

function isValidEdge(e: unknown, ids: Set<string>): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const v = e as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.from === 'string' && ids.has(v.from) && (v.to === null || (typeof v.to === 'string' && ids.has(v.to)));
}

/** Recompute orphan flags from connectivity so stale flags can't persist. */
function seedDoc(): DiagramDoc {
  const now = Date.now();
  return {
    // Fixed id: fresh-install initializers across states must agree on the key.
    id: 'doc-seed',
    title: 'checkout-event-driven-mesh.arch',
    nodes: cloneNodes(mockNodes),
    edges: cloneEdges(mockEdges),
    strokes: cloneStrokes(mockStrokes),
    createdAt: now,
    updatedAt: now,
  };
}

function blankDoc(n: number): DiagramDoc {
  const now = Date.now();
  return {
    id: `doc-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    title: n <= 1 ? 'untitled.arch' : `untitled-${n}.arch`,
    nodes: [],
    edges: [],
    strokes: [],
    createdAt: now,
    updatedAt: now,
  };
}
/** Recompute orphan flags from connectivity so stale flags can't persist. */
function reconcileOrphans(nodes: ArchNode[], edges: ArchEdge[]): ArchNode[] {
  const deg = new Map<string, number>();
  nodes.forEach((n) => deg.set(n.id, 0));
  edges.forEach((e) => {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    if (e.to) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  });
  return nodes.map((n) => ({ ...n, isOrphan: (deg.get(n.id) ?? 0) === 0 }));
}

const TYPE_META: Record<string, { label: string; tag: string; stroke: string; type: string }> = {
  service: { label: 'Microservice', tag: 'Node.js / REST', stroke: '#2563EB', type: 'service' },
  gateway: { label: 'API Gateway', tag: 'Envoy v1.28', stroke: '#7C3AED', type: 'gateway' },
  db: { label: 'Database', tag: 'Postgres 15', stroke: '#2563EB', type: 'db' },
  stream: { label: 'Event Stream', tag: 'Kafka v3.6', stroke: '#7C3AED', type: 'stream' },
};

export function DiagramProvider({ children }: { children: ReactNode }) {
  const persisted = useRef(loadPersisted());
  const [theme, setThemeState] = useState<ThemeName>(() => persisted.current?.theme ?? 'light');
  const [nodes, setNodesState] = useState<ArchNode[]>(() =>
    persisted.current ? cloneNodes(persisted.current.nodes) : cloneNodes(mockNodes),
  );
  const [edges, setEdgesState] = useState<ArchEdge[]>(() =>
    persisted.current ? cloneEdges(persisted.current.edges) : cloneEdges(mockEdges),
  );
  const [strokes, setStrokesState] = useState<FreeStroke[]>(() => {
    const p = persisted.current;
    if (p?.docs && p.activeDocId) {
      const active = p.docs.find((d) => d.id === p.activeDocId);
      if (active?.strokes) return cloneStrokes(active.strokes);
    }
    return [];
  });
  const [texts, setTextsState] = useState<FreeText[]>(() => {
    const p = persisted.current;
    if (p?.docs && p.activeDocId) {
      const active = p.docs.find((d) => d.id === p.activeDocId);
      if (active?.texts) return cloneTexts(active.texts);
    }
    return [];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<FreshnessState>(() => persisted.current?.freshness ?? 'drift');
  const [freshnessLabel, setFreshnessLabel] = useState(
    () => persisted.current?.freshnessLabel ?? 'Out of sync — review changes',
  );
  const [driftCount, setDriftCount] = useState(() => persisted.current?.driftCount ?? 1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [zoom, setZoom] = useState(() => {
    const z = persisted.current?.zoom;
    return typeof z === 'number' && Number.isFinite(z) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) : 1.0;
  });
  const [pan, setPanState] = useState<{ x: number; y: number }>(() => {
    const p = persisted.current?.pan;
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : { ...DEFAULT_PAN };
  });
  const [tool, setToolState] = useState<CanvasTool>('select');
  const [orthogonal, setOrthogonal] = useState(true);
  const [snapGrid, setSnapGrid] = useState(false);
  const [docTitle, setDocTitleState] = useState(() => persisted.current?.docTitle ?? 'checkout-event-driven-mesh.arch');
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  useEffect(() => {
    const goOffline = () => {
      setIsOnline(false);
      pushLog('Network offline — sync paused');
      pushToast('You are offline — sync paused');
    };
    const goOnline = () => {
      setIsOnline(true);
      pushLog('Network back online');
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
    // pushToast/pushLog stable; subscribe once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [displayName, setDisplayName] = useState(() => (persisted.current?.displayName ?? 'You').slice(0, 40) || 'You');
  const [docState, setDocState] = useState<{ docs: DiagramDoc[]; activeDocId: string }>(() => {
    const docs = persisted.current?.docs ?? [seedDoc()];
    const savedActive = persisted.current?.activeDocId;
    const activeDocId = savedActive && docs.some((d) => d.id === savedActive) ? savedActive : docs[0].id;
    return { docs, activeDocId };
  });
  const docs = docState.docs;
  const activeDocId = docState.activeDocId;
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<{ nodes: ArchNode[]; edges: ArchEdge[]; strokes: FreeStroke[]; texts: FreeText[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: ArchNode[]; edges: ArchEdge[]; strokes: FreeStroke[]; texts: FreeText[] }[]>([]);
  const seedThreadList = (): ReviewThread[] => [
    {
      id: 't1',
      author: mockComment.author,
      role: mockComment.role,
      time: mockComment.time,
      pinnedTo: 'kafka',
      pinnedLabel: mockComment.pinnedTo,
      text: mockComment.text,
      resolved: false,
      replies: [],
    },
  ];
  const seedCpList = (): SnapshotCheckpoint[] =>
    mockCheckpoints.map((c) => ({ ...c, nodes: cloneNodes(mockNodes), edges: cloneEdges(mockEdges), strokes: [], texts: [] }));
  const activeKeyOf = (): string => {
    const p = persisted.current;
    if (p?.activeDocId && p.docs?.some((d) => d.id === p.activeDocId)) return p.activeDocId;
    return p?.docs?.[0]?.id ?? 'doc-seed';
  };
  const [threadMap, setThreadMap] = useState<Record<string, ReviewThread[]>>(() => {
    const p = persisted.current;
    if (p?.threadsByDoc && Object.keys(p.threadsByDoc).length > 0) return p.threadsByDoc;
    // Legacy flat arrays migrate into the active document's scope.
    if (p && Array.isArray(p.threads)) {
      const clean = (p.threads as unknown[]).filter(isValidThread);
      if (clean.length > 0) return { [activeKeyOf()]: clean };
    }
    return { [activeKeyOf()]: seedThreadList() };
  });
  const [cpsMap, setCpsMap] = useState<Record<string, SnapshotCheckpoint[]>>(() => {
    const p = persisted.current;
    if (p?.cpsByDoc && Object.keys(p.cpsByDoc).length > 0) return p.cpsByDoc;
    if (p && Array.isArray(p.checkpoints)) {
      const clean = (p.checkpoints as unknown[])
        .map(sanitizeCheckpoint)
        .filter((c): c is SnapshotCheckpoint => c !== null);
      if (clean.length > 0) return { [activeKeyOf()]: clean };
    }
    return { [activeKeyOf()]: seedCpList() };
  });
  const [syncLog, setSyncLog] = useState<SyncLog[]>(() => {
    const saved = persisted.current?.syncLog;
    if (Array.isArray(saved)) {
      const clean = saved.filter(
        (l): l is SyncLog =>
          typeof l === 'object' &&
          l !== null &&
          typeof (l as unknown as Record<string, unknown>).text === 'string' &&
          typeof (l as unknown as Record<string, unknown>).time === 'string' &&
          typeof (l as unknown as { id?: unknown }).id === 'number',
      );
      if (clean.length > 0) return clean.slice(0, 30);
    }
    return [
      { id: logSeq++, text: 'Watcher attached to ns/payments (42 objects)', time: new Date().toLocaleTimeString() },
      { id: logSeq++, text: 'OpenAPI diff: POST /orders schema changed', time: new Date().toLocaleTimeString() },
    ];
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Persist (debounced). The active doc always mirrors the live graph.
  // Review state persists per document (v5); legacy flat arrays migrate on load.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const now = Date.now();
        const { docs: allDocs, activeDocId: active } = docsRef.current;
        const synced = allDocs.map((d) =>
          d.id === active
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), updatedAt: now }
            : d,
        );
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ docs: synced, activeDocId: active, theme, docTitle, displayName, threadsByDoc: threadMap, cpsByDoc: cpsMap, syncLog, freshness, freshnessLabel, driftCount, pan, zoom, v: 5 }),
        );
      } catch {
        /* quota ignore */
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [nodes, edges, strokes, texts, theme, docTitle, displayName, threadMap, cpsMap, syncLog, freshness, freshnessLabel, driftCount, docState, pan, zoom]);

  // Synchronous flush on unload: the debounced persist above can lag keystrokes
  // by 300ms, so a reload within that window would drop the latest characters.
  useEffect(() => {
    const flush = () => {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const { docs: allDocs, activeDocId: active } = docsRef.current;
        const now = Date.now();
        const synced = allDocs.map((d) =>
          d.id === active
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), updatedAt: now }
            : d,
        );
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...prev, docs: synced, activeDocId: active, pan: panRef.current, zoom: zoomRef.current }));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  const lastToast = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const pushToast = useCallback((text: string) => {
    // Collapse rapid identical toasts (e.g. repeated layout clicks).
    const now = Date.now();
    if (lastToast.current.text === text && now - lastToast.current.at < 1200) return;
    lastToast.current = { text, at: now };
    const id = toastSeq++;
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  const pushLog = useCallback((text: string) => {
    setSyncLog((prev) => [{ id: logSeq++, text, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
  }, []);

  const freshnessRef = useRef(freshness);
  freshnessRef.current = freshness;

  interface GraphSnap {
    nodes: ArchNode[];
    edges: ArchEdge[];
    strokes: FreeStroke[];
    texts: FreeText[];
  }
  const pastRef = useRef<GraphSnap[]>([]);
  const futureRef = useRef<GraphSnap[]>([]);

  const snapshot = useCallback((n: ArchNode[], e: ArchEdge[], markDrift = true) => {
    const entry = { nodes: cloneNodes(n), edges: cloneEdges(e), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current) };
    pastRef.current = [...pastRef.current.slice(-29), entry];
    futureRef.current = [];
    setPast(pastRef.current);
    setFuture([]);
    setDirty(true);
    // Any semantic graph mutation invalidates a previous "fresh" sync.
    if (markDrift && freshnessRef.current === 'fresh') {
      setFreshness('drift');
      setFreshnessLabel('Unsynced changes');
      setDriftCount(1);
    }
  }, []);

  // Plain setters: history is recorded explicitly via snapshot()/checkpoint()
  // so per-frame updates (drag) and per-keystroke updates (inspector) don't
  // flood the undo stack. Kept for API compatibility.
  const setNodes: React.Dispatch<React.SetStateAction<ArchNode[]>> = useCallback((action) => {
    setNodesState(action);
  }, []);

  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const docsRef = useRef(docState);
  docsRef.current = docState;
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const snapGridRef = useRef(snapGrid);
  snapGridRef.current = snapGrid;
  const snapThresholdRef = useRef(10);
  try {
    const s = JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { snapThreshold?: string };
    if (s.snapThreshold === '5' || s.snapThreshold === '10' || s.snapThreshold === '20') snapThresholdRef.current = Number(s.snapThreshold);
    else if (s.snapThreshold === 'off') snapThresholdRef.current = 0;
  } catch {
    /* ignore */
  }
  const activeDocRef = useRef(activeDocId);
  activeDocRef.current = activeDocId;
  const docTitleRef = useRef(docTitle);
  docTitleRef.current = docTitle;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const archBaseName = () =>
    docTitleRef.current.replace(/\.arch$/i, '').replace(/[^\w\-+.]+/g, '-').replace(/^-+|-+$/g, '') || 'system_architecture';

  const setEdges: React.Dispatch<React.SetStateAction<ArchEdge[]>> = useCallback((action) => {
    setEdgesState(action);
  }, []);

  // Record one undo step for the current graph. Drags and inspector typing
  // call this once on grab/focus, then use moveNode/updateNode (silent).
  const checkpoint = useCallback(
    (markDrift = true) => {
      snapshot(nodesRef.current, edgesRef.current, markDrift);
    },
    [snapshot],
  );

  // History-silent single-node move (drag frames). Snaps to 10px when enabled.
  const moveNode = useCallback(
    (id: string, x: number, y: number) => {
      const snap = snapGridRef.current ? snapThresholdRef.current : 0;
      const nx = snap ? Math.round(x / snap) * snap : Math.round(x);
      const ny = snap ? Math.round(y / snap) * snap : Math.round(y);
      setNodesState((prev) => prev.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)));
    },
    [],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      if (!edgesRef.current.some((e) => e.id === id)) {
        pushToast('Edge already removed');
        return;
      }
      snapshot(nodesRef.current, edgesRef.current);
      setEdgesState((prev) => prev.filter((e) => e.id !== id));
      pushToast('Deleted route');
      pushLog(`Canvas: deleted route ${id}`);
    },
    [pushToast, pushLog, snapshot],
  );

  const updateEdge = useCallback((id: string, patch: Partial<ArchEdge>) => {
    // Silent: callers checkpoint() before editing so typing doesn't flood undo.
    setEdgesState((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const p = pastRef.current;
    if (p.length === 0) {
      pushToast('Nothing to undo');
      return;
    }
    const last = p[p.length - 1];
    futureRef.current = [
      { nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current) },
      ...futureRef.current,
    ].slice(0, 30);
    pastRef.current = p.slice(0, -1);
    setPast(pastRef.current);
    setFuture(futureRef.current);
    setNodesState(cloneNodes(last.nodes));
    setEdgesState(cloneEdges(last.edges));
    setStrokesState(cloneStrokes(last.strokes ?? []));
    setTextsState(cloneTexts(last.texts ?? []));
    pushToast('Undo applied');
  }, [pushToast]);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (f.length === 0) {
      pushToast('Nothing to redo');
      return;
    }
    const head = f[0];
    pastRef.current = [
      ...pastRef.current,
      { nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current) },
    ].slice(-30);
    futureRef.current = f.slice(1);
    setPast(pastRef.current);
    setFuture(futureRef.current);
    setNodesState(cloneNodes(head.nodes));
    setEdgesState(cloneEdges(head.edges));
    setStrokesState(cloneStrokes(head.strokes ?? []));
    setTextsState(cloneTexts(head.texts ?? []));
    pushToast('Redo applied');
  }, [pushToast]);

  const setTheme = useCallback(
    (t: ThemeName) => {
      setThemeState(t);
      document.documentElement.setAttribute('data-theme', t);
      pushToast(`Switched theme to ${t.toUpperCase()}`);
    },
    [pushToast],
  );

  const setPan = useCallback((p: { x: number; y: number }) => {
    setPanState({ x: p.x, y: p.y });
  }, []);

  const setTool = useCallback(
    (t: CanvasTool) => {
      setToolState(t);
      pushToast(`Tool: ${t.toUpperCase()}`);
    },
    [pushToast],
  );

  const setDocTitle = useCallback((t: string) => {
    const name = t.slice(0, 80);
    setDocTitleState(name);
    const id = activeDocRef.current;
    setDocState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === id ? { ...d, title: name, updatedAt: Date.now() } : d)),
    }));
  }, []);

  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
  }, []);

  const openDoc = useCallback(
    (id: string) => {
      const cur = docsRef.current;
      if (id === cur.activeDocId) return;
      const target = cur.docs.find((d) => d.id === id);
      if (!target) {
        pushToast('Diagram not found');
        return;
      }
      const now = Date.now();
      setDocState((prev) => ({
        activeDocId: id,
        docs: prev.docs.map((d) =>
          d.id === cur.activeDocId
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), updatedAt: now }
            : d,
        ),
      }));
      setNodesState(cloneNodes(target.nodes));
      setEdgesState(cloneEdges(target.edges));
      setStrokesState(cloneStrokes(target.strokes ?? []));
      setTextsState(cloneTexts(target.texts ?? []));
      setDocTitleState(target.title);
      setSelectedId(null);
      setDirty(false);
      resetHistory();
      pushToast(`Opened ${target.title}`);
    },
    [pushToast, resetHistory],
  );

  const newDoc = useCallback(() => {
    const cur = docsRef.current;
    if (cur.docs.length >= 25) {
      pushToast('Library full (25 diagrams) — delete one first');
      return;
    }
    const now = Date.now();
    const doc = blankDoc(cur.docs.length + 1);
    setDocState((prev) => ({
      activeDocId: doc.id,
      docs: [
        ...prev.docs.map((d) =>
          d.id === cur.activeDocId
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), updatedAt: now }
            : d,
        ),
        doc,
      ],
    }));
    setNodesState([]);
    setEdgesState([]);
    setStrokesState([]);
    setTextsState([]);
    setDocTitleState(doc.title);
    setSelectedId(null);
    setDirty(false);
    resetHistory();
    setFreshness('local');
    setFreshnessLabel('New diagram — add services to begin');
    setDriftCount(0);
    pushToast(`Created ${doc.title}`);
    pushLog(`Diagram created: ${doc.title}`);
  }, [pushToast, pushLog, resetHistory]);

  const renameDoc = useCallback((id: string, title: string) => {
    const name = title.trim().slice(0, 80) || 'untitled.arch';
    setDocState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === id ? { ...d, title: name, updatedAt: Date.now() } : d)),
    }));
    if (id === activeDocRef.current) setDocTitleState(name);
  }, []);

  const setDocTags = useCallback((id: string, tags: string[]) => {
    const clean = [...new Set(tags.map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
    setDocState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === id ? { ...d, tags: clean, updatedAt: Date.now() } : d)),
    }));
  }, []);

  const duplicateDoc = useCallback(
    (id: string) => {
      const cur = docsRef.current;
      if (cur.docs.length >= 25) {
        pushToast('Library full (25 diagrams) — delete one first');
        return;
      }
      const src = cur.docs.find((d) => d.id === id);
      if (!src) {
        pushToast('Diagram not found');
        return;
      }
      const now = Date.now();
      // UUID remapping: every element gets a fresh id, connector refs re-mapped.
      const newId = () => `n-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      const liveNodes = src.id === cur.activeDocId ? nodesRef.current : src.nodes;
      const liveEdges = src.id === cur.activeDocId ? edgesRef.current : src.edges;
      const idMap = new Map<string, string>();
      liveNodes.forEach((n) => idMap.set(n.id, newId()));
      const nodesCopy = liveNodes.map((n) => ({ ...n, id: idMap.get(n.id)! }));
      const edgesCopy = liveEdges
        .filter((e) => idMap.has(e.from) && (e.to === null || idMap.has(e.to)))
        .map((e) => ({
          ...e,
          id: `e-${Math.random().toString(36).slice(2, 10)}`,
          from: idMap.get(e.from)!,
          to: e.to === null ? null : idMap.get(e.to)!,
        }));
      const copy: DiagramDoc = {
        id: `doc-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        title: `${src.title.replace(/\.arch$/i, '')} (Copy).arch`,
        nodes: nodesCopy,
        edges: edgesCopy,
        strokes: cloneStrokes(src.id === cur.activeDocId ? strokesRef.current : (src.strokes ?? [])).map((s) => ({
          ...s,
          id: `s-${Math.random().toString(36).slice(2, 10)}`,
        })),
        texts: cloneTexts(src.id === cur.activeDocId ? textsRef.current : (src.texts ?? [])).map((t) => ({
          ...t,
          id: `t-${Math.random().toString(36).slice(2, 10)}`,
        })),
        createdAt: now,
        updatedAt: now,
        tags: [...(src.tags ?? [])],
      };
      setDocState((prev) => ({ activeDocId: copy.id, docs: [...prev.docs, copy] }));
      setNodesState(cloneNodes(copy.nodes));
      setEdgesState(cloneEdges(copy.edges));
      setStrokesState(cloneStrokes(copy.strokes ?? []));
      setTextsState(cloneTexts(copy.texts ?? []));
      setDocTitleState(copy.title);
      setSelectedId(null);
      setDirty(false);
      resetHistory();
      pushToast(`Duplicated as ${copy.title}`);
    },
    [pushToast, resetHistory],
  );

  const deleteDoc = useCallback(
    (id: string) => {
      const cur = docsRef.current;
      const target = cur.docs.find((d) => d.id === id);
      if (!target) {
        pushToast('Diagram not found');
        return;
      }
      const remaining = cur.docs.filter((d) => d.id !== id);
      // Drop the deleted doc's review state with it — no orphaned storage.
      setThreadMap((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCpsMap((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (remaining.length === 0) {
        const fresh = blankDoc(1);
        setDocState({ docs: [fresh], activeDocId: fresh.id });
        setNodesState([]);
        setEdgesState([]);
        setStrokesState([]);
        setTextsState([]);
        setDocTitleState(fresh.title);
        setSelectedId(null);
        setDirty(false);
        resetHistory();
        pushToast('Deleted — started a blank diagram');
        return;
      }
      const nextActive = id === cur.activeDocId ? remaining[0] : cur.docs.find((d) => d.id === cur.activeDocId)!;
      setDocState({ docs: remaining, activeDocId: nextActive.id });
      if (id === cur.activeDocId) {
        setNodesState(cloneNodes(nextActive.nodes));
        setEdgesState(cloneEdges(nextActive.edges));
        setStrokesState(cloneStrokes(nextActive.strokes ?? []));
        setTextsState(cloneTexts(nextActive.texts ?? []));
        setDocTitleState(nextActive.title);
        setSelectedId(null);
        setDirty(false);
        resetHistory();
      }
      pushToast(`Deleted ${target.title}`);
    },
    [pushToast, resetHistory],
  );

  const placeShape = useCallback(
    (shape: LibraryShape, x: number, y: number) => {
      snapshot(nodesRef.current, edgesRef.current);
      // Default shape based on kind: databases get cylinder, others get rounded
      const defaultShape = shape.kind === 'db' ? 'cylinder' : 'rounded';
      const node: ArchNode = {
        id: `${shape.id}-${Date.now().toString(36)}`,
        type: shape.kind,
        label: shape.label,
        tag: shape.tag,
        icon: shape.icon,
        iconSrc: shape.iconSrc,
        health: 'Healthy',
        x: Math.round(x),
        y: Math.round(y),
        w: 170,
        h: 70,
        stroke: shape.stroke,
        isOrphan: true,
        shape: defaultShape,
      };
      setNodesState((prev) => [...prev, node]);
      setSelectedId(node.id);
      pushToast(`Added ${shape.label}`);
      pushLog(`Library: added ${shape.label} (${shape.provider})`);
    },
    [pushToast, pushLog, snapshot],
  );

  const zoomBy = useCallback((delta: number) => {
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, []);

  const zoomTo = useCallback((z: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1.0);
    setPanState({ ...DEFAULT_PAN });
  }, []);

  const applyLayout = useCallback(
    (kind: LayoutKind) => {
      // Layout is cosmetic: undoable, but not data drift.
      snapshot(nodesRef.current, edgesRef.current, false);
      // Generic deterministic layout: works for any node count (PM AC6)
      const all = cloneNodes(nodesRef.current);
      const byId = new Map(all.map((n) => [n.id, n]));
      // depth via BFS from sources
      const indeg = new Map<string, number>(all.map((n) => [n.id, 0]));
      edgesRef.current.forEach((e) => {
        if (e.to && indeg.has(e.to)) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
      });
      if (kind === 'matrix') {
        all.forEach((n, idx) => {
          n.x = 80 + (idx % 3) * 280;
          n.y = 100 + Math.floor(idx / 3) * 140;
        });
      } else if (kind === 'tree') {
        const levels = new Map<string, number>();
        const queue = all.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
        if (queue.length === 0 && all.length) queue.push(all[0].id);
        queue.forEach((id) => levels.set(id, 0));
        const order = [...queue];
        while (order.length) {
          const cur = order.shift()!;
          const d = levels.get(cur) ?? 0;
          edgesRef.current.forEach((e) => {
            if (e.from === cur && e.to && !levels.has(e.to)) {
              levels.set(e.to, d + 1);
              order.push(e.to);
            }
          });
        }
        all.forEach((n) => {
          if (!levels.has(n.id)) levels.set(n.id, Math.max(0, ...[...levels.values(), 0]));
        });
        const maxLvl = Math.max(0, ...[...levels.values()]);
        for (let l = 0; l <= maxLvl; l++) {
          const lvl = all.filter((n) => levels.get(n.id) === l);
          lvl.forEach((n, idx) => {
            n.x = 480 - (lvl.length * 230) / 2 + idx * 230;
            n.y = 80 + l * 115;
          });
        }
      } else {
        // dag: column by depth
        const depth = new Map<string, number>();
        const queue = all.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
        if (queue.length === 0 && all.length) queue.push(all[0].id);
        queue.forEach((id) => depth.set(id, 0));
        const order = [...queue];
        while (order.length) {
          const cur = order.shift()!;
          const d = depth.get(cur) ?? 0;
          edgesRef.current.forEach((e) => {
            if (e.from === cur && e.to && byId.has(e.to)) {
              const nd = d + 1;
              if ((depth.get(e.to) ?? -1) < nd) {
                depth.set(e.to, nd);
                if (!order.includes(e.to)) order.push(e.to);
              }
            }
          });
        }
        all.forEach((n) => {
          if (!depth.has(n.id)) depth.set(n.id, Math.max(0, ...[...depth.values(), 0]) + 1);
        });
        const maxD = Math.max(0, ...[...depth.values()]);
        for (let d = 0; d <= maxD; d++) {
          const col = all.filter((n) => depth.get(n.id) === d);
          col.forEach((n, r) => {
            n.x = 80 + d * 220;
            n.y = 110 + r * 130;
          });
        }
      }
      setNodesState(all);
      pushToast(`Applying ${kind.toUpperCase()} layout...`);
    },
    [pushToast, snapshot],
  );

  const resetDefaultNodes = useCallback(() => {
    snapshot(nodesRef.current, edgesRef.current);
    setNodesState(cloneNodes(mockNodes));
    setEdgesState(cloneEdges(mockEdges));
    setStrokesState([]);
    setTextsState([]);
    setSelectedId(null);
    pushToast('Default topology restored.');
  }, [pushToast, snapshot]);

  const panToNode = useCallback(
    (id: string) => {
      const n = nodesRef.current.find((node) => node.id === id);
      if (n) {
        setSelectedId(n.id);
        setZoom((z) => {
          setPanState({ x: 260 - n.x * z, y: 200 - n.y * z });
          return z;
        });
        pushToast(`Focused on ${n.label}`);
      }
    },
    [pushToast],
  );

  const addNode = useCallback(
    (type: CanvasTool, x: number, y: number) => {
      if (type === 'select' || type === 'pan' || type === 'draw' || type === 'connector' || type === 'comment') return;
      const meta = TYPE_META[type] ?? TYPE_META.service;
      snapshot(nodesRef.current, edgesRef.current);
      const count = nodesRef.current.filter((n) => n.type === meta.type).length + 1;
      const id = `${meta.type}-${Date.now().toString(36)}-${count}`;
      const defaultShape = meta.type === 'db' ? 'cylinder' : 'rounded';
      const node: ArchNode = {
        id,
        type: meta.type,
        label: `${meta.label} ${count}`,
        tag: meta.tag,
        health: 'Healthy',
        x: Math.round(x),
        y: Math.round(y),
        w: 170,
        h: 70,
        stroke: meta.stroke,
        isOrphan: true,
        shape: defaultShape,
      };
      setNodesState((prev) => [...prev, node]);
      setSelectedId(id);
      pushToast(`Added ${meta.label} (${id})`);
      pushLog(`Canvas: added ${meta.label} ${id}`);
    },
    [pushToast, pushLog, snapshot],
  );

  const deleteSelected = useCallback(() => {
    const id = selectedId;
    if (!id) {
      pushToast('Nothing selected to delete');
      return;
    }
    snapshot(nodesRef.current, edgesRef.current);
    setNodesState((prev) => prev.filter((n) => n.id !== id));
    setEdgesState((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    setSelectedId(null);
    pushToast(`Deleted node ${id}`);
  }, [selectedId, pushToast, snapshot]);

  const deleteNodes = useCallback(
    (ids: string[]) => {
      const set = new Set(ids.filter(Boolean));
      if (set.size === 0) {
        pushToast('Nothing selected to delete');
        return;
      }
      snapshot(nodesRef.current, edgesRef.current);
      setNodesState((prev) => prev.filter((n) => !set.has(n.id)));
      setEdgesState((prev) => prev.filter((e) => !set.has(e.from) && !(e.to && set.has(e.to))));
      if (selectedId && set.has(selectedId)) setSelectedId(null);
      pushToast(`Deleted ${set.size} node${set.size === 1 ? '' : 's'}`);
      pushLog(`Canvas: bulk deleted ${set.size} nodes`);
    },
    [selectedId, pushToast, pushLog, snapshot],
  );

  const duplicateSelected = useCallback(() => {
    const n = nodesRef.current.find((x) => x.id === selectedId);
    if (!n) {
      pushToast('Nothing selected to duplicate');
      return;
    }
    snapshot(nodesRef.current, edgesRef.current);
    // A fresh copy has no edges yet, so it is always an orphan.
    const copy: ArchNode = { ...n, id: `${n.id}-copy-${Date.now().toString(36)}`, x: n.x + 24, y: n.y + 24, label: `${n.label} copy`, isOrphan: true };
    setNodesState((prev) => [...prev, copy]);
    setSelectedId(copy.id);
    pushToast(`Duplicated ${n.label}`);
  }, [selectedId, pushToast, snapshot]);

  const updateNode = useCallback((id: string, patch: Partial<ArchNode>) => {
    // Silent: callers checkpoint() once on focus so typing doesn't flood undo.
    setNodesState((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  }, []);

  const connectNodes = useCallback(
    (from: string, to: string | null, targetCoords?: { x: number; y: number }) => {
      snapshot(nodesRef.current, edgesRef.current);
      const edge: ArchEdge = {
        id: `e-${Date.now().toString(36)}`,
        from,
        to,
        targetCoords,
        label: to ? 'route' : 'Unresolved route',
        color: to ? '#2563EB' : '#DC2626',
        isDangling: !to,
      };
      // clear orphan flags for both ends
      setNodesState((prev) => prev.map((n) => (n.id === from || n.id === to ? { ...n, isOrphan: false } : n)));
      setEdgesState((prev) => [...prev, edge]);
      pushToast(to ? `Connected ${from} → ${to}` : 'Created dangling wire (select target to resolve)');
      pushLog(`Canvas: wire ${from} → ${to ?? '∅'}`);
    },
    [pushToast, pushLog, snapshot],
  );

  const loadGraph = useCallback(
    (ns: ArchNode[], es: ArchEdge[], label?: string) => {
      snapshot(nodesRef.current, edgesRef.current);
      const cleanEdges = es.filter((e) => ns.some((n) => n.id === e.from) && (e.to === null || ns.some((n) => n.id === e.to)));
      setNodesState(reconcileOrphans(cloneNodes(ns), cleanEdges));
      setEdgesState(cloneEdges(cleanEdges));
      setStrokesState([]);
      setTextsState([]);
      setSelectedId(null);
      setDirty(false);
      pushToast(label ?? 'Graph loaded');
      pushLog(label ?? 'Graph loaded');
    },
    [pushToast, pushLog, snapshot],
  );

  // Freehand ink: one undo step per finished stroke (snapshot on commit).
  const addStroke = useCallback(
    (pts: { x: number; y: number }[], color: string, width: number) => {
      const clean = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 2000);
      if (clean.length < 2) return;
      snapshot(nodesRef.current, edgesRef.current);
      const stroke: FreeStroke = {
        id: `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
        pts: clean.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        color,
        width,
      };
      setStrokesState((prev) => [...prev, stroke]);
      setDirty(true);
      pushLog(`Freehand: ink stroke (${clean.length} pts)`);
    },
    [pushLog, snapshot],
  );

  const updateStroke = useCallback((id: string, patch: Partial<FreeStroke>) => {
    // Silent: callers snapshot() once before editing.
    setStrokesState((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)));
    setDirty(true);
  }, []);

  const moveStroke = useCallback((id: string, dx: number, dy: number) => {
    // Silent per-frame move; caller snapshots once on grab.
    setStrokesState((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pts: s.pts.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) })) } : s)),
    );
    setDirty(true);
  }, []);

  const deleteStroke = useCallback(
    (id: string) => {
      if (!strokesRef.current.some((s) => s.id === id)) {
        pushToast('Stroke already removed');
        return;
      }
      snapshot(nodesRef.current, edgesRef.current);
      setStrokesState((prev) => prev.filter((s) => s.id !== id));
      pushToast('Deleted ink stroke');
      pushLog(`Freehand: deleted stroke ${id}`);
    },
    [pushToast, pushLog, snapshot],
  );

  const addText = useCallback(
    (x: number, y: number, text: string, fontSize: number, color: string): string | null => {
      const clean = text.trim().slice(0, 500);
      if (!clean) return null;
      snapshot(nodesRef.current, edgesRef.current);
      const id = `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
      const t: FreeText = {
        id,
        x: Math.round(x),
        y: Math.round(y),
        text: clean,
        fontSize,
        color,
      };
      setTextsState((prev) => [...prev, t]);
      setDirty(true);
      pushLog(`Text: "${clean.slice(0, 30)}${clean.length > 30 ? '…' : ''}"`);
      return id;
    },
    [pushLog, snapshot],
  );

  const updateText = useCallback((id: string, patch: Partial<FreeText>) => {
    setTextsState((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t)));
    setDirty(true);
  }, []);

  const moveText = useCallback((id: string, dx: number, dy: number) => {
    setTextsState((prev) =>
      prev.map((t) => (t.id === id ? { ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy) } : t)),
    );
    setDirty(true);
  }, []);

  const deleteText = useCallback(
    (id: string) => {
      if (!textsRef.current.some((t) => t.id === id)) {
        pushToast('Text already removed');
        return;
      }
      snapshot(nodesRef.current, edgesRef.current);
      setTextsState((prev) => prev.filter((t) => t.id !== id));
      pushToast('Deleted text');
      pushLog(`Text: deleted ${id}`);
    },
    [pushToast, pushLog, snapshot],
  );

  // Append a graph beside existing content (Blueprints "Insert"), remapping
  // colliding ids and placing the block to the right of current content.
  const mergeGraph = useCallback(
    (ns: ArchNode[], es: ArchEdge[], label?: string) => {
      if (ns.length === 0) {
        pushToast('Nothing to insert');
        return;
      }
      snapshot(nodesRef.current, edgesRef.current);
      const existing = new Set(nodesRef.current.map((n) => n.id));
      const idMap = new Map<string, string>();
      ns.forEach((n) => {
        let id = n.id;
        if (existing.has(id)) {
          let k = 2;
          while (existing.has(`${n.id}-${k}`)) k++;
          id = `${n.id}-${k}`;
        }
        existing.add(id);
        idMap.set(n.id, id);
      });
      const cur = nodesRef.current;
      const maxX = cur.length > 0 ? Math.max(...cur.map((n) => n.x + n.w)) : 0;
      const minIX = Math.min(...ns.map((n) => n.x));
      const dx = maxX + 80 - minIX;
      const mapped: ArchNode[] = ns.map((n) => ({ ...n, id: idMap.get(n.id)!, x: n.x + dx }));
      const mappedEdges: ArchEdge[] = es
        .filter((e) => idMap.has(e.from) && (e.to === null || idMap.has(e.to)))
        .map((e, i) => ({
          ...e,
          id: `e-merge-${Date.now().toString(36)}-${i}`,
          from: idMap.get(e.from)!,
          to: e.to === null ? null : idMap.get(e.to)!,
          targetCoords: e.targetCoords ? { x: e.targetCoords.x + dx, y: e.targetCoords.y } : undefined,
        }));
      setNodesState([...cloneNodes(cur), ...mapped]);
      setEdgesState([...cloneEdges(edgesRef.current), ...mappedEdges]);
      pushToast(label ?? `Inserted ${mapped.length} nodes`);
      pushLog(label ?? `Inserted ${mapped.length} nodes`);
    },
    [pushToast, pushLog, snapshot],
  );

  const resync = useCallback(() => {
    if (!isOnlineRef.current) {
      setFreshness('drift');
      setFreshnessLabel('Sync failed — you are offline');
      setDriftCount(1);
      pushToast('Sync failed — you are offline');
      pushLog('Sync failed: offline, no attempt made');
      return;
    }
    setFreshness('syncing');
    setFreshnessLabel('Syncing…');
    pushLog('Sync started: k8s-prod us-east-1');
    window.setTimeout(() => {
      const hasFraud = nodesRef.current.find((n) => n.id === 'fraud-worker');
      if (!hasFraud) snapshot(nodesRef.current, edgesRef.current);
      setNodesState((prev) => (prev.find((n) => n.id === 'fraud-worker') ? prev : [...prev, fraudWorkerNode]));
      setEdgesState((prev) => (prev.find((e) => e.id === 'e-fraud-k') ? prev : [...prev, fraudEdge]));
      setFreshness('fresh');
      setFreshnessLabel('In sync · us-east-1-prod');
      setDriftCount(0);
      setDirty(false);
      const sha = Math.random().toString(16).slice(2, 9);
      pushToast('Synced upstream Fraud Worker into diagram!');
      pushLog(`Sync complete: ${sha} +1 node Fraud Worker, drift=0`);
    }, 700);
  }, [pushToast, pushLog, snapshot]);

  const healOrphan = useCallback(
    (id: string | null = null, silent = false) => {
      const orphans = nodesRef.current.filter((n) => {
        const deg = edgesRef.current.filter((e) => e.from === n.id || e.to === n.id).length;
        return deg === 0 || n.isOrphan;
      });
      if (orphans.length === 0) {
        if (!silent) pushToast('No isolated services found');
        return false;
      }
      // Heal the requested node when given (linter cards); else the first.
      const target = (typeof id === 'string' && orphans.find((n) => n.id === id)) || orphans[0];
      snapshot(nodesRef.current, edgesRef.current);
      const hub = nodesRef.current.find((n) => n.id === 'kafka') ?? nodesRef.current.find((n) => n.id !== target.id);
      setNodesState((prev) => prev.map((n) => (n.id === target.id ? { ...n, isOrphan: false, health: 'Subscribed', stroke: '#7C3AED' } : n)));
      if (target.id === 'legacy-billing') {
        setEdgesState((prev) => (prev.find((e) => e.id === 'e-fix-b') ? prev : [...prev, billingHealEdge]));
      } else if (hub) {
        setEdgesState((prev) => [
          ...prev,
          { id: `e-heal-${Date.now().toString(36)}`, from: hub.id, to: target.id, label: 'order-events', color: '#7C3AED' },
        ]);
      }
      if (!silent) {
        pushToast(`Bound ${target.label} to mesh!`);
        pushLog(`Linter heal: ${target.id}`);
      }
      return true;
    },
    [pushToast, pushLog, snapshot],
  );

  const pruneWire = useCallback(
    (id: string | null = null, silent = false) => {
      const dang = edgesRef.current.filter((e) => e.isDangling || !e.to);
      if (dang.length === 0) {
        if (!silent) pushToast('No dangling wires');
        return false;
      }
      const wire = (typeof id === 'string' && dang.find((e) => e.id === id)) || dang[0];
      snapshot(nodesRef.current, edgesRef.current);
      setEdgesState((prev) => prev.filter((e) => e.id !== wire.id));
      if (!silent) {
        pushToast(`Pruned wire ${wire.from} → ∅`);
        pushLog(`Linter prune: ${wire.id}`);
      }
      return true;
    },
    [pushToast, pushLog, snapshot],
  );

  const healAll = useCallback(() => {
    const orphanIds = nodesRef.current
      .filter((n) => {
        const deg = edgesRef.current.filter((e) => e.from === n.id || e.to === n.id).length;
        return deg === 0 || n.isOrphan;
      })
      .map((n) => n.id);
    const wireIds = edgesRef.current.filter((e) => e.isDangling || !e.to).map((e) => e.id);
    if (orphanIds.length === 0 && wireIds.length === 0) {
      pushToast('No lint issues to heal');
      return;
    }
    snapshot(nodesRef.current, edgesRef.current);
    const hub = nodesRef.current.find((n) => n.id === 'kafka');
    orphanIds.forEach((oid, i) => {
      const from = hub && hub.id !== oid ? hub.id : nodesRef.current.find((n) => n.id !== oid)?.id;
      setNodesState((prev) => prev.map((n) => (n.id === oid ? { ...n, isOrphan: false, health: 'Subscribed', stroke: '#7C3AED' } : n)));
      if (oid === 'legacy-billing') {
        setEdgesState((prev) => (prev.find((e) => e.id === 'e-fix-b') ? prev : [...prev, billingHealEdge]));
      } else if (from) {
        const eid = `e-heal-${Date.now().toString(36)}-${i}`;
        setEdgesState((prev) => [...prev, { id: eid, from, to: oid, label: 'order-events', color: '#7C3AED' }]);
      }
    });
    setEdgesState((prev) => prev.filter((e) => !wireIds.includes(e.id)));
    pushLog(`Linter auto-heal: ${orphanIds.length} bound, ${wireIds.length} pruned`);
    pushToast('All architecture linter rules passed!');
  }, [pushToast, pushLog, snapshot]);

  const exportArch = useCallback(async () => {
    const settings = (() => {
      try {
        return JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { embedMetadata?: boolean };
      } catch {
        return {} as { embedMetadata?: boolean };
      }
    })();
    const payload: Record<string, unknown> = {
      app: 'ArchFlux',
      version: '1.0-deterministic',
      spec: 'RFC-Architecture-Graph',
      nodes: nodesRef.current,
      edges: edgesRef.current,
      strokes: strokesRef.current,
      texts: textsRef.current,
    };
    if (settings.embedMetadata !== false) {
      payload.metadata = {
        exportedAt: new Date().toISOString(),
        docTitle: docTitleRef.current,
        nodeCount: nodesRef.current.length,
        edgeCount: edgesRef.current.length,
        strokeCount: strokesRef.current.length,
      };
    }

    // If online and we have an active document with server ID, try backend export first
    const online = isOnlineRef.current;
    const activeDoc = docsRef.current.docs.find(d => d.id === activeDocRef.current);
    const hasServerId = activeDoc?.id && !activeDoc.id.startsWith('doc-');

    if (online && hasServerId) {
      try {
        const serverExport = await api.exportDiagram(activeDoc!.id);
        const blob = new Blob([JSON.stringify(serverExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const base = archBaseName();
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}.arch`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        pushToast(`Exported ${base}.arch (from server)`);
        return;
      } catch {
        pushToast('Server export failed, using local fallback');
      }
    }

    // Local fallback
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const base = archBaseName();
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${base}.arch`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    pushToast(`Exported ${base}.arch (local)`);
  }, [pushToast]);

  const exportPNG = useCallback(() => {
    const canvas = document.getElementById('architectureCanvas') as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0) {
      pushToast('Canvas not ready — open Precision Canvas first');
      return;
    }
    const settings = (() => {
      try {
        return JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { exportResolution?: string };
      } catch {
        return {} as { exportResolution?: string };
      }
    })();
    const scale = settings.exportResolution === '4x' ? 4 : settings.exportResolution === '1x' ? 1 : 2;
    const out = document.createElement('canvas');
    out.width = canvas.width * scale;
    out.height = canvas.height * scale;
    const ctx = out.getContext('2d');
    if (!ctx) {
      pushToast('PNG export unsupported here');
      return;
    }
    ctx.scale(scale, scale);
    ctx.fillStyle = themeRef.current === 'dark' ? '#1F2937' : '#FFFFFF';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    const base = archBaseName();
    out.toBlob((blob) => {
      if (!blob) {
        pushToast('PNG export failed');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      pushToast(`Exported ${base}.png`);
    }, 'image/png');
  }, [pushToast]);

  const importArch = useCallback(
    (data: any) => {
      // Handle both formats: {nodes, edges} and server export {app, spec, nodes, edges, metadata}
      let nodes: any[] = data.nodes;
      let edges: any[] = data.edges;
      let strokes: any[] = data.strokes ?? [];
      let texts: any[] = data.texts ?? [];

      if (!nodes || !edges) {
        pushToast('Invalid .arch file: missing nodes/edges');
        return;
      }
      if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        pushToast('Invalid .arch file: nodes/edges must be arrays');
        return;
      }

      // Same shape gate as persisted storage: drop malformed entries so a
      // bad file can never NaN the canvas.
      const validNodes = nodes.filter(isValidNode) as ArchNode[];
      if (validNodes.length === 0) {
        pushToast('Invalid .arch file: no usable nodes');
        return;
      }
      const ids = new Set(validNodes.map((n) => n.id));
      const validEdges = edges
        .filter((e): e is ArchEdge => isValidEdge(e, ids))
        .map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
      if (validEdges.length < edges.length) {
        pushToast(`Imported with ${edges.length - validEdges.length} bad routes dropped`);
      }
      const validStrokes = Array.isArray(strokes) ? strokes.filter(isValidStroke) : [];
      const validTexts = Array.isArray(texts) ? texts.filter(isValidText) : [];
      loadGraph(validNodes, validEdges, `Imported .arch (${validNodes.length} nodes)`);
      if (validStrokes.length > 0) setStrokesState(cloneStrokes(validStrokes));
      if (validTexts.length > 0) setTextsState(cloneTexts(validTexts));
    },
    [loadGraph, pushToast],
  );

  // Review state is scoped per document: the UI only ever shows the active
  // doc's threads/checkpoints, and ops write into the active doc's lists.
  const threads = useMemo(() => threadMap[activeDocId] ?? [], [threadMap, activeDocId]);
  const checkpoints = useMemo(() => cpsMap[activeDocId] ?? [], [cpsMap, activeDocId]);
  const threadMapRef = useRef(threadMap);
  threadMapRef.current = threadMap;
  const cpsMapRef = useRef(cpsMap);
  cpsMapRef.current = cpsMap;

  const addThread = useCallback(
    (pinnedTo: string, text: string, label?: string) => {
      if (!text.trim()) {
        pushToast('Comment body required');
        return;
      }
      const author = displayName.trim() || 'You';
      const node = nodesRef.current.find((n) => n.id === pinnedTo);
      const docId = activeDocRef.current;
      setThreadMap((prev) =>
        ({
          ...prev,
          [docId]: [
            {
              id: `t-${Date.now().toString(36)}`,
              author,
              role: 'Engineer',
              time: 'just now',
              pinnedTo,
              pinnedLabel: label ?? node?.label ?? pinnedTo,
              text: text.trim(),
              resolved: false,
              replies: [],
            },
            ...(prev[docId] ?? []),
          ].slice(0, 100),
        }) as Record<string, ReviewThread[]>,
      );
      pushToast('Thread pinned to ' + (label ?? node?.label ?? pinnedTo));
    },
    [pushToast, displayName],
  );

  const replyThread = useCallback(
    (id: string, text: string) => {
      if (!text.trim()) return;
      const author = displayName.trim() || 'You';
      const docId = activeDocRef.current;
      setThreadMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).map((t) =>
          t.id === id
            ? { ...t, replies: [...t.replies, { author, text: text.trim(), time: 'just now' }] }
            : t,
        ),
      }));
      pushToast('Reply posted');
    },
    [pushToast, displayName],
  );

  const toggleResolveThread = useCallback(
    (id: string) => {
      const docId = activeDocRef.current;
      setThreadMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).map((t) => (t.id === id ? { ...t, resolved: !t.resolved } : t)),
      }));
      pushToast('Thread status updated');
    },
    [pushToast],
  );

  const deleteThread = useCallback(
    (id: string) => {
      const docId = activeDocRef.current;
      setThreadMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).filter((t) => t.id !== id),
      }));
      pushToast('Thread deleted');
    },
    [pushToast],
  );

  const tagCheckpoint = useCallback(
    (title: string) => {
      const docId = activeDocRef.current;
      const count = (cpsMapRef.current[docId] ?? []).length;
      const name = title.trim() || `v${count + 1}.0-candidate`;
      setCpsMap((prev) =>
        ({
          ...prev,
          [docId]: [
            {
              id: `v${Date.now().toString(36)}`,
              title: name,
              meta: `Snapshot • ${displayName.trim() || 'You'} • just now • ${nodesRef.current.length}n/${edgesRef.current.length}e`,
              active: true,
              badge: `${nodesRef.current.length} nodes, ${edgesRef.current.length} routes`,
              nodes: cloneNodes(nodesRef.current),
              edges: cloneEdges(edgesRef.current),
              strokes: cloneStrokes(strokesRef.current),
              texts: cloneTexts(textsRef.current),
            },
            ...(prev[docId] ?? []).map((c) => ({ ...c, active: false })),
          ].slice(0, 20),
        }) as Record<string, SnapshotCheckpoint[]>,
      );
      pushToast(`Checkpoint saved: ${name}`);
      pushLog(`Checkpoint: ${name}`);
    },
    [pushToast, pushLog, displayName],
  );

  const restoreCheckpoint = useCallback(
    (id: string) => {
      const docId = activeDocRef.current;
      const cp = (cpsMapRef.current[docId] ?? []).find((c) => c.id === id);
      if (!cp) return;
      loadGraph(cp.nodes, cp.edges, `Restored ${cp.title}`);
      setStrokesState(cloneStrokes(cp.strokes ?? []));
      setTextsState(cloneTexts(cp.texts ?? []));
      setCpsMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).map((c) => ({ ...c, active: c.id === id })),
      }));
    },
    [loadGraph],
  );

  const deleteCheckpoint = useCallback(
    (id: string) => {
      const docId = activeDocRef.current;
      setCpsMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).filter((c) => c.id !== id),
      }));
      pushToast('Checkpoint deleted');
    },
    [pushToast],
  );

  const value = useMemo<DiagramContextValue>(
    () => ({
      theme,
      setTheme,
      nodes,
      edges,
      setNodes,
      setEdges,
      strokes,
      addStroke,
      updateStroke,
      moveStroke,
      deleteStroke,
      texts,
      addText,
      updateText,
      moveText,
      deleteText,
      selectedId,
      setSelectedId,
      freshness,
      freshnessLabel,
      driftCount,
      toasts,
      pushToast,
      resync,
      healOrphan,
      pruneWire,
      healAll,
      exportArch,
      exportPNG,
      importArch,
      zoom,
      pan,
      setPan,
      tool,
      setTool,
      orthogonal,
      setOrthogonal,
      snapGrid,
      setSnapGrid,
      zoomBy,
      zoomTo,
      resetView,
      applyLayout,
      resetDefaultNodes,
      panToNode,
      docTitle,
      setDocTitle,
      dirty,
      docs,
      activeDocId,
      openDoc,
      newDoc,
      renameDoc,
      setDocTags,
      duplicateDoc,
      deleteDoc,
      placeShape,
      undo,
      redo,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoDepth: past.length,
      redoDepth: future.length,
      addNode,
      deleteSelected,
      deleteNodes,
      duplicateSelected,
      updateNode,
      moveNode,
      checkpoint,
      deleteEdge,
      updateEdge,
      connectNodes,
      loadGraph,
      mergeGraph,
      threads,
      addThread,
      replyThread,
      toggleResolveThread,
      deleteThread,
      displayName,
      setDisplayName,
      checkpoints,
      tagCheckpoint,
      restoreCheckpoint,
      deleteCheckpoint,
      syncLog,
      pushLog,
      isOnline,
    }),
    [
      theme, setTheme, nodes, edges, setNodes, setEdges, strokes, addStroke, updateStroke, moveStroke, deleteStroke, selectedId, freshness, freshnessLabel,
      driftCount, toasts, pushToast, resync, healOrphan, pruneWire, healAll, exportArch, exportPNG, importArch,
      zoom, pan, setPan, tool, setTool, orthogonal, setOrthogonal, snapGrid, zoomBy, zoomTo, resetView, applyLayout,
      resetDefaultNodes, panToNode, docTitle, setDocTitle, dirty, docs, activeDocId, openDoc, newDoc, renameDoc, setDocTags, duplicateDoc, deleteDoc, placeShape, undo, redo, past.length, future.length,
      addNode, deleteSelected, deleteNodes, duplicateSelected, updateNode, moveNode, checkpoint, deleteEdge, updateEdge, connectNodes, loadGraph, mergeGraph, threads,
      addThread, replyThread, toggleResolveThread, deleteThread, displayName, checkpoints, tagCheckpoint, restoreCheckpoint,
      deleteCheckpoint, syncLog, pushLog, isOnline,
      texts, addText, updateText, moveText, deleteText,
    ],
  );

  return <DiagramContext.Provider value={value}>{children}</DiagramContext.Provider>;
}
