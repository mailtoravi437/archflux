import { useCollaboration } from '../hooks/useCollaboration';
import { isServerDocId } from '../lib/honesty';
import { initialsOf } from '../lib/presence';
import { isSignedIn } from '../state/session';

/**
 * Live dock tab (Live.dc.html "R1 STATE"): presence only. Comments and the notifications inbox are R2
 * (BACKLOG D8), so the tab says so in one muted line and shows no thread or inbox controls.
 */
interface CollaborationPanelProps {
  diagramId: string | null;
  /** Kept for callers that pass it; the panel is always rendered in-flow inside the dock. */
  embedded?: boolean;
}

interface PresenceUser {
  id: string;
  name?: string;
  color?: string;
}

const MUTED = 'var(--text-muted)';
const RULE = '1px solid var(--border-panel)';
const FALLBACK_COLOR = '#2563EB';

function Avatar({ name, color, size = 28, ring = false, overlap = false, title }: { name: string; color?: string; size?: number; ring?: boolean; overlap?: boolean; title?: string }) {
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      style={{
        width: size, height: size, borderRadius: size / 2, background: color || FALLBACK_COLOR, color: '#FFFFFF',
        fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: ring ? '2px solid #FFFFFF' : undefined, marginLeft: overlap ? -6 : undefined,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <span style={{ color: MUTED, lineHeight: 1.5 }}>{body}</span>
    </div>
  );
}

function sortSelfFirst<T extends PresenceUser>(users: T[], selfId: string): T[] {
  return [...users].sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId));
}

export function CollaborationPanel({ diagramId }: CollaborationPanelProps) {
  const { connected, users, awareness } = useCollaboration(diagramId);

  if (!diagramId) {
    return null;
  }

  const signedIn = isSignedIn();
  const cloud = isServerDocId(diagramId);
  const selfId = awareness && typeof awareness.clientID === 'number' ? String(awareness.clientID) : '';
  const people = sortSelfFirst(users as PresenceUser[], selfId);

  let body;
  if (!signedIn) {
    body = <Message title="Sign in to work live" body="Presence and live cursors need an account. Your diagram stays on this device until you sign in." />;
  } else if (!cloud) {
    body = <Message title="Live is off for this diagram" body="It is saved on this device only. Save it to your workspace to see who is here and work together live." />;
  } else {
    body = (
      <>
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: RULE }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: connected ? '#15803D' : '#8A93A3' }} />
          <span style={{ fontWeight: 600 }}>{connected ? 'Connected' : 'Not connected'}</span>
          <span style={{ flexGrow: 1 }} />
          {connected && people.length > 0 && <span style={{ fontSize: 12, color: MUTED }}>{people.length} here</span>}
        </div>
        {connected ? (
          <>
            <ul aria-label="People here" style={{ listStyle: 'none', margin: 0, padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {people.map((u) => {
                const name = u.name || 'Collaborator';
                return (
                  <li key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40 }}>
                    <Avatar name={name} color={u.color} />
                    <span style={{ flexGrow: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {u.id === selfId && (
                      <span style={{ padding: '1px 8px', borderRadius: 999, background: 'var(--bg-panel-subtle)', fontSize: 11, fontWeight: 600 }}>You</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {people.length <= 1 && (
              <p style={{ margin: 0, padding: '0 16px 12px', color: MUTED, lineHeight: 1.5 }}>Just you here. Share this diagram to work with others live.</p>
            )}
          </>
        ) : (
          <Message title="Reconnecting" body="Your edits stay on this device until the connection returns." />
        )}
      </>
    );
  }

  return (
    <div className="collaboration-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: 13 }}>
      {body}
      <p style={{ margin: 0, marginTop: 'auto', padding: '12px 16px', borderTop: RULE, fontSize: 12, lineHeight: 1.5, color: MUTED }}>
        Comment threads and the notifications inbox arrive in R2.
      </p>
    </div>
  );
}

/**
 * Presence pill at the top right of the canvas (Live.dc.html). Only while connected with at least two
 * people; there is no Follow in R1.
 */
export function PresencePill({ connected, users, selfId }: { connected: boolean; users: PresenceUser[]; selfId: string }) {
  if (!connected || users.length < 2) return null;
  const people = sortSelfFirst(users, selfId);
  const shown = people.slice(0, 5);
  const extra = people.length - shown.length;
  return (
    <div
      role="status"
      aria-label={`${people.length} people here`}
      data-testid="presence-pill"
      style={{
        position: 'absolute', right: 16, top: 12, zIndex: 43, display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 6px 4px 10px', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 999,
        boxShadow: '0 4px 12px rgba(16,24,40,.06)', color: '#1B1F27', fontSize: 12,
      }}
    >
      <span style={{ color: '#5B6474' }}>{people.length} here</span>
      <span style={{ display: 'flex' }}>
        {shown.map((u, i) => {
          const name = u.name || 'Collaborator';
          return <Avatar key={u.id} name={name} color={u.color} ring overlap={i > 0} title={u.id === selfId ? `${name} (you)` : name} />;
        })}
      </span>
      {extra > 0 && <span style={{ color: '#5B6474', paddingRight: 4 }}>+{extra}</span>}
    </div>
  );
}
