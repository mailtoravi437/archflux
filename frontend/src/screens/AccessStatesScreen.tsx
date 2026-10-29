import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, getCorrelationId, getShareToken, isForbiddenError, setShareToken } from '../lib/api';
import type { AccessState } from '../lib/api';
import { clearSession, getSession, isSignedIn } from '../state/session';
import { deepLinkPath, deepLinkWithToken, loginUrlFor } from '../lib/access';
import { useDiagram } from '../state/useDiagram';
import { NotFoundState, Skeleton } from '../components/states';
import RequestAccess from '../components/access/RequestAccess';

/**
 * Shareable deep link `#/d/:id` (R1-E07-T06, FL-15). Asks GET /diagrams/:id/access first and
 * renders the matching state from AccessStates.dc.html. Never shows a title unless the server sent one.
 */
const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F7F9', padding: 16, boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#1B1F27' } as const;
const primaryLink = { height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' } as const;

function OpenInCanvas({ id }: { id: string }) {
  const navigate = useNavigate();
  const { docs, addServerDoc } = useDiagram();
  const known = docs.some((d) => d.id === id);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);
  useEffect(() => {
    if (known || attempted.current) return;
    attempted.current = true;
    // Fetches the server diagram, adds it to the library and opens it (R1-E07-T06).
    void addServerDoc(id).then((ok) => {
      if (ok) navigate('/canvas', { replace: true });
      else setFailed(true);
    });
  }, [known, id, addServerDoc, navigate]);
  if (known && !failed) return <Skeleton label="Opening diagram" />;
  if (failed) {
    return (
      <section aria-label="Could not open" style={{ textAlign: 'center', maxWidth: 380 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>We couldn’t open this diagram</h2>
        <p style={{ margin: 0, color: '#5B6474' }}>Try again in a moment. Your access has not changed.</p>
      </section>
    );
  }
  return <Skeleton label="Opening diagram" />;
}

export default function AccessStatesScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<AccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const signedIn = isSignedIn();
  const location = useLocation();
  const urlToken = new URLSearchParams(location.search).get('token');

  // A share link carries its token in the hash query. Keep it in memory for X-Share-Token and drop
  // it from the address bar once signed in (a signed-out visitor keeps it in `next` through login).
  useEffect(() => {
    if (!urlToken) return;
    setShareToken(id, urlToken);
    if (signedIn) navigate(deepLinkPath(id), { replace: true });
  }, [id, urlToken, signedIn, navigate]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setState(null);
    api.access.state(id).then(
      (r) => { if (!cancelled) setState(r.data); },
      (e) => { if (!cancelled) setError(isForbiddenError(e) ? 'forbidden' : e instanceof Error ? e.message : 'Could not check access'); },
    );
    return () => { cancelled = true; };
  }, [id, signedIn, tick]);

  if (!signedIn) return <Navigate to={loginUrlFor(deepLinkWithToken(id, urlToken))} replace />;

  const switchAccount = () => {
    void api.logout().catch(() => undefined).finally(() => {
      clearSession();
      navigate(loginUrlFor(deepLinkWithToken(id, getShareToken(id))), { replace: true });
    });
  };
  const email = getSession()?.email;

  const restore = async () => {
    setRestoreError(null);
    try {
      await api.diagrams.restore(id);
      setTick((n) => n + 1);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Could not restore');
    }
  };

  let body;
  if (error) {
    body = <NotFoundState signedInAs={email} errorId={getCorrelationId() ?? undefined} onSwitchAccount={switchAccount} />;
  } else if (!state) {
    body = <Skeleton label="Checking access" />;
  } else if (state.state === 'ok') {
    body = <OpenInCanvas id={id} />;
  } else if (state.state === 'request') {
    body = <RequestAccess diagramId={id} title={state.title ?? 'this diagram'} ownerName={state.ownerName} signedInAs={email} onSwitchAccount={switchAccount} />;
  } else if (state.state === 'expired') {
    body = (
      <section aria-label="Link expired" style={{ width: 380, maxWidth: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 22, background: '#FEF3C7', color: '#92400E', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>This link has expired</h2>
        <p style={{ margin: 0, color: '#5B6474' }}>
          Ask {state.ownerName ?? 'the owner'} for a new link.
        </p>
      </section>
    );
  } else if (state.state === 'trashed') {
    body = (
      <section aria-label="In trash" style={{ width: 380, maxWidth: '100%', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#5B6474' }}>Seen by the owner</span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{state.title ? `“${state.title}” is in the trash` : 'This diagram is in the trash'}</h2>
        {restoreError && <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>{restoreError}</div>}
        <button type="button" onClick={() => void restore()} style={primaryLink}>Restore</button>
      </section>
    );
  } else {
    body = <NotFoundState signedInAs={email} errorId={getCorrelationId() ?? undefined} onSwitchAccount={switchAccount} />;
  }
  return <main style={center}>{body}</main>;
}
