import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  CHECKLIST_LABEL,
  computeChecklist,
  dismissChecklist,
  isChecklistDismissed,
  visibleChecklistSteps,
  type ChecklistStep,
} from '../../lib/checklist';
import { getSession, isSignedIn } from '../../state/session';
import { useDiagram } from '../../state/useDiagram';

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

const ACTION: Record<ChecklistStep, { to: string; label: string }> = {
  create_diagram: { to: '/canvas', label: 'Open canvas' },
  add_5_elements: { to: '/canvas', label: 'Open canvas' },
  connect_two: { to: '/canvas', label: 'Open canvas' },
  invite_teammate: { to: '/settings/team', label: 'Invite' },
  share_or_publish: { to: '/canvas', label: 'Open canvas' },
  connect_github: { to: '/settings/connectors', label: 'Connect' },
};

/**
 * Getting-started card (SC-04, FirstRun.dc.html). Completion comes only from real state: local docs,
 * the server roster (when signed in). Sharing and GitHub have no readable state yet, so they stay open.
 */
export default function GettingStarted() {
  const { docs } = useDiagram();
  const userKey = getSession()?.email ?? 'guest';
  const [dismissed, setDismissed] = useState(() => isChecklistDismissed(userKey));
  const [plan, setPlan] = useState('free');
  const [invitesSent, setInvitesSent] = useState(0);

  useEffect(() => {
    if (dismissed || !isSignedIn()) return;
    let cancelled = false;
    Promise.all([api.workspaces.current(), api.workspaces.members()])
      .then(([w, m]) => {
        if (cancelled) return;
        setPlan(w.data.plan);
        setInvitesSent(m.data.invites.length + Math.max(0, m.data.members.length - 1));
      })
      .catch(() => {
        /* offline or forbidden: the server-derived step simply stays open */
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const done = useMemo(
    () => computeChecklist({ docs, invitesSent, sharesMade: 0, githubConnected: false, plan }),
    [docs, invitesSent, plan],
  );
  const steps = visibleChecklistSteps(plan);
  const doneCount = steps.filter((s) => done[s]).length;

  if (dismissed) return null;
  return (
    <section aria-label="Getting started" style={{ width: 320, boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 12, boxShadow: '0 16px 40px rgba(16,24,40,.12)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#1B1F27' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, flexGrow: 1 }}>Get started · {doneCount} of {steps.length}</span>
        <button
          type="button"
          aria-label="Dismiss checklist"
          style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#5B6474', fontSize: 16, cursor: 'pointer' }}
          onClick={() => {
            dismissChecklist(userKey);
            setDismissed(true);
          }}
        >
          ×
        </button>
      </div>
      <div role="progressbar" aria-label="Getting started progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} style={{ height: 6, borderRadius: 3, background: '#EEF0F3', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: '#4F46E5' }} />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s) => (
          <li key={s} data-done={done[s]} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: done[s] ? '#DCF3E6' : '#FFFFFF', color: done[s] ? '#047857' : '#5B6474', border: done[s] ? 'none' : '1.5px solid #C3C8D1' }}>{done[s] ? '✓' : ''}</span>
            <span style={{ flexGrow: 1, color: done[s] ? '#5B6474' : '#1B1F27', textDecoration: done[s] ? 'line-through' : 'none' }}>
              {CHECKLIST_LABEL[s]}
              <span style={HIDDEN}>{done[s] ? ' (done)' : ' (not done)'}</span>
            </span>
            {!done[s] && <Link to={ACTION[s].to} style={{ fontSize: 11 }} aria-label={`${CHECKLIST_LABEL[s]}: ${ACTION[s].label}`}>{ACTION[s].label}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
