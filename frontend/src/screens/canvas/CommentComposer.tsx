import type { RefObject } from 'react';
import { useDiagram } from '../../state/useDiagram';
import { sourceModeForDoc } from '../../lib/honesty';

/** Annotation comment length cap (ANN-R15) — MUST match the backend limit. */
const COMMENT_MAX = 2000;

export interface CommentComposerProps {
  /** What the pin is attached to: a node id, or '__canvas' for the canvas area. */
  target: { id: string; label: string };
  text: string;
  setText: (v: string) => void;
  /** Focus trap owned by CanvasScreen (active while the composer is open). */
  trapRef: RefObject<HTMLDivElement | null>;
  onCancel: () => void;
  onPost: () => void;
}

/** Review-pin composer shown after the Note tool is used on a node or the canvas. */
export function CommentComposer({ target, text, setText, trapRef, onCancel, onPost }: CommentComposerProps) {
  const { activeDocId } = useDiagram();
  return (
    <div style={{ position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: 380, maxWidth: '92vw' }}>
      <div ref={trapRef} className="content-card" style={{ padding: 12 }} role="dialog" aria-label={`Comment on ${target.label}`}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>💬 Pin review on [{target.label}]</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono-font)', marginBottom: 6 }} data-testid="comment-location">
          {sourceModeForDoc(activeDocId) === 'local' ? 'Saved on this device only' : 'Shared with collaborators'}
        </div>
        <textarea
          autoFocus
          rows={3}
          maxLength={COMMENT_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Should we use outbox pattern here?"
          aria-label="Review comment text"
          aria-describedby="comment-counter"
          style={{ width: '100%', resize: 'vertical', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 8px', fontSize: 14, fontFamily: 'var(--hand-font)', color: 'var(--text-main)' }}
        />
        <div id="comment-counter" style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)', textAlign: 'right', marginTop: 2 }}>
          {text.length}/{COMMENT_MAX}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          <button className="btn btn--sm btn--secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn--sm btn--primary"
            disabled={!text.trim()}
            onClick={onPost}
          >
            Post pin
          </button>
        </div>
      </div>
    </div>
  );
}
