import { useEffect } from 'react';
import { track } from '../../lib/analytics';
import { useNavigate } from 'react-router-dom';
import { useDiagramCollab, useDiagramDocs } from '../../state/useDiagram';
import { registerCommands, shortcutLabel } from '../../lib/commands';
import type { Command } from '../../lib/commands';
import { isServerDocId } from '../../lib/honesty';

interface AppCommandDeps {
  onSave: () => void;
  onImport: () => void;
  onFocusMode: () => void;
  onShortcuts: () => void;
}

/**
 * Registers the existing app-level actions (R1-E10-T03): new doc, save,
 * export, import, undo/redo, zoom, theme, the navigation routes and layout.
 * Actions on the docs/collab contexts are closed over here because
 * CommandContext only carries `actions` and `ui`.
 */
export function useAppCommands({ onSave, onImport, onFocusMode, onShortcuts }: AppCommandDeps): void {
  const navigate = useNavigate();
  const { newDoc, activeDocId, docs, openDoc } = useDiagramDocs();
  const { exportArch, exportSVG, exportPNG, exportCSV, exportPrint, resync, healAll } = useDiagramCollab();

  useEffect(() => {
    const k = (mac: string, other: string) => shortcutLabel(mac, other);
    const onCanvas = (ctx: { route: string }) => ctx.route === '/canvas';
    const cmds: Command[] = [
      // File
      { id: 'file.new', title: 'New blank diagram', group: 'File', keywords: ['create', 'doc'], run: () => { newDoc(); track('diagram_created', { source: 'blank' }); navigate('/canvas'); } },
      { id: 'file.save', title: 'Save diagram to server', group: 'File', keywords: ['save', 'upload'], when: () => isServerDocId(activeDocId), run: () => onSave() },
      { id: 'file.exportArch', title: 'Export .arch file', group: 'File', keywords: ['download', 'export'], run: () => exportArch() },
      { id: 'file.exportSvg', title: 'Export SVG (vector)', group: 'File', keywords: ['download', 'image'], run: () => exportSVG() },
      { id: 'file.exportPng', title: 'Export PNG snapshot', group: 'File', keywords: ['download', 'image'], run: () => exportPNG() },
      { id: 'file.exportCsv', title: 'Export CSV (shape data)', group: 'File', keywords: ['download', 'spreadsheet'], run: () => exportCSV() },
      { id: 'file.print', title: 'Print / Save as PDF', group: 'File', keywords: ['pdf', 'export'], run: () => exportPrint() },
      { id: 'file.import', title: 'Import a diagram…', group: 'File', keywords: ['open', 'upload', 'load'], run: () => onImport() },
      ...docs.map((d): Command => ({
        id: `file.open.${d.id}`,
        title: `Open diagram: ${d.title}`,
        group: 'File',
        keywords: ['switch'],
        when: () => d.id !== activeDocId,
        run: () => { openDoc(d.id); navigate('/canvas'); },
      })),
      // Edit
      { id: 'edit.undo', title: 'Undo', group: 'Edit', shortcut: k('⌘Z', 'Ctrl+Z'), when: (ctx) => ctx.actions.canUndo, run: (ctx) => ctx.actions.undo() },
      { id: 'edit.redo', title: 'Redo', group: 'Edit', shortcut: k('⇧⌘Z', 'Ctrl+Shift+Z'), when: (ctx) => ctx.actions.canRedo, run: (ctx) => ctx.actions.redo() },
      // Arrange
      { id: 'arrange.layoutDag', title: 'Auto-layout (DAG)', group: 'Arrange', keywords: ['layout', 'arrange', 'tidy'], run: (ctx) => { navigate('/canvas'); ctx.actions.applyLayout('dag'); } },
      // Display
      { id: 'display.themeLight', title: 'Theme: Engineering Light', group: 'Display', keywords: ['appearance', 'light'], run: (ctx) => ctx.ui.setTheme('light') },
      { id: 'display.themeBlueprint', title: 'Theme: Cyber Blueprint', group: 'Display', keywords: ['appearance', 'blue'], run: (ctx) => ctx.ui.setTheme('blueprint') },
      { id: 'display.themeDark', title: 'Theme: Obsidian Dark', group: 'Display', keywords: ['appearance', 'dark'], run: (ctx) => ctx.ui.setTheme('dark') },
      // View
      { id: 'view.zoomIn', title: 'Zoom in', group: 'View', keywords: ['magnify'], when: onCanvas, run: (ctx) => ctx.ui.zoomBy(0.1) },
      { id: 'view.zoomOut', title: 'Zoom out', group: 'View', keywords: ['shrink'], when: onCanvas, run: (ctx) => ctx.ui.zoomBy(-0.1) },
      { id: 'view.zoom100', title: 'Zoom to 100%', group: 'View', keywords: ['actual size', 'reset zoom'], when: onCanvas, run: (ctx) => ctx.ui.zoomTo(1) },
      { id: 'view.fit', title: 'Fit canvas to view', group: 'View', shortcut: 'F', keywords: ['zoom', 'reset'], run: (ctx) => { navigate('/canvas'); ctx.ui.resetView(); } },
      { id: 'view.focus', title: 'Focus mode', group: 'View', keywords: ['fullscreen', 'present', 'hide panels'], run: () => onFocusMode() },
      { id: 'view.shortcuts', title: 'Keyboard shortcuts', group: 'View', shortcut: '?', keywords: ['help', 'keys'], run: () => onShortcuts() },
      // Navigate
      { id: 'nav.library', title: 'Go to Library', group: 'Navigate', shortcut: k('⌘O', 'Ctrl+O'), keywords: ['dashboard', 'documents'], run: () => navigate('/dashboard') },
      { id: 'nav.canvas', title: 'Go to Canvas', group: 'Navigate', keywords: ['editor', 'precision'], run: () => navigate('/canvas') },
      { id: 'nav.review', title: 'Go to Review', group: 'Navigate', shortcut: 'D', keywords: ['reviews', 'comments'], run: () => navigate('/reviews') },
      { id: 'nav.merge', title: 'Go to Merge & Automation', group: 'Navigate', shortcut: k('⌘G', 'Ctrl+G'), keywords: ['git', 'reviews'], run: () => navigate('/reviews', { state: { tab: 'merge' } }) },
      { id: 'nav.sync', title: 'Go to Sync', group: 'Navigate', shortcut: k('⌘S', 'Ctrl+S'), keywords: ['living', 'drift'], run: () => navigate('/living') },
      { id: 'nav.blueprints', title: 'Go to Blueprints', group: 'Navigate', shortcut: k('⌘B', 'Ctrl+B'), keywords: ['templates'], run: () => navigate('/blueprints') },
      { id: 'nav.settings', title: 'Go to Settings', group: 'Navigate', shortcut: k('⌘,', 'Ctrl+,'), keywords: ['preferences'], run: () => navigate('/settings/general') },
      // Review / Advanced (existing palette entries)
      { id: 'review.resync', title: 'Re-sync from upstream', group: 'Review', keywords: ['sync', 'refresh'], run: () => resync() },
      { id: 'advanced.healAll', title: 'Heal all lint issues', group: 'Advanced', keywords: ['linter', 'fix'], run: () => healAll() },
    ];
    return registerCommands(cmds);
  }, [navigate, newDoc, activeDocId, docs, openDoc, exportArch, exportSVG, exportPNG, exportCSV, exportPrint, resync, healAll, onSave, onImport, onFocusMode, onShortcuts]);
}
