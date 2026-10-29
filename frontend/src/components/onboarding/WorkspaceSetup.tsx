import { useEffect, useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  api,
  ApiError,
  formatLimitValue,
  setActiveWorkspaceId,
  type WorkspaceDto,
  type WorkspaceRole,
} from '../../lib/api';
import {
  ROLES,
  ROLE_LABEL,
  clearPendingInvite,
  getPendingInvite,
  markWorkspaceSetupDone,
  parseEmails,
  rememberWorkspace,
  slugError,
  slugify,
} from '../../lib/workspaceSetup';
import { getSession } from '../../state/session';

const field: CSSProperties = { height: 38, padding: '0 10px', border: '1px solid #E3E6EB', borderRadius: 8, font: 'inherit', fontSize: 14, color: '#1B1F27', background: '#FFFFFF' };
const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#5B6474' };
const card: CSSProperties = { background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 };
const primaryBtn: CSSProperties = { height: 40, border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
const outlineBtn: CSSProperties = { height: 40, border: '1px solid #E3E6EB', borderRadius: 8, background: '#FFFFFF', color: '#1B1F27', font: 'inherit', fontWeight: 600, cursor: 'pointer' };

function limitText(ws: WorkspaceDto | null): string | null {
  if (!ws) return null;
  const d = ws.limits.cloudDiagrams;
  const e = ws.limits.editors;
  if (typeof d !== 'number' || typeof e !== 'number') return null;
  const plan = ws.plan === 'member' ? 'free' : ws.plan;
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan: ${formatLimitValue(d)} cloud diagrams, ${formatLimitValue(e)} editors.`;
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError || e instanceof Error ? e.message : fallback;
}

/**
 * Workspace setup and join (SC-02, Welcome.dc.html). Shown after the first real sign-in.
 * Join cards come only from an invite token this browser holds; the API has no "list my
 * invites" endpoint yet, so nothing is invented. Slug availability is checked by the server on create.
 */
export default function WorkspaceSetup({ onDone }: { onDone: () => void }) {
  const uid = useId();
  const email = getSession()?.email;
  const [ws, setWs] = useState<WorkspaceDto | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTaken, setSlugTaken] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [pendingToken, setPendingToken] = useState<string | null>(() => getPendingInvite());
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.workspaces
      .current()
      .then((r) => {
        if (cancelled) return;
        setWs(r.data);
        setName(r.data.name);
        setSlug(r.data.slug ?? slugify(r.data.name));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = ws?.role === 'admin';
  const sErr = slug ? slugError(slug) : null;
  const text = limitText(ws);

  const join = async () => {
    if (!pendingToken) return;
    setBusy(true);
    setJoinError(null);
    try {
      const r = await api.workspaces.acceptInvite(pendingToken);
      rememberWorkspace({ id: r.data.workspaceId, name: r.data.name });
      setActiveWorkspaceId(r.data.workspaceId);
      clearPendingInvite();
      markWorkspaceSetupDone();
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        clearPendingInvite();
        setPendingToken(null);
        setJoinError('That invite is no longer valid. Ask an admin to send a new one.');
      } else if (e instanceof ApiError && e.code === 'INVITE_EMAIL_MISMATCH') {
        setJoinError(`This invite was sent to a different email address${email ? `; you are signed in as ${email}` : ''}.`);
      } else {
        setJoinError(errMsg(e, 'Could not accept the invite.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const create = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    setSlugTaken(false);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a workspace name');
      return;
    }
    if (slugError(slug)) {
      setError(slugError(slug));
      return;
    }
    const parsed = parseEmails(emails);
    if (parsed.invalid.length > 0) {
      setError(`Not a valid email: ${parsed.invalid.join(', ')}`);
      return;
    }
    setBusy(true);
    try {
      const updated = await api.workspaces.update({ name: trimmed, slug });
      setWs(updated.data);
      rememberWorkspace({ id: updated.data.id, name: updated.data.name });
      markWorkspaceSetupDone();
      const failed: string[] = [];
      for (const to of parsed.valid) {
        try {
          const inv = await api.workspaces.invite(to, role);
          if (inv.data.emailSent === false) failed.push(`${to}: invite created but the email could not be sent`);
        } catch (e) {
          failed.push(`${to}: ${errMsg(e, 'invite failed')}`);
        }
      }
      if (failed.length > 0) {
        setNotes(failed);
        setBusy(false);
        return;
      }
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SLUG_TAKEN') {
        setSlugTaken(true);
      } else {
        setError(errMsg(e, 'Could not create the workspace.'));
      }
      setBusy(false);
    }
  };

  const skip = () => {
    markWorkspaceSetupDone();
    onDone();
  };

  if (notes.length > 0) {
    return (
      <section aria-label="Workspace created" style={{ ...card, width: 520, maxWidth: '100%' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Workspace created</h2>
        <p style={{ margin: 0, color: '#5B6474' }}>Some invites did not go out. You can resend them from Settings, Team.</p>
        <ul role="status" style={{ margin: 0, paddingLeft: 18, color: '#B91C1C' }}>
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <button type="button" style={primaryBtn} onClick={onDone}>Continue</button>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Welcome</h1>
        {email && <p style={{ margin: '6px 0 0', color: '#5B6474' }}>Signed in as {email} · Step 1 of 3</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: pendingToken ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 20, width: pendingToken ? 880 : 440, maxWidth: '100%' }}>
        {pendingToken && (
          <section aria-label="Join with your invite" style={{ ...card, border: '1.5px solid #4F46E5', boxShadow: '0 0 0 4px rgba(79,70,229,.10)', gap: 14 }}>
            <span style={{ padding: '2px 10px', width: 'fit-content', borderRadius: 999, background: '#EEF0FF', color: '#4338CA', fontSize: 12, fontWeight: 600 }}>Recommended</span>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Join with your invite</h2>
            <p style={{ margin: 0, color: '#5B6474' }}>You were invited to a workspace. The invite is accepted for the email you are signed in with.</p>
            {joinError && <p role="alert" style={{ margin: 0, color: '#B91C1C' }}>{joinError}</p>}
            <button type="button" style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={join}>Accept invite and join</button>
          </section>
        )}
        <section aria-label="Create a new workspace" style={card}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Create a new workspace</h2>
          {loadFailed && <p role="status" style={{ margin: 0, color: '#92400E' }}>Could not reach the server, so workspace setup is unavailable right now. You can still continue and set this up later in Settings.</p>}
          {ws && !isAdmin && <p role="status" style={{ margin: 0, color: '#5B6474' }}>Only an admin can change this workspace.</p>}
          {isAdmin && (
            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={label} htmlFor={`${uid}-name`}>Workspace name
                <input
                  id={`${uid}-name`}
                  style={field}
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                    setSlugTaken(false);
                  }}
                />
              </label>
              <label style={label} htmlFor={`${uid}-slug`}>Workspace URL name
                <input
                  id={`${uid}-slug`}
                  style={field}
                  value={slug}
                  aria-invalid={!!sErr || slugTaken}
                  aria-describedby={`${uid}-slug-msg`}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase());
                    setSlugTaken(false);
                  }}
                />
              </label>
              <span id={`${uid}-slug-msg`} role="status" style={{ fontSize: 12, color: slugTaken || sErr ? '#B91C1C' : '#5B6474', marginTop: -6 }}>
                {slugTaken ? 'That workspace URL is already taken. Try another.' : sErr ?? 'Letters, numbers and hyphens. Availability is checked when you create.'}
              </span>
              <label style={label} htmlFor={`${uid}-emails`}>Invite teammates (optional)
                <input id={`${uid}-emails`} style={field} placeholder="name@company.com, …" value={emails} onChange={(e) => setEmails(e.target.value)} />
              </label>
              <label style={label} htmlFor={`${uid}-role`}>Role for invited teammates
                <select id={`${uid}-role`} style={field} value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </label>
              <span style={{ fontSize: 12, color: '#5B6474' }}>You&apos;ll be the admin.{text ? ` ${text}` : ''}</span>
              {error && <p role="alert" style={{ margin: 0, color: '#B91C1C' }}>{error}</p>}
              <button type="submit" style={{ ...outlineBtn, opacity: busy ? 0.6 : 1 }} disabled={busy}>Create workspace</button>
            </form>
          )}
        </section>
      </div>
      <button type="button" onClick={skip} style={{ border: 'none', background: 'transparent', color: '#4338CA', font: 'inherit', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
        Skip for now
      </button>
    </div>
  );
}
