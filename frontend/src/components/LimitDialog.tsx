import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { api, formatLimitValue, LIMIT_REACHED_EVENT, type LimitInfo } from '../lib/api';
import { track } from '../lib/analytics';
import { getConfig } from '../lib/config';

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

const LIMIT_NOUN: Record<string, string> = { cloudDiagrams: 'cloud diagrams', editors: 'editors' };

function planLabel(plan: string | null): string {
  if (!plan) return '';
  const p = plan === 'member' ? 'free' : plan;
  return `${p.charAt(0).toUpperCase()}${p.slice(1)} plan · `;
}

export interface LimitDialogProps {
  info: LimitInfo;
  /** Workspace plan, or null while unknown. */
  plan: string | null;
  /** Workspace role, or null while unknown. Unknown is treated as non-admin for actions. */
  role: string | null;
  onClose: () => void;
}

const btnPrimary = { height: 38, padding: '0 16px', border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' } as const;
const btnSecondary = { height: 38, padding: '0 14px', border: '1px solid #E3E6EB', borderRadius: 8, background: '#FFFFFF', color: '#1B1F27', font: 'inherit', fontWeight: 500, cursor: 'pointer' } as const;

/** Limit-reached dialog (SC-54, Limits artboard). Nothing is blocked: the doc stays local. */
export default function LimitDialog({ info, plan, role, onClose }: LimitDialogProps) {
  const trap = useFocusTrap<HTMLDivElement>(true);
  const returnTo = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const [note, setNote] = useState<string | null>(null);
  const isAdmin = role === 'admin';
  const noun = LIMIT_NOUN[info.limit] ?? info.limit;
  const supportEmail = getConfig().supportEmail;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    track('limit_reached', { limit: info.limit });
  }, [info.limit]);

  useEffect(() => {
    const prev = returnTo.current;
    return () => {
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  const title =
    info.limit === 'cloudDiagrams'
      ? `Save a ${ordinal(info.current + 1)} diagram to the cloud with Team`
      : `Add another ${noun.replace(/s$/, '')} with Team`;

  const askAdmin = async () => {
    const msg = `Hi, our ArchFlux workspace has reached its ${noun} limit (${info.current} of ${formatLimitValue(info.max)}). Could you upgrade to Team so I can keep going?`;
    try {
      await navigator.clipboard.writeText(msg);
      setNote('Message copied to your clipboard. Paste it to a workspace admin — nobody has been notified yet.');
    } catch {
      setNote('Could not copy automatically. Please ask a workspace admin to upgrade — nobody has been notified.');
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <section
        ref={trap}
        role="dialog"
        aria-modal="true"
        aria-label="Limit reached"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '100%', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 14, boxShadow: '0 16px 40px rgba(16,24,40,.12)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12, color: '#1B1F27', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 }}
      >
        <span style={{ padding: '2px 10px', width: 'fit-content', borderRadius: 999, background: '#EEF0FF', color: '#4338CA', fontSize: 12, fontWeight: 600 }}>
          {planLabel(plan)}{info.current} of {formatLimitValue(info.max)} {noun}
        </span>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h1>
        <p style={{ margin: 0, color: '#5B6474' }}>
          Nothing is blocked: your diagrams stay viewable, editable, exportable and deletable. This one stays on this device until you upgrade or free a slot.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#3D4553', lineHeight: '22px' }}>
          <li>Unlimited cloud diagrams and history</li>
          <li>Proposals, reviews and GitHub</li>
          <li>2 live sync sources</li>
        </ul>
        {!isAdmin && role !== null && (
          <p style={{ margin: 0, color: '#5B6474' }}>Ask an admin to upgrade — we&apos;ll include what you were trying to do.</p>
        )}
        {note && <p role="status" style={{ margin: 0, color: '#3D4553' }}>{note}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && supportEmail && (
            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent('Upgrade ArchFlux to Team')}`}
              style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            >
              Contact us to upgrade
            </a>
          )}
          {!isAdmin && role !== null && (
            <button type="button" style={btnPrimary} onClick={askAdmin}>Ask an admin</button>
          )}
          <button type="button" style={btnSecondary} onClick={onClose} autoFocus>Keep on this device</button>
        </div>
      </section>
    </div>
  );
}

/**
 * Listens for the API layer's 402 event and shows {@link LimitDialog}.
 * Mount once inside the app shell: `<LimitDialogHost />`.
 */
export function LimitDialogHost() {
  const [info, setInfo] = useState<LimitInfo | null>(null);
  const [ws, setWs] = useState<{ plan: string | null; role: string | null }>({ plan: null, role: null });

  useEffect(() => {
    const onLimit = (e: Event) => {
      const detail = (e as CustomEvent<LimitInfo>).detail;
      if (!detail) return;
      setInfo(detail);
      setWs({ plan: null, role: null });
      api.getCurrentWorkspace().then(
        (r) => setWs({ plan: r.data.plan ?? null, role: r.data.role ?? 'member' }),
        // Unknown role: fall back to the non-admin view (no upgrade action we can't honour).
        () => setWs({ plan: null, role: 'member' }),
      );
    };
    window.addEventListener(LIMIT_REACHED_EVENT, onLimit);
    return () => window.removeEventListener(LIMIT_REACHED_EVENT, onLimit);
  }, []);

  if (!info) return null;
  return <LimitDialog info={info} plan={ws.plan} role={ws.role} onClose={() => setInfo(null)} />;
}
