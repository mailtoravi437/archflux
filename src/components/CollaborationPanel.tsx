import { useCollaboration } from '../hooks/useCollaboration';

interface CollaborationPanelProps {
  diagramId: string | null;
  /** Rendered inside the right dock tab (in-flow) instead of as a fixed overlay. */
  embedded?: boolean;
}

export function CollaborationPanel({ diagramId, embedded }: CollaborationPanelProps) {
  const {
    connected,
    synced,
    users,
  } = useCollaboration(diagramId);

  if (!diagramId) {
    return null;
  }

  return (
    <div className="collaboration-panel" style={embedded ? {
      display: 'flex',
      flexDirection: 'column',
    } : {
      position: 'fixed',
      top: '60px',
      right: '20px',
      zIndex: 50,
      width: '280px',
      maxHeight: '400px',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-panel)',
      borderRadius: '12px',
      boxShadow: 'var(--panel-shadow)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid var(--border-panel)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            background: connected ? 'var(--accent-emerald)' : 'var(--accent-rose)' 
          }} />
          <strong style={{ fontSize: '14px', fontFamily: 'var(--heading-font)' }}>
            Collaboration
          </strong>
          <span className={`badge-count ${connected ? 'badge-emerald' : 'badge-rose'}`}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        {synced && (
          <span className="badge-count badge-emerald" style={{ fontSize: '10px' }}>
            Synced
          </span>
        )}
      </div>

      {/* Connected Users */}
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid var(--border-panel)',
        maxHeight: '200px',
        overflowY: 'auto',
      }}>
        <div style={{ 
          fontSize: '11px', 
          fontWeight: 700, 
          color: 'var(--text-muted)', 
          marginBottom: '8px',
          fontFamily: 'var(--mono-font)',
          textTransform: 'uppercase',
        }}>
          Collaborators ({users.length})
        </div>
        {users.length === 0 ? (
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-muted)', 
            textAlign: 'center',
            padding: '16px 0',
          }}>
            No other collaborators
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {users.map((user) => (
              <div 
                key={user.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: 'var(--bg-panel-subtle)',
                }}
              >
                <span style={{ 
                  width: '10px', 
                  height: '10px', 
                  borderRadius: '50%', 
                  background: user.color || '#2563EB',
                }} />
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: 500,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user.name || `User ${user.id.slice(0, 6)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div style={{ 
        padding: '10px 16px', 
        borderTop: '1px solid var(--border-panel)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--mono-font)',
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span><strong aria-label="Connection status">Status:</strong> {connected ? '🟢 Connected — live' : '🔴 Disconnected — offline'}</span>
          <span><strong aria-label="Sync status">Sync:</strong> {synced ? '🟢 Synced — current' : '🟡 Syncing — stale'} {synced ? '' : '(observation may be outdated)'}</span>
        </div>
      </div>
    </div>
  );
}

export function PresenceIndicators(_props: {
  users: Map<string, any>;
  onCursorMove?: (userId: string, x: number, y: number) => void;
}) {
  // This would render remote cursors on the canvas
  // Implementation would integrate with the canvas rendering
  return null;
}