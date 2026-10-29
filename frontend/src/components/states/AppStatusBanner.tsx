import { useEffect, useState } from 'react';
import { useApiSignals, clearRateLimited, clearSessionExpired } from '../../lib/apiSignals';
import { useDiagram } from '../../state/useDiagram';
import { StatusBanner } from './components';
import { selectBanner } from './selectBanner';

const WRITE_ROLES = new Set(['owner', 'admin', 'editor']);

/**
 * Shows the highest-priority real condition. Signals that exist today: offline (navigator),
 * save failure (syncError while online), a newer server version (saveConflict) and a role
 * downgrade seen during this session, plus the lib/api.ts signals: a 401 on a real session
 * (session_expired) and an HTTP 429 with its Retry-After countdown (rate_limited).
 */
export default function AppStatusBanner({ onReviewConflict }: { onReviewConflict: () => void }) {
  const { isOnline, syncError, saveConflict, saveActiveDoc, exportArch, activeDocId, role } = useDiagram();
  // Adjust state during render (no effect): remember the last role per diagram and flag a write -> read downgrade.
  const [seen, setSeen] = useState<{ id: string; role: string | null; downgradedTo: string | null }>({ id: activeDocId, role, downgradedTo: null });
  if (seen.id !== activeDocId) {
    setSeen({ id: activeDocId, role, downgradedTo: null });
  } else if (seen.role !== role) {
    const down = seen.role && WRITE_ROLES.has(seen.role) && role && !WRITE_ROLES.has(role);
    setSeen({ id: activeDocId, role, downgradedTo: down ? role : role && WRITE_ROLES.has(role) ? null : seen.downgradedTo });
  }
  const { sessionExpired, rateLimitedUntil } = useApiSignals();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (n >= rateLimitedUntil) clearRateLimited();
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [rateLimitedUntil]);
  const rateSeconds = rateLimitedUntil === null ? 0 : Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  const accessChanged = seen.downgradedTo !== null && role === seen.downgradedTo;
  const kind = selectBanner({
    access_changed: accessChanged,
    session_expired: sessionExpired,
    rate_limited: rateSeconds > 0,
    save_failed: !!syncError && isOnline,
    newer_version: !!saveConflict,
    offline: !isOnline,
  });
  if (!kind) return null;

  const retry = () => { void saveActiveDoc(); };
  const download = () => { exportArch(); };
  const signIn = () => {
    clearSessionExpired();
    try { window.location.hash = '#/login'; } catch { /* non-DOM env */ }
  };
  const roleName = role ? role.charAt(0).toUpperCase() + role.slice(1) : '';
  return (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 92%)', zIndex: 40 }}>
      {kind === 'access_changed' && (
        <StatusBanner kind={kind} detail={`Your role on this diagram changed to ${roleName}. Editing is off.`} onPrimary={download} onSecondary={download} />
      )}
      {kind === 'session_expired' && (
        <StatusBanner
          kind={kind}
          detail="Your session ended. Sign in again to keep saving."
          safeDetail="Edits stay in this tab until you leave it."
          onPrimary={signIn}
          onSecondary={clearSessionExpired}
        />
      )}
      {kind === 'rate_limited' && (
        <StatusBanner
          kind={kind}
          detail={`You hit the request limit. Try again in ${rateSeconds} s.`}
          safeDetail="Your edits stay in this tab."
          onPrimary={clearRateLimited}
        />
      )}
      {kind === 'save_failed' && <StatusBanner kind={kind} detail={syncError ?? undefined} onPrimary={retry} onSecondary={download} />}
      {kind === 'newer_version' && <StatusBanner kind={kind} onPrimary={onReviewConflict} />}
      {kind === 'offline' && <StatusBanner kind={kind} onPrimary={retry} onSecondary={download} />}
    </div>
  );
}
