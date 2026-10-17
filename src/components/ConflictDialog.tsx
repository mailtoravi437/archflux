import { useEffect } from 'react';
import { useFocusTrap } from '../useFocusTrap';
import { CONFLICT_ACTIONS, formatVersionContrast, type ConflictAction, type ConflictInfo } from '../conflict';

export interface ConflictDialogProps {
  conflict: ConflictInfo;
  busyAction: ConflictAction | null;
  onAction: (action: ConflictAction) => void;
  onClose: () => void;
}

/**
 * Save-conflict dialog (§6.2): stale PUT vs. newer server version.
 * Three explicit actions — never silent. Focus-trapped, Esc closes
 * (dismisses the dialog; the conflict state stays until resolved).
 */
export default function ConflictDialog({ conflict, busyAction, onAction, onClose }: ConflictDialogProps) {
  const trap = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        ref={trap}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        aria-describedby="conflict-desc"
        className="content-card"
        style={{ maxWidth: 460, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head">
          <span className="card-title" id="conflict-title">Save conflict — needs attention</span>
          <button type="button" className="btn-xs" onClick={onClose} aria-label="Dismiss conflict dialog">✕</button>
        </div>
        <p id="conflict-desc" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Someone saved a newer version while you were editing. {formatVersionContrast(conflict)}{' '}
          Compare the versions in Reviews before deciding — your work is safe locally either way.
        </p>
        {conflict.message && (
          <p style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>
            Server: {conflict.message}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {CONFLICT_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`dock-action-btn${a.id === 'force' ? ' btn-xs-primary' : ''}`}
              style={{ padding: '10px 12px', textAlign: 'left', opacity: busyAction !== null && busyAction !== a.id ? 0.6 : 1 }}
              disabled={busyAction !== null}
              onClick={() => onAction(a.id)}
            >
              <span style={{ fontSize: '18px' }}>{a.id === 'reload' ? '🔄' : a.id === 'force' ? '💾' : '📋'}</span>
              <span>
                <span style={{ fontWeight: 700, display: 'block', fontSize: 12 }}>
                  {a.title}{busyAction === a.id ? '…' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{a.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
