import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { NotFoundState } from '../components/states';
import { getSession } from '../state/session';

/** Unknown path under the app shell: honest copy, one way home. The index route still redirects. */
export function NotFoundRoute() {
  const navigate = useNavigate();
  return (
    <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <NotFoundState
        page
        onGoHome={() => navigate('/', { replace: true })}
      />
    </main>
  );
}

/** Not-found page for a visitor with no session: no redirect, no app shell, a way to sign in or go home (BUG-LIVE-013). */
export function PublicNotFound() {
  useEffect(() => {
    document.title = 'Page not found · ArchFlux';
  }, []);
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
        padding: 24,
        background: 'var(--bg-app, #F7F7F5)',
        color: '#1B1F27',
        fontSize: 13,
      }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Page not found</h1>
      <p style={{ margin: 0, color: '#5B6474', maxWidth: 320 }}>
        This address doesn&apos;t match any page in ArchFlux. The link may be mistyped or out of date.
      </p>
      <span style={{ display: 'flex', gap: 12 }}>
        <Link to="/login">Sign in</Link>
        <Link to="/">Home</Link>
      </span>
    </main>
  );
}

/** Catch-all: signed-in visitors keep the in-app not-found; signed-out visitors get the public page. */
export function UnknownRoute() {
  if (!getSession()) return <PublicNotFound />;
  return (
    <AppShell>
      <NotFoundRoute />
    </AppShell>
  );
}
