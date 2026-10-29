import { useEffect } from 'react';
import type { ArchNode, DisplayStyle } from '../../types';
import { useDiagram } from '../../state/useDiagram';
import { registerCommands, shortcutLabel, type Command, type CommandContext } from '../../lib/commands';
import type { AlignEdge } from '../../state/ops/arrange';
import { copyText } from '../../lib/clipboard';
import { isBoundaryNode } from '../../canvas/render/boundaries';
import { copyToClipboard, hasClipboard, readClipboard } from './nodeClipboard';

export interface CanvasCommandHandlers {
  /** "Replace icon": opens the picker for one node. */
  onReplaceIcon: (id: string) => void;
  /** "Comment": opens the composer for one node. */
  onComment: (id: string, label: string) => void;
  /** "Properties": shows the Inspector. */
  onProperties: () => void;
  /** "Select similar": the canvas owns the multi-selection, so it applies the found ids. */
  onSelectMany: (ids: string[]) => void;
  /** Delete when a boundary with contents is selected: the canvas asks "boundary only / with contents". Returns true when it took over. */
  onDeleteBoundaries: (ids: string[]) => boolean;
}

const onCanvas = (ctx: CommandContext) => ctx.route === '/canvas';
const canEdit = (ctx: CommandContext) => ctx.role === 'owner' || ctx.role === 'editor';
const canComment = (ctx: CommandContext) => ctx.role !== 'viewer';

const ALIGN: readonly { edge: AlignEdge; title: string; key: string }[] = [
  { edge: 'left', title: 'Align left', key: 'L' },
  { edge: 'center', title: 'Align center', key: 'C' },
  { edge: 'right', title: 'Align right', key: 'R' },
  { edge: 'top', title: 'Align top', key: 'T' },
  { edge: 'middle', title: 'Align middle', key: 'M' },
  { edge: 'bottom', title: 'Align bottom', key: 'B' },
];

const STYLES: readonly { style: DisplayStyle; title: string; n: number }[] = [
  { style: 'icon', title: 'Icon', n: 1 },
  { style: 'card', title: 'Card', n: 2 },
  { style: 'shape', title: 'Shape', n: 3 },
];

/** The link "Copy link to element" produces; `CanvasScreen` reads `element` on arrival. */
export function elementLink(docId: string, elementId: string): string {
  const base = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`;
  return `${base}#/canvas?doc=${encodeURIComponent(docId)}&element=${encodeURIComponent(elementId)}`;
}

/**
 * Registers the canvas element commands (R1-E04-T07) in the command registry while the canvas is
 * mounted. The context menu and the command palette list the same entries, so titles and
 * shortcuts match. Availability (`when`) hides what does not apply; nothing is shown disabled.
 */
export function useCanvasCommands(handlers: CanvasCommandHandlers): void {
  const d = useDiagram();
  const { nodes, edges, layers, pages, activePageId, activeDocId, onReplaceIcon, onComment, onProperties, onSelectMany, onDeleteBoundaries } = {
    nodes: d.nodes, edges: d.edges, layers: d.layers, pages: d.pages, activePageId: d.activePageId, activeDocId: d.activeDocId, ...handlers,
  };
  const { deleteNodes, deleteEdge, duplicateSelected, mergeGraph, selectSimilar, align, distribute, matchSize, zOrder, setLocked, setDisplayStyle, moveToLayer, moveToPage, pushToast, checkpoint, updateNode, setActivePageId, toggleCollapse, fitToContents, addLaneBelow, setTool } = d;

  useEffect(() => {
    const k = shortcutLabel;
    const pick = (ctx: CommandContext): ArchNode[] => {
      const set = new Set(ctx.selectionIds);
      return nodes.filter((n) => set.has(n.id));
    };
    const lockedLayers = new Set(layers.filter((l) => l.locked).map((l) => l.id));
    const isLocked = (n: ArchNode) => Boolean(n.locked) || lockedLayers.has(n.layerId ?? 'ly-default');
    const unlocked = (ctx: CommandContext) => pick(ctx).filter((n) => !isLocked(n));
    const ids = (ctx: CommandContext) => pick(ctx).map((n) => n.id);

    const paste = () => {
      const c = readClipboard();
      if (!c) return;
      mergeGraph(c.nodes, c.edges, `Pasted ${c.nodes.length} element${c.nodes.length === 1 ? '' : 's'}`);
    };

    const cmds: Command[] = [
      // Edit
      {
        id: 'edit.cut', title: 'Cut', group: 'Edit', shortcut: k('⌘X', 'Ctrl+X'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => {
          const sel = unlocked(ctx).map((n) => n.id);
          const count = copyToClipboard(nodes, edges, sel);
          if (count > 0) deleteNodes(sel);
        },
      },
      {
        id: 'edit.copy', title: 'Copy', group: 'Edit', shortcut: k('⌘C', 'Ctrl+C'),
        when: (ctx) => onCanvas(ctx) && pick(ctx).length > 0,
        run: (ctx) => {
          const count = copyToClipboard(nodes, edges, ids(ctx));
          pushToast(`Copied ${count} element${count === 1 ? '' : 's'}`);
        },
      },
      { id: 'edit.paste', title: 'Paste', group: 'Edit', shortcut: k('⌘V', 'Ctrl+V'), when: (ctx) => onCanvas(ctx) && canEdit(ctx) && hasClipboard(), run: paste },
      {
        id: 'edit.duplicate', title: 'Duplicate', group: 'Edit', shortcut: k('⌘D', 'Ctrl+D'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length > 0,
        run: (ctx) => {
          const sel = pick(ctx);
          if (sel.length === 1) {
            duplicateSelected(sel[0].id);
          } else {
            const c = copyToClipboard(nodes, edges, sel.map((n) => n.id));
            if (c > 0) paste();
          }
        },
      },
      {
        id: 'edit.delete', title: 'Delete', group: 'Edit', shortcut: k('⌫', 'Delete'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && (unlocked(ctx).length > 0 || ctx.selectionIds.some((id) => edges.some((e) => e.id === id))),
        run: (ctx) => {
          const sel = unlocked(ctx).map((n) => n.id);
          if (sel.length > 0 && onDeleteBoundaries(sel)) return;
          if (sel.length > 0) deleteNodes(sel);
          else ctx.selectionIds.filter((id) => edges.some((e) => e.id === id)).forEach((id) => deleteEdge(id));
        },
      },
      {
        id: 'edit.selectSimilar', title: 'Select similar', group: 'Edit',
        when: (ctx) => onCanvas(ctx) && pick(ctx).length === 1,
        run: (ctx) => {
          const found = selectSimilar(pick(ctx)[0].id);
          onSelectMany(found);
          pushToast(`Selected ${found.length} similar element${found.length === 1 ? '' : 's'}`);
        },
      },
      // Arrange
      ...ALIGN.map((a): Command => ({
        id: `arrange.align.${a.edge}`, title: a.title, group: 'Arrange', shortcut: k(`⌥⇧${a.key}`, `Alt+Shift+${a.key}`), keywords: ['align'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length >= 2,
        run: (ctx) => align(unlocked(ctx).map((n) => n.id), a.edge),
      })),
      {
        id: 'arrange.distributeH', title: 'Distribute horizontally', group: 'Arrange', shortcut: k('⌥⇧H', 'Alt+Shift+H'), keywords: ['distribute', 'spacing'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length >= 3,
        run: (ctx) => distribute(unlocked(ctx).map((n) => n.id), 'h'),
      },
      {
        id: 'arrange.distributeV', title: 'Distribute vertically', group: 'Arrange', shortcut: k('⌥⇧V', 'Alt+Shift+V'), keywords: ['distribute', 'spacing'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length >= 3,
        run: (ctx) => distribute(unlocked(ctx).map((n) => n.id), 'v'),
      },
      {
        id: 'arrange.matchSize', title: 'Match size', group: 'Arrange', keywords: ['same size', 'width', 'height'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length >= 2,
        run: (ctx) => matchSize(unlocked(ctx).map((n) => n.id), 'both'),
      },
      {
        id: 'arrange.front', title: 'Bring to front', group: 'Arrange', shortcut: k('⇧⌘]', 'Ctrl+Shift+]'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => zOrder(unlocked(ctx).map((n) => n.id), 'front'),
      },
      {
        id: 'arrange.back', title: 'Send to back', group: 'Arrange', shortcut: k('⇧⌘[', 'Ctrl+Shift+['),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => zOrder(unlocked(ctx).map((n) => n.id), 'back'),
      },
      {
        id: 'arrange.forward', title: 'Bring forward', group: 'Arrange', shortcut: k('⌘]', 'Ctrl+]'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => zOrder(unlocked(ctx).map((n) => n.id), 'forward'),
      },
      {
        id: 'arrange.backward', title: 'Send backward', group: 'Arrange', shortcut: k('⌘[', 'Ctrl+['),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => zOrder(unlocked(ctx).map((n) => n.id), 'backward'),
      },
      {
        id: 'arrange.lock', title: 'Lock', group: 'Arrange', shortcut: k('⇧⌘L', 'Ctrl+Shift+L'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => setLocked(unlocked(ctx).map((n) => n.id), true),
      },
      {
        id: 'arrange.unlock', title: 'Unlock', group: 'Arrange', shortcut: k('⇧⌘L', 'Ctrl+Shift+L'),
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length > 0 && unlocked(ctx).length === 0 && pick(ctx).some((n) => n.locked),
        run: (ctx) => setLocked(pick(ctx).filter((n) => n.locked).map((n) => n.id), false),
      },
      // Containers (R1-E03-T03, T06)
      {
        id: 'display.collapse', title: 'Collapse', group: 'Display', shortcut: k('⌥C', 'Alt+C'), keywords: ['boundary', 'chip'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1 && isBoundaryNode(pick(ctx)[0]) && !pick(ctx)[0].collapsed,
        run: (ctx) => toggleCollapse(pick(ctx)[0].id),
      },
      {
        id: 'display.expand', title: 'Expand', group: 'Display', shortcut: k('⌥C', 'Alt+C'), keywords: ['boundary', 'chip'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1 && isBoundaryNode(pick(ctx)[0]) && pick(ctx)[0].collapsed === true,
        run: (ctx) => toggleCollapse(pick(ctx)[0].id),
      },
      {
        id: 'arrange.fitToContents', title: 'Fit to contents', group: 'Arrange', keywords: ['boundary', 'resize'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1 && isBoundaryNode(pick(ctx)[0]) && nodes.some((n) => n.parentId === pick(ctx)[0].id),
        run: (ctx) => fitToContents(pick(ctx)[0].id),
      },
      {
        id: 'arrange.addLaneBelow', title: 'Add lane below', group: 'Arrange', keywords: ['swimlane'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1 && pick(ctx)[0].boundaryKind === 'swimlane',
        run: (ctx) => { addLaneBelow(pick(ctx)[0].id); },
      },
      {
        id: 'insert.frame', title: 'Frame', group: 'Edit', shortcut: k('⇧F', 'Shift+F'), keywords: ['insert', 'boundary', 'present'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx),
        run: () => { setTool('frame'); pushToast('Frame tool: drag out a rectangle'); },
      },
      {
        id: 'insert.swimlane', title: 'Swimlane', group: 'Edit', shortcut: k('⇧W', 'Shift+W'), keywords: ['insert', 'boundary', 'lane'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx),
        run: () => { setTool('swimlane'); pushToast('Swimlane tool: drag out a rectangle'); },
      },
      // Display
      ...STYLES.map((s): Command => ({
        id: `display.style.${s.style}`, title: s.title, group: 'Display', shortcut: k(`⌥${s.n}`, `Alt+${s.n}`), keywords: ['display style'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => setDisplayStyle(unlocked(ctx).map((n) => n.id), s.style),
      })),
      {
        id: 'display.replaceIcon', title: 'Replace icon', group: 'Display', keywords: ['icon'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1,
        run: (ctx) => onReplaceIcon(pick(ctx)[0].id),
      },
      // Review
      {
        id: 'review.comment', title: 'Comment', group: 'Review', keywords: ['note', 'review'],
        when: (ctx) => onCanvas(ctx) && canComment(ctx) && pick(ctx).length === 1,
        run: (ctx) => {
          const n = pick(ctx)[0];
          onComment(n.id, n.label);
        },
      },
      {
        id: 'review.copyLink', title: 'Copy link to element', group: 'Review', keywords: ['share', 'url'],
        when: (ctx) => onCanvas(ctx) && pick(ctx).length === 1,
        run: (ctx) => {
          void copyText(elementLink(activeDocId, pick(ctx)[0].id)).then((ok) => pushToast(ok ? 'Link copied' : 'Could not copy the link'));
        },
      },
      // Navigate
      { id: 'nav.history', title: 'Version history', group: 'Navigate', keywords: ['revisions', 'restore', 'versions'], run: (ctx) => ctx.navigate('/history') },
      // Advanced
      ...layers.map((l): Command => ({
        id: `advanced.moveToLayer.${l.id}`, title: `Move to layer: ${l.name}`, group: 'Advanced', keywords: ['layer'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => moveToLayer(unlocked(ctx).map((n) => n.id), l.id),
      })),
      ...pages.filter((p) => p.id !== activePageId).map((p): Command => ({
        id: `advanced.moveToPage.${p.id}`, title: `Move to page: ${p.name}`, group: 'Advanced', keywords: ['page'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && unlocked(ctx).length > 0,
        run: (ctx) => moveToPage(unlocked(ctx).map((n) => n.id), p.id),
      })),
      ...pages.filter((p) => p.id !== activePageId).map((p): Command => ({
        id: `advanced.linkToPage.${p.id}`, title: `Link to page: ${p.name}`, group: 'Advanced', keywords: ['page link', 'navigate'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1,
        run: (ctx) => {
          const n = pick(ctx)[0];
          checkpoint(false);
          updateNode(n.id, { linkPageId: p.id });
        },
      })),
      {
        id: 'advanced.goToLinkedPage', title: 'Go to linked page', group: 'Advanced', keywords: ['page link', 'navigate'],
        when: (ctx) => onCanvas(ctx) && pick(ctx).length === 1 && Boolean(pick(ctx)[0].linkPageId),
        run: (ctx) => {
          const target = pick(ctx)[0].linkPageId;
          if (target) setActivePageId(target);
        },
      },
      {
        id: 'advanced.unlinkPage', title: 'Remove page link', group: 'Advanced', keywords: ['page link'],
        when: (ctx) => onCanvas(ctx) && canEdit(ctx) && pick(ctx).length === 1 && Boolean(pick(ctx)[0].linkPageId),
        run: (ctx) => {
          const n = pick(ctx)[0];
          checkpoint(false);
          updateNode(n.id, { linkPageId: undefined });
        },
      },
      {
        id: 'advanced.properties', title: 'Properties', group: 'Advanced', keywords: ['inspector'],
        when: (ctx) => onCanvas(ctx) && ctx.selectionIds.length > 0,
        run: () => onProperties(),
      },
    ];
    const unregister = registerCommands(cmds);
    return () => {
      unregister();
    };
  }, [nodes, edges, layers, pages, activePageId, activeDocId, onReplaceIcon, onComment, onProperties, onSelectMany, deleteNodes, deleteEdge, duplicateSelected, mergeGraph, selectSimilar, align, distribute, matchSize, zOrder, setLocked, setDisplayStyle, moveToLayer, moveToPage, pushToast, checkpoint, updateNode, setActivePageId, toggleCollapse, fitToContents, addLaneBelow, setTool, onDeleteBoundaries]);
}
