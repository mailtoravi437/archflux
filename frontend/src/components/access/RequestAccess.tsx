import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { track } from '../../lib/analytics';

/** "Request access" card from AccessStates.dc.html. Sends POST /diagrams/:id/access-requests. */
export default function RequestAccess({ diagramId, title, ownerName, signedInAs, onSwitchAccount }: {
  diagramId: string;
  title: string;
  ownerName?: string;
  signedInAs?: string;
  onSwitchAccount: () => void;
}) {
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor'>('commenter');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = ownerName || 'the owner';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.access.requestAccess(diagramId, role, note.trim());
      track('access_requested', { role });
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSent(true);
        setError(null);
      } else setError(e instanceof Error ? e.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  };

  const field = { border: '1px solid #E3E6EB', borderRadius: 8, font: 'inherit', background: '#FFFFFF', color: '#1B1F27' } as const;
  return (
    <section aria-label="Request access" style={{ width: 400, maxWidth: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#1B1F27' }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF0FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      </span>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>You need access to “{title}”</h2>
      <p style={{ margin: 0, color: '#5B6474' }}>
        {ownerName ? `Owned by ${ownerName}. ` : ''}{signedInAs ? `Signed in as ${signedInAs} — ` : ''}
        <button type="button" onClick={onSwitchAccount} style={{ border: 'none', background: 'transparent', padding: 0, color: '#4338CA', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>switch account</button>
      </p>
      {sent ? (
        <p role="status" style={{ margin: 0, color: '#047857', fontWeight: 600 }}>Request sent — we’ll email you when {owner} responds</p>
      ) : (
        <>
          <select aria-label="Access level" value={role} onChange={(e) => setRole(e.target.value as typeof role)} style={{ ...field, height: 36, padding: '0 8px' }}>
            <option value="commenter">Request to comment</option>
            <option value="editor">Request to edit</option>
            <option value="viewer">Request to view</option>
          </select>
          <textarea aria-label="Message to owner" placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...field, height: 56, padding: '8px 10px', resize: 'none' }} />
          {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>{error}</div>}
          <button type="button" disabled={busy} onClick={() => void submit()} style={{ height: 38, border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Request access</button>
          <span style={{ fontSize: 12, color: '#5B6474' }}>We’ll email you when {owner} responds.</span>
        </>
      )}
    </section>
  );
}
