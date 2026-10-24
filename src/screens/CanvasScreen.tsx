import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiagram } from '../useDiagram';
import type { CanvasTool } from '../useDiagram';
import type { ArchNode, LibraryShape, ShapeCategory } from '../types';
import { libraryShapes } from '../mocks';
import { useFocusTrap } from '../useFocusTrap';
import { sourceModeForDoc } from '../honesty';
import {
  clampNodeSize,
  distToSegment,
  edgePoints,
  hitResizeHandle,
  minimapTransform,
  miniToWorld,
  resizeHandles,
  snapNode,
  worldToMini,
  type GuideLine,
  type ResizeHandleId,
} from '../canvasGeometry';
import { ToolPalette } from '../components/ToolPalette';
import { CollaborationPanel } from '../components/CollaborationPanel';
import { useCollaboration } from '../hooks/useCollaboration';
import { CanvasEngine } from '../canvas/CanvasEngine';
import {
  drawEdgePass,
  drawFreeTextPass,
  drawInkPass,
  drawNodePass,
  drawThreadPinPass,
  type NodeIconSource,
} from '../canvas/render';

export const TOOLS: { id: CanvasTool; icon: string; label: string; title: string }[] = [
  { id: 'select', icon: '/icons/tools/select.svg', label: 'Select', title: 'Select & Move (V)' },
  { id: 'pan', icon: '/icons/tools/pan.svg', label: 'Pan', title: 'Pan / Hand (H) — drag to pan' },
  { id: 'draw', icon: '/icons/tools/draw.svg', label: 'Draw', title: 'Freehand pencil (P) — stays active, Esc to exit' },
  { id: 'text', icon: '/icons/tools/text.svg', label: 'Text', title: 'Text tool (T) — click canvas to type' },
  { id: 'service', icon: '/icons/tools/service.svg', label: 'Service', title: 'Service Box (S) — click again to lock' },
  { id: 'gateway', icon: '/icons/tools/gateway.svg', label: 'Gateway', title: 'Gateway (G) — click again to lock' },
  { id: 'db', icon: '/icons/tools/database.svg', label: 'Database', title: 'Database Cylinder (D) — click again to lock' },
  { id: 'stream', icon: '/icons/tools/stream.svg', label: 'Queue', title: 'Queue / Stream (Q) — click again to lock' },
  { id: 'connector', icon: '/icons/tools/connector.svg', label: 'Connect', title: 'Smart Connector (C): click A then B — click again to lock' },
  { id: 'comment', icon: '/icons/tools/comment.svg', label: 'Note', title: 'Note (N) — click a node or empty canvas' },
];

export const LOCKABLE: CanvasTool[] = ['service', 'gateway', 'db', 'stream', 'connector', 'comment'];

const RECENT_SHAPES_KEY = 'archflux:recent-shapes:v1';
const MAX_RECENT_SHAPES = 8;
/** Annotation comment length cap (ANN-R15) — MUST match the backend limit. */
const COMMENT_MAX = 2000;

/** Pure recency update (most-recent-first, deduped, capped). Exported for tests. */
export function pushRecentShape(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT_SHAPES);
}

export function loadRecentShapes(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SHAPES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENT_SHAPES) : [];
  } catch {
    return [];
  }
}

function recordShapeUse(id: string) {
  try {
    localStorage.setItem(RECENT_SHAPES_KEY, JSON.stringify(pushRecentShape(loadRecentShapes(), id)));
  } catch {
    /* quota ignore */
  }
}

// Freehand ink + vendor icon cache (module-level so remounts don't refetch).
const iconImgCache = new Map<string, HTMLImageElement>();
// In-flight draw-cache image loads. Visual tests wait for this to drain so
// screenshots never catch half-painted vendor icons.
let pendingIconLoads = 0;
const iconSettleListeners = new Set<() => void>();
function noteIconSettled() {
  pendingIconLoads = Math.max(0, pendingIconLoads - 1);
  if (pendingIconLoads === 0) iconSettleListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
function trackIconLoad() {
  pendingIconLoads += 1;
}
const STROKE_COLORS = ['#1F2937', '#635BFF', '#635BFF', '#16A34A', '#F0B86E', '#DC2626'];
const STROKE_WIDTHS = [2, 4, 6];

const NODE_ICONS = [
  '/icons/node-icons/box.svg',
  '/icons/node-icons/gateway.svg',
  '/icons/node-icons/database.svg',
  '/icons/node-icons/stream.svg',
  '/icons/node-icons/lightning.svg',
  '/icons/node-icons/lock.svg',
  '/icons/node-icons/k8s.svg',
  '/icons/node-icons/elephant.svg',
  '/icons/node-icons/red.svg',
  '/icons/node-icons/mail.svg',
  '/icons/node-icons/lambda.svg',
  '/icons/node-icons/globe.svg',
];
const PROTOCOLS = ['REST', 'gRPC', 'WebSocket', 'Async'];
const NODE_STROKE_WIDTHS = [1, 1.5, 2.5, 4];

const BORDER_SWATCHES = ['#635BFF', '#635BFF', '#16A34A', '#F0B86E', '#DC2626', '#6B7280'];
const FILL_SWATCHES = ['#FFFFFF', '#DBEAFE', '#DCFCE7', '#FEF3C7', '#FEE2E2', '#EDE9FE'];

function Swatches(props: { values: (string | null)[]; current: string | undefined; nullLabel: string; onPick: (v: string | null) => void; label: string }) {
  const { values, current, nullLabel, onPick, label } = props;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label={label}>
        {values.map((v) =>
          v === null ? (
            <button
              key="default"
              className="btn-xs"
              title={nullLabel}
              onClick={() => onPick(null)}
              style={current === undefined ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : undefined}
            >
              Auto
            </button>
          ) : (
            <button
              key={v}
              aria-label={`${label} ${v}`}
              title={v}
              onClick={() => onPick(v)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: current === v ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                background: v,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ),
        )}
      </div>
    </div>
  );
}

/** Shared edge geometry: polyline points used by both draw and hit-testing. */

export default function CanvasScreen() {
  const navigate = useNavigate();
  const {
    theme,
    nodes,
    edges,
    strokes,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    zoom,
    pan,
    setPan,
    orthogonal,
    zoomTo,
    resetView,
    resetDefaultNodes,
    panToNode,
    healAll,
    healOrphan,
    pruneWire,
    undo,
    redo,
    addNode,
    deleteSelected,
    deleteNodes,
    duplicateSelected,
    placeShape,
    updateNode,
    moveNode,
    checkpoint,
    deleteEdge,
    updateEdge,
    connectNodes,
    addThread,
    addStroke,
    moveStroke,
    deleteStroke,
    updateStroke,
    pushToast,
    newDoc,
    threads,
    texts,
    addText,
    updateText,
    moveText,
    deleteText,
    activeDocId,
    loadGraph,
  } = useDiagram();

  // Real-time collaboration: shared Y.Doc per active document.
  const collab = useCollaboration(activeDocId ?? null);
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Zoom-adaptive grid: scale background spacing with zoom so dots/lines stay
  // visually stable (preserves geometry; only CSS background-size changes).
  useEffect(() => {
    if (!viewportRef.current) return;
    const size = Math.max(10, Math.round(20 / (zoom || 1)));
    viewportRef.current.style.setProperty('--grid-size', `${size}px`);
  }, [zoom]);
  // Latest paint function, refreshed by the setup effect below. draw() reads
  // live state via stateRef, so re-invoking it repaints current state.
  const drawRef = useRef<() => void>(() => {});
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  // Click-vs-drag: a second node click arms a connection that only completes
  // on pointer-up without a move, so dragging never spawns stray edges.
  const connectArmRef = useRef<{ from: string; to: string } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  // Inline text editor draft (Excalidraw-style click-to-type). editingId set when editing existing text.
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string; editingId: string | null } | null>(null);
  // Live mirror so unmount/beforeunload handlers can rescue an open draft.
  const textDraftRef = useRef<typeof textDraft>(null);
  textDraftRef.current = textDraft;
  const [multiSel, setMultiSel] = useState<string[]>([]);
  // In-progress freehand ink (committed to the store on pointer-up).
  const [ink, setInk] = useState<{ x: number; y: number }[] | null>(null);
  const inkRef = useRef<{ pts: { x: number; y: number }[] } | null>(null);
  // Live refs for the write-through draft session.
  const liveTextRef = useRef<string | null>(null);
  const liveSnapRef = useRef(false);
  // Guards the blur-after-unmount commit (Enter/Esc unmount fires blur too).
  const draftCommitted = useRef(false);
  // Bumps when a vendor icon finishes loading so the canvas repaints it.
  const [, setIconTick] = useState(0);
  // Shared render-pass vendor-icon bridge: pass calls get() before painting
  // (only complete images draw) and ensure() registers in-flight loads; the
  // drain counter resumes visual tests waiting for stable pixels.
  const iconsAdapter: NodeIconSource = {
    get: (src) => iconImgCache.get(src) ?? null,
    ensure: (src) => {
      if (iconImgCache.has(src)) return;
      const img = new Image();
      trackIconLoad();
      img.onload = () => { setIconTick((t) => t + 1); noteIconSettled(); };
      img.onerror = () => { iconImgCache.delete(src); noteIconSettled(); };
      iconImgCache.set(src, img);
      img.src = src;
    },
  };

  // Preload all vendor icons at startup so they're cached before rendering
  useEffect(() => {
    const iconUrls = [
      '/icons/aws/ec2.svg', '/icons/aws/lambda.svg', '/icons/aws/ecs.svg', '/icons/aws/rds.svg',
      '/icons/aws/s3.svg', '/icons/aws/sqs.svg', '/icons/aws/sns.svg', '/icons/aws/alb.svg',
      '/icons/aws/apigw.svg', '/icons/aws/cfront.svg', '/icons/aws/cw.svg', '/icons/aws/dynamo.svg',
      '/icons/aws/ec2.svg', '/icons/aws/ecs.svg', '/icons/aws/lambda.svg', '/icons/aws/rds.svg',
      '/icons/gcp/compute.svg', '/icons/gcp/gke.svg', '/icons/gcp/sql.svg', '/icons/gcp/storage.svg',
      '/icons/gcp/bigquery.svg', '/icons/gcp/pubsub.svg', '/icons/gcp/lb.svg', '/icons/gcp/cloudrun.svg',
      '/icons/azure/vm.svg', '/icons/azure/aks.svg', '/icons/azure/func.svg', '/icons/azure/sql.svg',
      '/icons/azure/cosmos.svg', '/icons/azure/fd.svg', '/icons/azure/vm.svg',
      '/icons/data/kafka.svg', '/icons/data/redis.svg', '/icons/data/postgres.svg',
      '/icons/data/mongo.svg', '/icons/data/elastic.svg', '/icons/data/rabbit.svg',
      '/icons/general/service.svg', '/icons/general/gateway.svg', '/icons/general/database.svg',
      '/icons/general/stream.svg', '/icons/tools/select.svg', '/icons/tools/pan.svg',
      '/icons/tools/draw.svg', '/icons/tools/text.svg', '/icons/tools/service.svg',
      '/icons/tools/gateway.svg', '/icons/tools/database.svg', '/icons/tools/stream.svg',
      '/icons/tools/connector.svg', '/icons/tools/comment.svg',
      '/icons/node-icons/box.svg', '/icons/node-icons/gateway.svg', '/icons/node-icons/database.svg',
      '/icons/node-icons/stream.svg', '/icons/node-icons/lightning.svg', '/icons/node-icons/lock.svg',
      '/icons/node-icons/k8s.svg', '/icons/node-icons/elephant.svg', '/icons/node-icons/red.svg',
      '/icons/node-icons/mail.svg', '/icons/node-icons/lambda.svg', '/icons/node-icons/globe.svg',
      '/icons/tools/lock.svg', '/icons/tools/more.svg'
    ];
    let settled = 0;
    const done = () => {
      settled += 1;
      if (settled >= iconUrls.length) {
        preloadDoneRef.current = true;
        if (pendingIconLoads === 0) setIconsReady(true);
      }
    };
    iconUrls.forEach(url => {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = url;
    });
    // Draw-cache images settle independently of the preload above.
    const checkCacheDrained = () => {
      if (preloadDoneRef.current && pendingIconLoads === 0) setIconsReady(true);
    };
    iconSettleListeners.add(checkCacheDrained);
    checkCacheDrained();
    return () => {
      iconSettleListeners.delete(checkCacheDrained);
    };
  }, []);

  // Dual visual style engine: sketchy brainstorming vs clean architectural.
  let sketchy = false;
  let gridStyle: 'dots' | 'lines' | 'none' = 'dots';
  let snapThreshold = 10;
  let connectorCurve: 'orthogonal' | 'straight' | 'bezier' = 'orthogonal';
  try {
    const settings = JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as Record<string, unknown>;
    sketchy = settings.style === 'sketchy';
    if (settings.gridStyle === 'dots' || settings.gridStyle === 'lines' || settings.gridStyle === 'none') {
      gridStyle = settings.gridStyle;
    }
    if (settings.snapThreshold === '5' || settings.snapThreshold === '10' || settings.snapThreshold === '20' || settings.snapThreshold === 'off') {
      snapThreshold = settings.snapThreshold === 'off' ? 0 : Number(settings.snapThreshold);
    }
    if (settings.connectorCurve === 'orthogonal' || settings.connectorCurve === 'straight' || settings.connectorCurve === 'bezier') {
      connectorCurve = settings.connectorCurve;
    }
  } catch {
    sketchy = false;
  }
  // Shape library drawer (functional categories).
  const [libOpen, setLibOpen] = useState(false);
  const [recentShapeIds, setRecentShapeIds] = useState<string[]>(() => loadRecentShapes());
  const placeShapeRecorded = (shape: LibraryShape, x: number, y: number) => {
    recordShapeUse(shape.id);
    setRecentShapeIds(loadRecentShapes());
    placeShape(shape, x, y);
  };
  const [libQuery, setLibQuery] = useState('');
  const [libCategory, setLibCategory] = useState<'all' | ShapeCategory>('all');
  const libSearchRef = useRef<HTMLInputElement | null>(null);
  // Non-modal drawer: move focus to search on open (SHP-R8); return it to the
  // rail toggle on close so keyboard users are not stranded.
  useEffect(() => {
    if (libOpen) {
      const t = window.setTimeout(() => libSearchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [libOpen]);
  // Unified right utility dock (v2.4): Tab A Inspector / Tab B Linter.
  // Selection auto-switches to Inspector; the left dock keeps canvas-wide tools.
  const [dockTab, setDockTab] = useState<'inspector' | 'linter' | 'collab'>('inspector');
  // Collapsible dock: closed by default on phones so the canvas stays usable.
  const [dockOpen, setDockOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.innerWidth > 600,
  );
  // Excalidraw-style: add-tools are single-use unless locked (re-click / Q).
  const [lockedTool, setLockedTool] = useState<CanvasTool | null>(null);
  const spaceDown = useRef(false);
  const [commentFor, setCommentFor] = useState<{ id: string; label: string } | null>(null);
  const [commentText, setCommentText] = useState('');
  const composerTrap = useFocusTrap<HTMLDivElement>(commentFor !== null);
  // Canvas 2D unavailable (rare): show a fallback instead of a blank.
  const [canvasError, setCanvasError] = useState(false);
  // Vendor-icon preload completion — visual tests wait on this for stable pixels.
  const [iconsReady, setIconsReady] = useState(false);
  const preloadDoneRef = useRef(false);
  // Coalesces inspector focus events: one undo step per selected node.
  const inspectorCkpt = useRef<string | null>(null);
  const checkpointInspector = (id: string) => {
    if (inspectorCkpt.current !== id) {
      inspectorCkpt.current = id;
      checkpoint(false);
    }
  };
  const dragRef = useRef<{
    mode: 'node' | 'pan' | 'stroke' | 'text' | 'resize' | null;
    nodeId: string | null;
    strokeId: string | null;
    textId: string | null;
    dx: number;
    dy: number;
    px: number;
    py: number;
    lx: number;
    ly: number;
    moved: boolean;
    group: { id: string; ox: number; oy: number }[] | null;
    handle?: ResizeHandleId | null;
    sx?: number;
    sy?: number;
    sw?: number;
    sh?: number;
  }>({
    mode: null,
    nodeId: null,
    strokeId: null,
    textId: null,
    dx: 0,
    dy: 0,
    px: 0,
    py: 0,
    lx: 0,
    ly: 0,
    moved: false,
    group: null,
  });
  // Live alignment guides painted while a snapped drag is in flight.
  const guidesRef = useRef<GuideLine[]>([]);
  // Minimap: toggleable 160px overview. Default on for content-rich diagrams
  // on wide screens; always user-overridable. Toggle persists per browser.
  const [miniOpen, setMiniOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('archflux:minimap:v1');
      if (stored === 'open') return true;
      if (stored === 'closed') return false;
    } catch {
      /* ignore */
    }
    return nodes.length >= 6 && (typeof window === 'undefined' || window.innerWidth > 900);
  });
  const setMiniOpenPersisted = (v: boolean | ((prev: boolean) => boolean)) => {
    setMiniOpen((prev) => {
      const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(prev) : v;
      try {
        localStorage.setItem('archflux:minimap:v1', next ? 'open' : 'closed');
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Dock tab scroll positions survive tab switches (CAN-R20).
  const dockScrollRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const el =
      dockTab === 'inspector'
        ? document.querySelector('#linterDrawer [aria-label="Contextual inspector"]')
        : dockTab === 'linter'
          ? document.getElementById('linterCardsContainer')
          : document.querySelector('#linterDrawer [aria-label="Live collaborators"]');
    if (el instanceof HTMLElement && dockScrollRef.current[dockTab] !== undefined) {
      el.scrollTop = dockScrollRef.current[dockTab];
    }
  }, [dockTab]);
  const stateRef = useRef({ nodes, edges, strokes, texts, threads, selectedId, selectedEdgeId, selectedStrokeId, selectedTextId, textDraft, multiSel, theme, zoom, pan, orthogonal, pendingFrom, tool, lockedTool, sketchy, gridStyle, snapThreshold, connectorCurve });
  // Sync latest state for native listeners (effect, not render, to respect ref rules).
  useEffect(() => {
    stateRef.current = { nodes, edges, strokes, texts, threads, selectedId, selectedEdgeId, selectedStrokeId, selectedTextId, textDraft, multiSel, theme, zoom, pan, orthogonal, pendingFrom, tool, lockedTool, sketchy, gridStyle, snapThreshold, connectorCurve };
  });

  // ==================== LIVE REMOTE CURSORS (LucidChart parity) ==============
  // Own pointer → awareness (world coords, throttled); remote peers → engine
  // decorations layer, a screen-space canvas stacked above the content canvas.
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
  }, [collab.updateAwareness]);
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

  // Repaint remote cursors when presence or the view transform changes.
  useEffect(() => {
    const engine = cursorsEngineRef.current;
    if (!engine) return;
    let selfId = '';
    try {
      const awareness = collab.awareness;
      if (awareness && typeof awareness.clientID === 'number') selfId = String(awareness.clientID);
    } catch {
      /* awareness not ready */
    }
    const cursors = collab.users
      .filter((u) => String(u.id) !== selfId && u.cursor)
      .map((u) => ({ userId: u.id, userName: u.name, userColor: u.color, x: u.cursor!.x, y: u.cursor!.y }));
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
  }, [collab.users, collab.awareness, pan.x, pan.y, zoom, theme]);

  // A typed draft is never lost: rescued on unmount (route switch), stashed on
  // reload/close (beforeunload), restored on mount. Empty drafts are ignored.
  useEffect(() => {
    const stash = () => {
      const d = textDraftRef.current;
      // Live-saved content is already in the store (sync-flushed on unload);
      // stashing it too would restore a duplicate.
      if (d && !draftCommitted.current && d.value.trim() && !liveTextRef.current) {
        try {
          localStorage.setItem('archflux:pending-draft', JSON.stringify(d));
        } catch {
          /* ignore */
        }
      }
    };
    const rescue = () => {
      finishTextDraft(textDraftRef.current);
    };
    try {
      const raw = localStorage.getItem('archflux:pending-draft');
      if (raw) {
        localStorage.removeItem('archflux:pending-draft');
        const d = JSON.parse(raw) as { x: number; y: number; value: string; editingId: string | null };
        const value = typeof d.value === 'string' ? d.value.trim().slice(0, 500) : '';
        if (value && Number.isFinite(d.x) && Number.isFinite(d.y)) {
          draftCommitted.current = true;
          if (d.editingId && texts.some((t) => t.id === d.editingId)) {
            checkpoint(false);
            updateText(d.editingId, { text: value });
          } else {
            addText(d.x, d.y, value, 20, '#1F2937');
          }
          pushToast('Restored unsent text from before reload');
        }
      }
    } catch {
      /* ignore */
    }
    window.addEventListener('beforeunload', stash);
    return () => {
      window.removeEventListener('beforeunload', stash);
      rescue();
    };
    // Mount/unmount lifecycle must run exactly once; actions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // New selection gets a fresh inspector checkpoint budget.
  useEffect(() => {
    inspectorCkpt.current = null;
  }, [selectedId, selectedEdgeId]);
  // Suppresses the auto-switch when a selection is made *from* the dock
  // (e.g. clicking a linter result) so the user stays in the list they are
  // working through (DCK-R2).
  const suppressDockAutoSwitch = useRef(false);
  // Auto-switch to Inspector tab when anything selectable is picked on canvas.
  useEffect(() => {
    if (suppressDockAutoSwitch.current) {
      suppressDockAutoSwitch.current = false;
      return;
    }
    if (selectedId || selectedEdgeId || selectedStrokeId || selectedTextId) setDockTab('inspector');
  }, [selectedId, selectedEdgeId, selectedStrokeId, selectedTextId]);
  // Node/edge selection clears ink selection and vice versa.
  useEffect(() => {
    if (selectedId || selectedEdgeId) setSelectedStrokeId(null);
  }, [selectedId, selectedEdgeId]);

  // Selected node - memoized so it only recomputes when selectedId changes
  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [selectedId, nodes]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [selectedEdgeId, edges]);
  const selectedStroke = useMemo(() => strokes.find((s) => s.id === selectedStrokeId) ?? null, [selectedStrokeId, strokes]);
  const selectedText = useMemo(() => texts.find((t) => t.id === selectedTextId) ?? null, [selectedTextId, texts]);
  
  // Guard: ensure selected entities exist; if not, reset selection state
  if (!selectedId && selected) setSelectedId(selected.id);
  if (!selectedEdgeId && selectedEdge) setSelectedEdgeId(selectedEdge.id);
  if (!selectedStrokeId && selectedStroke) setSelectedStrokeId(selectedStroke.id);
  if (!selectedTextId && selectedText) setSelectedTextId(selectedText.id);

  // Excalidraw-style: selection toolbars float adjacent to the selection,
  // Toolbar position — memoized so it only recomputes when selection/zoom/pan change
  const selToolbarPos = useMemo(() => {
    const v = viewportRef.current;
    const vw = v?.clientWidth ?? 1200;
    const vh = v?.clientHeight ?? 800;
    let cx = 0, topW = 0, botW = 0;
    if (selectedStroke) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selectedStroke.pts.forEach((p) => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      });
      if (!Number.isFinite(minX)) return null;
      cx = (minX + maxX) / 2; topW = minY; botW = maxY;
    } else if (selectedText) {
      const w = selectedText.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * selectedText.fontSize * 0.6;
      cx = selectedText.x + w / 2; topW = selectedText.y - selectedText.fontSize * 1.4; botW = selectedText.y;
    } else {
      return null;
    }
    // Phones: dock the toolbar to the bottom edge (above the FAB zone)
    // instead of floating — floating bars cover the selection on 390px.
    if (vw < 600) {
      return { left: Math.min(Math.max(vw / 2, 80), Math.max(80, vw - 80)), top: Math.max(8, vh - 170) };
    }
    const sx = cx * zoom + pan.x;
    // Toolbar is capped at 700px wide (half = 350); keep the whole bar on-screen,
    // shrinking the margin on narrow viewports instead of collapsing.
    const half = Math.min(350, Math.max(80, vw / 2 - 8));
    const left = Math.min(Math.max(sx, half), Math.max(half, vw - half));
    const above = topW * zoom + pan.y - 150;
    const below = botW * zoom + pan.y + 14;
    // Prefer above the selection; flip below near the top; always stay on-screen.
    const top = Math.min(Math.max(above > 8 ? above : below, 8), Math.max(8, vh - 160));
    return { left, top };
  }, [selectedStroke, selectedText, zoom, pan, viewportRef]);

  // Single choke point for finishing a draft WITHOUT stealing selection or tool:
  // used by click-away, global Esc, and unmount rescue. Never discards typed text.
  const finishTextDraft = useCallback(
    (d: { x: number; y: number; value: string; editingId: string | null } | null) => {
      if (!d || draftCommitted.current) return;
      draftCommitted.current = true;
      const value = d.value.trim().slice(0, 500);
      if (d.editingId) {
        if (!value) {
          deleteText(d.editingId);
          setSelectedTextId(null);
        } else {
          const cur = texts.find((t) => t.id === d.editingId);
          if (cur && cur.text !== value) updateText(d.editingId, { text: value });
        }
        // else: live-saved on every keystroke already.
      } else if (liveTextRef.current) {
        if (!value) {
          deleteText(liveTextRef.current);
        } else {
          const cur = texts.find((t) => t.id === liveTextRef.current);
          if (cur && cur.text !== value) updateText(liveTextRef.current, { text: value });
        }
      } else if (value) {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        addText(d.x, d.y, value, 20, dark ? '#E5E7EB' : '#1F2937');
      }
      liveTextRef.current = null;
      liveSnapRef.current = false;
      setTextDraft(null);
    },
    [addText, updateText, deleteText, texts, setSelectedTextId, setTextDraft],
  );

  const commitTextDraft = () => {
    if (!textDraft || draftCommitted.current) return;
    draftCommitted.current = true;
    const value = textDraft.value.trim().slice(0, 500);
    if (textDraft.editingId) {
      // Live-saved on every keystroke already; empty commit removes the entry.
      if (!value) {
        deleteText(textDraft.editingId);
        setSelectedTextId(null);
      }
    } else if (liveTextRef.current) {
      if (!value) deleteText(liveTextRef.current);
      else {
        // Select the live-saved text and return to Select (Excalidraw flow).
        setSelectedTextId(liveTextRef.current);
        setSelectedId(null);
        setSelectedEdgeId(null);
        setSelectedStrokeId(null);
        setTool('select');
      }
    } else if (value) {
      const dark = theme === 'dark';
      const id = addText(textDraft.x, textDraft.y, value, 20, dark ? '#E5E7EB' : '#1F2937');
      if (id) {
        setSelectedTextId(id);
        setSelectedId(null);
        setSelectedEdgeId(null);
        setSelectedStrokeId(null);
        setTool('select');
      }
    }
    liveTextRef.current = null;
    liveSnapRef.current = false;
    setTextDraft(null);
  };

  // Write-through: every keystroke lands in the store immediately, so a draft
  // can never be lost no matter which key is pressed next. One undo step covers
  // the whole typing session (snapshot on first character only).
  const onDraftChange = (value: string) => {
    if (!textDraft) return;
    setTextDraft({ ...textDraft, value });
    const clean = value.slice(0, 500);
    if (textDraft.editingId) {
      if (!liveSnapRef.current) {
        liveSnapRef.current = true;
        checkpoint(false);
      }
      updateText(textDraft.editingId, { text: clean });
      return;
    }
    if (!clean.trim()) {
      if (liveTextRef.current) {
        deleteText(liveTextRef.current);
        liveTextRef.current = null;
      }
      return;
    }
    if (liveTextRef.current) {
      updateText(liveTextRef.current, { text: clean });
    } else {
      const dark = theme === 'dark';
      const id = addText(textDraft.x, textDraft.y, clean, 20, dark ? '#E5E7EB' : '#1F2937');
      if (id) liveTextRef.current = id;
    }
    liveSnapRef.current = true;
  };

  // Derived linter (generic, not hardcoded) — memoized so it only recomputes when nodes/edges change
  const degree = useMemo(() => {
    const m = new Map<string, number>();
    const safeNodes = nodes ?? [];
    const safeEdges = edges ?? [];
    safeNodes.forEach((n) => m.set(n.id, 0));
    safeEdges.forEach((e) => {
      m.set(e.from, (m.get(e.from) ?? 0) + 1);
      if (e.to) m.set(e.to, (m.get(e.to) ?? 0) + 1);
    });
    return m;
  }, [nodes, edges]);
  const orphans = useMemo(() => nodes.filter((n) => (degree.get(n.id) ?? 0) === 0 || n.isOrphan), [degree, nodes]);
  const danglings = useMemo(() => edges.filter((e) => e.isDangling || !e.to), [edges]);
  const ambiguous = useMemo(() => edges.filter((e) => e.to && !e.isDangling && !e.protocol), [edges]);
  const remaining = orphans.length + danglings.length + ambiguous.length;

  const tagProtocol = (edgeId: string, protocol: string) => {
    checkpoint(false);
    updateEdge(edgeId, { protocol });
    pushToast(`Tagged ${protocol} on route`);
  };

  // Redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const cv: HTMLCanvasElement = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCanvasError(true);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const draw = () => {
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const s = stateRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (reducedMotion) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
      ctx.translate(s.pan.x, s.pan.y);
      ctx.scale(s.zoom, s.zoom);

      const isDark = s.theme === 'dark';

      // Viewport culling: skip off-screen work so 100+ node graphs stay fluid.
      const margin = 80;
      const vx0 = (0 - s.pan.x) / s.zoom - margin;
      const vy0 = (0 - s.pan.y) / s.zoom - margin;
      const vx1 = (w - s.pan.x) / s.zoom + margin;
      const vy1 = (h - s.pan.y) / s.zoom + margin;
      const onScreen = (x: number, y: number, bw: number, bh: number) =>
        x <= vx1 && x + bw >= vx0 && y <= vy1 && y + bh >= vy0;

      s.edges.forEach((edge) => {
        // Cull on the pre-pass polyline (exact points match the shared helper).
        const pts = edgePoints(edge, s.nodes ?? [], s.orthogonal, s.connectorCurve);
        if (!pts) return;
        if (pts.every((p) => p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1)) return;
        drawEdgePass(ctx, edge, s.nodes ?? [], {
          isDark,
          selected: s.selectedEdgeId === edge.id,
          orthogonal: s.orthogonal,
          curve: s.connectorCurve,
        });
      });

      /** Draw a single node — delegates to the shared render pass. */
      const drawNode = (node: ArchNode) => {
        if (!onScreen(node.x, node.y, node.w, node.h)) return;
        drawNodePass(ctx, node, iconsAdapter, {
          isDark,
          selected: s.selectedId === node.id || s.multiSel.includes(node.id),
          pending: s.pendingFrom === node.id,
          showPorts: s.tool === 'connector',
        });
      };

      s.nodes.forEach(drawNode);

      // Resize grips + alignment guides for the selected node (single-select).
      {
        const sel = s.selectedId ? s.nodes.find((n) => n.id === s.selectedId) : undefined;
        if (sel && s.multiSel.length <= 1) {
          ctx.save();
          for (const h of resizeHandles(sel, s.zoom)) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = (isDark ? '#8B83FF' : '#635BFF');
            ctx.lineWidth = 1.5 / s.zoom;
            ctx.fillRect(h.x - h.size / 2, h.y - h.size / 2, h.size, h.size);
            ctx.strokeRect(h.x - h.size / 2, h.y - h.size / 2, h.size, h.size);
          }
          ctx.restore();
        }
        if (guidesRef.current.length > 0) {
          ctx.save();
          ctx.strokeStyle = '#635BFF';
          ctx.lineWidth = 1.5 / s.zoom;
          ctx.setLineDash([6 / s.zoom, 4 / s.zoom]);
          for (const g of guidesRef.current) {
            ctx.beginPath();
            if (g.vertical) {
              ctx.moveTo(g.at, vy0);
              ctx.lineTo(g.at, vy1);
            } else {
              ctx.moveTo(vx0, g.at);
              ctx.lineTo(vx1, g.at);
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Freehand ink strokes (committed + in-progress), drawn above shapes.
      const inkPass = (pts: { x: number; y: number }[], color: string, width: number, selected: boolean) => {
        if (pts.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach((p) => {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        });
        if (maxX < vx0 || minX > vx1 || maxY < vy0 || minY > vy1) return;
        drawInkPass(ctx, pts, color, width, selected);
      };
      s.strokes.forEach((st) => inkPass(st.pts, st.color, st.width, s.selectedStrokeId === st.id));
      if (ink && ink.length > 0) {
        inkPass(ink, isDark ? '#E5E7EB' : '#1F2937', 3, false);
      }
      // Free-standing text labels (Excalidraw-style).
      s.texts.forEach((t) => {
        drawFreeTextPass(ctx, t, s.selectedTextId === t.id, isDark);
      });
      // Note pins — visual markers for review threads on the canvas.
      s.threads.forEach((t) => {
        if (t.pinnedTo === '__canvas') return;
        const n = s.nodes.find((node) => node.id === t.pinnedTo);
        if (!n) return;
        drawThreadPinPass(ctx, n, { resolved: t.resolved, isDark });
      });
      ctx.restore();
    };

    draw();
    drawRef.current = draw;
    const onResize = () => {
      const c = canvasRef.current;
      const v = viewportRef.current;
      if (!c || !v) return;
      const r = window.devicePixelRatio || 1;
      c.width = Math.round(v.clientWidth * r);
      c.height = Math.round(v.clientHeight * r);
      draw();
    };
    window.addEventListener('resize', onResize);
    window.setTimeout(onResize, 40);
    const hitNode = (x: number, y: number) => {
      const s = stateRef.current;
      for (let i = s.nodes.length - 1; i >= 0; i--) {
        const n = s.nodes[i];
        if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n.id;
      }
      return null;
    };
    const hitEdge = (x: number, y: number) => {
      const s = stateRef.current;
      const tol = 8 / s.zoom;
      for (let i = s.edges.length - 1; i >= 0; i--) {
        const pts = edgePoints(s.edges[i], s.nodes, s.orthogonal, s.connectorCurve);
        if (!pts) continue;
        for (let j = 0; j < pts.length - 1; j++) {
          if (distToSegment(x, y, pts[j], pts[j + 1]) <= tol) return s.edges[i].id;
        }
      }
      return null;
    };
    const hitStroke = (x: number, y: number) => {
      const s = stateRef.current;
      const tol = 10 / s.zoom;
      for (let i = s.strokes.length - 1; i >= 0; i--) {
        const pts = s.strokes[i].pts;
        for (let j = 0; j < pts.length - 1; j++) {
          if (distToSegment(x, y, pts[j], pts[j + 1]) <= tol) return s.strokes[i].id;
        }
        if (pts.length === 1 && Math.hypot(x - pts[0].x, y - pts[0].y) <= tol) return s.strokes[i].id;
      }
      return null;
    };
    const hitText = (x: number, y: number) => {
      const s = stateRef.current;
      const tol = 6 / s.zoom;
      for (let i = s.texts.length - 1; i >= 0; i--) {
        const t = s.texts[i];
        const lines = t.text.split('\n');
        const w = lines.reduce((m, l) => Math.max(m, l.length), 0) * t.fontSize * 0.6;
        const top = t.y - t.fontSize * 1.4;
        const bottom = t.y + (lines.length - 1) * t.fontSize * 1.3;
        if (x >= t.x - tol && x <= t.x + w + tol && y >= top - tol && y <= bottom + tol) return t.id;
      }
      return null;
    };
    const onPointerDown = (e: PointerEvent) => {
      const pt = dropToWorld(e.clientX, e.clientY);
      if (!pt) return;
      const { x, y } = pt;
      const hit = hitNode(x, y);
      const cur = stateRef.current;
      const activeTool = cur.tool;
      const releaseTool = () => {
        // Single-use tools revert to Select unless locked (Excalidraw model).
        // The pencil stays active for continuous sketching — Esc exits.
        if (activeTool !== 'draw' && cur.lockedTool !== activeTool) {
          setTool('select');
          setLockedTool(null);
        }
      };
      // Space held (or middle button): pan regardless of tool.
      if (spaceDown.current || e.button === 1 || activeTool === 'pan') {
        dragRef.current = { mode: 'pan', nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: e.clientX - cur.pan.x, py: e.clientY - cur.pan.y, lx: 0, ly: 0, moved: false, group: null };
        return;
      }
      // Resize grips on the selected node (select tool only).
      if (activeTool === 'select' && cur.selectedId) {
        const sel = cur.nodes.find((node) => node.id === cur.selectedId);
        if (sel) {
          const grip = hitResizeHandle(x, y, sel, cur.zoom);
          if (grip) {
            dragRef.current = {
              mode: 'resize', nodeId: sel.id, strokeId: null, textId: null,
              dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null,
              handle: grip, sx: x, sy: y, sw: sel.w, sh: sel.h,
            };
            return;
          }
        }
      }
      // Click-away finishes any open text draft (blur is unreliable: remounts,
      // focus steals, and unmount-blurs must never destroy or duplicate text).
      finishTextDraft(cur.textDraft);
      // Freehand pencil: begin ink capture (committed on pointer-up).
      if (activeTool === 'draw') {
        inkRef.current = { pts: [{ x: Math.round(x), y: Math.round(y) }] };
        setInk(inkRef.current.pts);
        setSelectedStrokeId(null);
        setSelectedTextId(null);
        return;
      }
      // Text tool: open inline editor at click position (type immediately).
      if (activeTool === 'text') {
        draftCommitted.current = false;
        liveTextRef.current = null;
        liveSnapRef.current = false;
        setTextDraft({ x: Math.round(x), y: Math.round(y), value: '', editingId: null });
        setSelectedTextId(null);
        setSelectedStrokeId(null);
        return;
      }
      if (activeTool === 'service' || activeTool === 'gateway' || activeTool === 'db' || activeTool === 'stream') {
        if (!hit) {
          addNode(activeTool, x, y);
          releaseTool();
        } else {
          setSelectedId(hit);
          setSelectedEdgeId(null);
        }
        return;
      }
      if (activeTool === 'connector') {
        if (hit) {
          if (!cur.pendingFrom) {
            setPendingFrom(hit);
            setSelectedId(hit);
            pushToast(`Connector source: ${hit} — click target`);
          } else if (cur.pendingFrom === hit) {
            setPendingFrom(null);
          } else {
            connectNodes(cur.pendingFrom, hit);
            setPendingFrom(null);
            releaseTool();
          }
        } else if (cur.pendingFrom) {
          connectNodes(cur.pendingFrom, null, { x: Math.round(x), y: Math.round(y) });
          setPendingFrom(null);
          releaseTool();
        }
        return;
      }
      if (activeTool === 'comment') {
        if (hit) {
          const n = cur.nodes.find((node) => node.id === hit);
          setCommentFor({ id: hit, label: n?.label ?? hit });
        } else {
          setCommentFor({ id: '__canvas', label: 'Canvas area' });
        }
        setCommentText('');
        releaseTool();
        return;
      }
      if (hit) {
        // Shift+click toggles multi-select without starting a drag.
        if (e.shiftKey) {
          setSelectedEdgeId(null);
          setMultiSel((prev) => {
            const next = prev.includes(hit) ? prev.filter((id) => id !== hit) : [...prev, hit];
            setSelectedId(next.length > 0 ? next[next.length - 1] : null);
            return next;
          });
          dragRef.current = { mode: null, nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
          return;
        }
const n = cur.nodes.find((node) => node.id === hit);
        // Clicking outside the current set collapses to a single selection.
        const groupIds = cur.multiSel.includes(hit) ? cur.multiSel : [];
        if (!cur.multiSel.includes(hit)) setMultiSel([]);
        if (cur.pendingFrom) {
          if (cur.pendingFrom !== hit) {
            // Defer to pointer-up: a drag must move the node, not connect it.
            connectArmRef.current = { from: cur.pendingFrom, to: hit };
          } else {
            setPendingFrom(null);
          }
        } else {
          setPendingFrom(hit);
        }
        // Undo checkpoint lands on first actual move, not on mere selection.
        dragRef.current = {
          mode: 'node',
          nodeId: hit,
          strokeId: null,
          textId: null,
          dx: n ? x - n.x : 0,
          dy: n ? y - n.y : 0,
          px: 0,
          py: 0,
          lx: 0,
          ly: 0,
          moved: false,
          group: groupIds.map((id) => {
            const m = cur.nodes.find((node) => node.id === id);
            return { id, ox: (m?.x ?? x) - x, oy: (m?.y ?? y) - y };
          }),
        };
        setSelectedId(hit);
        setSelectedEdgeId(null);
        setSelectedStrokeId(null);
      } else {
        const edgeHit = hitEdge(x, y);
        if (edgeHit) {
          setSelectedEdgeId(edgeHit);
          setSelectedId(null);
          setSelectedStrokeId(null);
          setMultiSel([]);
          dragRef.current = { mode: null, nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
        } else {
          const inkHit = hitStroke(x, y);
          if (inkHit) {
            // Grab ink: one undo step on first move, silent per-frame moves after.
            dragRef.current = { mode: 'stroke', nodeId: null, strokeId: inkHit, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: x, ly: y, moved: false, group: null };
            setSelectedStrokeId(inkHit);
            setSelectedId(null);
            setSelectedEdgeId(null);
            setSelectedTextId(null);
            setMultiSel([]);
          } else {
            const textHit = hitText(x, y);
            if (textHit) {
              dragRef.current = { mode: 'text', nodeId: null, strokeId: null, textId: textHit, dx: 0, dy: 0, px: 0, py: 0, lx: x, ly: y, moved: false, group: null };
              setSelectedTextId(textHit);
              setSelectedId(null);
              setSelectedEdgeId(null);
              setSelectedStrokeId(null);
              setMultiSel([]);
            } else {
              dragRef.current = { mode: 'pan', nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: e.clientX - cur.pan.x, py: e.clientY - cur.pan.y, lx: 0, ly: 0, moved: false, group: null };
              setSelectedId(null);
              setSelectedEdgeId(null);
              setSelectedStrokeId(null);
              setSelectedTextId(null);
              setPendingFrom(null);
              setMultiSel([]);
            }
          }
        }
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      // Live presence: publish own cursor for remote collaborators (throttled).
      if (e.target === cv) publishCursor(e.clientX, e.clientY);
      // Live ink capture while the pencil is down (independent of drag state).
      if (inkRef.current) {
        const rect = cv.getBoundingClientRect();
        const s = stateRef.current;
        const wx = Math.round((e.clientX - rect.left - s.pan.x) / s.zoom);
        const wy = Math.round((e.clientY - rect.top - s.pan.y) / s.zoom);
        const pts = inkRef.current.pts;
        const last = pts[pts.length - 1];
        if (Math.hypot(wx - last.x, wy - last.y) >= 2) {
          pts.push({ x: wx, y: wy });
          setInk([...pts]);
        }
        return;
      }
      const drag = dragRef.current;
      if (!drag.mode) return;
      const s = stateRef.current;
      if (drag.mode === 'stroke' && drag.strokeId) {
        const rect = cv.getBoundingClientRect();
        const wx = (e.clientX - rect.left - s.pan.x) / s.zoom;
        const wy = (e.clientY - rect.top - s.pan.y) / s.zoom;
        if (!drag.moved) {
          drag.moved = true;
          checkpoint(false);
        }
        moveStroke(drag.strokeId, wx - drag.lx, wy - drag.ly);
        drag.lx = wx;
        drag.ly = wy;
        return;
      }
      if (drag.mode === 'text' && drag.textId) {
        const rect = cv.getBoundingClientRect();
        const wx = (e.clientX - rect.left - s.pan.x) / s.zoom;
        const wy = (e.clientY - rect.top - s.pan.y) / s.zoom;
        if (!drag.moved) {
          drag.moved = true;
          checkpoint(false);
        }
        moveText(drag.textId, wx - drag.lx, wy - drag.ly);
        drag.lx = wx;
        drag.ly = wy;
        return;
      }
      if (drag.mode === 'resize' && drag.nodeId && drag.handle) {
        const rect = cv.getBoundingClientRect();
        const wx = (e.clientX - rect.left - s.pan.x) / s.zoom;
        const wy = (e.clientY - rect.top - s.pan.y) / s.zoom;
        if (!drag.moved) {
          drag.moved = true;
          checkpoint(false);
        }
        const dw = wx - (drag.sx ?? wx);
        const dh = wy - (drag.sy ?? wy);
        const sw = drag.sw ?? 170;
        const sh = drag.sh ?? 70;
        let nw = sw + ((drag.handle === 'e' || drag.handle === 'se') ? dw : 0);
        let nh = sh + ((drag.handle === 's' || drag.handle === 'se') ? dh : 0);
        if (e.shiftKey && sw > 0 && sh > 0) {
          // Shift locks the aspect ratio to the grab-time shape.
          const ratio = sw / sh;
          if (drag.handle === 's') nw = nh * ratio;
          else nh = nw / ratio;
        }
        const clamped = clampNodeSize(nw, nh);
        updateNode(drag.nodeId, { w: Math.round(clamped.w), h: Math.round(clamped.h) });
        return;
      }
      if (drag.mode === 'node' && drag.nodeId) {
        const rect = cv.getBoundingClientRect();
        const wx = (e.clientX - rect.left - s.pan.x) / s.zoom;
        const wy = (e.clientY - rect.top - s.pan.y) / s.zoom;
        if (!drag.moved) {
          drag.moved = true;
          checkpoint(false);
        }
        if (drag.group && drag.group.length > 0) {
          guidesRef.current = [];
          drag.group.forEach((m) => moveNode(m.id, wx + m.ox, wy + m.oy));
        } else {
          // Alignment snap: single-node drags snap edges within the snap
          // threshold (0 disables; holding Alt suspends it for this drag).
          let tx = wx - drag.dx;
          let ty = wy - drag.dy;
          const threshold = e.altKey ? 0 : (s.snapThreshold ?? 10);
          if (threshold > 0) {
            const self = s.nodes.find((n) => n.id === drag.nodeId);
            if (self) {
              const res = snapNode(
                { x: tx, y: ty, w: self.w, h: self.h },
                s.nodes.filter((n) => n.id !== drag.nodeId),
                threshold,
              );
              tx = res.x;
              ty = res.y;
              guidesRef.current = res.guides;
            }
          } else {
            guidesRef.current = [];
          }
          moveNode(drag.nodeId, tx, ty);
        }
      } else if (drag.mode === 'pan') {
        setPan({ x: e.clientX - drag.px, y: e.clientY - drag.py });
      }
    };
    const onPointerUp = () => {
      // Commit finished ink as one undoable stroke.
      if (inkRef.current) {
        const pts = inkRef.current.pts;
        inkRef.current = null;
        setInk(null);
        if (pts.length >= 2) {
          const dark = stateRef.current.theme === 'dark';
          addStroke(pts, dark ? '#E5E7EB' : '#1F2937', 3);
        }
      }
      const arm = connectArmRef.current;
      connectArmRef.current = null;
      if (arm && !dragRef.current.moved && stateRef.current.pendingFrom === arm.from) {
        connectNodes(arm.from, arm.to);
        setPendingFrom(null);
      }
      dragRef.current = { mode: null, nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
      if (guidesRef.current.length > 0) {
        guidesRef.current = [];
        drawRef.current();
      }
    };
    cv.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    cv.addEventListener('pointerleave', clearOwnCursor);
    return () => {
      window.removeEventListener('resize', onResize);
      cv.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cv.removeEventListener('pointerleave', clearOwnCursor);
    };
  }, [setPan, setSelectedId, addNode, connectNodes, setTool, pushToast, moveNode, moveStroke, moveText, addStroke, addText, updateText, deleteText, checkpoint, finishTextDraft, publishCursor, clearOwnCursor]);

  // Live repaint: the canvas paints on mount/resize only, so re-invoke draw
  // whenever visual state changes (drag frames, selection, theme, pan/zoom…).
  useEffect(() => {
    drawRef.current();
  }, [nodes, edges, strokes, texts, selectedId, selectedEdgeId, selectedStrokeId, selectedTextId, textDraft, multiSel, theme, zoom, pan, pendingFrom, tool, lockedTool, threads]);

  // Wheel / trackpad: scroll pans, Ctrl/Cmd+scroll (pinch) zooms to cursor.
  // Must be non-passive to preventDefault the page bounce/zoom gesture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const newZoom = Math.min(4.0, Math.max(0.1, s.zoom * factor));
        const wx = (cx - s.pan.x) / s.zoom;
        const wy = (cy - s.pan.y) / s.zoom;
        zoomTo(newZoom);
        setPan({ x: cx - wx * newZoom, y: cy - wy * newZoom });
      } else {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        setPan({ x: s.pan.x - e.deltaX * unit, y: s.pan.y - e.deltaY * unit });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomTo, setPan]);

  // Keyboard shortcuts
  // True fit: frame live content bounds, not a hardcoded origin.
  const fitContent = useCallback(() => {
    const v = viewportRef.current;
    if (!v || (nodes.length === 0 && strokes.length === 0)) {
      resetView();
      return;
    }
    const vw = v.clientWidth;
    const vh = v.clientHeight;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    strokes.forEach((st) => {
      st.pts.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
    texts.forEach((t) => {
      const lines = t.text.split('\n');
      const w = lines.reduce((m, l) => Math.max(m, l.length), 0) * t.fontSize * 0.6;
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y - t.fontSize * 1.4);
      maxX = Math.max(maxX, t.x + w);
      maxY = Math.max(maxY, t.y + (lines.length - 1) * t.fontSize * 1.3);
    });
    const pad = 60;
    const bw = Math.max(1, maxX - minX + pad * 2);
    const bh = Math.max(1, maxY - minY + pad * 2);
    const z = Math.min(4.0, Math.max(0.1, Math.min(vw / bw, vh / bh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    zoomTo(z);
    setPan({ x: vw / 2 - cx * z, y: vh / 2 - cy * z });
  }, [nodes, strokes, texts, zoomTo, setPan, resetView]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const isMod = e.ctrlKey || e.metaKey;
      if (e.key === ' ' && !isMod) {
        e.preventDefault();
        spaceDown.current = true;
        return;
      }
      // Single-key shortcuts must not fire while a button holds focus
      // (e.g. Delete right after clicking a rail button). Escape always passes.
      if (!isMod && e.key !== 'Escape' && tag === 'BUTTON') return;
      // Read rebindable shortcuts from settings (fall back to defaults).
      let shortcuts: Record<string, string> = { Select: 'V', Pan: 'H', Draw: 'P', Text: 'T', Service: 'S', Gateway: 'G', Database: 'D', Queue: 'Q', Note: 'N', Connector: 'C', Library: 'L' };
      try {
        const s = JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { shortcuts?: Record<string, string> };
        if (s.shortcuts) shortcuts = { ...shortcuts, ...s.shortcuts };
      } catch {
        /* ignore */
      }
      // Bound key for a tool name (e.g. keyFor('Select') → 'v').
      const keyFor = (toolName: string) => (shortcuts[toolName] ?? '').toLowerCase();
      const k = e.key.toLowerCase();
      if (isMod && k === 'a') {
        e.preventDefault();
        const ids = stateRef.current.nodes.map((n) => n.id);
        setMultiSel(ids);
        setSelectedId(ids.length > 0 ? ids[ids.length - 1] : null);
        setSelectedEdgeId(null);
      } else if (isMod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && k === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const cur = stateRef.current;
        if (cur.textDraft) return; // typing in the inline editor
        if (cur.selectedTextId && !cur.selectedId && !cur.selectedEdgeId && cur.multiSel.length === 0) {
          deleteText(cur.selectedTextId);
          setSelectedTextId(null);
          return;
        }
        if (cur.selectedStrokeId && !cur.selectedId && !cur.selectedEdgeId && cur.multiSel.length === 0) {
          deleteStroke(cur.selectedStrokeId);
          setSelectedStrokeId(null);
          return;
        }
        const bulk = Array.from(new Set([...stateRef.current.multiSel, stateRef.current.selectedId].filter((v): v is string => Boolean(v))));
        if (bulk.length > 1) {
          deleteNodes(bulk);
          setMultiSel([]);
          setSelectedEdgeId(null);
        } else if (stateRef.current.selectedEdgeId) {
          deleteEdge(stateRef.current.selectedEdgeId);
          setSelectedEdgeId(null);
        } else {
          deleteSelected();
        }
      } else if (e.key === 'Escape') {
        // Esc finishes an open draft (commits typed text) instead of discarding it.
        finishTextDraft(stateRef.current.textDraft);
        setSelectedId(null);
        setSelectedEdgeId(null);
        setSelectedStrokeId(null);
        setInk(null);
        inkRef.current = null;
        setMultiSel([]);
        setPendingFrom(null);
        setCommentFor(null);
        setLockedTool(null);
        setLibOpen(false);
        setTool('select');
      } else if (k === keyFor('Draw')) {
        setTool('draw');
        setPendingFrom(null);
      } else if (k === keyFor('Text')) {
        setTool('text');
        setPendingFrom(null);
      } else if (e.key.startsWith('Arrow') && stateRef.current.selectedId) {
        // Keyboard nudge: one undo step per selection, silent moves after.
        e.preventDefault();
        const nid = stateRef.current.selectedId;
        const key = `nudge:${nid}`;
        if (inspectorCkpt.current !== key) {
          inspectorCkpt.current = key;
          checkpoint(false);
        }
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const n = stateRef.current.nodes.find((nn) => nn.id === nid);
        if (n) moveNode(nid, n.x + dx, n.y + dy);
      } else if (k === keyFor('Select')) {
        setTool('select');
        setPendingFrom(null);
      } else if (k === keyFor('Pan')) {
        setTool('pan');
        setPendingFrom(null);
      } else if (k === keyFor('Service') || e.key === '1') {
        setTool('service');
        setPendingFrom(null);
      } else if (k === keyFor('Gateway') || e.key === '2') {
        setTool('gateway');
        setPendingFrom(null);
      } else if (k === keyFor('Database') || e.key === '3') {
        setTool('db');
        setPendingFrom(null);
      } else if (k === keyFor('Note') || e.key === '5') {
        setTool('comment');
        setPendingFrom(null);
      } else if (k === keyFor('Connector')) {
        setTool('connector');
        setPendingFrom(null);
      } else if (k === keyFor('Queue') || e.key === '4') {
        // Q selects the Queue/Stream tool; pressing it again locks repeat placement.
        if (stateRef.current.tool === 'stream') {
          const locking = stateRef.current.lockedTool !== 'stream';
          setLockedTool(locking ? 'stream' : null);
          pushToast(locking ? 'Tool locked — repeat placement (Q to unlock)' : 'Tool unlocked — single use');
        } else {
          setTool('stream');
          setPendingFrom(null);
        }
      } else if (k === 'f') {
        // F frames the selection; with nothing selected it fits all content.
        if (stateRef.current.selectedId) panToNode(stateRef.current.selectedId);
        else fitContent();
      } else if (k === 'm') {
        setMiniOpenPersisted((v) => !v);
      } else if (k === keyFor('Library')) {
        setLibOpen((v) => !v);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDown.current = false;
    };
    const onBlur = () => {
      // Alt-Tab while Space is held must not leave pan-mode stuck on.
      spaceDown.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
    // panToNode/setMiniOpenPersisted read live refs/state; subscribing once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, deleteSelected, deleteNodes, duplicateSelected, setSelectedId, setTool, resetView, fitContent, deleteEdge, deleteStroke, deleteText, moveNode, checkpoint, pushToast, finishTextDraft]);

  // Double-click a node jumps straight into renaming it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDblClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const s = stateRef.current;
      const x = (e.clientX - rect.left - s.pan.x) / s.zoom;
      const y = (e.clientY - rect.top - s.pan.y) / s.zoom;
      const hit = [...s.nodes].reverse().find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h);
      if (hit) {
        setSelectedId(hit.id);
        setSelectedEdgeId(null);
        window.setTimeout(() => {
          const input = document.getElementById('inspector-label') as HTMLInputElement | null;
          input?.focus();
          input?.select();
        }, 60);
        return;
      }
      // Double-click a text label edits it inline.
      const tol = 6 / s.zoom;
      const textHit = [...s.texts].reverse().find((t) => {
        const lines = t.text.split('\n');
        const w = lines.reduce((m, l) => Math.max(m, l.length), 0) * t.fontSize * 0.6;
        const top = t.y - t.fontSize * 1.4;
        const bottom = t.y + (lines.length - 1) * t.fontSize * 1.3;
        return x >= t.x - tol && x <= t.x + w + tol && y >= top - tol && y <= bottom + tol;
      });
      if (textHit) {
        draftCommitted.current = false;
        liveTextRef.current = null;
        liveSnapRef.current = false;
        setSelectedTextId(textHit.id);
        setSelectedId(null);
        setSelectedEdgeId(null);
        setTextDraft({ x: textHit.x, y: textHit.y, value: textHit.text, editingId: textHit.id });
      }
    };
    canvas.addEventListener('dblclick', onDblClick);
    return () => canvas.removeEventListener('dblclick', onDblClick);
  }, [setSelectedId]);


  const libQ = libQuery.trim().toLowerCase();
  const libShapes = useMemo(
    () =>
      libraryShapes.filter(
        (s) =>
          (libCategory === 'all' || s.category === libCategory) &&
          (!libQ || `${s.label} ${s.tag} ${s.provider}`.toLowerCase().includes(libQ)),
      ),
    [libCategory, libQ],
  );

  const placeShapeAtCenter = (shape: LibraryShape) => {
    const v = viewportRef.current;
    const s = stateRef.current;
    const cx = (v?.clientWidth ?? 800) / 2;
    const cy = (v?.clientHeight ?? 600) / 2;
    let x = (cx - s.pan.x) / s.zoom - 85;
    let y = (cy - s.pan.y) / s.zoom - 35;
    // Consecutive center placements must not stack exactly (SHP-R16):
    // step down-right until the spot is free, wrapping after 5 steps.
    const occupied = () => s.nodes.some((n) => Math.abs(n.x - x) < 8 && Math.abs(n.y - y) < 8);
    let step = 0;
    while (occupied() && step < 5) {
      step += 1;
      x += 16;
      y += 16;
    }
    placeShapeRecorded(shape, x, y);
  };

  const dropToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const s = stateRef.current;
    return {
      x: (clientX - rect.left - s.pan.x) / s.zoom,
      y: (clientY - rect.top - s.pan.y) / s.zoom,
    };
  };

  // Screen-reader announcements for selection / lint / graph changes.
  const [announcement, setAnnouncement] = useState('');
  const announceTimer = useRef(0);
  useEffect(() => {
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      if (selectedEdge) setAnnouncement(`Selected route ${selectedEdge.label}, from ${selectedEdge.from} to ${selectedEdge.to ?? 'unresolved'}.`);
      else if (selected) setAnnouncement(`Selected ${selected.label}, ${selected.tag}, health ${selected.health}. ${remaining} lint issues.`);
      else if (multiSel.length > 1) setAnnouncement(`${multiSel.length} nodes selected.`);
      else setAnnouncement(`${nodes.length} nodes, ${edges.length} routes, ${strokes.length} ink strokes, ${texts.length} text labels. ${remaining} lint issues.`);
    }, 150);
    return () => window.clearTimeout(announceTimer.current);
  }, [selectedId, selectedEdgeId, multiSel.length, remaining, nodes.length, edges.length, strokes.length, texts.length, selected, selectedEdge]);

  // Minimap click-to-navigate: center the main canvas on the clicked world point.
  const onMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mc = miniCanvasRef.current;
    const v = viewportRef.current;
    if (!mc || !v) return;
    const r = mc.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const mx = ((e.clientX - r.left) / r.width) * 160;
    const my = ((e.clientY - r.top) / r.height) * 100;
    const t = minimapTransform(nodes, 160, 100);
    const wpt = miniToWorld(mx, my, t);
    setPan({ x: v.clientWidth / 2 - wpt.x * zoom, y: v.clientHeight / 2 - wpt.y * zoom });
  };

  // Minimap repaint: nodes/edges/viewport as a 160x100 overview.
  useEffect(() => {
    if (!miniOpen) return;
    const mc = miniCanvasRef.current;
    if (!mc) return;
    const mctx = mc.getContext('2d');
    if (!mctx) return;
    const MW = 160;
    const MH = 100;
    const t = minimapTransform(nodes, 160, 100);
    const isDarkMap = theme === 'dark';
    mctx.clearRect(0, 0, MW, MH);
    mctx.fillStyle = isDarkMap ? '#101318' : '#FFFFFF';
    mctx.fillRect(0, 0, MW, MH);
    mctx.strokeStyle = isDarkMap ? '#292F3A' : '#E0E3EA';
    mctx.lineWidth = 1;
    edges.forEach((edge) => {
      const a = nodes.find((n) => n.id === edge.from);
      const b = edge.to ? nodes.find((n) => n.id === edge.to) : null;
      if (!a || !b) return;
      const p1 = worldToMini(a.x + a.w / 2, a.y + a.h / 2, t);
      const p2 = worldToMini(b.x + b.w / 2, b.y + b.h / 2, t);
      mctx.beginPath();
      mctx.moveTo(p1.x, p1.y);
      mctx.lineTo(p2.x, p2.y);
      mctx.stroke();
    });
    nodes.forEach((n) => {
      const p = worldToMini(n.x, n.y, t);
      mctx.fillStyle = n.stroke ?? '#635BFF';
      mctx.fillRect(p.x, p.y, Math.max(2.5, n.w * t.s), Math.max(2.5, n.h * t.s));
    });
    const v = viewportRef.current;
    if (v && zoom > 0) {
      const tl = worldToMini((0 - pan.x) / zoom, (0 - pan.y) / zoom, t);
      mctx.strokeStyle = '#635BFF';
      mctx.lineWidth = 1.5;
      mctx.strokeRect(tl.x, tl.y, (v.clientWidth / zoom) * t.s, (v.clientHeight / zoom) * t.s);
    }
  }, [nodes, edges, theme, miniOpen, zoom, pan]);

  return (
    <div className="screen-view active">
      <div
        className={`canvas-layout${gridStyle === 'lines' ? ' grid-lines' : gridStyle === 'none' ? ' grid-none' : ''}`}
        ref={viewportRef}
        id="canvasViewport"
        data-testid="canvas-status"
        data-nodes={nodes.length}
        data-edges={edges.length}
        data-icons-ready={iconsReady}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const pt = dropToWorld(e.clientX, e.clientY);
          if (!pt) return;
          // Provider-library shapes carry their full payload.
          try {
            const raw = e.dataTransfer.getData('text/archflux-shape');
            if (raw) {
              const shape = JSON.parse(raw) as LibraryShape;
              if (shape && typeof shape.id === 'string' && typeof shape.label === 'string') {
                const known = libraryShapes.find((s) => s.id === shape.id);
                placeShapeRecorded(known ?? { ...shape, provider: 'General', kind: 'service' }, pt.x - 85, pt.y - 35);
                return;
              }
            }
          } catch {
            /* fall through to tool drop */
          }
          const id = e.dataTransfer.getData('text/archflux-tool') as CanvasTool;
          if (!pt || !TOOLS.some((t) => t.id === id)) return;
          if (id === 'service' || id === 'gateway' || id === 'db' || id === 'stream') {
            addNode(id, pt.x, pt.y);
          } else {
            setTool(id);
            pushToast(`${id} tool active — click the canvas`);
          }
        }}
      >
        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 35, pointerEvents: 'none' }}>
            <div className="content-card" style={{ maxWidth: 380, textAlign: 'center', pointerEvents: 'auto' }} role="status" aria-label="Empty canvas">
              <img src="/icons/tools/select.svg" alt="" style={{ width: 28, height: 28, marginBottom: 4 }} />
              <div className="card-title" style={{ marginBottom: 4 }}>Empty canvas</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Start with a building block, load a blueprint, or restore the sample mesh.
              </p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn-xs btn-xs-primary" onClick={() => { setTool('service'); pushToast('Service tool active — click anywhere to place'); }}>+ Add service</button>
                <button className="btn-xs" onClick={() => navigate('/blueprints')}>Browse blueprints</button>
                <button className="btn-xs" onClick={resetDefaultNodes}>Restore sample</button>
                <button className="btn-xs" onClick={() => { newDoc(); pushToast('Started a blank diagram'); }}>New diagram</button>
              </div>
            </div>
          </div>
        )}
        {canvasError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45 }}>
            <div className="content-card" style={{ maxWidth: 400, textAlign: 'center' }} role="alert">
              <div className="card-title" style={{ marginBottom: 4 }}>Canvas unavailable</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                This browser could not provide a 2D drawing context. Your diagrams are
                safe in local storage — try another browser, or export your work from
                the Sync screen&apos;s file transfer.
              </p>
              <button className="btn-xs btn-xs-primary" onClick={() => navigate('/living')}>Go to file transfer</button>
            </div>
          </div>
        )}
        <canvas
          id="architectureCanvas"
          ref={canvasRef}
          role="img"
          aria-label={`Architecture diagram: ${nodes.length} nodes, ${edges.length} routes, ${remaining} lint issues. Use the node list below or arrow keys to explore.`}
          style={{ cursor: tool === 'text' ? 'text' : tool === 'pan' ? 'grab' : tool === 'draw' || tool === 'connector' ? 'crosshair' : 'default' }}
        />

        {/* Screen-reader traversal: full node + route list, keyboard native */}
        <nav className="sr-only" aria-label="Diagram nodes and routes">
          <ul>
            {nodes.map((n) => {
              const conns = edges.filter((e) => e.from === n.id || e.to === n.id);
              return (
                <li key={n.id} data-testid={`canvas-node-${n.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(n.id);
                      setSelectedEdgeId(null);
                      panToNode(n.id);
                    }}
                  >
                    {n.label}, {n.tag}, health {n.health}, {conns.length} connections{n.isOrphan ? ', isolated' : ''}
                  </button>
                </li>
              );
            })}
          </ul>
          <ul aria-label="Routes">
            {edges.map((e) => (
              <li key={e.id} data-testid={`canvas-route-${e.id}`}>
                Route {e.label}: {e.from} to {e.to ?? 'unresolved'}
              </li>
            ))}
          </ul>
        </nav>
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

<ToolPalette
          tool={tool}
          setTool={setTool}
          lockedTool={lockedTool}
          setLockedTool={setLockedTool}
          setPendingFrom={setPendingFrom}
          pushToast={pushToast}
          libOpen={libOpen}
          setLibOpen={setLibOpen}
        />

        {libOpen && (
          <div className="library-drawer" id="shape-library-drawer" role="dialog" aria-modal="false" aria-label="Shape library">
            <div className="linter-header">
              <div className="linter-title">
                <img src="/icons/general/database.svg" alt="" style={{ width: 16, height: 16, marginRight: 6 }} />
                <span>Shape Library</span>
                <span className="badge-count cyan">{libShapes.length}</span>
              </div>
              <button className="btn-xs" onClick={() => setLibOpen(false)}>Close ✕</button>
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                ref={libSearchRef}
                type="search"
                className="doc-title-input"
                style={{ background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                placeholder="Search shapes… (EC2, Kafka, Redis)"
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                aria-label="Search shapes"
              />
              {recentShapeIds.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Recently used</div>
                  <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }} role="group" aria-label="Recently used shapes">
                    {recentShapeIds.map((id) => {
                      const s = libraryShapes.find((sh) => sh.id === id);
                      if (!s) return null;
                      return (
                        <button
                          key={id}
                          className="btn-xs"
                          title={`${s.label} — ${s.tag}`}
                          aria-label={`Place recent shape ${s.label}, ${s.category} category`}
                          onClick={() => placeShapeAtCenter(s)}
                          style={{ flexShrink: 0 }}
                        >
                          {s.iconSrc ? (
                            <img src={s.iconSrc} alt="" style={{ width: 18, height: 18, display: 'block' }} />
                          ) : (
                            <span aria-hidden="true">{s.icon}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="tablist" aria-label="Shape categories">
                {(['all', 'general', 'compute', 'storage', 'database', 'network', 'messaging', 'observability'] as const).map((cat) => {
                  // Live counts reflect the current search (LIB-R2).
                  const inSearch = (s: LibraryShape) =>
                    !libQ || `${s.label} ${s.tag} ${s.provider} ${s.category}`.toLowerCase().includes(libQ);
                  const count = cat === 'all'
                    ? libraryShapes.filter(inSearch).length
                    : libraryShapes.filter((s) => s.category === cat && inSearch(s)).length;
                  return (
                    <button
                      key={cat}
                      role="tab"
                      aria-selected={libCategory === cat}
                      className={`btn-xs${libCategory === cat ? ' btn-xs-primary' : ''}`}
                      onClick={() => setLibCategory(cat)}
                    >
                      {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
                    </button>
                  );
                })}
              </div>
              <div className="lib-grid">
                {libShapes.map((s) => (
                  <button
                    key={s.id}
                    className="lib-shape"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/archflux-shape', JSON.stringify(s))}
                    onClick={() => placeShapeAtCenter(s)}
                    title={`${s.label} — ${s.tag}. Click to place, or drag onto canvas.`}
                  >
                    {s.iconSrc ? (
                      <img src={s.iconSrc} alt="" style={{ width: 28, height: 28 }} aria-hidden="true" />
                    ) : (
                      <span className="lib-shape-icon" aria-hidden="true">{s.icon}</span>
                    )}
                    <span className="lib-shape-label">{s.label}</span>
                    <span className="lib-shape-tag">{s.provider}</span>
                  </button>
                ))}
              </div>
              {libShapes.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No shapes match “{libQuery}”. <button className="btn-xs" style={{ marginLeft: 4 }} onClick={() => { setLibQuery(''); setLibCategory('all'); }}>Clear</button></div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)' }}>Click places at view center · drag places precisely</div>
            </div>
          </div>
        )}

        <div className="linter-inspector" id="linterDrawer" style={dockOpen ? undefined : { display: 'none' }}>
          <div className="utility-tabbar" role="tablist" aria-label="Right utility dock">
            <button
              role="tab"
              aria-selected={dockTab === 'inspector'}
              className={`utility-tab${dockTab === 'inspector' ? ' active' : ''}`}
              onClick={() => setDockTab('inspector')}
            >
              ▤ Inspector
            </button>
            <button
              role="tab"
              aria-selected={dockTab === 'linter'}
              className={`utility-tab${dockTab === 'linter' ? ' active' : ''}`}
              onClick={() => setDockTab('linter')}
            >
              🔍 Linter <span className="badge-count warn" id="linterCountBadge">{remaining}</span>
            </button>
            <button
              role="tab"
              aria-selected={dockTab === 'collab'}
              className={`utility-tab${dockTab === 'collab' ? ' active' : ''}`}
              onClick={() => setDockTab('collab')}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                  background: collab.connected ? 'var(--accent-emerald)' : 'var(--text-dim)',
                }}
              />
              Live{collab.users.length > 0 ? ` ${collab.users.length}` : ''}
            </button>
            <span style={{ flex: 1 }} />
            <button
              className="btn-xs"
              aria-label="Collapse inspector dock"
              title="Collapse dock (more canvas space)"
              onClick={() => setDockOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="utility-split">
            {dockTab === 'inspector' && (
              <div className="linter-body" role="tabpanel" aria-label="Contextual inspector" style={{ maxHeight: '50%' }} onScroll={(e) => { dockScrollRef.current.inspector = e.currentTarget.scrollTop; }}>
              {!selected && !selectedEdge && (
                <div className="callout-block">Nothing selected — click a node or route to edit its properties here.</div>
              )}
              <details style={{ marginTop: 6 }}>
                <summary style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Diagram outline ({nodes.length})
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, maxHeight: 180, overflowY: 'auto' }} role="list" aria-label="Diagram outline, top to bottom">
                  {[...nodes]
                    .sort((a, b) => a.y - b.y || a.x - b.x)
                    .map((n) => {
                      const conns = edges.filter((e) => e.from === n.id || e.to === n.id).length;
                      return (
                        <button
                          key={n.id}
                          role="listitem"
                          className={`btn-xs${n.id === selectedId ? ' btn-xs-primary' : ''}`}
                          aria-current={n.id === selectedId}
                          aria-label={`${n.label}, ${n.tag}, ${conns} connections`}
                          title={`${n.label} — ${n.tag} (${conns} connections). Activate to inspect.`}
                          style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                          onClick={() => {
                            setSelectedId(n.id);
                            setSelectedEdgeId(null);
                            panToNode(n.id);
                          }}
                        >
                          {n.label} · {conns}↔
                        </button>
                      );
                    })}
                  {nodes.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No nodes yet.</div>
                  )}
                </div>
              </details>
              {selected && (
              <div>
                <div className="dock-headline"><span>Inspector</span><span>{selected.type}</span></div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Label
                  <input id="inspector-label" className="doc-title-input" style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2 }} value={selected.label} onFocus={() => checkpointInspector(selected.id)} onChange={(e) => updateNode(selected.id, { label: e.target.value })} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>Tag
                  <input className="doc-title-input" style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2 }} value={selected.tag} onFocus={() => checkpointInspector(selected.id)} onChange={(e) => updateNode(selected.id, { tag: e.target.value })} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>Status
                  <input className="doc-title-input" style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2 }} value={selected.health} onFocus={() => checkpointInspector(selected.id)} onChange={(e) => updateNode(selected.id, { health: e.target.value })} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>Details (inside node)
                  <textarea
                    className="doc-title-input"
                    style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2, resize: 'vertical' }}
                    value={selected.details ?? ''}
                    onChange={(e) => updateNode(selected.id, { details: e.target.value || undefined })}
                    placeholder="Enter node details..."
                  />
                </label>
                <Swatches values={[null, ...FILL_SWATCHES]} current={selected.fill} nullLabel="Automatic fill" label="Fill" onPick={(v) => { checkpointInspector(`fill:${selected.id}`); updateNode(selected.id, { fill: v ?? undefined }); }} />
                <Swatches values={BORDER_SWATCHES} current={selected.stroke} nullLabel="" label="Border" onPick={(v) => { if (v) { checkpointInspector(`stroke:${selected.id}`); updateNode(selected.id, { stroke: v }); } }} />
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Provider Icon</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Provider icon">
                    {NODE_ICONS.map((icon) => {
                      const iconName = icon.split('/').pop()?.replace(/\.svg$/i, '') ?? 'icon';
                      return (
                        <button
                          key={icon}
                          className="btn-xs"
                          aria-pressed={selected.icon === icon}
                          aria-label={`Provider icon ${iconName}`}
                          title={`Provider icon ${iconName}`}
                          onClick={() => { checkpointInspector(`icon:${selected.id}`); updateNode(selected.id, { icon }); }}
                          style={selected.icon === icon ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : undefined}
                        >
                          <img src={icon} alt="" style={{ width: 20, height: 20, display: 'block' }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Border Stroke Width</div>
                  <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Border stroke width">
                    {NODE_STROKE_WIDTHS.map((w) => (
                      <button
                        key={w}
                        className={`btn-xs${(selected.strokeWidth ?? (2.5)) === w ? ' btn-xs-primary' : ''}`}
                        onClick={() => { checkpointInspector(`sw:${selected.id}`); updateNode(selected.id, { strokeWidth: w }); }}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Shape</div>
                  <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Node shape">
                    {(['rectangle', 'rounded', 'logo', 'cylinder'] as const).map((sh) => (
                      <button
                        key={sh}
                        className={`btn-xs${(selected.shape ?? 'rectangle') === sh ? ' btn-xs-primary' : ''}`}
                        onClick={() => { checkpointInspector(`shape:${selected.id}`); updateNode(selected.id, { shape: sh }); }}
                        aria-label={`Node shape ${sh}`}
                        title={sh}
                      >
                        {sh === 'rectangle' ? '▭' : sh === 'rounded' ? '⬚' : sh === 'logo' ? '🖼' : '⛁'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Metadata</div>
                  {([
                    ['port', 'Port (e.g. :8080 / 5432)'],
                    ['repo', 'Repo link (e.g. org/service)'],
                    ['source', 'Source spec (e.g. k8s/deploy.yaml)'],
                  ] as const).map(([field, placeholder]) => (
                    <input
                      key={field}
                      className="doc-title-input"
                      style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 4, fontSize: 11, fontFamily: 'var(--mono-font)' }}
                      placeholder={placeholder}
                      aria-label={`Node ${field}`}
                      value={selected[field] ?? ''}
                      onFocus={() => checkpointInspector(`${field}:${selected.id}`)}
                      onChange={(e) => updateNode(selected.id, { [field]: e.target.value } as Partial<ArchNode>)}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn-xs" onClick={() => panToNode(selected.id)}>Focus</button>
                  <button className="btn-xs" onClick={duplicateSelected}>Duplicate</button>
                  <button className="btn-xs" onClick={deleteSelected} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)', marginTop: 6 }}>Arrows nudge • Del deletes</div>
              </div>
              )}
              {selectedEdge && !selected && (() => {
                const from = nodes.find((n) => n.id === selectedEdge.from);
                const to = selectedEdge.to ? nodes.find((n) => n.id === selectedEdge.to) : null;
                return (
                <div>
                  <div className="dock-headline"><span>Route Inspector</span><span>{selectedEdge.isDangling ? 'dangling' : 'route'}</span></div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', marginBottom: 6 }}>
                    {(from?.label ?? selectedEdge.from)} → {(to?.label ?? '∅')}
                  </div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Label
                    <input className="doc-title-input" style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2 }} value={selectedEdge.label} onFocus={() => checkpointInspector(`e:${selectedEdge.id}`)} onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value })} />
                  </label>
                  <Swatches values={BORDER_SWATCHES} current={selectedEdge.color} nullLabel="" label="Color" onPick={(v) => { if (v) { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { color: v }); } }} />
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Protocol Tag</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Protocol tag">
                      {PROTOCOLS.map((p) => (
                        <button
                          key={p}
                          className={`btn-xs${selectedEdge.protocol === p ? ' btn-xs-primary' : ''}`}
                          onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { protocol: p }); }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Line Style</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }} role="group" aria-label="Line style">
                    {(['solid', 'dashed', 'dotted'] as const).map((ls) => {
                      const active = (selectedEdge.lineStyle ?? (selectedEdge.dashed ? 'dashed' : 'solid')) === ls;
                      return (
                        <button
                          key={ls}
                          className={`btn-xs${active ? ' btn-xs-primary' : ''}`}
                          onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { lineStyle: ls, dashed: ls === 'dashed' }); }}
                        >
                          {ls[0].toUpperCase() + ls.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Arrow Heads</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }} role="group" aria-label="Arrow head configuration">
                    {(['end', 'both', 'none'] as const).map((a) => (
                      <button
                        key={a}
                        className={`btn-xs${(selectedEdge.arrow ?? 'end') === a ? ' btn-xs-primary' : ''}`}
                        onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { arrow: a }); }}
                      >
                        {a === 'end' ? '→ End' : a === 'both' ? '↔ Both' : '— None'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn-xs" onClick={() => panToNode(selectedEdge.from)}>Focus</button>
                    <button className="btn-xs" onClick={() => { deleteEdge(selectedEdge.id); setSelectedEdgeId(null); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete route</button>
                  </div>
                </div>
                );
              })()}
              {selectedText && !selected && !selectedEdge && !selToolbarPos && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border-panel)', paddingTop: 8 }}>
                  <div className="dock-headline"><span>Text Style</span><span>{selectedText.fontSize}px</span></div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Content
                    <textarea
                      rows={2}
                      className="doc-title-input"
                      style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2, fontFamily: "'Caveat', cursive", fontSize: 15, resize: 'vertical' }}
                      value={selectedText.text}
                      onFocus={() => checkpointInspector(`t:${selectedText.id}`)}
                      onChange={(e) => updateText(selectedText.id, { text: e.target.value })}
                      aria-label="Text content"
                    />
                  </label>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Font</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }} role="group" aria-label="Font family">
                    {(['Caveat', 'Patrick Hand', 'Plus Jakarta Sans', 'Fira Code'] as const).map((f) => (
                      <button
                        key={f}
                        className={`btn-xs${(selectedText.fontFamily ?? 'Caveat') === f ? ' btn-xs-primary' : ''}`}
                        title={f}
                        aria-label={`Font ${f}`}
                        style={{ fontFamily: `'${f}', ${f === 'Fira Code' ? 'monospace' : f === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive'}` }}
                        onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fontFamily: f }); }}
                      >
                        Ag
                      </button>
                    ))}
                    <button
                      className={`btn-xs${selectedText.bold ? ' btn-xs-primary' : ''}`}
                      aria-pressed={!!selectedText.bold}
                      aria-label="Bold"
                      title="Bold"
                      style={{ fontWeight: 800 }}
                      onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { bold: !selectedText.bold }); }}
                    >
                      B
                    </button>
                    <button
                      className={`btn-xs${selectedText.italic ? ' btn-xs-primary' : ''}`}
                      aria-pressed={!!selectedText.italic}
                      aria-label="Italic"
                      title="Italic"
                      style={{ fontStyle: 'italic' }}
                      onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { italic: !selectedText.italic }); }}
                    >
                      I
                    </button>
                  </div>
                  <Swatches values={BORDER_SWATCHES} current={selectedText.color} nullLabel="" label="Color" onPick={(v) => { if (v) { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { color: v }); } }} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Size</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }} role="group" aria-label="Text size">
                    {[16, 20, 28, 36].map((sz) => (
                      <button
                        key={sz}
                        className={`btn-xs${selectedText.fontSize === sz ? ' btn-xs-primary' : ''}`}
                        onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fontSize: sz }); }}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Background</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Background fill">
                    <button
                      className={`btn-xs${(selectedText.fill ?? 'transparent') === 'transparent' ? ' btn-xs-primary' : ''}`}
                      title="Transparent background"
                      onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fill: 'transparent', border: false }); }}
                    >
                      ∅
                    </button>
                    {['#FEF3C7', '#DBEAFE', '#DCFCE7', '#FEE2E2', '#EDE9FE', '#1F2937'].map((c) => (
                      <button
                        key={c}
                        aria-label={`Background ${c}`}
                        title={`Background ${c}`}
                        onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fill: c }); }}
                        style={{
                          width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                          border: selectedText.fill === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                          background: c,
                        }}
                      />
                    ))}
                    <button
                      className={`btn-xs${selectedText.border ? ' btn-xs-primary' : ''}`}
                      aria-pressed={!!selectedText.border}
                      title="Border around background (needs a fill)"
                      disabled={(selectedText.fill ?? 'transparent') === 'transparent'}
                      onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { border: !selectedText.border }); }}
                    >
                      ▢
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn-xs" onClick={() => { draftCommitted.current = false; liveTextRef.current = null; liveSnapRef.current = false; setTextDraft({ x: selectedText.x, y: selectedText.y, value: selectedText.text, editingId: selectedText.id }); }}>Edit on canvas</button>
                    <button className="btn-xs" onClick={() => { deleteText(selectedText.id); setSelectedTextId(null); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border-panel)', paddingTop: 8 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Jump to node
                  <select
                    className="theme-select"
                    style={{ width: '100%', marginTop: 4 }}
                    value=""
                    onChange={(e) => { if (e.target.value) panToNode(e.target.value); }}
                    aria-label="Jump to node"
                  >
                    <option value="">Select a node… ({nodes.length})</option>
                    {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </label>
              </div>
              </div>
            )}
            {dockTab === 'collab' && (
              <div className="linter-body" role="tabpanel" aria-label="Live collaborators" style={{ padding: 0, overflow: 'hidden' }} onScroll={(e) => { dockScrollRef.current.collab = e.currentTarget.scrollTop; }}>
                <CollaborationPanel diagramId={activeDocId} embedded />
              </div>
            )}
            {dockTab === 'linter' && (
            <>
          <div className="linter-header">
            <div className="linter-title">
              <span>🔍 Architecture Linter</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-xs btn-xs-primary" onClick={healAll}>
                Auto-Heal All
              </button>
            </div>
          </div>
          <div className="linter-body" id="linterCardsContainer" role="tabpanel" aria-label="Architecture linter" onScroll={(e) => { dockScrollRef.current.linter = e.currentTarget.scrollTop; }}>
            {remaining === 0 ? (
              <div className="lint-card" style={{ borderLeft: '3px solid var(--accent-emerald)' }}>
                <div className="lint-head" style={{ color: 'var(--accent-emerald)' }}>
                  ✓ Zero Lint Errors
                </div>
                <p className="lint-desc">All microservices have valid bus connectors and strict port bindings.</p>
              </div>
            ) : (
              <>
                {orphans.map((n) => (
                  <div key={n.id} className="lint-card warn" onClick={() => panToNode(n.id)} role="button" tabIndex={0} aria-label={`Isolated node ${n.label} — activate to inspect`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panToNode(n.id); } }}>
                    <div className="lint-head">
                      <span style={{ color: 'var(--accent-amber)' }}>⚠️ Isolated: {n.label}</span>
                      <span>Topology</span>
                    </div>
                    <p className="lint-desc"><strong>{n.label}</strong> isn&apos;t connected to anything yet. Bind it or delete it.</p>
                    <div className="lint-btn-row">
                      <button className="btn-xs" onClick={(e) => { e.stopPropagation(); panToNode(n.id); }}>Inspect</button>
                      <button className="btn-xs btn-xs-primary" onClick={(e) => { e.stopPropagation(); setSelectedId(n.id); setSelectedEdgeId(null); healOrphan(n.id); }}>Auto-bind</button>
                    </div>
                  </div>
                ))}
                {danglings.map((e) => (
                  <div key={e.id} className="lint-card danger" onClick={() => panToNode(e.from)} role="button" tabIndex={0} aria-label={`Dangling wire from ${e.from} — activate to inspect`} onKeyDown={(e2) => { if (e2.key === 'Enter' || e2.key === ' ') { e2.preventDefault(); panToNode(e.from); } }}>
                    <div className="lint-head">
                      <span style={{ color: 'var(--accent-rose)' }}>🚫 Dangling: {e.from} → ∅</span>
                      <span>Routing</span>
                    </div>
                    <p className="lint-desc">Wire <strong>{e.id}</strong> terminates in empty space. Prune or reconnect.</p>
                    <div className="lint-btn-row">
                      <button className="btn-xs" onClick={(ev) => { ev.stopPropagation(); panToNode(e.from); }}>Inspect</button>
                      <button className="btn-xs btn-xs-primary" onClick={(ev) => { ev.stopPropagation(); pruneWire(e.id); }}>Prune Wire</button>
                    </div>
                  </div>
                ))}
                {ambiguous.map((e) => (
                  <div key={e.id} className="lint-card warn" onClick={() => panToNode(e.from)} role="button" tabIndex={0} aria-label={`Protocol ambiguity on route ${e.label || e.id} — activate to inspect`} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); panToNode(e.from); } }}>
                    <div className="lint-head">
                      <span style={{ color: 'var(--accent-amber)' }}>❓ Protocol Ambiguity: {e.label || e.id}</span>
                      <span>Contract</span>
                    </div>
                    <p className="lint-desc">Inter-service route <strong>{e.from} → {e.to}</strong> has no protocol tag. Highlight the node or tag it.</p>
                    <div className="lint-btn-row">
                      <button className="btn-xs" onClick={(ev) => { ev.stopPropagation(); panToNode(e.from); }}>Inspect</button>
                      <button className="btn-xs btn-xs-primary" onClick={(ev) => { ev.stopPropagation(); tagProtocol(e.id, 'REST'); }}>Tag REST</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          </>
        )}
        </div>
        </div>

        {miniOpen ? (
          <div className="minimap-wrap">
            <div className="minimap-head">
              <span>Map</span>
              <button
                className="btn-xs"
                data-testid="minimap-toggle"
                onClick={() => setMiniOpenPersisted(false)}
                aria-label="Hide minimap"
                title="Hide minimap"
              >
                ✕
              </button>
            </div>
            <canvas
              ref={miniCanvasRef}
              id="minimapCanvas"
              width={160}
              height={100}
              onClick={onMinimapClick}
              style={{ width: 160, height: 100, display: 'block', cursor: 'pointer' }}
              role="img"
              aria-label="Minimap overview — activate to center the canvas here"
            />
          </div>
        ) : (
          <button
            className="minimap-toggle"
            data-testid="minimap-toggle"
            onClick={() => setMiniOpenPersisted(true)}
            aria-label="Show minimap"
            title="Minimap overview"
          >
            🗺
          </button>
        )}

        {pendingFrom && (
          <div className="connect-hint" role="status">
            <span>◉ Connecting from <strong>{nodes.find((n) => n.id === pendingFrom)?.label ?? pendingFrom}</strong> — click a target node · Esc to cancel</span>
            <button className="btn-xs" onClick={() => setPendingFrom(null)}>Esc</button>
          </div>
        )}

        {commentFor && (
          <div style={{ position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: 380, maxWidth: '92vw' }}>
            <div ref={composerTrap} className="content-card" style={{ padding: 12 }} role="dialog" aria-label={`Comment on ${commentFor.label}`}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>💬 Pin review on [{commentFor.label}]</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono-font)', marginBottom: 6 }} data-testid="comment-location">
                {sourceModeForDoc(activeDocId) === 'local' ? 'Saved on this device only' : 'Shared with collaborators'}
              </div>
              <textarea
                autoFocus
                rows={3}
                maxLength={COMMENT_MAX}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="e.g. Should we use outbox pattern here?"
                aria-label="Review comment text"
                aria-describedby="comment-counter"
                style={{ width: '100%', resize: 'vertical', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 8px', fontSize: 14, fontFamily: 'var(--hand-font)', color: 'var(--text-main)' }}
              />
              <div id="comment-counter" style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)', textAlign: 'right', marginTop: 2 }}>
                {commentText.length}/{COMMENT_MAX}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                <button className="btn-xs" onClick={() => setCommentFor(null)}>Cancel</button>
                <button
                  className="btn-xs btn-xs-primary"
                  disabled={!commentText.trim()}
                  onClick={() => { addThread(commentFor.id, commentText, commentFor.label); setCommentFor(null); setCommentText(''); }}
                >
                  Post pin
                </button>
              </div>
            </div>
          </div>
        )}

        {textDraft && (() => {
          const editing = textDraft.editingId ? texts.find((t) => t.id === textDraft.editingId) : null;
          const fam = editing?.fontFamily ?? 'Caveat';
          const generic = fam === 'Fira Code' ? 'monospace' : fam === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive';
          return (
          <textarea
            autoFocus
            ref={(el) => { el?.focus(); }}
            rows={2}
            value={textDraft.value}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitTextDraft();
              } else if (e.key === 'Escape') {
                // Esc finishes (commits) — a typed draft is never discarded.
                e.stopPropagation();
                commitTextDraft();
              }
            }}
            onBlur={() => {
              // Commit on genuine blur (e.g. clicking into side panels, which
              // never fires canvas pointerdown). Guarded: remount/unmount blurs
              // and post-Enter/post-Esc blurs are skipped via the flag + empty check.
              if (!draftCommitted.current && textDraft.value.trim()) commitTextDraft();
            }}
            placeholder="Type anything…"
            aria-label={textDraft.editingId ? 'Edit text' : 'Type anything'}
            style={{
              position: 'absolute',
              left: Math.min(Math.max(textDraft.x * zoom + pan.x, 8), Math.max(8, (viewportRef.current?.clientWidth ?? window.innerWidth) - 140)),
              top: Math.min(Math.max(textDraft.y * zoom + pan.y - 24 * zoom, 8), Math.max(8, (viewportRef.current?.clientHeight ?? window.innerHeight) - 60)),
              zIndex: 45,
              minWidth: 120,
              maxWidth: 480,
              background: 'transparent',
              border: '1px dashed var(--accent-cyan)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: Math.max(14, (editing?.fontSize ?? 20) * zoom),
              lineHeight: 1.3,
              fontFamily: `'${fam}', ${generic}`,
              fontWeight: editing?.bold ? 700 : 600,
              fontStyle: editing?.italic ? 'italic' : 'normal',
              color: editing?.color ?? (theme === 'dark' ? '#F9FAFB' : '#1F2937'),
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              fieldSizing: 'content',
            } as React.CSSProperties}
          />
          );
        })()}

        {selectedStroke && selToolbarPos && (
          <div style={{ position: 'absolute', left: selToolbarPos.left, top: selToolbarPos.top, transform: 'translateX(-50%)', zIndex: 40, maxWidth: 'min(94vw, 700px)' }}>
            <div className="content-card" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', maxWidth: 'min(94vw, 700px)' }} role="dialog" aria-label="Ink stroke style">
              <span style={{ fontSize: 12, fontWeight: 700 }}>✏️ Ink</span>
              <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Ink color">
                {STROKE_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Ink color ${c}`}
                    title={c}
                    onClick={() => { checkpoint(false); updateStroke(selectedStroke.id, { color: c }); }}
                    style={{
                      width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                      border: selectedStroke.color === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                      background: c,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Ink width">
                {STROKE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    className={`btn-xs${selectedStroke.width === w ? ' btn-xs-primary' : ''}`}
                    onClick={() => { checkpoint(false); updateStroke(selectedStroke.id, { width: w }); }}
                  >
                    {w}px
                  </button>
                ))}
              </div>
              <button className="btn-xs" onClick={() => { deleteStroke(selectedStroke.id); setSelectedStrokeId(null); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
              <button className="btn-xs" onClick={() => setSelectedStrokeId(null)}>Done</button>
            </div>
          </div>
        )}

        {selectedText && selToolbarPos && (
          <div style={{ position: 'absolute', left: selToolbarPos.left, top: selToolbarPos.top, transform: 'translateX(-50%)', zIndex: 40, maxWidth: 'min(94vw, 700px)' }}>
            <div className="content-card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 'min(94vw, 700px)' }} role="dialog" aria-label="Text style">
              <span style={{ fontSize: 12, fontWeight: 700 }}>T Text</span>
              <button
                className="btn-xs"
                onClick={() => { draftCommitted.current = false; liveTextRef.current = null; liveSnapRef.current = false; setTextDraft({ x: selectedText.x, y: selectedText.y, value: selectedText.text, editingId: selectedText.id }); }}
              >
                Edit
              </button>
              <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Font family">
                {(['Caveat', 'Patrick Hand', 'Plus Jakarta Sans', 'Fira Code'] as const).map((f) => (
                  <button
                    key={f}
                    className={`btn-xs${(selectedText.fontFamily ?? 'Caveat') === f ? ' btn-xs-primary' : ''}`}
                    aria-label={`Font ${f}`}
                    title={f}
                    style={{ fontFamily: `'${f}', ${f === 'Fira Code' ? 'monospace' : f === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive'}` }}
                    onClick={() => { checkpoint(false); updateText(selectedText.id, { fontFamily: f }); }}
                  >
                    Ag
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Bold and italic">
                <button
                  className={`btn-xs${selectedText.bold ? ' btn-xs-primary' : ''}`}
                  aria-pressed={!!selectedText.bold}
                  aria-label="Bold"
                  title="Bold"
                  style={{ fontWeight: 800 }}
                  onClick={() => { checkpoint(false); updateText(selectedText.id, { bold: !selectedText.bold }); }}
                >
                  B
                </button>
                <button
                  className={`btn-xs${selectedText.italic ? ' btn-xs-primary' : ''}`}
                  aria-pressed={!!selectedText.italic}
                  aria-label="Italic"
                  title="Italic"
                  style={{ fontStyle: 'italic' }}
                  onClick={() => { checkpoint(false); updateText(selectedText.id, { italic: !selectedText.italic }); }}
                >
                  I
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Text color">
                {STROKE_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Text color ${c}`}
                    title={c}
                    onClick={() => { checkpoint(false); updateText(selectedText.id, { color: c }); }}
                    style={{
                      width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                      border: selectedText.color === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                      background: c,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Text size">
                {[16, 20, 28, 36].map((sz) => (
                  <button
                    key={sz}
                    className={`btn-xs${selectedText.fontSize === sz ? ' btn-xs-primary' : ''}`}
                    onClick={() => { checkpoint(false); updateText(selectedText.id, { fontSize: sz }); }}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} role="group" aria-label="Background fill">
                <button
                  className={`btn-xs${(selectedText.fill ?? 'transparent') === 'transparent' ? ' btn-xs-primary' : ''}`}
                  title="Transparent background"
                  onClick={() => { checkpoint(false); updateText(selectedText.id, { fill: 'transparent', border: false }); }}
                >
                  ∅
                </button>
                {['#FEF3C7', '#DBEAFE', '#DCFCE7', '#FEE2E2', '#EDE9FE', '#1F2937'].map((c) => (
                  <button
                    key={c}
                    aria-label={`Background ${c}`}
                    title={`Background ${c}`}
                    onClick={() => { checkpoint(false); updateText(selectedText.id, { fill: c }); }}
                    style={{
                      width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                      border: selectedText.fill === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                      background: c,
                    }}
                  />
                ))}
                <button
                  className={`btn-xs${selectedText.border ? ' btn-xs-primary' : ''}`}
                  aria-pressed={!!selectedText.border}
                  title="Toggle border around background (needs a fill)"
                  disabled={(selectedText.fill ?? 'transparent') === 'transparent'}
                  onClick={() => { checkpoint(false); updateText(selectedText.id, { border: !selectedText.border }); }}
                >
                  ▢
                </button>
              </div>
              <button className="btn-xs" onClick={() => { deleteText(selectedText.id); setSelectedTextId(null); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
              <button className="btn-xs" onClick={() => setSelectedTextId(null)}>Done</button>
            </div>
          </div>
        )}
      </div>
      {!dockOpen && (
        <button
          className="panel-reopen"
          data-testid="dock-reopen"
          aria-label="Open inspector dock"
          title="Open inspector dock"
          onClick={() => setDockOpen(true)}
        >
          ▤ Inspector
        </button>
      )}
    </div>
  );
}
