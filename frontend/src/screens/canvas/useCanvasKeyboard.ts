import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ArchNode, DisplayStyle } from '../../types';
import type { CanvasTool } from '../../state/useDiagram';
import type { DiagramApi, Pt, TextDraft } from './types';

/** Default single-key tool shortcuts, keyed by the settings-screen name. */
export const DEFAULT_SHORTCUTS: Readonly<Record<string, string>> = {
  Select: 'V', Pan: 'H', Draw: 'P', Text: 'T', Service: 'S', Gateway: 'G', Database: 'D', Queue: 'Q', Note: 'M', Connector: 'C', Library: 'L',
};

/** Shortcuts with the user's rebinds from settings applied (storage errors fall back to defaults). */
export function readShortcuts(): Record<string, string> {
  try {
    const s = JSON.parse(localStorage.getItem('archflux:settings:v1') ?? '{}') as { shortcuts?: Record<string, string> };
    if (s.shortcuts) return { ...DEFAULT_SHORTCUTS, ...s.shortcuts };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SHORTCUTS };
}

/** Alt+digit → display style (matched on `code`: Alt changes `key` on macOS). */
const DISPLAY_KEYS: Readonly<Record<string, DisplayStyle>> = { Digit1: 'icon', Digit2: 'card', Digit3: 'shape' };

/**
 * Command ids for a shortcut, or null. Lock toggles: try Lock, then Unlock.
 */
function ARRANGE_SHORTCUTS(e: KeyboardEvent, isMod: boolean): string | string[] | null {
  if (e.altKey && !e.shiftKey && !isMod && e.code === 'KeyC') return ['display.collapse', 'display.expand'];
  if (e.shiftKey && !e.altKey && !isMod) {
    if (e.code === 'KeyF') return 'insert.frame';
    if (e.code === 'KeyW') return 'insert.swimlane';
  }
  if (e.altKey && e.shiftKey && !isMod) {
    const align: Record<string, string> = { KeyL: 'left', KeyC: 'center', KeyR: 'right', KeyT: 'top', KeyM: 'middle', KeyB: 'bottom' };
    if (align[e.code]) return `arrange.align.${align[e.code]}`;
    if (e.code === 'KeyH') return 'arrange.distributeH';
    if (e.code === 'KeyV') return 'arrange.distributeV';
    return null;
  }
  if (!isMod || e.altKey) return null;
  if (e.code === 'BracketRight') return e.shiftKey ? 'arrange.front' : 'arrange.forward';
  if (e.code === 'BracketLeft') return e.shiftKey ? 'arrange.back' : 'arrange.backward';
  if (e.code === 'KeyL' && e.shiftKey) return ['arrange.lock', 'arrange.unlock'];
  if (!e.shiftKey) {
    if (e.code === 'KeyC') return 'edit.copy';
    if (e.code === 'KeyX') return 'edit.cut';
    if (e.code === 'KeyV') return 'edit.paste';
  }
  return null;
}

/** The live editor state the keyboard handler reads through `stateRef`. */
export interface CanvasKeyboardState {
  nodes: ArchNode[];
  selectedId: string | null;
  selectedEdgeId: string | null;
  selectedStrokeId: string | null;
  selectedTextId: string | null;
  textDraft: TextDraft | null;
  multiSel: string[];
  tool: CanvasTool;
  lockedTool: CanvasTool | null;
  /** Ids of locked layers: their elements cannot be selected. */
  lockedLayers?: ReadonlySet<string>;
}

/** Every ref and callback the global keydown/keyup/blur effect uses. */
export interface CanvasKeyboardDeps
  extends Pick<
    DiagramApi,
    | 'undo'
    | 'redo'
    | 'deleteSelected'
    | 'deleteNodes'
    | 'duplicateSelected'
    | 'setSelectedId'
    | 'setTool'
    | 'resetView'
    | 'deleteEdge'
    | 'deleteStroke'
    | 'deleteText'
    | 'moveNode'
    | 'checkpoint'
    | 'pushToast'
    | 'panToNode'
  > {
  stateRef: { readonly current: CanvasKeyboardState };
  spaceDown: { current: boolean };
  inkRef: { current: { pts: Pt[] } | null };
  inspectorCkpt: { current: string | null };
  fitContent: () => void;
  finishTextDraft: (d: TextDraft | null) => void;
  setMiniOpenPersisted: (v: boolean | ((prev: boolean) => boolean)) => void;
  setMultiSel: Dispatch<SetStateAction<string[]>>;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
  setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  setSelectedStrokeId: Dispatch<SetStateAction<string | null>>;
  setInk: Dispatch<SetStateAction<Pt[] | null>>;
  setPendingFrom: Dispatch<SetStateAction<string | null>>;
  setCommentFor: Dispatch<SetStateAction<{ id: string; label: string } | null>>;
  setLockedTool: Dispatch<SetStateAction<CanvasTool | null>>;
  setLibOpen: Dispatch<SetStateAction<boolean>>;
  /** R1-E02-T06: open the inline name editor on a node (Enter with one node selected). */
  beginNodeEdit: (id: string) => void;
  /** R1-E04-T07: Shift+F10 / the context-menu key open the context menu at the selection. */
  openContextMenu: (at: { x: number; y: number } | null) => void;
  /** Delete with a boundary that has contents selected: the canvas asks what to do. True when it took over. */
  requestDeleteBoundary: (ids: string[]) => boolean;
  /** R1-E04-T08: runs a registered canvas command by id (arrange, clipboard); false when unavailable. */
  runCanvasCommand: (id: string) => boolean;
  /** R1-E04-T08: Ctrl+F opens the find bar, Ctrl+H the find bar with replace. */
  openFind: (replace: boolean) => void;
  /** R1-E02-T05: Alt+1/2/3 switch the selection to icon / card / shape. */
  setDisplayStyle: (ids: string[], style: DisplayStyle) => void;
}

/**
 * Global canvas keyboard shortcuts (tools, undo/redo, delete, nudge, Esc,
 * Space-to-pan). The dependency list is exactly the one the effect had inside
 * CanvasScreen: the React state setters are stable, and panToNode /
 * setMiniOpenPersisted are read from the subscribing render on purpose.
 */
export function useCanvasKeyboard(deps: CanvasKeyboardDeps): void {
  const {
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
    openContextMenu,
    requestDeleteBoundary,
    runCanvasCommand,
    openFind,
  } = deps;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const isMod = e.ctrlKey || e.metaKey;
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        e.preventDefault();
        openContextMenu(null);
        return;
      }
      // Arrange, z-order, lock, clipboard and find shortcuts (R1-E04-T01/T02/T07/T08, R1-E10-T05).
      // Matched on `code`: Alt and Shift change `key` on some layouts.
      const arrangeId = ARRANGE_SHORTCUTS(e, isMod);
      if (arrangeId) {
        const ids = Array.isArray(arrangeId) ? arrangeId : [arrangeId];
        if (ids.some((id) => runCanvasCommand(id))) e.preventDefault();
        else if (isMod && e.altKey === false && e.shiftKey === false && ids[0] === 'edit.copy') return; // nothing selected: leave native copy alone
        return;
      }
      if (isMod && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        openFind(e.key.toLowerCase() === 'h');
        return;
      }
      if (e.key === ' ' && !isMod) {
        e.preventDefault();
        spaceDown.current = true;
        return;
      }
      // Single-key shortcuts must not fire while a button holds focus
      // (e.g. Delete right after clicking a rail button). Escape always passes.
      const displayKey = e.altKey && !isMod && !e.shiftKey ? DISPLAY_KEYS[e.code] : undefined;
      // Read rebindable shortcuts from settings (fall back to defaults).
      const shortcuts = readShortcuts();
      // R1-BUG-08: the Connector key still works from the screen-reader node list, the keyboard
      // route to pick a connection source and target.
      const inNodeList = Boolean((e.target as HTMLElement)?.closest?.('[aria-label="Diagram nodes and routes"]'));
      const connectFromList = inNodeList && !isMod && e.key.toLowerCase() === (shortcuts['Connector'] ?? '').toLowerCase();
      if (!isMod && e.key !== 'Escape' && !displayKey && !connectFromList && tag === 'BUTTON') return;
      // Bound key for a tool name (e.g. keyFor('Select') → 'v').
      const keyFor = (toolName: string) => (shortcuts[toolName] ?? '').toLowerCase();
      const k = e.key.toLowerCase();
      if (displayKey) {
        // R1-E02-T05: one undo step for the whole selection; nothing selected = nothing to do.
        const cur = stateRef.current;
        const ids = Array.from(new Set([...cur.multiSel, cur.selectedId].filter((v): v is string => Boolean(v))));
        e.preventDefault();
        if (ids.length > 0) setDisplayStyle(ids, displayKey);
      } else if (isMod && k === 'a') {
        e.preventDefault();
        const locked = stateRef.current.lockedLayers;
        const ids = stateRef.current.nodes.filter((n) => !locked?.has(n.layerId ?? 'ly-default')).map((n) => n.id);
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
        if (!stateRef.current.selectedEdgeId && requestDeleteBoundary(bulk)) return;
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
      } else if (e.key === 'Enter' && !isMod && !e.altKey) {
        // R1-E02-T06: Enter on a single selected node edits its name inline.
        const cur = stateRef.current;
        if (cur.textDraft || cur.tool !== 'select' || !cur.selectedId || cur.multiSel.length > 1) return;
        e.preventDefault();
        beginNodeEdit(cur.selectedId);
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
        // R1-E01-T07: with exactly one node selected, C arms it as the source;
        // the next click on a target creates the edge.
        const cur = stateRef.current;
        const single = cur.selectedId && cur.multiSel.length <= 1 ? cur.selectedId : null;
        setTool('connector');
        setPendingFrom(single);
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
  }, [undo, redo, deleteSelected, deleteNodes, duplicateSelected, setSelectedId, setTool, resetView, fitContent, deleteEdge, deleteStroke, deleteText, moveNode, checkpoint, pushToast, finishTextDraft, beginNodeEdit, setDisplayStyle, openContextMenu, requestDeleteBoundary, runCanvasCommand, openFind]);
}
