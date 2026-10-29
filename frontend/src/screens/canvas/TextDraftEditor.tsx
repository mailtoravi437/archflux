import { useDiagram } from '../../state/useDiagram';
import type { TextDraft } from './types';

export interface TextDraftEditorProps {
  draft: TextDraft;
  /** The canvas viewport element (read during CanvasScreen's render), used to keep the editor on-screen. */
  viewport: HTMLDivElement | null;
  /** Set once the draft is committed, so the unmount blur does not commit twice. */
  draftCommitted: { readonly current: boolean };
  /** Write-through keystroke handler (CanvasScreen's onDraftChange). */
  onDraftChange: (value: string) => void;
  onCommit: () => void;
}

/** Inline click-to-type text editor positioned over the canvas (Excalidraw-style). */
export function TextDraftEditor({ draft, viewport, draftCommitted, onDraftChange, onCommit }: TextDraftEditorProps) {
  const { texts, zoom, pan, theme } = useDiagram();
  const editing = draft.editingId ? texts.find((t) => t.id === draft.editingId) : null;
  const fam = editing?.fontFamily ?? 'Caveat';
  const generic = fam === 'Fira Code' ? 'monospace' : fam === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive';
  return (
    <textarea
      autoFocus
      ref={(el) => { el?.focus(); }}
      rows={2}
      value={draft.value}
      onChange={(e) => onDraftChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          // Esc finishes (commits) — a typed draft is never discarded.
          e.stopPropagation();
          onCommit();
        }
      }}
      onBlur={() => {
        // Commit on genuine blur (e.g. clicking into side panels, which
        // never fires canvas pointerdown). Guarded: remount/unmount blurs
        // and post-Enter/post-Esc blurs are skipped via the flag + empty check.
        if (!draftCommitted.current && draft.value.trim()) onCommit();
      }}
      placeholder="Type anything…"
      aria-label={draft.editingId ? 'Edit text' : 'Type anything'}
      style={{
        position: 'absolute',
        left: Math.min(Math.max(draft.x * zoom + pan.x, 8), Math.max(8, (viewport?.clientWidth ?? window.innerWidth) - 140)),
        top: Math.min(Math.max(draft.y * zoom + pan.y - 24 * zoom, 8), Math.max(8, (viewport?.clientHeight ?? window.innerHeight) - 60)),
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
}
