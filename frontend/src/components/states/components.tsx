import { useEffect, useState } from 'react';
import { BANNER_COPY, type BannerKind } from './copy';

/** Used when the caller has no real value for an artboard placeholder ([Owner], attempt 3 of 5, N edits): never render example data. */
const PLAIN: Partial<Record<BannerKind, { body: string; safe: string }>> = {
  offline: { body: BANNER_COPY.offline.body, safe: 'Unsynced edits are stored locally; closing the tab keeps them.' },
  save_failed: { body: 'The server returned an error on save.', safe: BANNER_COPY.save_failed.safe },
  newer_version: { body: 'Someone saved a newer version while you were editing.', safe: BANNER_COPY.newer_version.safe },
  access_changed: { body: 'Your role on this diagram changed. Editing is off.', safe: BANNER_COPY.access_changed.safe },
  rate_limited: { body: 'You hit the request limit; ArchFlux will retry shortly.', safe: BANNER_COPY.rate_limited.safe },
};

const TONE: Record<BannerKind, { bg: string; fg: string }> = {
  offline: { bg: '#FEF3C7', fg: '#92400E' },
  save_failed: { bg: '#FDE8E8', fg: '#B91C1C' },
  newer_version: { bg: '#FEF3C7', fg: '#92400E' },
  access_changed: { bg: '#EEF0FF', fg: '#4338CA' },
  session_expired: { bg: '#EEF0FF', fg: '#4338CA' },
  rate_limited: { bg: '#FEF3C7', fg: '#92400E' },
};

const primaryBtn = { height: 30, padding: '0 12px', border: 'none', borderRadius: 6, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' } as const;
const altBtn = { height: 30, padding: '0 10px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', color: '#1B1F27', font: 'inherit', cursor: 'pointer' } as const;

/**
 * Status banner: say what happened, what is safe, one next action.
 * `detail` / `safeDetail` carry real values (unsynced count, attempt, countdown, names). Without them a
 * generic sentence is shown, never the artboard's example data.
 */
export function StatusBanner(props: { kind: BannerKind; detail?: string; safeDetail?: string; onPrimary: () => void; onSecondary?: () => void }) {
  const copy = BANNER_COPY[props.kind];
  const tone = TONE[props.kind];
  const role = props.kind === 'save_failed' || props.kind === 'access_changed' ? 'alert' : 'status';
  return (
    <section aria-label={copy.title} style={{ background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontSize: 13, color: '#1B1F27' }}>
      <div role={role} style={{ padding: '10px 14px', background: tone.bg, color: tone.fg, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: tone.fg }} />
        {copy.title}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ color: '#3D4553' }}>{props.detail ?? PLAIN[props.kind]?.body ?? copy.body}</span>
        <span style={{ fontSize: 12, color: '#5B6474' }}>
          <strong style={{ color: '#1B1F27' }}>Safe:</strong> {props.safeDetail ?? PLAIN[props.kind]?.safe ?? copy.safe}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={primaryBtn} onClick={props.onPrimary}>{copy.primary}</button>
          {copy.secondary && props.onSecondary && (
            <button type="button" style={altBtn} onClick={props.onSecondary}>{copy.secondary}</button>
          )}
        </span>
      </div>
    </section>
  );
}

const DEFAULT_LINES: Array<{ w: string; h: number }> = [
  { h: 28, w: '60%' }, { h: 120, w: '100%' }, { h: 16, w: '80%' }, { h: 16, w: '45%' },
];

/** Loading skeleton: renders nothing for `delay` ms (default 300), after 10 s adds a slow-server note. */
export function Skeleton(props: { lines?: Array<{ w: string; h: number }>; label: string; delay?: number; onKeepWaiting?: () => void }) {
  const delay = props.delay ?? 300;
  const [visible, setVisible] = useState(delay <= 0);
  const [slow, setSlow] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay);
    const t2 = setTimeout(() => setSlow(true), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay]);
  if (!visible) return null;
  const lines = props.lines ?? DEFAULT_LINES;
  return (
    <div role="status" aria-busy="true" aria-label={props.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{'@keyframes af-shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}@media (prefers-reduced-motion: reduce){.af-skel{animation:none!important}}'}</style>
      {lines.map((l, i) => (
        <span
          key={i}
          className="af-skel"
          style={{ display: 'block', height: l.h, width: l.w, borderRadius: 6, background: 'linear-gradient(90deg, #EEF0F3 0, #F6F7F9 100px, #EEF0F3 200px)', backgroundSize: '400px 100%', animation: 'af-shimmer 1.4s linear infinite' }}
        />
      ))}
      {slow && !waiting && (
        <span style={{ fontSize: 12, color: '#5B6474' }}>
          Still loading — the server is slow.{' '}
          <button type="button" style={altBtn} onClick={() => { setWaiting(true); props.onKeepWaiting?.(); }}>Keep waiting</button>
        </span>
      )}
    </div>
  );
}

/** Empty state: teaches the next step; real, honest copy supplied by the caller. */
export function EmptyState(props: { title: string; body: string; action?: { label: string; onClick: () => void }; secondary?: { label: string; onClick: () => void } }) {
  return (
    <section aria-label={props.title} style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16, color: '#1B1F27', fontSize: 13 }}>
      <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 14, border: '1.5px dashed #C3C8D1' }} />
      <strong style={{ fontSize: 15 }}>{props.title}</strong>
      <span style={{ color: '#5B6474', maxWidth: 300 }}>{props.body}</span>
      {(props.action || props.secondary) && (
        <span style={{ display: 'flex', gap: 6 }}>
          {props.action && (
            <button type="button" style={{ ...primaryBtn, height: 32, padding: '0 14px' }} onClick={props.action.onClick}>{props.action.label}</button>
          )}
          {props.secondary && (
            <button type="button" style={{ ...altBtn, height: 32, padding: '0 12px' }} onClick={props.secondary.onClick}>{props.secondary.label}</button>
          )}
        </span>
      )}
    </section>
  );
}

/** Not found with no existence leak: deliberately has no diagram-title prop. `page` swaps the diagram copy for unknown-route copy. */
export function NotFoundState(props: { signedInAs?: string; errorId?: string; page?: boolean; onGoHome?: () => void; onRequestAccess?: () => void; onSwitchAccount?: () => void }) {
  return (
    <section aria-label="Not found" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16, color: '#1B1F27', fontSize: 13 }}>
      <strong style={{ fontSize: 15 }}>{props.page ? 'Page not found' : "We can't open this diagram"}</strong>
      <span style={{ color: '#5B6474', maxWidth: 300 }}>
        {props.page
          ? "This address doesn't match any page in ArchFlux. The link may be mistyped or out of date."
          : "It may have been deleted, moved, or you don't have access."}{props.signedInAs ? ` Signed in as ${props.signedInAs}.` : ''}
      </span>
      {(props.onGoHome || props.onRequestAccess || props.onSwitchAccount) && (
        <span style={{ display: 'flex', gap: 6 }}>
          {props.onGoHome && (
            <button type="button" style={{ ...primaryBtn, height: 32, padding: '0 14px' }} onClick={props.onGoHome}>Go to home</button>
          )}
          {props.onRequestAccess && (
            <button type="button" style={{ ...primaryBtn, height: 32, padding: '0 14px' }} onClick={props.onRequestAccess}>Request access</button>
          )}
          {props.onSwitchAccount && (
            <button type="button" style={{ ...altBtn, height: 32, padding: '0 12px' }} onClick={props.onSwitchAccount}>Switch account</button>
          )}
        </span>
      )}
      {props.errorId && <span style={{ fontSize: 12, color: '#5B6474' }}>Error ID {props.errorId}</span>}
    </section>
  );
}
