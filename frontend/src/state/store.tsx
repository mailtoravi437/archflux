import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadTheme, saveTheme } from './theme';
import type { ReactNode } from 'react';
import type { ArchEdge, ArchNode, DiagramDoc, DisplayStyle, FreeStroke, FreeText, FreshnessState, Layer, LibraryShape, Page, TextFont, ThemeName } from '../types';
import type { Checkpoint } from '../types';
import { api, isLimitReachedError } from '../lib/api';
import type { DiagramRoleWire } from '../lib/api';
import { canEdit } from '../lib/access';
import { buildArchExport, validateArchImport } from '../lib/archFormat';
import { defaultLayer, defaultPage, newId as newDocId, normalizeDoc, normalizeEdge, normalizeNode } from '../lib/docModel';
import type { DocState } from './ops/types';
import * as pageOps from './ops/pages';
import * as styleOps from './ops/style';
import * as displayStyleOps from './ops/displayStyle';
import { trashLocalDoc } from './libraryLocal';
import type { PortSide } from '../lib/canvasGeometry';
import type { ImportedDoc } from '../lib/import/types';
import * as layerOps from './ops/layers';
import * as arrangeOps from './ops/arrange';
import * as findOps from './ops/findReplace';
import * as containmentOps from './ops/containment';
import * as collapseOps from './ops/containmentCollapse';
import * as laneOps from './ops/containmentLanes';
import type { FindQuery, FindMatch } from './ops/findReplace';
import { layeredLayout } from '../lib/layout';
import { conflictFromError, type ConflictInfo } from './conflict';
import { notConnectedSync, offlineSyncFailure } from './syncState';
import { exportDocument, downloadExport } from '../canvas/export/ExportPipeline';
import { isSignedIn } from './session';
import { track } from '../lib/analytics';
import { duplicateParentIds } from '../lib/duplicateParentIds';

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
  /** Pages and layers at the time of the checkpoint (older checkpoints lack them). */
  pages?: Page[];
  layers?: Layer[];
}

export interface SyncLog {
  id: number;
  text: string;
  time: string;
}

export type CanvasTool = 'select' | 'pan' | 'draw' | 'text' | 'service' | 'gateway' | 'db' | 'stream' | 'connector' | 'comment' | 'frame' | 'swimlane';
export type LayoutKind = 'dag' | 'tree' | 'matrix';

// ==================== SPLIT CONTEXTS FOR PERFORMANCE ====================

// Core graph data - changes frequently during editing
export interface DiagramCoreContextValue {
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
  /** Pages of the active doc, sorted by `order` (DATA_MODEL_R1 §2.4). */
  pages: Page[];
  /** Layers of the active doc. */
  layers: Layer[];
  /** Doc-level defaults: persisted and saved, never in the undo stack. */
  docDefaults: DocDefaults;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;
  selectedStrokeId: string | null;
  setSelectedStrokeId: (id: string | null) => void;
  selectedTextId: string | null;
  setSelectedTextId: (id: string | null) => void;
  multiSel: string[];
  setMultiSel: (ids: string[]) => void;
}

// Stable action functions - rarely change
export interface DiagramActionsContextValue {
  // Node operations
  addNode: (type: CanvasTool, x: number, y: number) => void;
  /** Adds a fully built node (Shapes panel, R1-E05-T04) with its x/y kept exactly; one undo step. `pos` overrides x/y (top-left, world). */
  insertNode: (node: ArchNode, pos?: { x: number; y: number }) => void;
  /** Quick-add: inserts `node` and a sync edge `fromId` -> node as ONE undo step, and selects the node. */
  insertConnected: (node: ArchNode, fromId: string) => void;
  deleteSelected: () => void;
  /** Deletes nodes (with their edges), and any freehand stroke / text ids in the list, as ONE undo step. */
  deleteNodes: (ids: string[]) => void;
  /** Duplicates `id`, or the selected node when omitted (menus pass the id: their closure can predate the selection). */
  duplicateSelected: (id?: string) => void;
  updateNode: (id: string, patch: Partial<ArchNode>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  checkpoint: (markDrift?: boolean) => void;
  // Edge operations
  deleteEdge: (id: string) => void;
  updateEdge: (id: string, patch: Partial<ArchEdge>) => void;
  connectNodes: (from: string, to: string | null, targetCoords?: { x: number; y: number }, ports?: { fromPort?: PortSide | null; toPort?: PortSide | null }) => void;
  // Graph operations
  loadGraph: (nodes: ArchNode[], edges: ArchEdge[], label?: string) => void;
  mergeGraph: (nodes: ArchNode[], edges: ArchEdge[], label?: string) => void;
  // Stroke operations
  addStroke: (pts: { x: number; y: number }[], color: string, width: number) => void;
  updateStroke: (id: string, patch: Partial<FreeStroke>) => void;
  moveStroke: (id: string, dx: number, dy: number) => void;
  deleteStroke: (id: string) => void;
  // Text operations
  addText: (x: number, y: number, text: string, fontSize: number, color: string) => string | null;
  updateText: (id: string, patch: Partial<FreeText>) => void;
  moveText: (id: string, dx: number, dy: number) => void;
  deleteText: (id: string) => void;
  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  // Layout
  applyLayout: (kind: LayoutKind) => void;
  panToNode: (id: string) => void;
  placeShape: (shape: LibraryShape, x: number, y: number) => void;
  // Pages and layers (R1-E00-T04): each call is one undo step, except setDocDefaults.
  addPage: (name?: string) => string;            // returns id, activates it
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => void;              // refuses the last page (toast "A diagram needs at least one page")
  reorderPages: (orderedIds: string[]) => void;
  duplicatePage: (id: string) => string;         // deep-copies elements with new ids, remaps edges/parentId
  addLayer: (name?: string) => string;
  updateLayer: (id: string, patch: Partial<Omit<Layer, 'id'>>) => void;
  reorderLayers: (bottomToTop: string[]) => void;  // stacking order, first = lowest; one undo step
  deleteLayer: (id: string) => void;             // moves its elements to 'ly-default'; refuses 'ly-default'
  moveToLayer: (ids: string[], layerId: string) => void;
  /** Moves nodes (and their children) to another page; edges that would cross pages are removed. One undo step. */
  moveToPage: (ids: string[], pageId: string) => void;
  // Containment (R1-E03-T02/T03/T06). The first three are history-silent: they run inside a drag that took one `checkpoint`.
  moveWithChildren: (id: string, x: number, y: number) => void;     // moves a node to (x, y) with its descendants; ancestors do not grow until the drop (`setParent` + `growBoundaries`)
  setParent: (ids: string[], parentId: string | null) => void;       // drop-in; rejects cycles, depth > 6, locked nodes
  growBoundaries: (ids: string[]) => void;                           // after a resize: ancestors of ids grow (never shrink)
  toggleCollapse: (id: string) => void;
  fitToContents: (id: string) => void;
  deleteBoundary: (id: string, mode: 'only' | 'with') => void;
  createBoundary: (kind: 'frame' | 'swimlane', rect: { x0: number; y0: number; x1: number; y1: number }) => string; // '' when refused (too small)
  addLaneBelow: (id: string) => string;
  setDocDefaults: (patch: Partial<NonNullable<DiagramDoc['defaults']>>) => void;
  // Arrange (R1-E04-T01/T02): each call is one undo step; locked nodes and nodes on locked layers are skipped.
  align: (ids: string[], edge: arrangeOps.AlignEdge) => void;          // needs >= 2 unlocked nodes
  distribute: (ids: string[], axis: 'h' | 'v') => void;               // needs >= 3 unlocked nodes
  matchSize: (ids: string[], dim: 'w' | 'h' | 'both') => void;         // to ids[0], the primary node
  zOrder: (ids: string[], cmd: 'front' | 'back' | 'forward' | 'backward') => void;
  setLocked: (ids: string[], locked: boolean) => void;
  /** Format painter / multi-select styling (R1-E04-T06): applies the style keys in `style` to `ids`; one undo step. */
  pasteStyle: (ids: string[], style: Partial<ArchNode>) => void;
  /** Switch icon / card / shape (R1-E02-T05): one undo step; w/h reset unless the node is custom sized. */
  setDisplayStyle: (ids: string[], style: DisplayStyle) => void;
  // Find and replace, select similar (R1-E10-T05). Find reads the active page.
  findMatches: (q: FindQuery) => FindMatch[];
  replaceAll: (q: FindQuery, replacement: string) => number;          // returns the number of fields replaced; one undo step
  selectSimilar: (id: string) => string[];                             // sets multiSel and returns it
}

// UI state - changes during interaction
export interface DiagramUIContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
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
  freshness: FreshnessState;
  freshnessLabel: string;
  driftCount: number;
  toasts: Toast[];
  pushToast: (text: string) => void;
  pauseToasts: () => void;
  resumeToasts: (ids: number[]) => void;
  isOnline: boolean;
  lintCount: number;
  /** Last resync failure message, if any. Cleared on next attempt/success. */
  syncError: string | null;
  /** Page shown on the canvas (UI state, not doc data). Defaults to the first page. */
  activePageId: string;
  setActivePageId: (id: string) => void;
}

// Document management
export interface DiagramDocsContextValue {
  docTitle: string;
  setDocTitle: (t: string) => void;
  dirty: boolean;
  docs: DiagramDoc[];
  activeDocId: string;
  openDoc: (id: string) => void;
  newDoc: () => void;
  renameDoc: (id: string, title: string) => void;
  setDocTags: (id: string, tags: string[]) => void;
  duplicateDoc: (id: string) => void;
  /**
   * R1-E09-T03: create a doc from an already-validated import ('new', opens it) or append its pages
   * to the active doc ('page', one undo step). Returns false when nothing was imported.
   */
  importDocument: (doc: ImportedDoc, mode: 'new' | 'page') => boolean;
  deleteDoc: (id: string) => void;
  /** Re-adds a doc taken from the local trash; false when its id is already in the library. */
  restoreLocalDoc: (doc: DiagramDoc) => boolean;
  /** Last server-acknowledged version for the active doc (null when local/unknown). */
  serverVersion: number | null;
  /** Pending stale-write conflict, if any. Never resolved silently. */
  saveConflict: ConflictInfo | null;
  /** PUT the active graph with optimistic concurrency. Local docs no-op. */
  saveActiveDoc: () => Promise<'saved' | 'local' | 'conflict' | 'error' | 'offline' | 'limit'>;
  /** True when the active local doc could not be created on the server because the plan limit was reached (it stays local). */
  activeDocLimited: boolean;
  /** Retry the pending save with force:true (remote preserved as a revision). */
  forceSaveActiveDoc: () => Promise<'saved' | 'error'>;
  /** Discard local edits and load the server graph + version. */
  reloadActiveDoc: () => Promise<'reloaded' | 'error'>;
  dismissSaveConflict: () => void;
  /**
   * The caller's role on the active server diagram, or null when it is local or not known yet.
   * Below editor the store refuses every edit action (see `EDIT_ACTIONS`) and the canvas hides the edit tools.
   */
  role: DiagramRoleWire | null;
  /** Loads a server diagram the caller can open but that is not in the library yet, adds it and opens it. False when it could not be loaded. */
  addServerDoc: (id: string) => Promise<boolean>;
}

// Collaboration features
export interface DiagramCollabContextValue {
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
  createBranch: (branchName?: string) => void;
  branchError: string | null;
  retryBranch: () => void;
  syncLog: SyncLog[];
  pushLog: (text: string) => void;
  resync: () => void;
  healOrphan: (id?: string | null, silent?: boolean) => void;
  pruneWire: (id?: string | null, silent?: boolean) => void;
  healAll: () => void;
  exportArch: () => void;
  exportPNG: () => void;
  exportSVG: () => void;
  exportCSV: () => void;
  exportPrint: () => void;
  importArch: (data: { nodes: ArchNode[]; edges: ArchEdge[] }) => { imported: boolean; warnings: string[] };
}

export type DocDefaults = NonNullable<DiagramDoc['defaults']>;

export const DiagramCoreContext = createContext<DiagramCoreContextValue | null>(null);
export const DiagramActionsContext = createContext<DiagramActionsContextValue | null>(null);
export const DiagramUIContext = createContext<DiagramUIContextValue | null>(null);
export const DiagramDocsContext = createContext<DiagramDocsContextValue | null>(null);
export const DiagramCollabContext = createContext<DiagramCollabContextValue | null>(null);

/** Actions that change the document. Refused for roles below editor. (`loadGraph` is not listed: live collaboration applies remote changes through it.) */
const EDIT_ACTIONS = [
  'addNode', 'insertNode', 'insertConnected', 'deleteSelected', 'deleteNodes', 'duplicateSelected', 'updateNode', 'moveNode', 'checkpoint',
  'deleteEdge', 'updateEdge', 'connectNodes', 'mergeGraph', 'addStroke', 'updateStroke', 'moveStroke', 'deleteStroke',
  'addText', 'updateText', 'moveText', 'deleteText', 'undo', 'redo', 'applyLayout', 'placeShape', 'addPage', 'renamePage', 'deletePage',
  'reorderPages', 'duplicatePage', 'addLayer', 'updateLayer', 'reorderLayers', 'deleteLayer', 'moveToLayer', 'moveToPage', 'setDocDefaults',
  'align', 'distribute', 'matchSize', 'zOrder', 'setLocked', 'pasteStyle', 'setDisplayStyle', 'replaceAll',
  'moveWithChildren', 'setParent', 'growBoundaries', 'toggleCollapse', 'fitToContents', 'deleteBoundary', 'createBoundary', 'addLaneBelow',
] as const;
const SILENT_EDIT_ACTIONS: ReadonlySet<string> = new Set(['moveNode', 'updateNode', 'updateEdge', 'moveStroke', 'moveText', 'updateText', 'updateStroke', 'checkpoint', 'moveWithChildren', 'setParent', 'growBoundaries']);

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

function clonePages(src: Page[]): Page[] {
  return src.map((p) => ({ ...p }));
}

function cloneLayers(src: Layer[]): Layer[] {
  return src.map((l) => ({ ...l }));
}

/** Pages / layers / defaults of a doc, with the §2.4 fallbacks applied. */
function docMeta(doc: DiagramDoc | undefined): { pages: Page[]; layers: Layer[]; defaults: DocDefaults } {
  const pages = doc?.pages && doc.pages.length > 0 ? [...doc.pages].sort((a, b) => a.order - b.order) : [defaultPage()];
  const layers = doc?.layers && doc.layers.length > 0 ? doc.layers : [defaultLayer()];
  return { pages: clonePages(pages), layers: cloneLayers(layers), defaults: { ...(doc?.defaults ?? {}) } };
}

/** The doc fields that mirror live page/layer state (persist, save, doc switch). */
function metaFields(pages: Page[], layers: Layer[], defaults: DocDefaults): Pick<DiagramDoc, 'pages' | 'layers' | 'defaults'> {
  return { pages: clonePages(pages), layers: cloneLayers(layers), defaults: { ...defaults } };
}

let elementSeq = 1;
/** Element ids for page duplication: unique within a burst of copies. */
function elementId(prefix: 'n' | 'e' | 's' | 't'): string {
  return `${prefix}-${Date.now().toString(36)}${(elementSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Server-backed versioning: local docs use `doc-*` ids; docs synced with the
// server carry the server UUID as their id (see exportDiagram flow).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function serverDiagramId(docId: string | null | undefined): string | null {
  if (!docId || docId.startsWith('doc-')) return null;
  return UUID_RE.test(docId) ? docId : null;
}

/** Server diagram JSON → local DiagramDoc (cross-device library, FE-Q1). */
export function serverDiagramToDoc(raw: unknown): DiagramDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== 'string' || !UUID_RE.test(d.id)) return null;
  const graph = (typeof d.graph === 'object' && d.graph !== null ? d.graph : {}) as Record<string, unknown>;
  const pick = (k: string): unknown[] => (Array.isArray(graph[k]) ? (graph[k] as unknown[]) : Array.isArray(d[k]) ? (d[k] as unknown[]) : []);
  const nodes = pick('nodes').filter(isValidNode) as ArchNode[];
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (pick('edges') as unknown[])
    .filter((e): e is ArchEdge => isValidEdge(e, ids))
    .map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
  const time = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : Date.now());
  const doc: DiagramDoc = {
    id: d.id,
    title: typeof d.title === 'string' && d.title ? d.title.slice(0, 80) : 'untitled.arch',
    nodes: reconcileOrphans(nodes, edges),
    edges,
    strokes: (pick('strokes') as unknown[]).filter(isValidStroke) as FreeStroke[],
    texts: (pick('texts') as unknown[]).filter(isValidText) as FreeText[],
    createdAt: time(d.createdAt),
    updatedAt: time(d.updatedAt),
  };
  // Top-level pages / layers / defaults from the server graph (R1-E00-T06).
  for (const k of ['pages', 'layers', 'defaults'] as const) {
    const v = k in graph ? graph[k] : d[k];
    if (v !== undefined) (doc as unknown as Record<string, unknown>)[k] = v;
  }
  if (typeof d.version === 'number') doc.serverVersion = d.version;
  return normalizeDoc(doc);
}

// Adapt a server checkpoint ({id,diagramId,title,meta,branch,snapshot,createdAt})
// to the local SnapshotCheckpoint shape so both render in one list.
export function serverCheckpointToLocal(cp: any): SnapshotCheckpoint {
  const snap = cp?.snapshot ?? {};
  const graph = snap?.graph ?? snap;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const strokes = Array.isArray(graph?.strokes) ? graph.strokes : [];
  const texts = Array.isArray(graph?.texts) ? graph.texts : [];
  return {
    id: String(cp.id),
    title: String(cp.title ?? 'checkpoint'),
    meta: String(cp.meta ?? cp.branch ?? cp.createdAt ?? ''),
    active: false,
    badge: `${nodes.length} nodes, ${edges.length} routes`,
    nodes: cloneNodes(nodes),
    edges: cloneEdges(edges),
    strokes: cloneStrokes(strokes),
    texts: cloneTexts(texts),
  };
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
          // serverVersion is optional: older payloads omit it (no format bump)
          // and corrupt non-number values are dropped, never trusted.
          const doc = { ...d, nodes: reconcileOrphans(nodes, edges), edges, strokes, texts };
          if (typeof doc.serverVersion !== 'number') delete doc.serverVersion;
          return normalizeDoc(doc);
        })
        .filter((d): d is DiagramDoc => d !== null);
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
    const title = typeof parsed.docTitle === 'string' && parsed.docTitle ? parsed.docTitle : 'untitled.arch';
    const doc = normalizeDoc({ id: `doc-${now.toString(36)}`, title, nodes: reconcileOrphans(nodes, edges), edges, strokes: [], createdAt: now, updatedAt: now });
    if (!doc) return null;
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

/** Normalise incoming nodes/edges against a doc's pages (DATA_MODEL_R1 §1.2). */
function normalizeGraph(ns: ArchNode[], es: ArchEdge[], doc: DiagramDoc | undefined): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const ctx = doc ?? { id: '', title: '', nodes: [], edges: [], createdAt: 0, updatedAt: 0, pages: [defaultPage()] };
  return { nodes: ns.map((n) => normalizeNode(n, ctx)), edges: es.map(normalizeEdge) };
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

const FIRST_DOC_ID = 'doc-first';

/** First-run document: one empty canvas (FRONTEND_SPEC "No mock data", FE-M1). */
function firstRunDoc(): DiagramDoc {
  const now = Date.now();
  return {
    // Fixed id: fresh-install initializers across states must agree on the key.
    id: FIRST_DOC_ID,
    title: 'untitled.arch',
    nodes: [],
    edges: [],
    strokes: [],
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
/** Heal target for an isolated node: the most-connected other node (FE-M7). */
function healHub(nodes: ArchNode[], edges: ArchEdge[], excludeId: string): ArchNode | undefined {
  const deg = new Map<string, number>();
  edges.forEach((e) => {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    if (e.to) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  });
  let best: ArchNode | undefined;
  for (const n of nodes) {
    if (n.id === excludeId) continue;
    if (!best || (deg.get(n.id) ?? 0) > (deg.get(best.id) ?? 0)) best = n;
  }
  return best;
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
  const [theme, setThemeState] = useState<ThemeName>(() => loadTheme() ?? persisted.current?.theme ?? 'light');
  const [nodes, setNodesState] = useState<ArchNode[]>(() =>
    persisted.current ? cloneNodes(persisted.current.nodes) : [],
  );
  const [edges, setEdgesState] = useState<ArchEdge[]>(() =>
    persisted.current ? cloneEdges(persisted.current.edges) : [],
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
  // Pages / layers / defaults of the active doc (R1-E00-T04).
  const persistedActiveDoc = (): DiagramDoc | undefined => {
    const p = persisted.current;
    return p?.docs?.find((d) => d.id === p.activeDocId);
  };
  const [pages, setPagesState] = useState<Page[]>(() => docMeta(persistedActiveDoc()).pages);
  const [layers, setLayersState] = useState<Layer[]>(() => docMeta(persistedActiveDoc()).layers);
  const [docDefaults, setDocDefaultsState] = useState<DocDefaults>(() => docMeta(persistedActiveDoc()).defaults);
  const [activePageId, setActivePageIdState] = useState<string>(() => docMeta(persistedActiveDoc()).pages[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [freshness, setFreshness] = useState<FreshnessState>(() => persisted.current?.freshness ?? 'local');
  const [freshnessLabel, setFreshnessLabel] = useState(
    () => persisted.current?.freshnessLabel ?? 'Local only — no live source connected',
  );
  const [driftCount, setDriftCount] = useState(() => persisted.current?.driftCount ?? 0);
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
  const [docTitle, setDocTitleState] = useState(() => persisted.current?.docTitle ?? 'untitled.arch');
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
    const docs = persisted.current?.docs ?? [firstRunDoc()];
    const savedActive = persisted.current?.activeDocId;
    const activeDocId = savedActive && docs.some((d) => d.id === savedActive) ? savedActive : docs[0].id;
    return { docs, activeDocId };
  });
  const docs = docState.docs;
  const activeDocId = docState.activeDocId;
  const [dirty, setDirty] = useState(false);
  // Stale-write conflict for the active doc (§6.2). Set only on a caught
  // VERSION_CONFLICT; cleared by an explicit resolution (reload/force/duplicate/dismiss).
  const [saveConflict, setSaveConflict] = useState<ConflictInfo | null>(null);
  // Last resync failure (PROD-008). Visible until the next attempt/success.
  const [syncError, setSyncError] = useState<string | null>(null);
  const activeKeyOf = (): string => {
    const p = persisted.current;
    if (p?.activeDocId && p.docs?.some((d) => d.id === p.activeDocId)) return p.activeDocId;
    return p?.docs?.[0]?.id ?? FIRST_DOC_ID;
  };
  const [threadMap, setThreadMap] = useState<Record<string, ReviewThread[]>>(() => {
    const p = persisted.current;
    if (p?.threadsByDoc && Object.keys(p.threadsByDoc).length > 0) return p.threadsByDoc;
    // Legacy flat arrays migrate into the active document's scope.
    if (p && Array.isArray(p.threads)) {
      const clean = (p.threads as unknown[]).filter(isValidThread);
      if (clean.length > 0) return { [activeKeyOf()]: clean };
    }
    return { [activeKeyOf()]: [] };
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
    return { [activeKeyOf()]: [] };
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
    return [];
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Persist (debounced). The active doc always mirrors the live graph.
  // Review state persists per document (v5); legacy flat arrays migrate on load.
  const persistVersion = useRef(0);
  const schedulePersist = useCallback(() => {
    persistVersion.current += 1;
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const now = Date.now();
        const { docs: allDocs, activeDocId: active } = docsRef.current;
        const synced = allDocs.map((d) =>
          d.id === active
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current), updatedAt: now }
            : d,
        );
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ docs: synced, activeDocId: active, theme: themeRef.current, docTitle: docTitleRef.current, displayName, threadsByDoc: threadMap, cpsByDoc: cpsMap, syncLog, freshness: freshnessRef.current, freshnessLabel, driftCount, pan: panRef.current, zoom: zoomRef.current, v: 5 }),
        );
      } catch {
        /* quota ignore */
      }
    }, 300);
    return () => window.clearTimeout(t);
  // Collection sizes are deps so ink/text/node edits schedule a write even
  // when no other persist-tracked state changes (debounced, no extra renders).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistVersion, displayName, threadMap, cpsMap, syncLog, freshnessLabel, driftCount, nodes.length, edges.length, strokes.length, texts.length, pages, layers, docDefaults]);

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
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current), updatedAt: now }
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
  // Toast auto-dismiss (NAV-R3: 5s, max 3 visible). Hover/focus pauses:
  // the tray clears pending timers on enter and re-schedules on leave.
  const toastTimersRef = useRef(new Map<number, number>());
  const scheduleToastDismiss = useCallback((id: number, delay = 5000) => {
    const prev = toastTimersRef.current.get(id);
    if (prev !== undefined) window.clearTimeout(prev);
    toastTimersRef.current.set(
      id,
      window.setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((t) => t.filter((x) => x.id !== id));
      }, delay),
    );
  }, []);

  const pauseToasts = useCallback(() => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current.clear();
  }, []);

  const resumeToasts = useCallback(
    (ids: number[]) => {
      ids.forEach((id) => scheduleToastDismiss(id, 1500));
    },
    [scheduleToastDismiss],
  );

  const pushToast = useCallback((text: string) => {
    // Collapse rapid identical toasts (e.g. repeated layout clicks).
    const now = Date.now();
    if (lastToast.current.text === text && now - lastToast.current.at < 1200) return;
    lastToast.current = { text, at: now };
    const id = toastSeq++;
    // Max 3 visible (NAV-R3): oldest drops as new ones arrive.
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    scheduleToastDismiss(id);
  }, [scheduleToastDismiss]);

  const pushLog = useCallback((text: string) => {
    setSyncLog((prev) => [{ id: logSeq++, text, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
  }, []);

  // ---- Optimistic-concurrency version tracking (§6.2, PROD-004) ----
  // serverVersion rides on the doc model (optional, no format bump) and is
  // sent on PUT when known. Every enveloped DiagramController response flows
  // through rememberDiagramVersion, which tolerates shapes without one.
  const serverVersion = useMemo(
    () => docs.find((d) => d.id === activeDocId)?.serverVersion ?? null,
    [docs, activeDocId],
  );

  const setDocServerVersion = useCallback((docId: string, version: number) => {
    setDocState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === docId ? { ...d, serverVersion: version } : d)),
    }));
    schedulePersist();
  }, [schedulePersist]);

  const rememberDiagramVersion = useCallback((docId: string, resp: unknown) => {
    const v = (resp as { data?: { version?: unknown } } | null | undefined)?.data?.version;
    if (typeof v === 'number' && Number.isFinite(v)) setDocServerVersion(docId, v);
  }, [setDocServerVersion]);

  /** Move a doc (and its per-doc review state) to a new id — local → server (FE-Q1). */
  const rekeyDoc = useCallback((oldId: string, newId: string) => {
    if (oldId === newId) return;
    const moveKey = <T,>(prev: Record<string, T>): Record<string, T> => {
      if (!(oldId in prev)) return prev;
      const next = { ...prev, [newId]: prev[oldId] };
      delete next[oldId];
      return next;
    };
    setThreadMap(moveKey);
    setCpsMap(moveKey);
    setDocState((prev) => ({
      docs: prev.docs.map((d) => {
        if (d.id !== oldId) return d;
        // The active doc's pages / layers live in state: carry them across the id change.
        const live = prev.activeDocId === oldId ? metaFields(pagesRef.current, layersRef.current, defaultsRef.current) : {};
        return { ...d, ...live, id: newId };
      }),
      activeDocId: prev.activeDocId === oldId ? newId : prev.activeDocId,
    }));
  }, []);

  const dismissSaveConflict = useCallback(() => {
    setSaveConflict(null);
  }, []);

  const freshnessRef = useRef(freshness);
  freshnessRef.current = freshness;

  interface GraphSnap {
    nodes: ArchNode[];
    edges: ArchEdge[];
    strokes: FreeStroke[];
    texts: FreeText[];
    pages: Page[];
    layers: Layer[];
  }
  const pastRef = useRef<GraphSnap[]>([]);
  const futureRef = useRef<GraphSnap[]>([]);

  const snapshot = useCallback((n: ArchNode[], e: ArchEdge[], markDrift = true) => {
    const entry: GraphSnap = { nodes: cloneNodes(n), edges: cloneEdges(e), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), pages: clonePages(pagesRef.current), layers: cloneLayers(layersRef.current) };
    pastRef.current = [...pastRef.current.slice(-29), entry];
    futureRef.current = [];
    // setPast removed - using ref only
    // setFuture removed - using ref only
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

  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const layersRef = useRef(layers);
  // Locked rule (R1-E04-T02): delete actions skip locked nodes and nodes on locked layers.
  const lockState = (): DocState => ({ nodes: nodesRef.current, edges: edgesRef.current, strokes: [], texts: [], pages: [], layers: layersRef.current });
  layersRef.current = layers;
  const defaultsRef = useRef(docDefaults);
  defaultsRef.current = docDefaults;
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;

  // Silent page / layer setters that keep the refs current within one event.
  const setPagesNow = useCallback((next: Page[]) => {
    pagesRef.current = next;
    setPagesState(next);
  }, []);
  const setLayersNow = useCallback((next: Layer[]) => {
    layersRef.current = next;
    setLayersState(next);
  }, []);
  const setActivePageId = useCallback((id: string) => {
    if (!pagesRef.current.some((p) => p.id === id)) return;
    activePageIdRef.current = id;
    setActivePageIdState(id);
  }, []);
  /** Load a doc's pages / layers / defaults into state and show its first page. */
  const loadDocMeta = useCallback((doc: DiagramDoc | undefined) => {
    const meta = docMeta(doc);
    setPagesNow(meta.pages);
    setLayersNow(meta.layers);
    defaultsRef.current = meta.defaults;
    setDocDefaultsState(meta.defaults);
    activePageIdRef.current = meta.pages[0].id;
    setActivePageIdState(meta.pages[0].id);
  }, [setPagesNow, setLayersNow]);
  // Undo/redo or a page delete can remove the active page: fall back to the first.
  useEffect(() => {
    if (!pages.some((p) => p.id === activePageId) && pages.length > 0) setActivePageId(pages[0].id);
  }, [pages, activePageId, setActivePageId]);
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
      schedulePersist();
    },
    [pushToast, pushLog, snapshot, schedulePersist],
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
      { nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), pages: clonePages(pagesRef.current), layers: cloneLayers(layersRef.current) },
      ...futureRef.current,
    ].slice(0, 30);
    pastRef.current = p.slice(0, -1);
    // setPast removed - using ref only
    // setFuture removed - using ref only
    setNodesState(cloneNodes(last.nodes));
    setEdgesState(cloneEdges(last.edges));
    setStrokesState(cloneStrokes(last.strokes ?? []));
    setTextsState(cloneTexts(last.texts ?? []));
    setPagesNow(clonePages(last.pages));
    setLayersNow(cloneLayers(last.layers));
    pushToast('Undo applied');
  }, [pushToast, setPagesNow, setLayersNow]);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (f.length === 0) {
      pushToast('Nothing to redo');
      return;
    }
    const head = f[0];
    pastRef.current = [
      ...pastRef.current,
      { nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), pages: clonePages(pagesRef.current), layers: cloneLayers(layersRef.current) },
    ].slice(-30);
    futureRef.current = f.slice(1);
    // setPast removed - using ref only
    // setFuture removed - using ref only
    setNodesState(cloneNodes(head.nodes));
    setEdgesState(cloneEdges(head.edges));
    setStrokesState(cloneStrokes(head.strokes ?? []));
    setTextsState(cloneTexts(head.texts ?? []));
    setPagesNow(clonePages(head.pages));
    setLayersNow(cloneLayers(head.layers));
    pushToast('Redo applied');
  }, [pushToast, setPagesNow, setLayersNow]);

  const setTheme = useCallback(
    (t: ThemeName) => {
      setThemeState(t);
      saveTheme(t);
      document.documentElement.setAttribute('data-theme', t);
      pushToast(`Switched theme to ${t.toUpperCase()}`);
      schedulePersist();
    },
    [pushToast, schedulePersist],
  );

  const setPan = useCallback((p: { x: number; y: number }) => {
    setPanState({ x: p.x, y: p.y });
    schedulePersist();
  }, [schedulePersist]);

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
    schedulePersist();
  }, [schedulePersist]);

  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    // setPast removed - using ref only
    // setFuture removed - using ref only
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
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current), updatedAt: now }
            : d,
        ),
      }));
      setNodesState(cloneNodes(target.nodes));
      setEdgesState(cloneEdges(target.edges));
      setStrokesState(cloneStrokes(target.strokes ?? []));
      setTextsState(cloneTexts(target.texts ?? []));
      loadDocMeta(target);
      setDocTitleState(target.title);
      setSelectedId(null);
      setDirty(false);
      resetHistory();
      schedulePersist();
      pushToast(`Opened ${target.title}`);
    },
    [pushToast, resetHistory, schedulePersist, loadDocMeta],
  );

  const addServerDoc = useCallback(
    async (id: string): Promise<boolean> => {
      if (docsRef.current.docs.some((d) => d.id === id)) {
        openDoc(id);
        return true;
      }
      try {
        const resp = await api.getDiagram(id);
        const doc = serverDiagramToDoc(resp?.data);
        if (!doc) return false;
        const next = { ...docsRef.current, docs: [...docsRef.current.docs, doc] };
        docsRef.current = next; // openDoc reads the ref, and the state update lands on the next render
        setDocState((prev) => (prev.docs.some((d) => d.id === doc.id) ? prev : { ...prev, docs: [...prev.docs, doc] }));
        openDoc(doc.id);
        return true;
      } catch {
        return false;
      }
    },
    [openDoc],
  );

  // Role on the active server diagram (R1-E07-T06). Keyed by doc id so a stale answer never applies to another doc.
  const [roleState, setRoleState] = useState<{ id: string; role: DiagramRoleWire | null }>({ id: '', role: null });
  useEffect(() => {
    const sid = serverDiagramId(docState.activeDocId);
    if (!sid || !isSignedIn()) return;
    let cancelled = false;
    api.access.state(sid).then(
      (r) => { if (!cancelled) setRoleState({ id: docState.activeDocId, role: r.data.state === 'ok' ? r.data.role ?? null : null }); },
      () => { /* role unknown: the server still enforces access on every write */ },
    );
    return () => { cancelled = true; };
  }, [docState.activeDocId]);
  const role = roleState.id === docState.activeDocId ? roleState.role : null;

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
            ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current), updatedAt: now }
            : d,
        ),
        doc,
      ],
    }));
    setNodesState([]);
    setEdgesState([]);
    setStrokesState([]);
    setTextsState([]);
    loadDocMeta(doc);
    setDocTitleState(doc.title);
    setSelectedId(null);
    setDirty(false);
    resetHistory();
    setFreshness('local');
    setFreshnessLabel('New diagram — add services to begin');
    setDriftCount(0);
    schedulePersist();
    pushToast(`Created ${doc.title}`);
    pushLog(`Diagram created: ${doc.title}`);
  }, [pushToast, pushLog, resetHistory, schedulePersist, loadDocMeta]);

  const renameDoc = useCallback((id: string, title: string) => {
    const name = title.trim().slice(0, 80) || 'untitled.arch';
    setDocState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === id ? { ...d, title: name, updatedAt: Date.now() } : d)),
    }));
    if (id === activeDocRef.current) setDocTitleState(name);
    schedulePersist();
  }, [schedulePersist]);

  const setDocTags = useCallback((id: string, tags: string[]) => {
    const clean = [...new Set(tags.map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
    setDocState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === id ? { ...d, tags: clean, updatedAt: Date.now() } : d)),
    }));
    schedulePersist();
  }, [schedulePersist]);

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
      // Children keep their boundary: parentId is remapped to the copy, or dropped if its parent was not copied (R1-BUG-02).
      const nodesCopy = liveNodes.map((n) => duplicateParentIds({ ...n, id: idMap.get(n.id)! }, idMap));
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
        ...(src.id === cur.activeDocId
          ? metaFields(pagesRef.current, layersRef.current, defaultsRef.current)
          : metaFields(docMeta(src).pages, docMeta(src).layers, docMeta(src).defaults)),
      };
      setDocState((prev) => ({ activeDocId: copy.id, docs: [...prev.docs, copy] }));
      setNodesState(cloneNodes(copy.nodes));
      setEdgesState(cloneEdges(copy.edges));
      setStrokesState(cloneStrokes(copy.strokes ?? []));
      setTextsState(cloneTexts(copy.texts ?? []));
      loadDocMeta(copy);
      setDocTitleState(copy.title);
      setSelectedId(null);
      setDirty(false);
      resetHistory();
      schedulePersist();
      pushToast(`Duplicated as ${copy.title}`);
    },
    [pushToast, resetHistory, schedulePersist, loadDocMeta],
  );

  const removeDocLocally = useCallback(
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
        loadDocMeta(fresh);
        setDocTitleState(fresh.title);
        setSelectedId(null);
        setDirty(false);
        resetHistory();
        schedulePersist();
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
        loadDocMeta(nextActive);
        setDocTitleState(nextActive.title);
        setSelectedId(null);
        setDirty(false);
        resetHistory();
      }
      schedulePersist();
      pushToast(`Deleted ${target.title}`);
    },
    [pushToast, resetHistory, schedulePersist, loadDocMeta],
  );

  // Server-backed docs are deleted on the server first, otherwise the next
  // library sync would bring them back (FE-Q1).
  const deleteDoc = useCallback(
    (id: string) => {
      const serverId = serverDiagramId(id);
      if (!serverId || !isSignedIn()) {
        // R1-E06-T03: a local delete goes to the local trash (30 days) instead of vanishing.
        const cur = docsRef.current;
        const target = cur.docs.find((d) => d.id === id);
        if (target) {
          const live = id === cur.activeDocId;
          trashLocalDoc(
            live
              ? { ...target, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current) }
              : target,
          );
        }
        removeDocLocally(id);
        return;
      }
      if (!isOnlineRef.current) {
        pushToast('You are offline — reconnect to delete a server diagram');
        return;
      }
      api.deleteDiagram(serverId).then(
        () => {
          pushLog(`Deleted server diagram ${serverId}`);
          removeDocLocally(id);
        },
        (e: unknown) => pushToast(`Delete failed: ${e instanceof Error ? e.message : e}`),
      );
    },
    [removeDocLocally, pushToast, pushLog],
  );

  /** Puts a doc back from the local trash (R1-E06-T03). Refuses a duplicate id. */
  const restoreLocalDoc = useCallback(
    (doc: DiagramDoc): boolean => {
      if (docsRef.current.docs.some((d) => d.id === doc.id)) return false;
      setDocState((prev) => ({ ...prev, docs: [...prev.docs, { ...doc, updatedAt: Date.now() }] }));
      schedulePersist();
      pushToast(`Restored ${doc.title}`);
      return true;
    },
    [pushToast, schedulePersist],
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
        pageId: activePageIdRef.current,
      };
      setNodesState((prev) => [...prev, node]);
      setSelectedId(node.id);
      track('element_added', { kind: shape.kind });
      pushToast(`Added ${shape.label}`);
      pushLog(`Library: added ${shape.label} (${shape.provider})`);
    },
    [pushToast, pushLog, snapshot],
  );

  const zoomBy = useCallback((delta: number) => {
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
    schedulePersist();
  }, [schedulePersist]);

  const zoomTo = useCallback((z: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)));
    schedulePersist();
  }, [schedulePersist]);

  const resetView = useCallback(() => {
    setZoom(1.0);
    setPanState({ ...DEFAULT_PAN });
    schedulePersist();
  }, [schedulePersist]);

  const applyLayout = useCallback(
    (kind: LayoutKind) => {
      // Layout is cosmetic: undoable, but not data drift.
      snapshot(nodesRef.current, edgesRef.current, false);
      // Generic deterministic layout: works for any node count (PM AC6)
      const all = cloneNodes(nodesRef.current);
      let laid = all;
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
        // dag: column by depth, via the shared layout (R1-E09-T05; capped on cycles, R1-BUG-03).
        laid = layeredLayout(all, edgesRef.current, 'LR');
      }
      setNodesState(laid);
      pushToast(`Applying ${kind.toUpperCase()} layout...`);
    },
    [pushToast, snapshot],
  );

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
        pageId: activePageIdRef.current,
      };
      setNodesState((prev) => [...prev, node]);
      setSelectedId(id);
      track('element_added', { kind: type });
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
    const target = nodesRef.current.find((n) => n.id === id);
    if (target && arrangeOps.isNodeLocked(lockState(), target)) {
      pushToast('Locked nodes cannot be deleted');
      return;
    }
    snapshot(nodesRef.current, edgesRef.current);
    // Deleting a boundary here keeps its children, moved up to its parent ("Delete with contents" is `deleteBoundary`).
    const parentOfDeleted = target?.parentId ?? null;
    setNodesState((prev) => prev.filter((n) => n.id !== id).map((n) => (n.parentId === id ? { ...n, parentId: parentOfDeleted } : n)));
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
      const ls = lockState();
      for (const n of nodesRef.current) if (set.has(n.id) && arrangeOps.isNodeLocked(ls, n)) set.delete(n.id);
      // Select-all also carries freehand stroke and text ids: they go in the same undo step (locked layers are skipped).
      const lockedLayerIdSet = new Set(layersRef.current.filter((l) => l.locked).map((l) => l.id));
      const free = (x: { id: string; layerId?: string }) => set.has(x.id) && !lockedLayerIdSet.has(x.layerId ?? 'ly-default');
      const strokeIds = new Set(strokesRef.current.filter(free).map((s) => s.id));
      const textIds = new Set(textsRef.current.filter(free).map((t) => t.id));
      const nodeIds = new Set(nodesRef.current.filter((n) => set.has(n.id)).map((n) => n.id));
      if (nodeIds.size === 0 && strokeIds.size === 0 && textIds.size === 0) {
        pushToast('Locked nodes cannot be deleted');
        return;
      }
      snapshot(nodesRef.current, edgesRef.current);
      if (nodeIds.size > 0) {
        setNodesState((prev) => {
          const byId = new Map(prev.map((n) => [n.id, n]));
          // Children of a deleted boundary move up to the nearest surviving ancestor.
          const survivor = (pid: string | null | undefined): string | null => {
            let cur = pid ?? null;
            while (cur && nodeIds.has(cur)) cur = byId.get(cur)?.parentId ?? null;
            return cur;
          };
          return prev.filter((n) => !nodeIds.has(n.id)).map((n) => (n.parentId && nodeIds.has(n.parentId) ? { ...n, parentId: survivor(n.parentId) } : n));
        });
        setEdgesState((prev) => prev.filter((e) => !nodeIds.has(e.from) && !(e.to && nodeIds.has(e.to))));
      }
      if (strokeIds.size > 0) setStrokesState((prev) => prev.filter((s) => !strokeIds.has(s.id)));
      if (textIds.size > 0) setTextsState((prev) => prev.filter((t) => !textIds.has(t.id)));
      if (selectedId && nodeIds.has(selectedId)) setSelectedId(null);
      const total = nodeIds.size + strokeIds.size + textIds.size;
      const parts = [
        nodeIds.size > 0 ? `${nodeIds.size} node${nodeIds.size === 1 ? '' : 's'}` : '',
        strokeIds.size > 0 ? `${strokeIds.size} stroke${strokeIds.size === 1 ? '' : 's'}` : '',
        textIds.size > 0 ? `${textIds.size} text${textIds.size === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      pushToast(`Deleted ${parts.join(', ')}`);
      pushLog(`Canvas: bulk deleted ${total} elements`);
      if (strokeIds.size > 0 || textIds.size > 0) schedulePersist();
    },
    [selectedId, pushToast, pushLog, snapshot, schedulePersist],
  );

  const duplicateSelected = useCallback((id?: string) => {
    const n = nodesRef.current.find((x) => x.id === (id ?? selectedId));
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
    schedulePersist();
  }, [schedulePersist]);

  const connectNodes = useCallback(
    (from: string, to: string | null, targetCoords?: { x: number; y: number }, ports?: { fromPort?: PortSide | null; toPort?: PortSide | null }) => {
      snapshot(nodesRef.current, edgesRef.current);
      const edge: ArchEdge = {
        id: elementId('e'),
        from,
        to,
        targetCoords,
        ...(ports?.fromPort ? { fromPort: ports.fromPort } : {}),
        ...(to && ports?.toPort ? { toPort: ports.toPort } : {}),
        label: to ? 'route' : 'Unresolved route',
        color: to ? '#2563EB' : '#DC2626',
        isDangling: !to,
      };
      // clear orphan flags for both ends
      setNodesState((prev) => prev.map((n) => (n.id === from || n.id === to ? { ...n, isOrphan: false } : n)));
      setEdgesState((prev) => [...prev, edge]);
      track('relationship_added', { relKind: edge.relKind ?? 'sync' });
      pushToast(to ? `Connected ${from} → ${to}` : 'Created dangling wire (select target to resolve)');
      pushLog(`Canvas: wire ${from} → ${to ?? '∅'}`);
      schedulePersist();
    },
    [pushToast, pushLog, snapshot, schedulePersist],
  );

  /** Normalisation context whose first page is the active page (new elements land there). */
  const activePageCtx = useCallback((): DiagramDoc => {
    const page = pagesRef.current.find((p) => p.id === activePageIdRef.current) ?? pagesRef.current[0] ?? defaultPage();
    return { id: '', title: '', nodes: [], edges: [], createdAt: 0, updatedAt: 0, pages: [page] };
  }, []);

  const loadGraph = useCallback(
    (rawNs: ArchNode[], rawEs: ArchEdge[], label?: string) => {
      snapshot(nodesRef.current, edgesRef.current);
      const { nodes: ns, edges: es } = normalizeGraph(rawNs, rawEs, activePageCtx());
      const cleanEdges = es.filter((e) => ns.some((n) => n.id === e.from) && (e.to === null || ns.some((n) => n.id === e.to)));
      setNodesState(reconcileOrphans(cloneNodes(ns), cleanEdges));
      setEdgesState(cloneEdges(cleanEdges));
      setStrokesState([]);
      setTextsState([]);
      setSelectedId(null);
      setDirty(false);
      pushToast(label ?? 'Graph loaded');
      pushLog(label ?? 'Graph loaded');
      schedulePersist();
    },
    [pushToast, pushLog, snapshot, schedulePersist, activePageCtx],
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
        pageId: activePageIdRef.current,
      };
      setStrokesState((prev) => [...prev, stroke]);
      setDirty(true);
      pushLog(`Freehand: ink stroke (${clean.length} pts)`);
      schedulePersist();
    },
    [pushLog, snapshot, schedulePersist],
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
      schedulePersist();
    },
    [pushToast, pushLog, snapshot, schedulePersist],
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
        pageId: activePageIdRef.current,
      };
      setTextsState((prev) => [...prev, t]);
      setDirty(true);
      pushLog(`Text: "${clean.slice(0, 30)}${clean.length > 30 ? '…' : ''}"`);
      schedulePersist();
      return id;
    },
    [pushLog, snapshot, schedulePersist],
  );

  const updateText = useCallback((id: string, patch: Partial<FreeText>) => {
    setTextsState((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t)));
    setDirty(true);
    schedulePersist();
  }, [schedulePersist]);

  const moveText = useCallback((id: string, dx: number, dy: number) => {
    setTextsState((prev) =>
      prev.map((t) => (t.id === id ? { ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy) } : t)),
    );
    setDirty(true);
    schedulePersist();
  }, [schedulePersist]);

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
      schedulePersist();
    },
    [pushToast, pushLog, snapshot, schedulePersist],
  );

  // Append a graph beside existing content (Blueprints "Insert"), remapping
  // colliding ids and placing the block to the right of current content.
  const mergeGraph = useCallback(
    (rawNs: ArchNode[], rawEs: ArchEdge[], label?: string) => {
      if (rawNs.length === 0) {
        pushToast('Nothing to insert');
        return;
      }
      const { nodes: ns, edges: es } = normalizeGraph(rawNs, rawEs, activePageCtx());
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
      // Inserted nodes land on the active page. Renamed ids are rewritten in
      // parentId; a linkPageId to a page this doc lacks is dropped.
      const pageId = activePageIdRef.current;
      const pageIds = new Set(pagesRef.current.map((p) => p.id));
      const mapped: ArchNode[] = ns.map((n) => {
        const m: ArchNode = { ...n, id: idMap.get(n.id)!, x: n.x + dx, pageId };
        if (typeof n.parentId === 'string') {
          const pid = idMap.get(n.parentId);
          if (pid) m.parentId = pid;
          else delete m.parentId;
        }
        if (m.linkPageId !== undefined && !pageIds.has(m.linkPageId)) delete m.linkPageId;
        return m;
      });
      const mappedEdges: ArchEdge[] = es
        .filter((e) => idMap.has(e.from) && (e.to === null || idMap.has(e.to)))
        .map((e, i) => ({
          ...e,
          id: `e-merge-${elementId('e').slice(2)}-${i}`,
          from: idMap.get(e.from)!,
          to: e.to === null ? null : idMap.get(e.to)!,
          targetCoords: e.targetCoords ? { x: e.targetCoords.x + dx, y: e.targetCoords.y } : undefined,
        }));
      setNodesState([...cloneNodes(cur), ...mapped]);
      setEdgesState([...cloneEdges(edgesRef.current), ...mappedEdges]);
      pushToast(label ?? `Inserted ${mapped.length} nodes`);
      pushLog(label ?? `Inserted ${mapped.length} nodes`);
      schedulePersist();
    },
    [pushToast, pushLog, snapshot, schedulePersist, activePageCtx],
  );

  // ---- Feature-module seam (R1-E00-T08): pure DocOps from state/ops/* ----
  // One call is one undo step. A no-op (every slice unchanged) records nothing.
  const applyOp = useCallback(
    (label: string, op: (s: DocState) => DocState): void => {
      const cur: DocState = {
        nodes: nodesRef.current,
        edges: edgesRef.current,
        strokes: strokesRef.current,
        texts: textsRef.current,
        pages: pagesRef.current,
        layers: layersRef.current,
      };
      const next = op(cur);
      const changed = (Object.keys(cur) as (keyof DocState)[]).filter((k) => next[k] !== cur[k]);
      if (changed.length === 0) return;
      snapshot(cur.nodes, cur.edges);
      if (next.nodes !== cur.nodes) {
        nodesRef.current = next.nodes;
        setNodesState(next.nodes);
      }
      if (next.edges !== cur.edges) {
        edgesRef.current = next.edges;
        setEdgesState(next.edges);
      }
      if (next.strokes !== cur.strokes) {
        strokesRef.current = next.strokes;
        setStrokesState(next.strokes);
      }
      if (next.texts !== cur.texts) {
        textsRef.current = next.texts;
        setTextsState(next.texts);
      }
      if (next.pages !== cur.pages) setPagesNow(next.pages);
      if (next.layers !== cur.layers) setLayersNow(next.layers);
      setDirty(true);
      schedulePersist();
      pushLog(label);
    },
    [snapshot, schedulePersist, pushLog, setPagesNow, setLayersNow],
  );

  /** Like `applyOp` but history-silent: for the frames of a drag whose one undo step was taken on grab (`checkpoint`). */
  const applyOpSilent = useCallback(
    (op: (s: DocState) => DocState): void => {
      const cur: DocState = {
        nodes: nodesRef.current,
        edges: edgesRef.current,
        strokes: strokesRef.current,
        texts: textsRef.current,
        pages: pagesRef.current,
        layers: layersRef.current,
      };
      const next = op(cur);
      if (next.nodes !== cur.nodes) {
        nodesRef.current = next.nodes;
        setNodesState(next.nodes);
      }
      if (next.edges !== cur.edges) {
        edgesRef.current = next.edges;
        setEdgesState(next.edges);
      }
      if (next.nodes !== cur.nodes || next.edges !== cur.edges) {
        setDirty(true);
        schedulePersist();
      }
    },
    [schedulePersist],
  );

  const moveWithChildren = useCallback(
    (id: string, x: number, y: number) =>
      applyOpSilent((st) => {
        const n = st.nodes.find((m) => m.id === id);
        return n ? containmentOps.moveWithChildren(st, id, Math.round(x) - n.x, Math.round(y) - n.y, false) : st;
      }),
    [applyOpSilent],
  );
  const setParent = useCallback(
    (ids: string[], parentId: string | null) => applyOpSilent((st) => containmentOps.reparent(st, ids, parentId)),
    [applyOpSilent],
  );
  const growBoundaries = useCallback(
    (ids: string[]) => applyOpSilent((st) => containmentOps.growAncestors(st, ids)),
    [applyOpSilent],
  );
  const toggleCollapse = useCallback(
    (id: string) => {
      const was = nodesRef.current.find((n) => n.id === id)?.collapsed === true;
      applyOp(`Canvas: ${was ? 'expanded' : 'collapsed'} a boundary`, (st) => collapseOps.toggleCollapse(st, id));
    },
    [applyOp],
  );
  const fitToContents = useCallback(
    (id: string) => applyOp('Canvas: fit boundary to contents', (st) => containmentOps.fitToContents(st, id)),
    [applyOp],
  );
  const deleteBoundary = useCallback(
    (id: string, mode: 'only' | 'with') => {
      applyOp(`Canvas: deleted a boundary (${mode === 'only' ? 'kept contents' : 'with contents'})`, (st) => containmentOps.deleteBoundary(st, id, mode));
      setSelectedId(null);
    },
    [applyOp],
  );
  const createBoundary = useCallback(
    (kind: 'frame' | 'swimlane', rect: laneOps.DragRect): string => {
      const id = `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      applyOp(`Canvas: added a ${kind}`, (st) => laneOps.createBoundary(st, id, kind, rect, activePageIdRef.current));
      return nodesRef.current.some((n) => n.id === id) ? id : '';
    },
    [applyOp],
  );
  const addLaneBelow = useCallback(
    (id: string): string => {
      const newId = `lane-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      applyOp('Canvas: added a lane below', (st) => laneOps.addLaneBelow(st, id, newId));
      return nodesRef.current.some((n) => n.id === newId) ? newId : '';
    },
    [applyOp],
  );

  const pageName = (id: string) => pagesRef.current.find((p) => p.id === id)?.name ?? id;

  const addPage = useCallback(
    (name?: string): string => {
      if (pagesRef.current.length >= pageOps.MAX_PAGES) {
        pushToast(`A diagram can have up to ${pageOps.MAX_PAGES} pages`);
        return activePageIdRef.current;
      }
      const id = newDocId('pg');
      applyOp('Pages: added a page', (st) => pageOps.addPage(st, id, name));
      setActivePageId(id);
      return id;
    },
    [applyOp, setActivePageId, pushToast],
  );

  const renamePage = useCallback(
    (id: string, name: string) => {
      applyOp(`Pages: renamed ${pageName(id)} to ${name.trim()}`, (st) => pageOps.renamePage(st, id, name));
    },
    [applyOp],
  );

  const deletePage = useCallback(
    (id: string) => {
      const list = pagesRef.current;
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) return;
      if (list.length <= 1) {
        pushToast('A diagram needs at least one page');
        return;
      }
      const name = list[idx].name;
      const fallback = (list[idx + 1] ?? list[idx - 1]).id;
      applyOp(`Pages: deleted ${name}`, (st) => pageOps.deletePage(st, id));
      if (activePageIdRef.current === id) setActivePageId(fallback);
    },
    [applyOp, pushToast, setActivePageId],
  );

  const reorderPages = useCallback(
    (orderedIds: string[]) => {
      applyOp('Pages: reordered', (st) => pageOps.reorderPages(st, orderedIds));
    },
    [applyOp],
  );

  const duplicatePage = useCallback(
    (id: string): string => {
      if (!pagesRef.current.some((p) => p.id === id)) return '';
      if (pagesRef.current.length >= pageOps.MAX_PAGES) {
        pushToast(`A diagram can have up to ${pageOps.MAX_PAGES} pages`);
        return '';
      }
      const copyId = newDocId('pg');
      applyOp(`Pages: duplicated ${pageName(id)}`, (st) => pageOps.duplicatePage(st, id, copyId, elementId));
      setActivePageId(copyId);
      return copyId;
    },
    [applyOp, setActivePageId, pushToast],
  );

  const importDocument = useCallback(
    (imp: ImportedDoc, mode: 'new' | 'page'): boolean => {
      const impPages = imp.pages ?? [];
      if (impPages.length === 0) return false;
      if (mode === 'page') {
        const before = pagesRef.current.length;
        const firstId = newDocId('pg');
        const ids = [firstId];
        applyOp(`Import: added ${impPages.length} page${impPages.length === 1 ? '' : 's'}`, (st) =>
          pageOps.appendImported(st, { nodes: imp.nodes, edges: imp.edges, texts: imp.texts ?? [], pages: impPages, layers: imp.layers ?? st.layers }, () => ids.shift() ?? newDocId('pg'), elementId),
        );
        if (pagesRef.current.length === before) {
          pushToast('Nothing was imported — the diagram would exceed 50 pages');
          return false;
        }
        setActivePageId(firstId);
        pushToast(`Imported ${imp.title} as a new page`);
        return true;
      }
      const cur = docsRef.current;
      if (cur.docs.length >= 25) {
        pushToast('Library full (25 diagrams) — delete one first');
        return false;
      }
      const now = Date.now();
      const base = blankDoc(cur.docs.length + 1);
      const doc: DiagramDoc = {
        ...base,
        title: imp.title.slice(0, 80) || base.title,
        nodes: cloneNodes(imp.nodes),
        edges: cloneEdges(imp.edges),
        texts: cloneTexts(imp.texts ?? []),
        pages: impPages,
        layers: imp.layers,
      };
      setDocState((prev) => ({
        activeDocId: doc.id,
        docs: [
          ...prev.docs.map((d) =>
            d.id === cur.activeDocId
              ? { ...d, title: docTitleRef.current, nodes: cloneNodes(nodesRef.current), edges: cloneEdges(edgesRef.current), strokes: cloneStrokes(strokesRef.current), texts: cloneTexts(textsRef.current), ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current), updatedAt: now }
              : d,
          ),
          doc,
        ],
      }));
      setNodesState(cloneNodes(doc.nodes));
      setEdgesState(cloneEdges(doc.edges));
      setStrokesState([]);
      setTextsState(cloneTexts(doc.texts ?? []));
      loadDocMeta(doc);
      setDocTitleState(doc.title);
      setSelectedId(null);
      setDirty(true);
      resetHistory();
      setFreshness('local');
      setFreshnessLabel(`Imported ${doc.title}`);
      setDriftCount(0);
      schedulePersist();
      pushToast(`Imported ${doc.title}`);
      pushLog(`Diagram imported: ${doc.title}`);
      return true;
    },
    [applyOp, pushToast, pushLog, resetHistory, schedulePersist, loadDocMeta, setActivePageId],
  );

  const addLayer = useCallback(
    (name?: string): string => {
      if (layersRef.current.length >= layerOps.MAX_LAYERS) {
        pushToast(`A diagram can have up to ${layerOps.MAX_LAYERS} layers`);
        return '';
      }
      const id = newDocId('ly');
      applyOp('Layers: added a layer', (st) => layerOps.addLayer(st, id, name));
      return id;
    },
    [applyOp, pushToast],
  );

  const reorderLayers = useCallback(
    (bottomToTop: string[]) => {
      applyOp('Layers: reordered', (st) => layerOps.reorderLayers(st, bottomToTop));
    },
    [applyOp],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<Omit<Layer, 'id'>>) => {
      applyOp(`Layers: updated ${layersRef.current.find((l) => l.id === id)?.name ?? id}`, (st) => layerOps.updateLayer(st, id, patch));
    },
    [applyOp],
  );

  const deleteLayer = useCallback(
    (id: string) => {
      if (id === layerOps.DEFAULT_LAYER_ID) {
        pushToast('The default layer cannot be deleted');
        return;
      }
      applyOp(`Layers: deleted ${layersRef.current.find((l) => l.id === id)?.name ?? id}`, (st) => layerOps.deleteLayer(st, id));
    },
    [applyOp, pushToast],
  );

  const moveToLayer = useCallback(
    (ids: string[], layerId: string) => {
      applyOp(`Layers: moved ${ids.length} element${ids.length === 1 ? '' : 's'}`, (st) => layerOps.moveToLayer(st, ids, layerId));
    },
    [applyOp],
  );

  // ---- Arrange (R1-E04-T01/T02) ----
  const moveToPage = useCallback(
    (ids: string[], pageId: string) => {
      const before = edgesRef.current.length;
      const nodesBefore = nodesRef.current;
      applyOp(`Pages: moved ${ids.length} element${ids.length === 1 ? '' : 's'}`, (st) => pageOps.moveToPage(st, ids, pageId));
      if (nodesRef.current === nodesBefore) {
        pushToast('Nothing to move');
        return;
      }
      const dropped = before - edgesRef.current.length;
      pushToast(dropped > 0 ? `Moved to page; ${dropped} connector${dropped === 1 ? '' : 's'} to other pages removed` : 'Moved to page');
    },
    [applyOp, pushToast],
  );

  const align = useCallback(
    (ids: string[], edge: arrangeOps.AlignEdge) => {
      applyOp(`Arrange: aligned ${ids.length} nodes ${edge}`, (st) => arrangeOps.align(st, ids, edge));
    },
    [applyOp],
  );

  const distribute = useCallback(
    (ids: string[], axis: 'h' | 'v') => {
      applyOp(`Arrange: distributed ${ids.length} nodes ${axis === 'h' ? 'horizontally' : 'vertically'}`, (st) => arrangeOps.distribute(st, ids, axis));
    },
    [applyOp],
  );

  const matchSize = useCallback(
    (ids: string[], dim: 'w' | 'h' | 'both') => {
      applyOp(`Arrange: matched size of ${Math.max(0, ids.length - 1)} nodes`, (st) => arrangeOps.matchSize(st, ids, dim));
    },
    [applyOp],
  );

  const zOrder = useCallback(
    (ids: string[], cmd: 'front' | 'back' | 'forward' | 'backward') => {
      applyOp(`Arrange: ${cmd} for ${ids.length} node${ids.length === 1 ? '' : 's'}`, (st) => arrangeOps.zOrder(st, ids, cmd));
    },
    [applyOp],
  );

  const setLocked = useCallback(
    (ids: string[], locked: boolean) => {
      applyOp(`Arrange: ${locked ? 'locked' : 'unlocked'} ${ids.length} node${ids.length === 1 ? '' : 's'}`, (st) => arrangeOps.setLocked(st, ids, locked));
    },
    [applyOp],
  );

  const insertNode = useCallback(
    (node: ArchNode, pos?: { x: number; y: number }) => {
      // Fresh id when the caller's id is taken (e.g. the same tile dropped twice from a stale payload).
      const taken = new Set(nodesRef.current.map((n) => n.id));
      let id = node.id;
      if (!id || taken.has(id)) id = `${node.kind ?? node.type}-${Date.now().toString(36)}-${nodesRef.current.length + 1}`;
      const placed: ArchNode = {
        ...node,
        id,
        x: Math.round(pos?.x ?? node.x),
        y: Math.round(pos?.y ?? node.y),
        pageId: node.pageId ?? activePageIdRef.current,
      };
      applyOp(`Canvas: added ${placed.label || 'element'}`, (st) => ({ ...st, nodes: [...st.nodes, placed] }));
      setSelectedId(id);
    },
    [applyOp],
  );

  const insertConnected = useCallback(
    (node: ArchNode, fromId: string) => {
      const taken = new Set(nodesRef.current.map((n) => n.id));
      if (!nodesRef.current.some((n) => n.id === fromId)) return;
      let id = node.id;
      if (!id || taken.has(id)) id = `${node.kind ?? node.type}-${Date.now().toString(36)}-${nodesRef.current.length + 1}`;
      const placed: ArchNode = { ...node, id, x: Math.round(node.x), y: Math.round(node.y), pageId: node.pageId ?? activePageIdRef.current, isOrphan: false };
      const edge: ArchEdge = { id: elementId('e'), from: fromId, to: id, label: 'route', color: '#2563EB', isDangling: false };
      applyOp(`Canvas: added ${placed.label || 'element'} and connected it`, (st) => ({
        ...st,
        nodes: [...st.nodes.map((n) => (n.id === fromId ? { ...n, isOrphan: false } : n)), placed],
        edges: [...st.edges, edge],
      }));
      setSelectedId(id);
      track('element_added', { kind: placed.kind ?? placed.type });
      track('relationship_added', { relKind: 'sync' });
    },
    [applyOp],
  );

  const pasteStyle = useCallback(
    (ids: string[], style: Partial<ArchNode>) => {
      applyOp(`Style: applied to ${ids.length} node${ids.length === 1 ? '' : 's'}`, (st) => styleOps.pasteStyle(st, ids, style));
    },
    [applyOp],
  );

  const setDisplayStyle = useCallback(
    (ids: string[], style: DisplayStyle) => {
      applyOp(`Display: ${style} for ${ids.length} node${ids.length === 1 ? '' : 's'}`, (st) => displayStyleOps.setDisplayStyle(st, ids, style));
    },
    [applyOp],
  );

  // ---- Find and replace, select similar (R1-E10-T05) ----
  const docStateNow = (): DocState => ({
    nodes: nodesRef.current,
    edges: edgesRef.current,
    strokes: strokesRef.current,
    texts: textsRef.current,
    pages: pagesRef.current,
    layers: layersRef.current,
  });

  const findMatches = useCallback((q: FindQuery): FindMatch[] => findOps.findMatches(docStateNow(), q, activePageIdRef.current), []);

  const replaceAll = useCallback(
    (q: FindQuery, replacement: string): number => {
      const count = findOps.findMatches(docStateNow(), q, activePageIdRef.current).length;
      if (count === 0) return 0;
      applyOp(`Find: replaced ${count} match${count === 1 ? '' : 'es'}`, (st) => findOps.replaceAll(st, q, replacement, activePageIdRef.current));
      return count;
    },
    [applyOp],
  );

  const selectSimilar = useCallback((id: string): string[] => {
    const ids = findOps.similarTo(docStateNow(), id);
    setMultiSel(ids);
    return ids;
  }, []);

  // Doc defaults are persisted and saved like pages, but not undoable.
  const setDocDefaults = useCallback(
    (patch: Partial<DocDefaults>) => {
      const next: DocDefaults = { ...defaultsRef.current };
      for (const [k, v] of Object.entries(patch) as [keyof DocDefaults, DocDefaults[keyof DocDefaults]][]) {
        if (v === undefined) delete next[k];
        else (next as Record<string, unknown>)[k] = v;
      }
      defaultsRef.current = next;
      setDocDefaultsState(next);
      setDirty(true);
      schedulePersist();
    },
    [schedulePersist],
  );

  const resync = useCallback(() => {
    if (!isOnlineRef.current) {
      // Offline: no attempt is made — the failure stays visible with Retry.
      const failed = offlineSyncFailure();
      setFreshness(failed.freshness);
      setFreshnessLabel(failed.freshnessLabel);
      setDriftCount(1);
      setSyncError(failed.syncError);
      pushToast('Sync failed — you are offline');
      pushLog('Sync failed: offline, no attempt made');
      return;
    }
    // No live connector exists in this build (FE-M2): report it honestly and
    // leave the graph untouched instead of simulating an upstream change.
    const status = notConnectedSync();
    setSyncError(null);
    setFreshness(status.freshness);
    setFreshnessLabel(status.freshnessLabel);
    setDriftCount(0);
    pushToast(status.freshnessLabel);
    pushLog('No re-sync: no live source is connected');
  }, [pushToast, pushLog]);

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
      const hub = healHub(nodesRef.current, edgesRef.current, target.id);
      setNodesState((prev) => prev.map((n) => (n.id === target.id ? { ...n, isOrphan: false, health: 'Subscribed', stroke: '#7C3AED' } : n)));
      if (hub) {
        setEdgesState((prev) => [
          ...prev,
          { id: `e-heal-${Date.now().toString(36)}`, from: hub.id, to: target.id, label: 'order-events', color: '#7C3AED' },
        ]);
      }
      if (!silent) {
        pushToast(`Bound ${target.label} to mesh!`);
        pushLog(`Linter heal: ${target.id}`);
      }
      schedulePersist();
      return true;
    },
    [pushToast, pushLog, snapshot, schedulePersist],
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
      schedulePersist();
      return true;
    },
    [pushToast, pushLog, snapshot, schedulePersist],
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
    orphanIds.forEach((oid, i) => {
      const from = healHub(nodesRef.current, edgesRef.current, oid)?.id;
      setNodesState((prev) => prev.map((n) => (n.id === oid ? { ...n, isOrphan: false, health: 'Subscribed', stroke: '#7C3AED' } : n)));
      if (from) {
        const eid = `e-heal-${Date.now().toString(36)}-${i}`;
        setEdgesState((prev) => [...prev, { id: eid, from, to: oid, label: 'order-events', color: '#7C3AED' }]);
      }
    });
    setEdgesState((prev) => prev.filter((e) => !wireIds.includes(e.id)));
    pushLog(`Linter auto-heal: ${orphanIds.length} bound, ${wireIds.length} pruned`);
    pushToast('All architecture linter rules passed!');
    schedulePersist();
  }, [pushToast, pushLog, snapshot, schedulePersist]);

  const exportArch = useCallback(async () => {
    const settings = (() => {
      try {
        return JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { embedMetadata?: boolean };
      } catch {
        return {} as { embedMetadata?: boolean };
      }
    })();
    // Deterministic local payload with stable element ids (PROD-007).
    const exportDoc = docsRef.current.docs.find((d) => d.id === docsRef.current.activeDocId);
    const payload = buildArchExport({
      nodes: nodesRef.current,
      edges: edgesRef.current,
      strokes: strokesRef.current,
      texts: textsRef.current,
      pages: exportDoc?.pages ?? [defaultPage()],
      layers: exportDoc?.layers ?? [defaultLayer()],
      defaults: exportDoc?.defaults,
      docTitle: docTitleRef.current,
      embedMetadata: settings.embedMetadata,
    });

    // If online and we have an active document with server ID, try backend export first
    const online = isOnlineRef.current;
    const activeDoc = docsRef.current.docs.find(d => d.id === activeDocRef.current);
    const hasServerId = activeDoc?.id && !activeDoc.id.startsWith('doc-');

    if (online && hasServerId) {
      try {
        const serverExport = await api.exportDiagram(activeDoc!.id);
        // NOTE: the export payload's `version` is the FILE format version, not
        // the diagram's optimistic-concurrency version — never tracked as
        // serverVersion.
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
        track('export_completed', { format: 'arch', scope: 'diagram' });
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
    track('export_completed', { format: 'arch', scope: 'diagram' });
    pushToast(`Exported ${base}.arch (local)`);
  }, [pushToast]);

  // LucidChart-parity vector/CSV export: full document, tightly cropped, from
  // live store state (assets inlined so files are self-contained).
  const composeExportDoc = useCallback((): DiagramDoc => ({
    id: activeDocRef.current ?? 'local',
    title: docTitleRef.current,
    nodes: nodesRef.current,
    edges: edgesRef.current,
    strokes: strokesRef.current,
    texts: textsRef.current,
    createdAt: 0,
    updatedAt: Date.now(),
  }), []);

  /** Legacy viewport-screenshot PNG (fallback when SVG rasterization fails). */
  const exportPNGFromCanvas = useCallback(() => {
    const canvas = document.getElementById('architectureCanvas') as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0) {
      pushToast('PNG export unsupported — canvas not ready if you are not on the Precision Canvas screen');
      return;
    }
    const base = archBaseName();
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) {
      pushToast('PNG export unsupported here');
      return;
    }
    ctx.drawImage(canvas, 0, 0);
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
      track('export_completed', { format: 'png', scope: 'diagram' });
      pushToast(`Exported ${base}.png (snapshot)`);
    }, 'image/png');
  }, [pushToast]);

  const exportPNG = useCallback(() => {
    // LucidChart-parity raster export: tightly cropped full-document render
    // (not a viewport screenshot), honoring the export-resolution setting.
    const settings = (() => {
      try {
        return JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { exportResolution?: string };
      } catch {
        return {} as { exportResolution?: string };
      }
    })();
    const scale = settings.exportResolution === '4x' ? 4 : settings.exportResolution === '1x' ? 1 : 2;
    void exportDocument(composeExportDoc(), {
      format: 'png',
      scale,
      background: themeRef.current === 'dark' ? 'dark' : 'white',
    })
      .then((result) => {
        if (!result.blob) {
          pushToast('PNG export failed — falling back to canvas snapshot');
          exportPNGFromCanvas();
          return;
        }
        downloadExport(result);
        track('export_completed', { format: 'png', scope: 'diagram' });
        pushToast(`Exported ${result.fileName} (${result.summary})`);
      })
      .catch(() => exportPNGFromCanvas());
  }, [composeExportDoc, exportPNGFromCanvas, pushToast]);

  const exportSVG = useCallback(() => {
    void exportDocument(composeExportDoc(), {
      format: 'svg',
      background: themeRef.current === 'dark' ? 'dark' : 'white',
    })
      .then((result) => {
        if (!result.blob) {
          pushToast('SVG export failed — canvas data unavailable');
          return;
        }
        downloadExport(result);
        track('export_completed', { format: 'svg', scope: 'diagram' });
        pushToast(`Exported ${result.fileName} (${result.summary})`);
      })
      .catch(() => pushToast('SVG export failed'));
  }, [composeExportDoc, pushToast]);

  const exportCSV = useCallback(() => {
    void exportDocument(composeExportDoc(), { format: 'csv' })
      .then((result) => {
        if (!result.blob) {
          pushToast('CSV export failed');
          return;
        }
        downloadExport(result);
        track('export_completed', { format: 'csv', scope: 'diagram' });
        pushToast(`Exported ${result.fileName} (${result.summary})`);
      })
      .catch(() => pushToast('CSV export failed'));
  }, [composeExportDoc, pushToast]);

  // LucidChart `ucbHr` parity: PDF via the browser print dialog (no PDF dep).
  const exportPrint = useCallback(() => {
    void exportDocument(composeExportDoc(), { format: 'print', background: 'white' })
      .then(() => {
        track('export_completed', { format: 'pdf', scope: 'diagram' });
        pushToast('Print view opened — choose "Save as PDF" in the dialog');
      })
      .catch(() => pushToast('Print export failed'));
  }, [composeExportDoc, pushToast]);

  const importArch = useCallback((data: any) => {
      // Validate fully BEFORE mutation: hard failure leaves the previous
      // graph unchanged (PROD-006). Soft issues return as warnings.
      const result = validateArchImport(data);
      if (!result.ok) {
        pushToast(`Import failed: ${result.error}`);
        return { imported: false, warnings: [] as string[] };
      }
      loadGraph(result.nodes, result.edges, `Imported .arch (${result.nodes.length} nodes)`);
      if (result.strokes.length > 0) setStrokesState(cloneStrokes(result.strokes));
      if (result.texts.length > 0) setTextsState(cloneTexts(result.texts));
      // v2 pages / layers / defaults become doc state (same undo step as loadGraph).
      loadDocMeta({ id: '', title: '', nodes: [], edges: [], createdAt: 0, updatedAt: 0, pages: result.pages, layers: result.layers, defaults: result.defaults });
      if (result.warnings.length > 0) {
        pushToast(`Imported with ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} — review before saving`);
      }
      return { imported: true, warnings: result.warnings };
    },
    [loadGraph, pushToast, loadDocMeta],
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
              pages: clonePages(pagesRef.current),
              layers: cloneLayers(layersRef.current),
            },
            ...(prev[docId] ?? []).map((c) => ({ ...c, active: false })),
          ].slice(0, 20),
        }) as Record<string, SnapshotCheckpoint[]>,
      );
      pushToast(`Checkpoint saved: ${name}`);
      pushLog(`Checkpoint: ${name}`);
      // Mirror to server when this doc is server-backed (fire-and-forget).
      const serverId = serverDiagramId(docId);
      if (serverId) {
        api.createCheckpoint(serverId, name, `local:${docId}`).then(
          (resp) => {
            rememberDiagramVersion(docId, resp);
            pushLog(`Checkpoint synced to server: ${name}`);
          },
          (e) => pushToast(`Server checkpoint failed (kept locally): ${e instanceof Error ? e.message : e}`),
        );
      }
    },
    [pushToast, pushLog, displayName, rememberDiagramVersion],
  );

  const restoreCheckpoint = useCallback(
    (id: string) => {
      const docId = activeDocRef.current;
      const serverId = serverDiagramId(docId);
      // Server-backed checkpoint: restore via API, then apply to canvas.
      if (serverId && UUID_RE.test(id)) {
        api.restoreCheckpoint(serverId, id).then(
          ({ data }) => {
            rememberDiagramVersion(docId, { data });
            const graph = data?.graph ?? {};
            loadGraph(graph.nodes ?? [], graph.edges ?? [], `Restored server checkpoint`);
            setStrokesState(cloneStrokes(graph.strokes ?? []));
            setTextsState(cloneTexts(graph.texts ?? []));
            setCpsMap((prev) => ({
              ...prev,
              [docId]: (prev[docId] ?? []).map((c) => ({ ...c, active: c.id === id })),
            }));
            pushToast('Restored checkpoint from server');
          },
          (e) => pushToast(`Server restore failed: ${e instanceof Error ? e.message : e}`),
        );
        return;
      }
      const cp = (cpsMapRef.current[docId] ?? []).find((c) => c.id === id);
      if (!cp) return;
      // Pages and layers first, so restored elements land on the pages they were saved on.
      if (cp.pages && cp.pages.length > 0) {
        loadDocMeta({ id: '', title: '', nodes: [], edges: [], createdAt: 0, updatedAt: 0, pages: cp.pages, layers: cp.layers, defaults: defaultsRef.current });
      }
      loadGraph(cp.nodes, cp.edges, `Restored ${cp.title}`);
      setStrokesState(cloneStrokes(cp.strokes ?? []));
      setTextsState(cloneTexts(cp.texts ?? []));
      setCpsMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).map((c) => ({ ...c, active: c.id === id })),
      }));
    },
    [loadGraph, loadDocMeta, pushToast, rememberDiagramVersion],
  );

  const deleteCheckpoint = useCallback(
    (id: string) => {
      const docId = activeDocRef.current;
      const serverId = serverDiagramId(docId);
      if (serverId && UUID_RE.test(id)) {
        api.deleteCheckpoint(serverId, id).catch(() => {
          /* local delete still applies; server retry on next sync */
        });
      }
      setCpsMap((prev) => ({
        ...prev,
        [docId]: (prev[docId] ?? []).filter((c) => c.id !== id),
      }));
      pushToast('Checkpoint deleted');
    },
    [pushToast],
  );

  // ---- Explicit save with conflict resolution (§6.2) ----
  const activeGraphPatch = useCallback(() => {    const graph = {
      nodes: cloneNodes(nodesRef.current),
      edges: cloneEdges(edgesRef.current),
      strokes: cloneStrokes(strokesRef.current),
      texts: cloneTexts(textsRef.current),
      ...metaFields(pagesRef.current, layersRef.current, defaultsRef.current),
    };
    return {
      title: docTitleRef.current,
      graph,
      nodes: graph.nodes,
      edges: graph.edges,
      strokes: graph.strokes,
      texts: graph.texts,
    };
  }, []);

  // Cross-device library (FE-Q1): a signed-in user sees their server diagrams
  // in every browser. Local copies win for ids already known here; versioned
  // saves surface any divergence as a conflict instead of overwriting.
  useEffect(() => {
    if (!isSignedIn() || !isOnlineRef.current) return;
    let cancelled = false;
    api.listDiagrams(1, 100).then(
      (resp) => {
        const rows = (resp as { data?: unknown })?.data;
        if (cancelled || !Array.isArray(rows)) return;
        const incoming = rows.map(serverDiagramToDoc).filter((d): d is DiagramDoc => d !== null);
        const known = new Set(docsRef.current.docs.map((d) => d.id));
        const added = incoming.filter((d) => !known.has(d.id));
        if (added.length === 0) return;
        setDocState((prev) => {
          const ids = new Set(prev.docs.map((d) => d.id));
          const fresh = added.filter((d) => !ids.has(d.id));
          return fresh.length ? { ...prev, docs: [...prev.docs, ...fresh] } : prev;
        });
        schedulePersist();
        pushLog(`Loaded ${added.length} diagram${added.length === 1 ? '' : 's'} from the server`);
      },
      () => {
        /* signed-out/expired sessions are handled by the API client */
      },
    );
    return () => {
      cancelled = true;
    };
    // Once per mount: sign-in reloads the app through /api/v1/auth/verify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [limitedDocIds, setLimitedDocIds] = useState<string[]>([]);
  const saveActiveDoc = useCallback(async (): Promise<'saved' | 'local' | 'conflict' | 'error' | 'offline' | 'limit'> => {
    const cur = docsRef.current;
    const active = cur.docs.find((d) => d.id === cur.activeDocId);
    if (!active) return 'error';
    const serverId = serverDiagramId(cur.activeDocId);
    if (!serverId && !isSignedIn()) {
      pushToast('Sign in to save diagrams to the server — guest work stays in this browser');
      return 'local';
    }
    if (!isOnlineRef.current) {
      pushToast('You are offline — save paused, nothing lost');
      return 'offline';
    }
    if (!serverId) {
      // First save of a local doc: create it on the server, then adopt the
      // server id so versioned saves, revisions and conflicts apply (FE-Q1).
      try {
        const patch = activeGraphPatch();
        const resp = await api.createDiagram(patch.title, undefined, patch.graph);
        const created = (resp as { data?: { id?: unknown; version?: unknown } })?.data;
        const newId = typeof created?.id === 'string' ? created.id : null;
        if (!newId || !serverDiagramId(newId)) throw new Error('server returned no diagram id');
        rekeyDoc(cur.activeDocId, newId);
        rememberDiagramVersion(newId, resp);
        setDirty(false);
        const v = created?.version;
        pushToast(typeof v === 'number' ? `Saved to server (v${v})` : 'Saved to server');
        pushLog(`Created server diagram ${newId} from ${docTitleRef.current}`);
        schedulePersist();
        return 'saved';
      } catch (e) {
        if (isLimitReachedError(e)) {
          // The doc stays local; the limit dialog opens via LIMIT_REACHED_EVENT. No "Save failed" toast.
          setLimitedDocIds((prev) => (prev.includes(cur.activeDocId) ? prev : [...prev, cur.activeDocId]));
          pushLog('Cloud save blocked by plan limit: doc stays local');
          return 'limit';
        }
        pushToast(`Save failed: ${e instanceof Error ? e.message : e}`);
        pushLog(`Save failed: ${e instanceof Error ? e.message : e}`);
        return 'error';
      }
    }
    const version = typeof active.serverVersion === 'number' ? active.serverVersion : undefined;
    try {
      const resp = await api.updateDiagram(serverId, activeGraphPatch(), version !== undefined ? { version } : {});
      rememberDiagramVersion(cur.activeDocId, resp);
      setDirty(false);
      const v = (resp as { data?: { version?: unknown } })?.data?.version;
      pushToast(typeof v === 'number' ? `Saved (v${v})` : 'Saved');
      pushLog(`Saved ${docTitleRef.current}${typeof v === 'number' ? ` (v${v})` : ''}`);
      schedulePersist();
      return 'saved';
    } catch (e) {
      const conflict = conflictFromError(e, version ?? null);
      if (conflict) {
        setSaveConflict(conflict);
        pushLog('Save conflict: server has a newer version — resolve explicitly');
        // Enrich attempted-vs-current versions without mutating the canvas.
        api.getDiagram(serverId).then(
          ({ data }) => {
            if (typeof data?.version === 'number') {
              setSaveConflict((prev) => (prev ? { ...prev, serverVersion: data.version } : prev));
            }
          },
          () => { /* current version stays unknown; all actions still work */ },
        );
        return 'conflict';
      }
      pushToast(`Save failed: ${e instanceof Error ? e.message : e}`);
      pushLog(`Save failed: ${e instanceof Error ? e.message : e}`);
      return 'error';
    }
  }, [pushToast, pushLog, schedulePersist, activeGraphPatch, rememberDiagramVersion, rekeyDoc]);

  const forceSaveActiveDoc = useCallback(async (): Promise<'saved' | 'error'> => {
    const cur = docsRef.current;
    const active = cur.docs.find((d) => d.id === cur.activeDocId);
    const serverId = serverDiagramId(cur.activeDocId);
    if (!active || !serverId) return 'error';
    const version = typeof active.serverVersion === 'number' ? active.serverVersion : undefined;
    try {
      const resp = await api.updateDiagram(
        serverId,
        activeGraphPatch(),
        version !== undefined ? { version, force: true } : { force: true },
      );
      rememberDiagramVersion(cur.activeDocId, resp);
      setSaveConflict(null);
      setDirty(false);
      pushToast('Saved your version — the remote state was preserved as a revision');
      pushLog('Save conflict resolved: kept mine (remote preserved as revision)');
      schedulePersist();
      return 'saved';
    } catch (e) {
      pushToast(`Force save failed: ${e instanceof Error ? e.message : e}`);
      pushLog(`Force save failed: ${e instanceof Error ? e.message : e}`);
      return 'error';
    }
  }, [pushToast, pushLog, schedulePersist, activeGraphPatch, rememberDiagramVersion]);

  const reloadActiveDoc = useCallback(async (): Promise<'reloaded' | 'error'> => {
    const docId = activeDocRef.current;
    const serverId = serverDiagramId(docId);
    if (!serverId) return 'error';
    try {
      const { data } = await api.getDiagram(serverId);
      const graph = (data?.graph ?? {}) as Record<string, unknown>;
      const pick = (k: string): unknown[] => {
        if (Array.isArray(graph[k])) return graph[k] as unknown[];
        const top = (data as Record<string, unknown> | null)?.[k];
        return Array.isArray(top) ? (top as unknown[]) : [];
      };
      const ns = pick('nodes').filter(isValidNode) as ArchNode[];
      const ids = new Set(ns.map((n) => n.id));
      const es = (pick('edges') as unknown[])
        .filter((e): e is ArchEdge => isValidEdge(e, ids))
        .map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined }));
      snapshot(nodesRef.current, edgesRef.current);
      setNodesState(reconcileOrphans(cloneNodes(ns), es));
      setEdgesState(cloneEdges(es));
      setStrokesState(cloneStrokes((pick('strokes') as unknown[]).filter(isValidStroke)));
      setTextsState(cloneTexts((pick('texts') as unknown[]).filter(isValidText)));
      // Server pages / layers / defaults, with the §2.4 fallbacks (normalizeDoc).
      const meta = normalizeDoc({ pages: graph.pages, layers: graph.layers, defaults: graph.defaults });
      const keepPage = activePageIdRef.current;
      loadDocMeta(meta ?? undefined);
      if (meta?.pages?.some((p) => p.id === keepPage)) setActivePageId(keepPage);
      if (typeof data?.title === 'string' && data.title) {
        setDocTitleState(data.title.slice(0, 80));
        setDocState((prev) => ({
          ...prev,
          docs: prev.docs.map((d) => (d.id === docId ? { ...d, title: String(data.title).slice(0, 80) } : d)),
        }));
      }
      rememberDiagramVersion(docId, { data });
      setSaveConflict(null);
      setDirty(false);
      pushToast('Reloaded the server version — local edits replaced');
      pushLog('Save conflict resolved: reloaded remote');
      schedulePersist();
      return 'reloaded';
    } catch (e) {
      pushToast(`Reload failed: ${e instanceof Error ? e.message : e}`);
      return 'error';
    }
  }, [pushToast, pushLog, schedulePersist, snapshot, rememberDiagramVersion, loadDocMeta, setActivePageId]);

  // Last failed server-branch request, retained so the UI can offer Retry
  // without losing the local duplicate (REV-R4).
  const failedBranchRef = useRef<{ serverId: string; title: string; branchName: string } | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  const requestServerBranch = useCallback(
    (req: { serverId: string; title: string; branchName: string }) => {
      setBranchError(null);
      api.createBranch(req.serverId, req.title, req.branchName).then(
        ({ data }) => {
          // NOTE: the branch response versions the NEW branch diagram, not the
          // source doc — deliberately not stored as this doc's serverVersion.
          failedBranchRef.current = null;
          pushLog(`Server branch created: ${data?.id ?? req.branchName}`);
        },
        (e) => {
          failedBranchRef.current = req;
          const msg = e instanceof Error ? e.message : String(e);
          setBranchError(msg);
          pushToast(`Server branch failed (local branch kept): ${msg}`);
        },
      );
    },
    [pushLog, pushToast],
  );

  const retryBranch = useCallback(() => {
    const req = failedBranchRef.current;
    if (!req) return;
    pushLog(`Retrying server branch: ${req.branchName}`);
    requestServerBranch(req);
  }, [requestServerBranch, pushLog]);

  // Branch the active doc: local duplicate tagged with the branch name, plus a
  // server-side branch when the doc is server-backed.
  const createBranch = useCallback(
    (branchName?: string) => {
      const docId = activeDocRef.current;
      const clean = (branchName ?? '').trim().slice(0, 40) || `branch-${new Date().toISOString().slice(0, 10)}`;
      duplicateDoc(docId);
      const copyId = docsRef.current.activeDocId;
      setDocTags(copyId, [...(docsRef.current.docs.find((d) => d.id === copyId)?.tags ?? []), `branch:${clean}`].slice(0, 8));
      renameDoc(copyId, `${docTitleRef.current.replace(/\.arch$/i, '')} [${clean}].arch`);
      pushLog(`Branch created: ${clean}`);
      const serverId = serverDiagramId(docId);
      if (serverId) {
        requestServerBranch({ serverId, title: `${docTitleRef.current} [${clean}]`, branchName: clean });
      }
    },
    [duplicateDoc, setDocTags, renameDoc, pushLog, requestServerBranch],
  );

  const coreValue = useMemo<DiagramCoreContextValue>(
    () => ({
      nodes,
      edges,
      strokes,
      texts,
      pages,
      layers,
      docDefaults,
      selectedId,
      setSelectedId,
      selectedEdgeId,
      setSelectedEdgeId,
      selectedStrokeId,
      setSelectedStrokeId,
      selectedTextId,
      setSelectedTextId,
      multiSel,
      setMultiSel,
    }),
    [nodes, edges, strokes, texts, pages, layers, docDefaults, selectedId, setSelectedId, selectedEdgeId, setSelectedEdgeId, selectedStrokeId, setSelectedStrokeId, selectedTextId, setSelectedTextId, multiSel, setMultiSel],
  );

  const rawActionsValue = useMemo<DiagramActionsContextValue>(
    () => ({
      addNode,
      insertNode,
      insertConnected,
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
      addStroke,
      updateStroke,
      moveStroke,
      deleteStroke,
      addText,
      updateText,
      moveText,
      deleteText,
      undo,
      redo,
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      undoDepth: pastRef.current.length,
      redoDepth: futureRef.current.length,
      applyLayout,
      panToNode,
      placeShape,
      addPage,
      renamePage,
      deletePage,
      reorderPages,
      duplicatePage,
      addLayer,
      updateLayer,
      reorderLayers,
      deleteLayer,
      moveToLayer,
      moveToPage,
      moveWithChildren,
      setParent,
      growBoundaries,
      toggleCollapse,
      fitToContents,
      deleteBoundary,
      createBoundary,
      addLaneBelow,
      setDocDefaults,
      align,
      distribute,
      matchSize,
      zOrder,
      setLocked,
      pasteStyle,
      setDisplayStyle,
      findMatches,
      replaceAll,
      selectSimilar,
    }),
    [addNode, insertNode, insertConnected, deleteSelected, deleteNodes, duplicateSelected, updateNode, moveNode, checkpoint, deleteEdge, updateEdge, connectNodes, loadGraph, mergeGraph, addStroke, updateStroke, moveStroke, deleteStroke, addText, updateText, moveText, deleteText, undo, redo, applyLayout, panToNode, placeShape, addPage, renamePage, deletePage, reorderPages, duplicatePage, addLayer, updateLayer, reorderLayers, deleteLayer, moveToLayer, moveToPage, moveWithChildren, setParent, growBoundaries, toggleCollapse, fitToContents, deleteBoundary, createBoundary, addLaneBelow, setDocDefaults, align, distribute, matchSize, zOrder, setLocked, pasteStyle, setDisplayStyle, findMatches, replaceAll, selectSimilar],
  );

  // Below editor every edit action is refused here, not only hidden in the UI (R1-E07-T06). High-frequency
  // gestures (drag, typing) are silent; the rest says why nothing happened.
  const actionsValue = useMemo<DiagramActionsContextValue>(() => {
    if (canEdit(role)) return rawActionsValue;
    const out: Record<string, unknown> = { ...rawActionsValue };
    const refuse = () => pushToast('View only: you do not have permission to edit this diagram');
    const silent = () => undefined;
    for (const k of EDIT_ACTIONS) out[k] = SILENT_EDIT_ACTIONS.has(k) ? silent : refuse;
    return out as unknown as DiagramActionsContextValue;
  }, [rawActionsValue, role, pushToast]);

  const lintCount = useMemo(() => {
    const deg = new Map<string, number>();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      if (e.to) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    });
    const orphans = nodes.filter((n) => (deg.get(n.id) ?? 0) === 0 || n.isOrphan).length;
    const dangling = edges.filter((e) => e.isDangling || !e.to).length;
    const ambiguous = edges.filter((e) => e.to && !e.isDangling && !e.protocol).length;
    return orphans + dangling + ambiguous;
  }, [nodes, edges]);

  const uiValue = useMemo<DiagramUIContextValue>(
    () => ({
      theme,
      setTheme,
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
      freshness,
      freshnessLabel,
      driftCount,
      toasts,
      pushToast,
      pauseToasts,
      resumeToasts,
      isOnline,
      lintCount,
      syncError,
      activePageId,
      setActivePageId,
    }),
    [theme, setTheme, zoom, pan, setPan, tool, setTool, orthogonal, setOrthogonal, snapGrid, setSnapGrid, zoomBy, zoomTo, resetView, freshness, freshnessLabel, driftCount, toasts, pushToast, pauseToasts, resumeToasts, isOnline, lintCount, syncError, activePageId, setActivePageId],
  );

  const docsValue = useMemo<DiagramDocsContextValue>(
    () => ({
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
      importDocument,
      deleteDoc,
      restoreLocalDoc,
      serverVersion,
      saveConflict,
      saveActiveDoc,
      activeDocLimited: limitedDocIds.includes(activeDocId),
      forceSaveActiveDoc,
      reloadActiveDoc,
      dismissSaveConflict,
      role,
      addServerDoc,
    }),
    [docTitle, setDocTitle, dirty, docs, activeDocId, openDoc, newDoc, renameDoc, setDocTags, duplicateDoc, importDocument, deleteDoc, restoreLocalDoc, serverVersion, saveConflict, saveActiveDoc, limitedDocIds, forceSaveActiveDoc, reloadActiveDoc, dismissSaveConflict, role, addServerDoc],
  );

  const collabValue = useMemo<DiagramCollabContextValue>(
    () => ({
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
      createBranch,
      branchError,
      retryBranch,
      syncLog,
      pushLog,
      resync,
      healOrphan,
      pruneWire,
      healAll,
      exportArch,
      exportPNG,
      exportSVG,
      exportCSV,
      exportPrint,
      importArch,
    }),
    [threads, addThread, replyThread, toggleResolveThread, deleteThread, displayName, setDisplayName, checkpoints, tagCheckpoint, restoreCheckpoint, deleteCheckpoint, createBranch, branchError, retryBranch, syncLog, pushLog, resync, healOrphan, pruneWire, healAll, exportArch, exportPNG, exportSVG, exportCSV, exportPrint, importArch],
  );

  return (
    <DiagramCoreContext.Provider value={coreValue}>
      <DiagramActionsContext.Provider value={actionsValue}>
        <DiagramUIContext.Provider value={uiValue}>
          <DiagramDocsContext.Provider value={docsValue}>
            <DiagramCollabContext.Provider value={collabValue}>
              {children}
            </DiagramCollabContext.Provider>
          </DiagramDocsContext.Provider>
        </DiagramUIContext.Provider>
      </DiagramActionsContext.Provider>
    </DiagramCoreContext.Provider>
  );
}
