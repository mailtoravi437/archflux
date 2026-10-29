import { useEffect, useRef, useState } from 'react';
import type { ArchNode } from '../../types';
import type { IconEntry } from '../../lib/icons';
import { inlineEditRects } from '../../canvas/render';

export type InlineField = 'name' | 'technology';

export interface InlineEditPatch { label?: string; technology?: string; }

export interface InlineEditorProps {
  node: ArchNode;
  /** Field that has focus when the editor opens. */
  initialField: InlineField;
  zoom: number;
  pan: { x: number; y: number };
  iconEntries?: IconEntry[];
  isDark: boolean;
  /** Called once with the changed fields ({} when nothing changed); the editor is closed by the parent. */
  onCommit: (patch: InlineEditPatch) => void;
  onCancel: () => void;
}

/** The technology text a node currently shows (`technology`, else the legacy `tag`). */
function nodeTechnology(node: ArchNode): string {
  return node.technology ?? node.tag ?? '';
}

/**
 * R1-E02-T06: name and technology inputs laid over the node's text lines (zoom and pan applied).
 * Enter commits, Esc cancels, Tab moves to technology, Shift+Tab back, an empty name restores the
 * previous one. Drafts are local: the document changes once, on commit, so one session is one undo
 * step and Esc leaves no trace.
 */
export function InlineEditor({ node, initialField, zoom, pan, iconEntries, isDark, onCommit, onCancel }: InlineEditorProps) {
  const [field, setField] = useState<InlineField>(initialField);
  const [name, setName] = useState(node.label);
  const [technology, setTechnology] = useState(nodeTechnology(node));
  const nameRef = useRef<HTMLInputElement>(null);
  const techRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const rects = inlineEditRects(node, iconEntries);

  useEffect(() => {
    const el = field === 'name' ? nameRef.current : techRef.current;
    el?.focus();
    el?.select();
  }, [field]);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const patch: InlineEditPatch = {};
    const nextName = name.trim();
    if (nextName !== '' && nextName !== node.label) patch.label = nextName;
    const nextTech = technology.trim();
    if (nextTech !== nodeTechnology(node).trim()) patch.technology = nextTech;
    onCommit(patch);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  const onKeyDown = (which: InlineField) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (which === 'name' && !e.shiftKey) setField('technology');
      else if (which === 'technology' && e.shiftKey) setField('name');
    }
  };

  const place = (r: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
    position: 'absolute',
    left: r.x * zoom + pan.x,
    top: r.y * zoom + pan.y,
    width: r.w * zoom,
    height: r.h * zoom,
  });
  const surface = isDark ? '#191D25' : '#FFFFFF';
  const accent = isDark ? '#8B83FF' : '#4F46E5';
  const base: React.CSSProperties = {
    zIndex: 46,
    boxSizing: 'border-box',
    padding: `0 ${6 * zoom}px`,
    borderRadius: 4 * zoom,
    background: surface,
    outline: 'none',
    fontFamily: "'Inter', -apple-system, sans-serif",
  };

  return (
    <div
      ref={rootRef}
      data-testid="inline-editor"
      onBlur={(e) => {
        // Commit when focus leaves both inputs (a click elsewhere), not when Tab moves between them.
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) commit();
      }}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {`Editing ${field === 'name' ? 'name' : 'technology'} of ${node.label}`}
      </div>
      <input
        ref={nameRef}
        aria-label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown('name')}
        style={{
          ...base, ...place(rects.name),
          border: field === 'name' ? `1.5px solid ${accent}` : `1px dashed ${isDark ? '#4B5363' : '#C3C8D1'}`,
          font: `600 ${13 * zoom}px 'Inter', -apple-system, sans-serif`,
          color: isDark ? '#F9FAFB' : '#1B1F27',
        }}
      />
      <input
        ref={techRef}
        aria-label="Technology"
        value={technology}
        onChange={(e) => setTechnology(e.target.value)}
        onKeyDown={onKeyDown('technology')}
        style={{
          ...base, ...place(rects.technology),
          border: field === 'technology' ? `1.5px solid ${accent}` : `1px dashed ${isDark ? '#4B5363' : '#C3C8D1'}`,
          font: `${11 * zoom}px 'Inter', -apple-system, sans-serif`,
          color: isDark ? '#9CA3AF' : '#5B6474',
        }}
      />
    </div>
  );
}
