import { useCallback, useEffect, useState } from 'react';
import { api, type AccessRequestInfo } from '../../lib/api';

type Role = 'viewer' | 'commenter' | 'editor';
const ROLES: { id: Role; label: string }[] = [
  { id: 'viewer', label: 'Can view' },
  { id: 'commenter', label: 'Can comment' },
  { id: 'editor', label: 'Can edit' },
];

/**
 * Owner/admin side of "Request access" (R1-BUG-07): pending requests for one diagram, with
 * Approve (optionally granting a lower role) and Deny. Renders nothing while there are no
 * pending requests, and nothing if the list cannot be loaded by this caller.
 */
export default function AccessRequests({ diagramId, onDecided }: { diagramId: string; onDecided?: () => void }) {
  const [rows, setRows] = useState<AccessRequestInfo[] | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.access.listRequests('pending');
      setRows(res.data.filter((r) => r.diagramId === diagramId));
    } catch {
      setRows([]);
    }
  }, [diagramId]);
  useEffect(() => {
    let live = true;
    api.access.listRequests('pending')
      .then((res) => { if (live) setRows(res.data.filter((r) => r.diagramId === diagramId)); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [diagramId]);

  const decide = async (r: AccessRequestInfo, approve: boolean) => {
    setBusyId(r.id);
    setError(null);
    try {
      if (approve) await api.access.approveRequest(r.id, roles[r.id] ?? r.role);
      else await api.access.denyRequest(r.id);
      setRows((prev) => (prev ?? []).filter((x) => x.id !== r.id));
      onDecided?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision');
      void load(); // someone else may have decided it already
    } finally {
      setBusyId(null);
    }
  };

  if (!rows || rows.length === 0) return null;
  const btn = { height: 28, padding: '0 10px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', color: '#1B1F27', font: 'inherit', cursor: 'pointer' } as const;
  return (
    <div role="region" aria-label="Access requests" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: '1px solid #EEF0F3' }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5B6474' }}>Access requests</span>
      {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>{error}</div>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const who = r.requesterName || r.requesterEmail || 'Someone';
          return (
            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{who}</span>
                {r.requesterEmail && r.requesterName && <span style={{ fontSize: 12, color: '#5B6474' }}>{r.requesterEmail}</span>}
                {r.note && <span style={{ fontSize: 12, color: '#3D4553' }}>“{r.note}”</span>}
              </span>
              <select
                aria-label={`Role to grant ${who}`}
                value={roles[r.id] ?? r.role}
                disabled={busyId === r.id}
                onChange={(e) => setRoles((p) => ({ ...p, [r.id]: e.target.value as Role }))}
                style={{ ...btn, padding: '0 6px' }}
              >
                {ROLES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button type="button" aria-label={`Approve ${who}`} disabled={busyId === r.id} onClick={() => void decide(r, true)} style={{ ...btn, background: '#1B1F27', color: '#FFFFFF', borderColor: '#1B1F27' }}>Approve</button>
              <button type="button" aria-label={`Deny ${who}`} disabled={busyId === r.id} onClick={() => void decide(r, false)} style={btn}>Deny</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
