import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, setActiveWorkspaceId } from '../lib/api';
import { clearPendingInvite, rememberWorkspace, setPendingInvite } from '../lib/workspaceSetup';
import { clearSession, getSession, hasUsableSession } from '../state/session';

type View =
  | { kind: 'working' }
  | { kind: 'guest' }
  | { kind: 'error'; message: string };

/** `#/invite/:token`: accepts a workspace invite, or goes to sign-in and comes back (R1-E11-T03). */
export default function InviteScreen() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  // A local guest session cannot accept an invite; known at first render, so no effect-driven state.
  const [view, setView] = useState<View>(() => (!hasUsableSession() && getSession() ? { kind: 'guest' } : { kind: 'working' }));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!hasUsableSession()) {
      setPendingInvite(token);
      if (!getSession()) navigate('/login', { replace: true });
      return;
    }
    api.workspaces
      .acceptInvite(token)
      .then((r) => {
        rememberWorkspace({ id: r.data.workspaceId, name: r.data.name });
        setActiveWorkspaceId(r.data.workspaceId);
        clearPendingInvite();
        navigate('/dashboard', { replace: true });
      })
      .catch((e: unknown) => {
        clearPendingInvite();
        if (e instanceof ApiError && e.status === 404) {
          setView({ kind: 'error', message: 'This invite is no longer valid. Ask an admin to send a new one.' });
        } else if (e instanceof ApiError && e.code === 'INVITE_EMAIL_MISMATCH') {
          setView({ kind: 'error', message: 'This invite was sent to a different email address. Sign in with the invited address.' });
        } else if (e instanceof ApiError && e.status === 402) {
          setView({ kind: 'error', message: 'This workspace has no free editor seats. Ask an admin.' });
        } else {
          setView({ kind: 'error', message: e instanceof Error ? e.message : 'Could not accept the invite.' });
        }
      });
  }, [token, navigate]);

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F7F9', color: '#1B1F27', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 }}>
      <section aria-label="Workspace invite" style={{ width: 440, maxWidth: '100%', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Workspace invite</h1>
        {view.kind === 'working' && <p role="status" style={{ margin: 0, color: '#5B6474' }}>Accepting your invite…</p>}
        {view.kind === 'guest' && (
          <>
            <p style={{ margin: 0, color: '#5B6474' }}>Sign in with the email address that was invited to accept this invite. Local guest sessions cannot join a workspace.</p>
            <button
              type="button"
              style={{ height: 40, border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => {
                clearSession();
                navigate('/login', { replace: true });
              }}
            >
              Sign in to accept
            </button>
          </>
        )}
        {view.kind === 'error' && (
          <>
            <p role="alert" style={{ margin: 0, color: '#B91C1C' }}>{view.message}</p>
            <Link to="/dashboard">Go to ArchFlux</Link>
          </>
        )}
      </section>
    </main>
  );
}
