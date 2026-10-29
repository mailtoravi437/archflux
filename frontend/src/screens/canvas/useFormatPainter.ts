import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArchNode } from '../../types';
import { copyStyle, type NodeStyle } from '../../state/ops/style';

/** Format painter shortcuts (R1-E04-T06): Ctrl/Cmd+Alt+C copies the style, Ctrl/Cmd+Alt+V pastes it. */
export function formatPainterShortcut(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): 'copy' | 'paste' | null {
  if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return null;
  // `code`, not `key`: Alt changes the produced character on macOS.
  if (e.code === 'KeyC') return 'copy';
  if (e.code === 'KeyV') return 'paste';
  return null;
}

export interface FormatPainterDeps {
  nodes: readonly ArchNode[];
  /** Selected node ids; the first is the style source. */
  selectedIds: readonly string[];
  pasteStyle: (ids: string[], style: Partial<ArchNode>) => void;
  onMessage?: (text: string) => void;
}

export interface FormatPainter {
  copied: NodeStyle | null;
  /** The toolbar button is armed: the next click on nodes pastes once. */
  armed: boolean;
  copy: () => boolean;
  paste: () => boolean;
  /** Toolbar "Format painter" button: copies the selection's style and arms a one-shot paste. */
  arm: () => boolean;
  disarm: () => void;
  /** Call with the ids under the next click. Pastes once and disarms; false when not armed. */
  applyArmed: (ids: string[]) => boolean;
}

/**
 * Format painter state. Copy takes the primary selected node; paste applies it
 * to the whole selection as a single undo step (store `pasteStyle`).
 * Integration (CanvasScreen/SelectionToolbars/keyboard) is a follow-up: see EPIC-04 T06 notes.
 */
export function useFormatPainter(deps: FormatPainterDeps): FormatPainter {
  const [copied, setCopied] = useState<NodeStyle | null>(null);
  const [armed, setArmed] = useState(false);
  const live = useRef(deps);
  useEffect(() => {
    live.current = deps;
  });
  const copiedRef = useRef<NodeStyle | null>(null);

  const copy = useCallback((): boolean => {
    const { nodes, selectedIds, onMessage } = live.current;
    const src = nodes.find((n) => n.id === selectedIds[0]);
    if (!src) {
      onMessage?.('Select an element to copy its style');
      return false;
    }
    const style = copyStyle(src);
    copiedRef.current = style;
    setCopied(style);
    onMessage?.(`Copied style of ${src.label || 'element'}`);
    return true;
  }, []);

  const paste = useCallback((): boolean => {
    const { selectedIds, pasteStyle, onMessage } = live.current;
    const style = copiedRef.current;
    if (!style) {
      onMessage?.('Nothing copied yet. Copy a style first (Ctrl+Alt+C)');
      return false;
    }
    if (selectedIds.length === 0) return false;
    pasteStyle([...selectedIds], style);
    return true;
  }, []);

  const arm = useCallback((): boolean => {
    if (!copy()) return false;
    setArmed(true);
    return true;
  }, [copy]);

  const disarm = useCallback(() => setArmed(false), []);

  const applyArmed = useCallback(
    (ids: string[]): boolean => {
      const style = copiedRef.current;
      if (!armed || !style || ids.length === 0) return false;
      live.current.pasteStyle(ids, style);
      setArmed(false);
      return true;
    },
    [armed],
  );

  // Keys: not while typing in a field; Esc cancels an armed paint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Escape' && armed) {
        setArmed(false);
        return;
      }
      const action = formatPainterShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'copy') copy();
      else paste();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, copy, paste]);

  return { copied, armed, copy, paste, arm, disarm, applyArmed };
}
