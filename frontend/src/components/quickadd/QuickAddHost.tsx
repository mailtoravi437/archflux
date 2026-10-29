import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useCoreDiagram, useDiagramUI } from '../../state/useDiagram';
import { registerCommands } from '../../lib/commands';
import QuickAdd from './QuickAdd';

/** Window event that opens quick-add (used by the palette command). */
export const QUICK_ADD_EVENT = 'archflux:quick-add';

const isTyping = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
};

/**
 * Opens quick-add (R1-E10-T06) from the keyboard: Ctrl/Cmd+Enter with exactly one node selected, or
 * Tab while the canvas itself has focus. Also registers the palette command. Mounted by AppShell on /canvas.
 */
export default function QuickAddHost() {
  const { nodes, selectedId, multiSel } = useCoreDiagram();
  const { zoom, pan } = useDiagramUI();
  const [open, setOpen] = useState(false);
  const single = selectedId && multiSel.length <= 1 ? nodes.find((n) => n.id === selectedId) ?? null : null;

  // Clearing the selection closes quick-add. A new selection keeps it open: that is how chaining works.
  const [hadSingle, setHadSingle] = useState(Boolean(single));
  if (Boolean(single) !== hadSingle) {
    setHadSingle(Boolean(single));
    if (!single) setOpen(false);
  }
  const tryOpen = useCallback(() => {
    if (single) setOpen(true);
  }, [single]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || e.defaultPrevented) return;
      const mod = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
      const tab = e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
        && document.activeElement instanceof HTMLElement && document.activeElement.id === 'architectureCanvas';
      if (!mod && !tab) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (!single) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, single]);

  useEffect(() => {
    const on = () => tryOpen();
    window.addEventListener(QUICK_ADD_EVENT, on);
    return () => window.removeEventListener(QUICK_ADD_EVENT, on);
  }, [tryOpen]);

  useEffect(
    () => registerCommands([{
      id: 'edit.quickAdd',
      title: 'Quick add connected element',
      group: 'Edit',
      shortcut: 'Ctrl+Enter',
      keywords: ['create', 'connect', 'add', 'type'],
      when: (ctx) => ctx.selectionIds.length === 1,
      run: () => { window.dispatchEvent(new Event(QUICK_ADD_EVENT)); },
    }]),
    [],
  );

  if (!open || !single) return null;
  const rect = document.getElementById('architectureCanvas')?.getBoundingClientRect();
  const style: CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(window.innerWidth - 280, (rect?.left ?? 0) + (single.x + single.w) * zoom + pan.x + 12)),
    top: Math.max(8, Math.min(window.innerHeight - 200, (rect?.top ?? 0) + single.y * zoom + pan.y)),
    zIndex: 90,
  };
  return <QuickAdd onClose={() => setOpen(false)} style={style} />;
}
