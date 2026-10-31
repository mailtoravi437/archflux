import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HistoryPanel from '../components/history/HistoryPanel';
import { isServerDocId } from '../lib/honesty';
import { useDiagram, useDiagramActions, useDiagramUI } from '../state/useDiagram';
import type { CanvasTool } from '../state/useDiagram';
import type { ArchNode, FreeText, LibraryShape } from '../types';
import { libraryShapes } from '../canvas/ShapeRegistry';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  distToSegment,
  edgePoints,
  effectiveNodeStyle,
  iconTileSize,
  hitResizeHandle,
  hitPort,
  hitsPageLinkBadge,
  pageLinkBadge,
  hitsNode,
  nodeBounds,
  nearestPort,
  nodePorts,
  resizeFromCorner,
  snapNode,
  type GuideLine,
  type PortSide,
  type ResizeHandleId,
} from '../lib/canvasGeometry';
import { ToolPalette } from '../components/ToolPalette';
import { CollaborationPanel, PresencePill } from '../components/CollaborationPanel';
import { useCollaboration } from '../hooks/useCollaboration';
import {
  drawEdgeLabelPass,
  drawEdgePass,
  drawFreeTextPass,
  drawInkPass,
  drawNodePass,
  drawSelectionHandles,
  drawThreadPinPass,
} from '../canvas/render';
import { recordShapeUse } from './canvas/recentShapes';
import { loadIconManifest } from '../lib/icons';
import type { IconEntry } from '../lib/icons';
import { useVendorIcons } from './canvas/useVendorIcons';
import { useCanvasKeyboard } from './canvas/useCanvasKeyboard';
import { pageView, lockedLayerIds, isEffectivelyLocked } from '../lib/pageView';
import { routeEdges, visibleNodes } from '../lib/containmentCollapse';
import { ancestorsOf, containerAt, depthOf, hitsBoundaryChrome } from '../lib/containment';
import { PortHandles } from './canvas/PortHandles';
import { ContextMenu } from './canvas/ContextMenu';
import { FindBar } from './canvas/FindBar';
import ReadOnlyBanner from '../components/access/ReadOnlyBanner';
import RequestAccess from '../components/access/RequestAccess';
import { canEdit } from '../lib/access';
import { getSession, isSignedIn } from '../state/session';
import { PagesBar } from './canvas/PagesBar';
import { LayersPanel } from './canvas/LayersPanel';
import { listCommands, recordCommandUse, type CommandContext } from '../lib/commands';
import type { FindMatch } from '../state/ops/findReplace';
import { useCanvasCommands } from './canvas/useCanvasCommands';
import { AiAssistantPanel } from './canvas/AiAssistantPanel';
import { Inspector } from './canvas/Inspector';
import { InkToolbar, TextToolbar } from './canvas/SelectionToolbars';
import { ShapeLibrary } from '../design-system/components/ShapeLibrary';
import { TILE_DRAG_MIME } from '../lib/shapeTiles';
import { Minimap } from './canvas/Minimap';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { CommentComposer } from './canvas/CommentComposer';
import { useRemoteCursors } from './canvas/useRemoteCursors';
import { useCollabGraphSync } from './canvas/useCollabGraphSync';
import { TextDraftEditor } from './canvas/TextDraftEditor';
import { ContextToolbar } from './canvas/ContextToolbar';
import { NodeIconPicker } from '../components/NodeIconPicker';
import { useFormatPainter } from './canvas/useFormatPainter';
import { hitEdgeHandle, insertWaypoint, moveWaypoint, snapCoord } from './canvas/edgeHandles';
import { edgeHops, labelPosFromPoint } from '../canvas/render/edges';
import { isBoundaryNode, orderForPaint } from '../canvas/render/boundaries';
import { resolveIcon } from '../lib/icons';
import { InlineEditor, type InlineEditPatch, type InlineField } from './canvas/InlineEditor';
import { CanvasUnavailable, DiagramNodeList, EmptyCanvasOverlay } from './canvas/CanvasOverlays';
import { CanvasLocalContext, type CanvasLocalValue } from './canvas/CanvasLocalContext';

// Tests import these from CanvasScreen; the implementation lives in canvas/recentShapes.
export { pushRecentShape, loadRecentShapes } from './canvas/recentShapes';

/** Canvas tools (ids and names). The rail's order, icons and labels live in ToolPalette (R1-E14-T02). */
export const TOOLS: { id: CanvasTool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Pan' },
  { id: 'service', label: 'Service' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'db', label: 'Database' },
  { id: 'stream', label: 'Queue' },
  { id: 'connector', label: 'Connect' },
  { id: 'draw', label: 'Draw' },
  { id: 'text', label: 'Text' },
  { id: 'comment', label: 'Comment' },
];

export const LOCKABLE: CanvasTool[] = ['service', 'gateway', 'db', 'stream', 'connector', 'comment'];

/** Shared edge geometry: polyline points used by both draw and hit-testing. */

/** Type guard for the JSON the Shapes panel puts on the drag (an ArchNode with a size). */
function isTileNode(v: unknown): v is ArchNode {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.label === 'string' && typeof o.w === 'number' && typeof o.h === 'number'
    && typeof o.x === 'number' && typeof o.y === 'number';
}

export default function CanvasScreen() {
  const {
    theme,
    nodes: allNodes,
    edges: allEdges,
    strokes: allStrokes,
    pages,
    layers,
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
    panToNode,
    undo,
    redo,
    addNode,
    deleteSelected,
    deleteNodes,
    duplicateSelected,
    placeShape,
    insertNode,
    pasteStyle,
    updateNode,
    setDisplayStyle,
    moveNode,
    moveWithChildren,
    setParent,
    growBoundaries,
    createBoundary,
    toggleCollapse,
    fitToContents,
    deleteBoundary,
    addLaneBelow,
    checkpoint,
    deleteEdge,
    updateEdge,
    connectNodes,
    addThread,
    addStroke,
    moveStroke,
    deleteStroke,
    pushToast,
    threads,
    texts: allTexts,
    addText,
    updateText,
    moveText,
    deleteText,
    activeDocId,
    activePageId,
    docs,
    openDoc,
    checkpoints,
    restoreCheckpoint,
    reloadActiveDoc,
    role,
    docTitle,
    setActivePageId,
    align,
    distribute,
    matchSize,
    zOrder,
    setLocked,
    loadGraph,
    docDefaults,
  } = useDiagram();

  // R1-E03-T04/T05: the canvas works on the active page's visible layers only.
  const view = useMemo(
    () => pageView({ nodes: allNodes, edges: allEdges, strokes: allStrokes, texts: allTexts, pages, layers }, activePageId),
    [allNodes, allEdges, allStrokes, allTexts, pages, layers, activePageId],
  );
  const { strokes, texts } = view;
  // R1-E03-T03: the children of a collapsed boundary are neither drawn nor hit-tested, and edges to them
  // run to the chip (merged per external endpoint, with a count).
  const pageNodes = view.nodes;
  const nodes = useMemo(() => visibleNodes(pageNodes), [pageNodes]);
  const routed = useMemo(() => routeEdges(pageNodes, view.edges), [pageNodes, view.edges]);
  const edges = useMemo(() => routed.map((r) => r.edge), [routed]);
  const edgeCounts = useMemo(() => new Map(routed.filter((r) => r.count > 1).map((r) => [r.edge.id, r.count] as const)), [routed]);
  const lockedLayers = useMemo(() => lockedLayerIds(layers), [layers]);
  const layerOrder = useMemo(() => new Map(layers.map((l) => [l.id, l.order] as const)), [layers]);
  const [layersOpen, setLayersOpen] = useState(false);
  // R1-E07-T06: below editor the canvas is read-only. Edit tools are hidden and the store refuses edits too.
  const editable = canEdit(role);
  const [requestOpen, setRequestOpen] = useState(false);
  const requestTrap = useFocusTrap<HTMLDivElement>(requestOpen);
  useEffect(() => {
    if (!editable && tool !== 'select' && tool !== 'pan' && !(tool === 'comment' && role === 'commenter')) setTool('select');
  }, [editable, tool, role, setTool]);

  // Real-time collaboration: shared Y.Doc per active document.
  const collab = useCollaboration(activeDocId ?? null);
  useCollabGraphSync({ collab, activeDocId, nodes: allNodes, edges: allEdges, strokes: allStrokes, texts: allTexts, loadGraph, pushToast });

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
  // Latest backing-store resize (set by the setup effect), used by the ResizeObserver.
  const resizeRef = useRef<() => void>(() => {});
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  // Click-vs-drag: a second node click arms a connection that only completes
  // on pointer-up without a move, so dragging never spawns stray edges.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  // Inline text editor draft (Excalidraw-style click-to-type). editingId set when editing existing text.
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string; editingId: string | null } | null>(null);
  // Live mirror so unmount/beforeunload handlers can rescue an open draft.
  const textDraftRef = useRef<typeof textDraft>(null);
  textDraftRef.current = textDraft;
  // R1-E02-T06: inline name/technology editor open on a node.
  const [nodeEdit, setNodeEdit] = useState<{ id: string; field: InlineField } | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  // In-progress freehand ink (committed to the store on pointer-up).
  const [ink, setInk] = useState<{ x: number; y: number }[] | null>(null);
  const inkRef = useRef<{ pts: { x: number; y: number }[] } | null>(null);
  // Live refs for the write-through draft session.
  const liveTextRef = useRef<string | null>(null);
  const liveSnapRef = useRef(false);
  // Guards the blur-after-unmount commit (Enter/Esc unmount fires blur too).
  const draftCommitted = useRef(false);
  // Vendor icon cache bridge + preload readiness (canvas/useVendorIcons).
  const { iconsAdapter, iconsReady } = useVendorIcons();

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
  const placeShapeRecorded = (shape: LibraryShape, x: number, y: number) => {
    recordShapeUse(shape.id);
    placeShape(shape, x, y);
  };
  const libPanelRef = useRef<HTMLDivElement | null>(null);
  // Non-modal drawer: move focus to search on open (SHP-R8); return it to the
  // rail toggle on close so keyboard users are not stranded.
  useEffect(() => {
    if (libOpen) {
      const t = window.setTimeout(() => libPanelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [libOpen]);
  // Unified right utility dock: Inspector / AI assistant (R2 placeholder) / Live / History (R1-E14-T10).
  // Selection auto-switches to Inspector; the left dock keeps canvas-wide tools.
  const [dockTab, setDockTab] = useState<'inspector' | 'assistant' | 'collab' | 'history'>('inspector');
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
  // Coalesces inspector focus events: one undo step per selected node.
  const inspectorCkpt = useRef<string | null>(null);
  const checkpointInspector = (id: string) => {
    if (inspectorCkpt.current !== id) {
      inspectorCkpt.current = id;
      checkpoint(false);
    }
  };
  // Selected-edge handle drag (waypoint, "+" midpoint, label pill); `moved` lives in dragRef.
  const edgeDragRef = useRef<{ edgeId: string; kind: 'wp' | 'mid' | 'label'; index: number; waypoints: { x: number; y: number }[] } | null>(null);
  const dragRef = useRef<{
    mode: 'node' | 'pan' | 'stroke' | 'text' | 'resize' | 'connect' | 'edge' | 'create' | null;
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
    ox?: number;
    oy?: number;
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
  // Node under the pointer (R1-E14-T02, §5A.5 hover: shadow + ports). Ref, not state: hover
  // repaints the canvas without re-rendering React.
  const hoveredRef = useRef<string | null>(null);
  // Boundary highlighted while a node is dragged over it (R1-E03-T02).
  const dropTargetRef = useRef<string | null>(null);
  // R1-E04-T05: ports show on the hovered node; a port drag keeps its source/target in `portDrag`.
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [portDrag, setPortDrag] = useState<{ sourceId: string; from: { x: number; y: number }; to: { x: number; y: number }; targetId: string | null; targetPort: PortSide | null } | null>(null);
  const portDragRef = useRef<{ nodeId: string; port: PortSide } | null>(null);
  // Frame / swimlane being dragged out (R1-E03-T06): kind + start point, and the live rect for the preview.
  const createRef = useRef<{ kind: 'frame' | 'swimlane'; x0: number; y0: number } | null>(null);
  const [createPreview, setCreatePreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
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
  // Dock tab scroll positions survive tab switches (CAN-R20).
  const dockScrollRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const el =
      dockTab === 'inspector'
        ? document.querySelector('#linterDrawer [aria-label="Contextual inspector"]')
        : document.querySelector('#linterDrawer [aria-label="Live collaborators"]');
    if (el instanceof HTMLElement && dockScrollRef.current[dockTab] !== undefined) {
      el.scrollTop = dockScrollRef.current[dockTab];
    }
  }, [dockTab]);
  const [iconEntries, setIconEntries] = useState<IconEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadIconManifest()
      .then((entries) => {
        if (!cancelled) setIconEntries(entries);
      })
      .catch(() => {
        /* the pass falls back to iconSrc / kind glyphs */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const stateRef = useRef({ nodes, edges, strokes, texts, threads, selectedId, selectedEdgeId, selectedStrokeId, selectedTextId, textDraft, multiSel, theme, zoom, pan, orthogonal, pendingFrom, tool, lockedTool, sketchy, gridStyle, snapThreshold, connectorCurve, iconEntries, docDefaults, lockedLayers, pageNodes, edgeCounts, activePageId, layerOrder });
  // Sync latest state for native listeners (effect, not render, to respect ref rules).
  useEffect(() => {
    stateRef.current = { nodes, edges, strokes, texts, threads, selectedId, selectedEdgeId, selectedStrokeId, selectedTextId, textDraft, multiSel, theme, zoom, pan, orthogonal, pendingFrom, tool, lockedTool, sketchy, gridStyle, snapThreshold, connectorCurve, iconEntries, docDefaults, lockedLayers, pageNodes, edgeCounts, activePageId, layerOrder };
  });

  // ==================== LIVE REMOTE CURSORS (LucidChart parity) ==============
  const { publishCursor, clearOwnCursor, remoteCursorCount } = useRemoteCursors({ collab, canvasRef, viewportRef, stateRef, theme, pan, zoom });

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
  const editedNode = useMemo(() => (nodeEdit ? nodes.find((n) => n.id === nodeEdit.id) ?? null : null), [nodeEdit, nodes]);
  // R1-E02-T06: one inline edit session is one undo step (checkpoint, then the silent update).
  const commitNodeEdit = useCallback((patch: InlineEditPatch) => {
    const id = nodeEdit?.id;
    setNodeEdit(null);
    if (!id || (patch.label === undefined && patch.technology === undefined)) return;
    checkpoint();
    const next: Partial<ArchNode> = {};
    if (patch.label !== undefined) next.label = patch.label;
    if (patch.technology !== undefined) {
      next.technology = patch.technology;
      next.tag = patch.technology; // legacy mirror: the legacy renderer and inspector still read `tag`
    }
    updateNode(id, next);
  }, [nodeEdit, checkpoint, updateNode]);
  // R1-E02-T05: nodes the floating context toolbar acts on (single or multi selection).
  const toolbarNodes = useMemo(() => {
    const ids = new Set([...multiSel, selectedId].filter((v): v is string => Boolean(v)));
    return nodes.filter((n) => ids.has(n.id));
  }, [multiSel, selectedId, nodes]);
  // R1-E05-T03: icon picker opened from the canvas icon slot or the context toolbar "Replace icon".
  const [iconPicker, setIconPicker] = useState<{ id: string; pos: { x: number; y: number } } | null>(null);
  const iconPickerNode = iconPicker ? nodes.find((n) => n.id === iconPicker.id) ?? null : null;
  // R1-E04-T07: context menu (right-click, Shift+F10 / the context-menu key).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; ids: string[]; label: string } | null>(null);
  const ctxOpenerRef = useRef<HTMLElement | null>(null);
  // Armed on a pointer-down on the selected node's icon tile; opens the picker on a click-release (no drag).
  const iconSlotDownRef = useRef<{ id: string; x: number; y: number } | null>(null);
  // R1-E04-T06: format painter. The first selected id is the style source.
  const painterIds = useMemo(
    () => (selectedId ? [selectedId, ...multiSel.filter((id) => id !== selectedId)] : multiSel),
    [selectedId, multiSel],
  );
  const painter = useFormatPainter({ nodes, selectedIds: painterIds, pasteStyle, onMessage: pushToast });
  const painterRef = useRef(painter);
  painterRef.current = painter;
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
      // Read the live size: the docked panel can resize the viewport after setup.
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
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

      // Edge bodies first; their label pills are painted after the nodes (R1-E14-T02).
      const visibleEdges = s.edges.filter((edge) => {
        // Cull on the pre-pass polyline (exact points match the shared helper).
        const pts = edgePoints(edge, s.nodes ?? [], s.orthogonal, s.connectorCurve);
        if (!pts) return false;
        return !pts.every((p) => p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1);
      });
      // R1-E04-T04: crossings once per frame; the later edge hops over the earlier one.
      const hops = edgeHops(visibleEdges, s.nodes ?? [], s.orthogonal, s.connectorCurve);
      const edgeFlags = (edge: { id: string }) => ({
        isDark,
        selected: s.selectedEdgeId === edge.id,
        orthogonal: s.orthogonal,
        curve: s.connectorCurve,
        hops: hops.get(edge.id),
        zoom: s.zoom,
      });
      visibleEdges.forEach((edge) => {
        drawEdgePass(ctx, edge, s.nodes ?? [], { ...edgeFlags(edge), pill: false });
      });

      // R1-E02-T08: state marks from real data. Open review threads become the node's count pin;
      // `locked` shows the lock. Lint, drift and diff have no per-node source yet (E08-T03 feeds diff).
      const openThreads = new Map<string, number>();
      s.threads.forEach((t) => {
        if (!t.resolved && t.pinnedTo !== '__canvas') openThreads.set(t.pinnedTo, (openThreads.get(t.pinnedTo) ?? 0) + 1);
      });
      // R1-E03-T01: descendant counts for collapsed boundaries (chip) and cloud-boundary logos.
      const descendantCount = (id: string): number => {
        let n = 0;
        const stack = [id];
        const seen = new Set<string>([id]);
        while (stack.length > 0) {
          const cur = stack.pop() as string;
          for (const c of s.pageNodes) {
            if (c.parentId === cur && !seen.has(c.id)) {
              seen.add(c.id);
              n += 1;
              stack.push(c.id);
            }
          }
        }
        return n;
      };
      const boundaryLogoFor = (node: ArchNode): CanvasImageSource | null => {
        if (node.boundaryKind !== 'cloud' || !node.iconRef) return null;
        const src = resolveIcon(node.iconRef, s.iconEntries)?.src;
        if (!src) return null;
        iconsAdapter.ensure(src);
        const img = iconsAdapter.get(src);
        return img && img.complete && img.naturalWidth > 0 ? img : null;
      };
      /** Draw a single node — delegates to the shared render pass. */
      const drawNode = (node: ArchNode) => {
        if (!onScreen(node.x, node.y, node.w, node.h)) return;
        const boundary = isBoundaryNode(node);
        drawNodePass(ctx, node, iconsAdapter, {
          isDark,
          selected: s.selectedId === node.id || s.multiSel.includes(node.id),
          pending: s.pendingFrom === node.id,
          showPorts: s.tool === 'connector',
          hovered: hoveredRef.current === node.id,
          zoom: s.zoom,
          iconEntries: s.iconEntries,
          propertyLineKey: s.docDefaults.propertyLine ?? 'owner',
          childCount: boundary && node.collapsed ? descendantCount(node.id) : undefined,
          boundaryLogo: boundary ? boundaryLogoFor(node) : undefined,
          status: {
            locked: isEffectivelyLocked(node, s.lockedLayers),
            comments: openThreads.get(node.id) ?? 0,
            multiSelected: s.multiSel.length > 1 && s.multiSel.includes(node.id),
          },
        });
        if (node.linkPageId) {
          // "↗" page-link badge (R1-E03-T04): clicking it switches to the linked page.
          const k = pageLinkBadge(node, s.zoom);
          ctx.save();
          ctx.beginPath();
          ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2);
          ctx.fillStyle = '#4F46E5';
          ctx.fill();
          ctx.lineWidth = 1.5 / s.zoom;
          ctx.strokeStyle = isDark ? '#0B0F14' : '#FFFFFF';
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `${Math.round(11 / s.zoom)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('↗', k.x, k.y + 0.5 / s.zoom);
          ctx.restore();
        }
      };

      orderForPaint(s.nodes, s.layerOrder).forEach(drawNode);

      // Label pills in their own pass after the nodes, so a node never hides a pill.
      visibleEdges.forEach((edge) => {
        drawEdgeLabelPass(ctx, edge, s.nodes ?? [], edgeFlags(edge));
      });

      // "×N" badge on an edge that stands for several edges into a collapsed boundary (R1-E03-T03).
      visibleEdges.forEach((edge) => {
        const count = s.edgeCounts.get(edge.id);
        if (!count) return;
        const pts = edgePoints(edge, s.nodes ?? [], s.orthogonal, s.connectorCurve);
        if (!pts || pts.length < 2) return;
        const a = pts[Math.floor((pts.length - 1) / 2)];
        const b = pts[Math.floor((pts.length - 1) / 2) + 1] ?? a;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.save();
        ctx.font = `600 ${11}px Inter, system-ui, sans-serif`;
        const label = `×${count}`;
        const bw = ctx.measureText(label).width + 10;
        ctx.fillStyle = isDark ? '#1F2937' : '#FFFFFF';
        ctx.strokeStyle = '#4F46E5';
        ctx.lineWidth = 1 / s.zoom;
        ctx.beginPath();
        ctx.roundRect(mx - bw / 2, my - 18, bw, 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#4F46E5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my - 10);
        ctx.restore();
      });

      // Drop-in highlight: the boundary a dragged node would join (R1-E03-T02).
      if (dropTargetRef.current) {
        const t = s.nodes.find((n) => n.id === dropTargetRef.current);
        if (t) {
          ctx.save();
          ctx.setLineDash([6 / s.zoom, 4 / s.zoom]);
          ctx.lineWidth = 2 / s.zoom;
          ctx.strokeStyle = '#4F46E5';
          ctx.strokeRect(t.x, t.y, t.w, t.h);
          ctx.restore();
        }
      }

      // Corner resize handles + alignment guides for the selected node (single-select).
      // Card, shape and icon nodes draw their own ring and handles in the node pass; legacy styles
      // get the same four 8 px corner handles here (R1-E14-T02).
      {
        const sel = s.selectedId ? s.nodes.find((n) => n.id === s.selectedId) : undefined;
        if (sel && s.multiSel.length <= 1 && effectiveNodeStyle(sel) === 'legacy') {
          drawSelectionHandles(ctx, sel, isDark, s.zoom);
        }
        if (guidesRef.current.length > 0) {
          ctx.save();
          ctx.strokeStyle = '#4F46E5';
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
      s.strokes.forEach((st) => inkPass(st.pts, st.color, st.width, s.selectedStrokeId === st.id || s.multiSel.includes(st.id)));
      if (ink && ink.length > 0) {
        inkPass(ink, isDark ? '#E5E7EB' : '#1F2937', 3, false);
      }
      // Free-standing text labels (Excalidraw-style).
      s.texts.forEach((t) => {
        drawFreeTextPass(ctx, t, s.selectedTextId === t.id || s.multiSel.includes(t.id), isDark);
      });
      // Note pins — visual markers for review threads on the canvas.
      s.threads.forEach((t) => {
        // Open threads show as the node's count pin (status slot); resolved ones keep the green tick.
        if (t.pinnedTo === '__canvas' || !t.resolved) return;
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
    resizeRef.current = onResize;
    window.addEventListener('resize', onResize);
    window.setTimeout(onResize, 40);
    const hitNode = (x: number, y: number) => {
      const s = stateRef.current;
      // Nodes first (topmost first), then boundaries by their border band and label only, deepest first
      // (R1-E03-T02): a click in a boundary's empty interior reaches the canvas, not the boundary.
      for (let i = s.nodes.length - 1; i >= 0; i--) {
        const n = s.nodes[i];
        if (isBoundaryNode(n)) continue;
        // Elements on a locked layer are drawn but cannot be picked.
        if (s.lockedLayers.has(n.layerId ?? 'ly-default')) continue;
        if (hitsNode(n, x, y)) return n.id;
      }
      let best: ArchNode | null = null;
      let bestDepth = -1;
      for (const n of s.nodes) {
        if (!isBoundaryNode(n) || s.lockedLayers.has(n.layerId ?? 'ly-default') || !hitsBoundaryChrome(n, x, y)) continue;
        const d = depthOf(s.nodes, n.id);
        if (d >= bestDepth) {
          best = n;
          bestDepth = d;
        }
      }
      return best ? best.id : null;
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
        if (s.lockedLayers.has(s.strokes[i].layerId ?? 'ly-default')) continue;
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
        if (s.lockedLayers.has(t.layerId ?? 'ly-default')) continue;
        const lines = t.text.split('\n');
        const w = lines.reduce((m, l) => Math.max(m, l.length), 0) * t.fontSize * 0.6;
        const top = t.y - t.fontSize * 1.4;
        const bottom = t.y + (lines.length - 1) * t.fontSize * 1.3;
        if (x >= t.x - tol && x <= t.x + w + tol && y >= top - tol && y <= bottom + tol) return t.id;
      }
      return null;
    };
    const onPointerDown = (e: PointerEvent) => {
      iconSlotDownRef.current = null;
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
        if (sel && effectiveNodeStyle(sel) !== 'icon') {
          const grip = hitResizeHandle(x, y, sel, cur.zoom);
          if (grip) {
            dragRef.current = {
              mode: 'resize', nodeId: sel.id, strokeId: null, textId: null,
              dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null,
              handle: grip, sx: x, sy: y, sw: sel.w, sh: sel.h, ox: sel.x, oy: sel.y,
            };
            return;
          }
        }
      }
      // Selected edge: grab a waypoint, a "+" midpoint or the label pill (R1-E04-T03, R1-E04-T04).
      if (activeTool === 'select' && cur.selectedEdgeId) {
        const edge = cur.edges.find((ed) => ed.id === cur.selectedEdgeId);
        const pts = edge ? edgePoints(edge, cur.nodes, cur.orthogonal, cur.connectorCurve) : null;
        const grab = edge && pts ? hitEdgeHandle(edge, pts, x, y, cur.zoom) : null;
        if (edge && grab) {
          edgeDragRef.current = {
            edgeId: edge.id,
            kind: grab.kind,
            index: grab.kind === 'wp' ? grab.index : grab.kind === 'mid' ? grab.insertIndex : 0,
            waypoints: (edge.waypoints ?? []).map((w) => ({ x: w.x, y: w.y })),
          };
          dragRef.current = { mode: 'edge', nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
          return;
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
      // Page-link badge (R1-E03-T04): switch to the linked page.
      if (activeTool === 'select' && e.button === 0) {
        const linked = [...cur.nodes].reverse().find((n) => n.linkPageId && hitsPageLinkBadge(n, x, y, cur.zoom));
        if (linked?.linkPageId) {
          setActivePageId(linked.linkPageId);
          dragRef.current = { mode: null, nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
          return;
        }
      }
      // Ports (R1-E04-T05): a press on a visible port of the hovered, selected or hit node starts a connection drag.
      if ((activeTool === 'select' || activeTool === 'connector') && !e.shiftKey && e.button === 0) {
        const ids = [hoveredRef.current, cur.multiSel.length <= 1 ? cur.selectedId : null, hit];
        for (const id of ids) {
          const pn = id ? cur.nodes.find((node) => node.id === id) : undefined;
          const port = pn ? hitPort(pn, x, y, cur.zoom) : null;
          if (pn && port) {
            portDragRef.current = { nodeId: pn.id, port };
            dragRef.current = { mode: 'connect', nodeId: pn.id, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
            setSelectedId(pn.id);
            setSelectedEdgeId(null);
            setSelectedStrokeId(null);
            return;
          }
        }
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
      if (activeTool === 'frame' || activeTool === 'swimlane') {
        createRef.current = { kind: activeTool, x0: x, y0: y };
        dragRef.current = { mode: 'create', nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
        setCreatePreview({ x0: x, y0: y, x1: x, y1: y });
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
        // Armed format painter: this click pastes the copied style onto the clicked node(s), once.
        if (painterRef.current.armed) {
          painterRef.current.applyArmed(cur.multiSel.includes(hit) ? cur.multiSel : [hit]);
          dragRef.current = { mode: null, nodeId: null, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
          return;
        }
        // Icon slot of an already selected icon-style element: a click (no drag) opens the icon picker.
        if (n && cur.selectedId === hit && cur.multiSel.length <= 1 && effectiveNodeStyle(n) === 'icon') {
          const tile = iconTileSize(n);
          const tx = n.x + n.w / 2 - tile / 2;
          if (x >= tx && x <= tx + tile && y >= n.y && y <= n.y + tile) iconSlotDownRef.current = { id: hit, x: e.clientX, y: e.clientY };
        }
        // Clicking outside the current set collapses to a single selection.
        const groupIds = cur.multiSel.includes(hit) ? cur.multiSel : [];
        if (!cur.multiSel.includes(hit)) setMultiSel([]);
        // R1-E01-T07: a click only selects. Connecting is explicit: the
        // Connector tool, `C` with one node selected, or a drag that starts
        // within 8 px of the node's edge (ports replace this in E04-T05).
        setPendingFrom(null);
        // A boundary's border band is its drag handle (R1-E03-T02), so only other nodes start an edge drag here.
        if (n && groupIds.length === 0 && !isBoundaryNode(n)) {
          const band = 8 / cur.zoom;
          const nearEdge = x - n.x <= band || n.x + n.w - x <= band || y - n.y <= band || n.y + n.h - y <= band;
          if (nearEdge) {
            dragRef.current = { mode: 'connect', nodeId: hit, strokeId: null, textId: null, dx: 0, dy: 0, px: 0, py: 0, lx: 0, ly: 0, moved: false, group: null };
            setSelectedId(hit);
            setSelectedEdgeId(null);
            setSelectedStrokeId(null);
            return;
          }
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
    // Moves one node. Nested nodes (a child, or a boundary with children) go through `moveWithChildren`
    // so descendants follow and the parent grows to keep the child inside (R1-E03-T02).
    const moveOne = (id: string, tx: number, ty: number) => {
      const pn = stateRef.current.pageNodes;
      const n = pn.find((m) => m.id === id);
      if (n && pn.some((m) => m.parentId === id)) moveWithChildren(id, tx, ty);
      else moveNode(id, tx, ty);
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
      if (!drag.mode) {
        // Idle pointer over the canvas: track the hovered node and the corner-resize cursor.
        if (e.target !== cv) return;
        const cur = stateRef.current;
        const rect = cv.getBoundingClientRect();
        const wx = (e.clientX - rect.left - cur.pan.x) / cur.zoom;
        const wy = (e.clientY - rect.top - cur.pan.y) / cur.zoom;
        let over = hitNode(wx, wy);
        if (!over && hoveredRef.current) {
          // A port dot straddles the node edge: keep the node hovered while the pointer is on it.
          const prev = cur.nodes.find((node) => node.id === hoveredRef.current);
          if (prev && hitPort(prev, wx, wy, cur.zoom)) over = prev.id;
        }
        if (over !== hoveredRef.current) {
          hoveredRef.current = over;
          setHoverNodeId(over);
          drawRef.current();
        }
        const sel = cur.tool === 'select' && cur.selectedId && cur.multiSel.length <= 1
          ? cur.nodes.find((n) => n.id === cur.selectedId)
          : undefined;
        const corner = sel && effectiveNodeStyle(sel) !== 'icon' ? hitResizeHandle(wx, wy, sel, cur.zoom) : null;
        cv.dataset.resize = corner ?? '';
        return;
      }
      const s = stateRef.current;
      if (drag.mode === 'edge' && edgeDragRef.current) {
        const ed = edgeDragRef.current;
        const rect = cv.getBoundingClientRect();
        const wx = (e.clientX - rect.left - s.pan.x) / s.zoom;
        const wy = (e.clientY - rect.top - s.pan.y) / s.zoom;
        const edge = s.edges.find((x) => x.id === ed.edgeId);
        if (!edge) return;
        if (!drag.moved) {
          drag.moved = true;
          checkpoint(false); // one undo step for the whole gesture
        }
        if (ed.kind === 'label') {
          const pts = edgePoints(edge, s.nodes, s.orthogonal, s.connectorCurve);
          if (pts) updateEdge(ed.edgeId, { labelPos: labelPosFromPoint(pts, wx, wy) });
          return;
        }
        const snap = s.snapThreshold > 0 && !e.altKey;
        const p = { x: snapCoord(wx, snap), y: snapCoord(wy, snap) };
        if (ed.kind === 'mid') {
          // The "+" handle becomes the new waypoint, then keeps dragging as a normal waypoint.
          ed.waypoints = insertWaypoint(ed.waypoints, ed.index, p);
          ed.kind = 'wp';
        } else {
          ed.waypoints = moveWaypoint(ed.waypoints, ed.index, p);
        }
        updateEdge(ed.edgeId, { waypoints: ed.waypoints });
        return;
      }
      if (drag.mode === 'create' && createRef.current) {
        const rect = cv.getBoundingClientRect();
        const c = createRef.current;
        drag.moved = true;
        setCreatePreview({ x0: c.x0, y0: c.y0, x1: (e.clientX - rect.left - s.pan.x) / s.zoom, y1: (e.clientY - rect.top - s.pan.y) / s.zoom });
        return;
      }
      if (drag.mode === 'connect' && drag.nodeId) {
        // Edge drag: show the connecting hint; the edge lands on pointer-up.
        if (!drag.moved) {
          drag.moved = true;
          setPendingFrom(drag.nodeId);
        }
        const pd = portDragRef.current;
        if (pd) {
          const rect = cv.getBoundingClientRect();
          const wx = (e.clientX - rect.left - s.pan.x) / s.zoom;
          const wy = (e.clientY - rect.top - s.pan.y) / s.zoom;
          const src = s.nodes.find((node) => node.id === pd.nodeId);
          const over = hitNode(wx, wy);
          const target = over && over !== pd.nodeId ? s.nodes.find((node) => node.id === over) : undefined;
          if (src) {
            const sp = nodePorts(src).find((p) => p.side === pd.port);
            setPortDrag({
              sourceId: src.id,
              from: sp ? { x: sp.x, y: sp.y } : { x: src.x, y: src.y },
              to: { x: wx, y: wy },
              targetId: target?.id ?? null,
              targetPort: target ? nearestPort(target, wx, wy) : null,
            });
          }
        }
        return;
      }
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
        // Corner handles (R1-E14-T02): the opposite corner stays put; Shift keeps the ratio.
        const next = resizeFromCorner(
          { x: drag.ox ?? 0, y: drag.oy ?? 0, w: drag.sw ?? 170, h: drag.sh ?? 70 },
          drag.handle,
          wx - (drag.sx ?? wx),
          wy - (drag.sy ?? wy),
          e.shiftKey,
        );
        updateNode(drag.nodeId, next);
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
          // A member nested under another member travels with it: move only the outermost ones.
          const inGroup = new Set(drag.group.map((m) => m.id));
          drag.group.forEach((m) => {
            if (ancestorsOf(s.pageNodes, m.id).some((a) => inGroup.has(a))) return;
            moveOne(m.id, wx + m.ox, wy + m.oy);
          });
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
          moveOne(drag.nodeId, tx, ty);
          // Highlight the boundary the drop would join.
          const dropAt = containerAt(s.pageNodes, wx, wy, new Set([drag.nodeId]), s.activePageId);
          const nextTarget = dropAt && dropAt.id !== s.pageNodes.find((n) => n.id === drag.nodeId)?.parentId ? dropAt.id : null;
          if (nextTarget !== dropTargetRef.current) {
            dropTargetRef.current = nextTarget;
            drawRef.current();
          }
        }
      } else if (drag.mode === 'pan') {
        setPan({ x: e.clientX - drag.px, y: e.clientY - drag.py });
      }
    };
    const onPointerUp = (e: PointerEvent) => {
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
      edgeDragRef.current = null;
      const drag = dragRef.current;
      const slotDown = iconSlotDownRef.current;
      iconSlotDownRef.current = null;
      if (slotDown && drag.mode === 'node' && drag.nodeId === slotDown.id && !drag.moved) {
        setIconPicker({ id: slotDown.id, pos: { x: slotDown.x + 12, y: slotDown.y + 12 } });
      }
      if (drag.mode === 'connect' && drag.nodeId) {
        const pd = portDragRef.current;
        if (drag.moved) {
          const pt = dropToWorld(e.clientX, e.clientY);
          const target = pt ? hitNode(pt.x, pt.y) : null;
          if (pd) {
            const cur = stateRef.current;
            const tn = target ? cur.nodes.find((node) => node.id === target) : undefined;
            const src = cur.nodes.find((node) => node.id === pd.nodeId);
            if (pt && tn && tn.id !== pd.nodeId) {
              connectNodes(pd.nodeId, tn.id, undefined, { fromPort: pd.port, toPort: nearestPort(tn, pt.x, pt.y) });
            } else if (pt && !target && src) {
              // Released on empty canvas: a dangling wire, once the drag is a real gesture (12 px).
              const sp = nodePorts(src).find((p) => p.side === pd.port);
              if (sp && Math.hypot(pt.x - sp.x, pt.y - sp.y) * cur.zoom >= 12) {
                connectNodes(pd.nodeId, null, { x: Math.round(pt.x), y: Math.round(pt.y) }, { fromPort: pd.port });
              }
            }
          } else if (target && target !== drag.nodeId) {
            connectNodes(drag.nodeId, target);
          }
        }
        setPendingFrom(null);
      }
      if (portDragRef.current) {
        portDragRef.current = null;
        setPortDrag(null);
      }
      // Frame / swimlane: the dragged rect becomes a boundary (one undo step); too small a rect creates nothing.
      if (drag.mode === 'create' && createRef.current) {
        const c = createRef.current;
        createRef.current = null;
        setCreatePreview(null);
        const pt = dropToWorld(e.clientX, e.clientY);
        if (pt && drag.moved) {
          const id = createBoundary(c.kind, { x0: c.x0, y0: c.y0, x1: pt.x, y1: pt.y });
          if (id) {
            setSelectedId(id);
            setSelectedEdgeId(null);
            setMultiSel([]);
          } else {
            pushToast(`Drag a larger area to create a ${c.kind}`);
          }
        }
        if (stateRef.current.lockedTool !== c.kind) setTool('select');
      }
      // Drop-in (R1-E03-T02): where a node drag ends decides its container; outside every boundary clears it.
      // The drag's one undo step was taken on grab, so these are history-silent.
      if (drag.mode === 'node' && drag.moved && drag.nodeId) {
        const cur = stateRef.current;
        const pt = dropToWorld(e.clientX, e.clientY);
        const ids = drag.group && drag.group.length > 0 ? drag.group.map((m) => m.id) : [drag.nodeId];
        const set = new Set(ids);
        const outer = ids.filter((id) => !ancestorsOf(cur.pageNodes, id).some((a) => set.has(a)));
        if (pt && outer.length > 0) {
          const target = containerAt(cur.pageNodes, pt.x, pt.y, set, cur.activePageId);
          setParent(outer, target?.id ?? null);
          // Staying inside a parent it overflows: the parent grows (never shrinks).
          growBoundaries(outer);
        }
      }
      if (drag.mode === 'resize' && drag.moved && drag.nodeId) growBoundaries([drag.nodeId]);
      if (dropTargetRef.current) {
        dropTargetRef.current = null;
        drawRef.current();
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
    const onPointerLeave = () => {
      clearOwnCursor();
      if (hoveredRef.current) {
        hoveredRef.current = null;
        setHoverNodeId(null);
        drawRef.current();
      }
    };
    cv.addEventListener('pointerleave', onPointerLeave);
    return () => {
      window.removeEventListener('resize', onResize);
      cv.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cv.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [createBoundary, moveWithChildren, setParent, growBoundaries, setActivePageId, setPan, setSelectedId, addNode, connectNodes, setTool, pushToast, moveNode, moveStroke, moveText, addStroke, addText, updateText, deleteText, checkpoint, finishTextDraft, publishCursor, clearOwnCursor]);

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

  // View toolbar zoom (R1-E14-T02): keep the viewport centre fixed while zooming.
  const zoomAtCenter = useCallback((target: number) => {
    const v = viewportRef.current;
    const z = Math.min(4.0, Math.max(0.1, Math.round(target * 100) / 100));
    if (!v || zoom <= 0) {
      zoomTo(z);
      return;
    }
    const cx = v.clientWidth / 2;
    const cy = v.clientHeight / 2;
    const wx = (cx - pan.x) / zoom;
    const wy = (cy - pan.y) / zoom;
    zoomTo(z);
    setPan({ x: cx - wx * z, y: cy - wy * z });
  }, [zoom, pan, zoomTo, setPan]);

  // The docked panel changes the canvas width without a window resize: repaint on any
  // viewport size change so the backing store matches.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => resizeRef.current());
    // Test environments may stub ResizeObserver partially; guard each call.
    if (typeof ro.observe === 'function') ro.observe(v);
    return () => {
      if (typeof ro.disconnect === 'function') ro.disconnect();
    };
  }, []);


  // R1-E02-T06: select the node and open its inline editor (double-click, Enter).
  const beginNodeEdit = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedEdgeId(null);
    setNodeEdit({ id, field: 'name' });
  }, [setSelectedId]);

  // R1-E04-T07: open the context menu at a pointer position (right-click), or at the selection
  // centre (Shift+F10 / context-menu key) when `at` is null.
  const openContextMenu = useCallback((at: { x: number; y: number } | null) => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const toClient = (wx: number, wy: number) => ({ x: rect.left + wx * s.zoom + s.pan.x, y: rect.top + wy * s.zoom + s.pan.y });
    let ids: string[];
    let point: { x: number; y: number };
    if (at) {
      const wx = (at.x - rect.left - s.pan.x) / s.zoom;
      const wy = (at.y - rect.top - s.pan.y) / s.zoom;
      point = at;
      let hitId: string | null = null;
      for (let i = s.nodes.length - 1; i >= 0 && !hitId; i--) if (hitsNode(s.nodes[i], wx, wy)) hitId = s.nodes[i].id;
      const current = new Set([...s.multiSel, s.selectedId].filter((v): v is string => Boolean(v)));
      if (hitId) {
        // Right-click inside the selection keeps it; on anything else it selects that element.
        if (current.has(hitId)) ids = Array.from(current);
        else {
          ids = [hitId];
          setSelectedId(hitId);
          setMultiSel([]);
          setSelectedEdgeId(null);
        }
      } else {
        const tol = 8 / s.zoom;
        const edgeHit = [...s.edges].reverse().find((ed) => {
          const pts = edgePoints(ed, s.nodes, s.orthogonal, s.connectorCurve);
          return !!pts && pts.some((p, j) => j < pts.length - 1 && distToSegment(wx, wy, p, pts[j + 1]) <= tol);
        });
        if (edgeHit) {
          ids = [edgeHit.id];
          setSelectedEdgeId(edgeHit.id);
          setSelectedId(null);
          setMultiSel([]);
        } else {
          ids = [];
        }
      }
    } else {
      const sel = new Set([...s.multiSel, s.selectedId].filter((v): v is string => Boolean(v)));
      const picked = s.nodes.filter((n) => sel.has(n.id));
      ids = picked.map((n) => n.id);
      if (s.selectedEdgeId && ids.length === 0) ids = [s.selectedEdgeId];
      if (picked.length > 0) {
        const bs = picked.map((n) => nodeBounds(n));
        const minX = Math.min(...bs.map((b) => b.x));
        const maxX = Math.max(...bs.map((b) => b.x + b.w));
        const minY = Math.min(...bs.map((b) => b.y));
        const maxY = Math.max(...bs.map((b) => b.y + b.h));
        point = toClient((minX + maxX) / 2, (minY + maxY) / 2);
      } else {
        point = { x: rect.left + 120, y: rect.top + 120 };
      }
    }
    const only = ids.length === 1 ? s.nodes.find((n) => n.id === ids[0]) : undefined;
    const label = only ? `${only.label} actions` : ids.length > 1 ? `${ids.length} elements actions` : 'Canvas actions';
    const active = document.activeElement;
    ctxOpenerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setCtxMenu({ x: point.x, y: point.y, ids, label });
  }, [setSelectedId]);
  // "Copy link to element" lands here: `#/canvas?doc=<id>&element=<id>` opens that doc, selects and
  // centres the element, and says so when it no longer exists. Each link is handled once.
  const navigate = useNavigate();
  const [linkParams] = useSearchParams();
  const handledLink = useRef<string | null>(null);
  const linkDoc = linkParams.get('doc');
  const linkElement = linkParams.get('element');
  useEffect(() => {
    if (!linkElement) return;
    const key = `${linkDoc ?? ''}|${linkElement}`;
    if (handledLink.current === key) return;
    if (linkDoc && linkDoc !== activeDocId && docs.some((d) => d.id === linkDoc)) {
      openDoc(linkDoc);
      return;
    }
    handledLink.current = key;
    if (nodes.some((n) => n.id === linkElement)) {
      setSelectedId(linkElement);
      setSelectedEdgeId(null);
      panToNode(linkElement);
    } else {
      pushToast('That element is not in this diagram');
    }
  }, [linkDoc, linkElement, activeDocId, docs, openDoc, nodes, setSelectedId, panToNode, pushToast]);
  // R1-E04-T08: keyboard shortcuts run the same registered commands as the menu and palette, so an
  // unavailable action (locked, too few nodes, viewer) is a no-op. Returns true when it ran.
  const actionsApi = useDiagramActions();
  const uiApi = useDiagramUI();
  const runCanvasCommand = useCallback((id: string): boolean => {
    const s = stateRef.current;
    const sel = new Set([...s.multiSel, s.selectedId, s.selectedEdgeId].filter((v): v is string => Boolean(v)));
    const ctx: CommandContext = { route: '/canvas', selectionIds: Array.from(sel), role: role ?? 'owner', actions: actionsApi, ui: uiApi, navigate: () => undefined };
    const cmd = listCommands(ctx).find((c) => c.id === id);
    if (!cmd) return false;
    recordCommandUse(cmd.id);
    cmd.run(ctx);
    return true;
  }, [actionsApi, uiApi, role]);
  // Find bar (Ctrl+F) with optional replace row (Ctrl+H).
  const [findBar, setFindBar] = useState<{ replace: boolean } | null>(null);
  const openFind = useCallback((replace: boolean) => setFindBar({ replace }), []);
  const closeFind = useCallback(() => {
    setFindBar(null);
    canvasRef.current?.focus({ preventScroll: true });
  }, []);
  const revealMatch = useCallback((m: FindMatch) => {
    if (m.entity === 'node') {
      setSelectedId(m.id);
      setSelectedEdgeId(null);
      setMultiSel([]);
      panToNode(m.id);
    } else {
      setSelectedEdgeId(m.id);
      setSelectedId(null);
      setMultiSel([]);
    }
  }, [setSelectedId, panToNode]);
  const layerSelectionIds = useMemo(
    () => [...new Set([...multiSel, selectedId, selectedStrokeId, selectedTextId].filter((v): v is string => Boolean(v)))],
    [multiSel, selectedId, selectedStrokeId, selectedTextId],
  );
  // Single selected boundary: collapse / expand, fit to contents, add lane below (context toolbar).
  const boundaryActions = useMemo(() => {
    if (toolbarNodes.length !== 1 || !isBoundaryNode(toolbarNodes[0])) return undefined;
    const b = toolbarNodes[0];
    return {
      collapsed: b.collapsed === true,
      onToggleCollapse: () => toggleCollapse(b.id),
      onFit: pageNodes.some((n) => n.parentId === b.id) ? () => fitToContents(b.id) : undefined,
      onAddLane: b.boundaryKind === 'swimlane' ? () => { const id = addLaneBelow(b.id); if (id) setSelectedId(id); } : undefined,
    };
  }, [toolbarNodes, pageNodes, toggleCollapse, fitToContents, addLaneBelow, setSelectedId]);
  const arrangeIds = useMemo(() => toolbarNodes.map((n) => n.id), [toolbarNodes]);
  const arrangeActions = useMemo(() => ({
    onAlign: (edge: Parameters<typeof align>[1]) => align(arrangeIds, edge),
    onDistribute: (axis: 'h' | 'v') => distribute(arrangeIds, axis),
    onMatchSize: () => matchSize(arrangeIds, 'both'),
    onZOrder: (cmd: 'front' | 'back') => zOrder(arrangeIds, cmd),
    onSetLocked: (locked: boolean) => setLocked(arrangeIds, locked),
  }), [arrangeIds, align, distribute, matchSize, zOrder, setLocked]);
  const closeContextMenu = useCallback((restoreFocus: boolean) => {
    setCtxMenu(null);
    if (!restoreFocus) return;
    const opener = ctxOpenerRef.current;
    ctxOpenerRef.current = null;
    const target = opener && opener.isConnected ? opener : canvasRef.current;
    target?.focus({ preventScroll: true });
  }, []);
  // Delete with a boundary that has contents: ask "boundary only / with contents" (R1-E03-T02).
  const [deleteAsk, setDeleteAsk] = useState<{ ids: string[] } | null>(null);
  const deleteTrap = useFocusTrap<HTMLDivElement>(deleteAsk !== null);
  const requestDeleteBoundary = useCallback((ids: string[]): boolean => {
    const pn = stateRef.current.pageNodes;
    const withContents = ids.some((id) => {
      const n = pn.find((m) => m.id === id);
      return n && isBoundaryNode(n) && pn.some((m) => m.parentId === id);
    });
    if (withContents) setDeleteAsk({ ids });
    return withContents;
  }, []);
  const confirmDelete = (mode: 'only' | 'with') => {
    const ids = deleteAsk?.ids ?? [];
    setDeleteAsk(null);
    const pn = stateRef.current.pageNodes;
    const boundaries = ids.filter((id) => {
      const n = pn.find((m) => m.id === id);
      return n && isBoundaryNode(n);
    });
    // Delete the others first, then each boundary (its own op, so "only" re-parents correctly).
    const others = ids.filter((id) => !boundaries.includes(id));
    if (others.length > 0) deleteNodes(others);
    boundaries.forEach((id) => deleteBoundary(id, mode));
    setMultiSel([]);
    canvasRef.current?.focus({ preventScroll: true });
  };
  const commandHandlers = useMemo(() => ({
    onDeleteBoundaries: requestDeleteBoundary,
    onReplaceIcon: (id: string) => {
      const s = stateRef.current;
      const n = s.nodes.find((m) => m.id === id);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (n && rect) {
        const b = nodeBounds(n);
        setIconPicker({ id, pos: { x: rect.left + (b.x + b.w) * s.zoom + s.pan.x + 12, y: rect.top + b.y * s.zoom + s.pan.y } });
      }
    },
    onComment: (id: string, label: string) => {
      setCommentFor({ id, label });
      setCommentText('');
    },
    onProperties: () => {
      setDockOpen(true);
      setDockTab('inspector');
    },
    onSelectMany: (ids: string[]) => {
      setMultiSel(ids);
      setSelectedId(ids.length > 0 ? ids[ids.length - 1] : null);
      setSelectedEdgeId(null);
    },
  }), [setSelectedId, requestDeleteBoundary]);
  useCanvasCommands(commandHandlers);

  useCanvasKeyboard({
    openContextMenu,
    requestDeleteBoundary,
    runCanvasCommand,
    openFind,
    stateRef,
    spaceDown,
    inkRef,
    inspectorCkpt,
    undo,
    redo,
    deleteSelected,
    deleteNodes,
    duplicateSelected,
    setSelectedId,
    setTool,
    resetView,
    fitContent,
    deleteEdge,
    deleteStroke,
    deleteText,
    moveNode,
    checkpoint,
    pushToast,
    finishTextDraft,
    panToNode,
    setMiniOpenPersisted,
    setMultiSel,
    setSelectedEdgeId,
    setSelectedTextId,
    setSelectedStrokeId,
    setInk,
    setPendingFrom,
    setCommentFor,
    setLockedTool,
    setLibOpen,
    beginNodeEdit,
    setDisplayStyle,
  });

  // Double-click a node jumps straight into renaming it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDblClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const s = stateRef.current;
      const x = (e.clientX - rect.left - s.pan.x) / s.zoom;
      const y = (e.clientY - rect.top - s.pan.y) / s.zoom;
      // Double-click a waypoint of the selected edge removes it (R1-E04-T03).
      const selEdge = s.selectedEdgeId ? s.edges.find((ed) => ed.id === s.selectedEdgeId) : undefined;
      const selPts = selEdge ? edgePoints(selEdge, s.nodes, s.orthogonal, s.connectorCurve) : null;
      const wpHit = selEdge && selPts ? hitEdgeHandle(selEdge, selPts, x, y, s.zoom) : null;
      if (selEdge && wpHit?.kind === 'wp') {
        checkpoint(false);
        const next = (selEdge.waypoints ?? []).filter((_, i) => i !== wpHit.index);
        updateEdge(selEdge.id, { waypoints: next.length > 0 ? next : undefined });
        return;
      }
      const hit = [...s.nodes].reverse().find((n) => hitsNode(n, x, y));
      if (hit) {
        setSelectedId(hit.id);
        setSelectedEdgeId(null);
        setNodeEdit({ id: hit.id, field: 'name' });
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


  /** World-space point at the middle of the visible canvas (Shapes panel inserts here). */
  const viewportCenterWorld = () => {
    const v = viewportRef.current;
    return {
      x: ((v?.clientWidth ?? 800) / 2 - pan.x) / zoom,
      y: ((v?.clientHeight ?? 600) / 2 - pan.y) / zoom,
    };
  };
  /** Shapes panel insert: consecutive inserts must not stack exactly (SHP-R16), so step down-right until free. */
  const insertFromPanel = (node: ArchNode) => {
    let x = node.x;
    let y = node.y;
    const occupied = () => nodes.some((n) => Math.abs(n.x - x) < 8 && Math.abs(n.y - y) < 8);
    for (let step = 0; step < 5 && occupied(); step += 1) {
      x += 16;
      y += 16;
    }
    insertNode(node, { x, y });
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

  // Editor-local selection state shared with the extracted dock parts.
  const beginTextEdit = (t: FreeText) => {
    draftCommitted.current = false;
    liveTextRef.current = null;
    liveSnapRef.current = false;
    setTextDraft({ x: t.x, y: t.y, value: t.text, editingId: t.id });
  };
  const canvasLocal: CanvasLocalValue = {
    selected,
    selectedEdge,
    selectedText,
    selToolbarPos,
    setSelectedEdgeId,
    setSelectedTextId,
    beginTextEdit,
  };

  return (
    <CanvasLocalContext.Provider value={canvasLocal}>
    <div className="screen-view active canvas-workspace">
      <div
        className={`canvas-layout${gridStyle === 'lines' ? ' grid-lines' : gridStyle === 'none' ? ' grid-none' : ''}`}
        ref={viewportRef}
        id="canvasViewport"
        data-testid="canvas-status"
        data-nodes={nodes.length}
        data-edges={edges.length}
        data-remote-cursors={remoteCursorCount}
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
          // Shapes panel tiles carry the node to create (R1-E05-T04): centre it on the drop point.
          const tileRaw = e.dataTransfer.getData(TILE_DRAG_MIME);
          if (tileRaw) {
            try {
              const parsed: unknown = JSON.parse(tileRaw);
              if (isTileNode(parsed)) {
                insertNode(parsed, { x: pt.x - parsed.w / 2, y: pt.y - parsed.h / 2 });
                return;
              }
            } catch {
              /* malformed payload: ignore */
            }
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
        {nodes.length === 0 && <EmptyCanvasOverlay />}
        {canvasError && <CanvasUnavailable />}
        <canvas
          id="architectureCanvas"
          ref={canvasRef}
          role="img"
          aria-label={`Architecture diagram: ${nodes.length} nodes, ${edges.length} routes, ${remaining} lint issues. Use the node list below or arrow keys to explore.`}
          tabIndex={-1}
          onContextMenu={(e) => {
            e.preventDefault();
            openContextMenu({ x: e.clientX, y: e.clientY });
          }}
          style={{ outline: 'none', cursor: tool === 'text' ? 'text' : tool === 'pan' ? 'grab' : tool === 'draw' || tool === 'connector' || tool === 'frame' || tool === 'swimlane' ? 'crosshair' : 'default' }}
        />

        {/* Screen-reader traversal: full node + route list, keyboard native */}
        <DiagramNodeList onSelectNode={(id) => {
          // R1-BUG-08: keyboard connect. With the Connector armed (C on a selected node), activating
          // another node in this list is the target; activating the same node cancels the arm.
          const cur = stateRef.current;
          if (cur.tool === 'connector' && cur.pendingFrom) {
            if (cur.pendingFrom === id) { setPendingFrom(null); return; }
            const from = cur.pendingFrom;
            connectNodes(from, id);
            setPendingFrom(null);
            if (cur.lockedTool !== 'connector') { setTool('select'); setLockedTool(null); }
            setSelectedId(id);
            setSelectedEdgeId(null);
            const label = (nid: string) => cur.nodes.find((n) => n.id === nid)?.label ?? nid;
            setAnnouncement(`Connected ${label(from)} to ${label(id)}.`);
            return;
          }
          setSelectedId(id); setSelectedEdgeId(null); panToNode(id);
        }} />
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

{editable && <ToolPalette
          tool={tool}
          setTool={setTool}
          lockedTool={lockedTool}
          setLockedTool={setLockedTool}
          setPendingFrom={setPendingFrom}
          pushToast={pushToast}
          libOpen={libOpen}
          setLibOpen={setLibOpen}
        />}

        {libOpen && (
          <div
            ref={libPanelRef}
            className="library-drawer"
            id="shape-library-drawer"
            role="dialog"
            aria-modal="false"
            aria-label="Shape library"
            style={{ width: 300 }}
            onKeyDown={(e) => { if (e.key === 'Escape') setLibOpen(false); }}
          >
            <ShapeLibrary
              viewportCenter={viewportCenterWorld()}
              pageId={activePageId}
              docDefaults={docDefaults}
              onInsert={insertFromPanel}
            />
          </div>
        )}

        <Minimap open={miniOpen} viewportRef={viewportRef} />

        <CanvasToolbar
          zoom={zoom}
          zoomAt={zoomAtCenter}
          onFit={fitContent}
          onUndo={undo}
          onRedo={redo}
          miniOpen={miniOpen}
          setMiniOpen={setMiniOpenPersisted}
          dockOpen={dockOpen}
          onShowPanel={() => setDockOpen(true)}
        />

        {createPreview && (
          <div
            aria-hidden="true"
            data-testid="boundary-preview"
            style={{
              position: 'absolute', zIndex: 30, pointerEvents: 'none', boxSizing: 'border-box', border: '2px dashed #4F46E5', background: 'rgba(79,70,229,.06)',
              left: Math.min(createPreview.x0, createPreview.x1) * zoom + pan.x,
              top: Math.min(createPreview.y0, createPreview.y1) * zoom + pan.y,
              width: Math.abs(createPreview.x1 - createPreview.x0) * zoom,
              height: Math.abs(createPreview.y1 - createPreview.y0) * zoom,
            }}
          />
        )}

        {(tool === 'select' || tool === 'connector') && (portDrag || hoverNodeId) && (
          <PortHandles
            node={nodes.find((n) => n.id === (portDrag ? portDrag.targetId ?? portDrag.sourceId : hoverNodeId)) ?? null}
            zoom={zoom}
            pan={pan}
            activePort={portDrag?.targetPort ?? null}
            preview={portDrag ? { from: portDrag.from, to: portDrag.to } : null}
          />
        )}

        {pendingFrom && (
          <div className="connect-hint" role="status">
            <span>◉ Connecting from <strong>{nodes.find((n) => n.id === pendingFrom)?.label ?? pendingFrom}</strong> — click a target node · Esc to cancel</span>
            <button className="btn btn--sm btn--secondary" onClick={() => setPendingFrom(null)}>Esc</button>
          </div>
        )}

        {commentFor && (
          <CommentComposer
            target={commentFor}
            text={commentText}
            setText={setCommentText}
            trapRef={composerTrap}
            onCancel={() => setCommentFor(null)}
            onPost={() => { addThread(commentFor.id, commentText, commentFor.label); setCommentFor(null); setCommentText(''); }}
          />
        )}

        {editable && toolbarNodes.length > 0 && !editedNode && tool === 'select' && (
          <ContextToolbar
            nodes={toolbarNodes}
            zoom={zoom}
            pan={pan}
            onSetDisplayStyle={setDisplayStyle}
            onReplaceIcon={(id, at) => setIconPicker({ id, pos: at })}
            formatPainterArmed={painter.armed}
            onFormatPainter={() => { if (painter.armed) painter.disarm(); else painter.arm(); }}
            arrange={arrangeActions}
            boundary={boundaryActions}
          />
        )}

        {!editable && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 47 }}>
            <ReadOnlyBanner role={role} title={docTitle} onRequestEdit={() => setRequestOpen(true)} />
          </div>
        )}
        {requestOpen && (
          <div role="dialog" aria-modal="true" aria-label="Request edit access" ref={requestTrap} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRequestOpen(false); } }} style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,24,40,.35)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <RequestAccess diagramId={activeDocId} title={docTitle} signedInAs={getSession()?.email} onSwitchAccount={() => setRequestOpen(false)} />
              <button type="button" className="btn btn--sm btn--secondary" onClick={() => setRequestOpen(false)}>Close</button>
            </div>
          </div>
        )}
        <PagesBar layerCount={layers.length} layersOpen={layersOpen} onToggleLayers={() => setLayersOpen((v) => !v)} />
        {layersOpen && <LayersPanel selectionIds={layerSelectionIds} onClose={() => setLayersOpen(false)} />}

        <PresencePill
          connected={collab.connected}
          users={collab.users}
          selfId={collab.awareness && typeof collab.awareness.clientID === 'number' ? String(collab.awareness.clientID) : ''}
        />
        {findBar && <FindBar withReplace={findBar.replace} onReveal={revealMatch} onClose={closeFind} />}

        {deleteAsk && (
          <div role="dialog" aria-modal="true" aria-label="Delete boundary" ref={deleteTrap} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDeleteAsk(null); canvasRef.current?.focus({ preventScroll: true }); } }} style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,24,40,.35)' }}>
            <div className="content-card" style={{ width: 380, maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
              <div className="card-title">Delete boundary?</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>This boundary contains other elements. Keep them, or delete them with it.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--sm btn--secondary" onClick={() => { setDeleteAsk(null); canvasRef.current?.focus({ preventScroll: true }); }}>Cancel</button>
                <button type="button" className="btn btn--sm btn--primary" autoFocus onClick={() => confirmDelete('only')}>Delete boundary only</button>
                <button type="button" className="btn btn--sm btn--secondary" style={{ color: '#B91C1C' }} onClick={() => confirmDelete('with')}>Delete with contents</button>
              </div>
            </div>
          </div>
        )}

        {ctxMenu && (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            selectionIds={ctxMenu.ids}
            label={ctxMenu.label}
            role={role ?? 'owner'}
            onClose={closeContextMenu}
          />
        )}

        {iconPicker && iconPickerNode && (
          <NodeIconPicker node={iconPickerNode} position={iconPicker.pos} onClose={() => setIconPicker(null)} />
        )}

        {editedNode && (
          <InlineEditor
            key={editedNode.id}
            node={editedNode}
            initialField={nodeEdit?.field ?? 'name'}
            zoom={zoom}
            pan={pan}
            iconEntries={iconEntries}
            isDark={theme === 'dark'}
            onCommit={commitNodeEdit}
            onCancel={() => setNodeEdit(null)}
          />
        )}

        {textDraft && (
          <TextDraftEditor
            draft={textDraft}
            viewport={viewportRef.current}
            draftCommitted={draftCommitted}
            onDraftChange={onDraftChange}
            onCommit={commitTextDraft}
          />
        )}

        {selectedStroke && selToolbarPos && (
          <InkToolbar stroke={selectedStroke} pos={selToolbarPos} onDeselect={() => setSelectedStrokeId(null)} />
        )}

        {selectedText && selToolbarPos && (
          <TextToolbar text={selectedText} pos={selToolbarPos} onEdit={beginTextEdit} onDeselect={() => setSelectedTextId(null)} />
        )}
      </div>
      {/* Docked right panel (R1-E14-T02, Main.dc.html L172–L178): full height, 320 px. */}
      {dockOpen && (
        <aside className="linter-inspector" id="linterDrawer" aria-label="Inspector">
          <div className="utility-tabbar">
            {/* Only the tabs live in the tablist; the close control sits beside it (FE-Q10). */}
            <div role="tablist" aria-label="Right panel" className="utility-tablist">
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'inspector'}
                className={`utility-tab${dockTab === 'inspector' ? ' active' : ''}`}
                onClick={() => setDockTab('inspector')}
              >
                Inspector
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'assistant'}
                className={`utility-tab${dockTab === 'assistant' ? ' active' : ''}`}
                onClick={() => setDockTab('assistant')}
              >
                AI assistant
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'collab'}
                className={`utility-tab${dockTab === 'collab' ? ' active' : ''}`}
                onClick={() => setDockTab('collab')}
              >
                Live{collab.connected && collab.users.length > 0 ? ` ${collab.users.length}` : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dockTab === 'history'}
                className={`utility-tab${dockTab === 'history' ? ' active' : ''}`}
                onClick={() => setDockTab('history')}
              >
                History
              </button>
            </div>
            <button
              type="button"
              className="utility-close"
              aria-label="Close panel"
              title="Close panel"
              onClick={() => setDockOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="utility-split">
            {dockTab === 'inspector' && (
              <div className="linter-body" role="tabpanel" aria-label="Contextual inspector" onScroll={(e) => { dockScrollRef.current.inspector = e.currentTarget.scrollTop; }}>
                {/* Read-only roles see the inspector but cannot change anything. */}
                <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                  <Inspector checkpointInspector={checkpointInspector} />
                </fieldset>
              </div>
            )}
            {dockTab === 'history' && (
              <div className="linter-body" role="tabpanel" aria-label="Version history" style={{ padding: 0, overflow: 'hidden' }}>
                <HistoryPanel
                  diagramId={activeDocId}
                  cloud={isSignedIn() && isServerDocId(activeDocId)}
                  canEdit={editable}
                  localCheckpoints={checkpoints}
                  onCompare={() => { pushToast('Compare opens in the History view'); navigate('/history'); }}
                  onRestoreLocal={restoreCheckpoint}
                  onRestored={reloadActiveDoc}
                />
              </div>
            )}
            {dockTab === 'collab' && (
              <div className="linter-body" role="tabpanel" aria-label="Live collaborators" style={{ padding: 0, overflow: 'hidden', flex: '1 1 0', minHeight: 0 }} onScroll={(e) => { dockScrollRef.current.collab = e.currentTarget.scrollTop; }}>
                <CollaborationPanel diagramId={activeDocId} />
              </div>
            )}
            {dockTab === 'assistant' && <AiAssistantPanel />}
          </div>
        </aside>
      )}
    </div>
    </CanvasLocalContext.Provider>
  );
}
