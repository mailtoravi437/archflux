import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useDiagram } from '../state/useDiagram';
import { loadSettings, saveSettings } from '../state/settings';
import { isSignedIn, getSession } from '../state/session';
import {
  api,
  ApiError,
  type WorkspaceDto,
  type WorkspaceInviteDto,
  type WorkspaceMemberDto,
  type WorkspaceRole,
} from '../lib/api';
import { ROLES, ROLE_LABEL, parseEmails, seatMeterText } from '../lib/workspaceSetup';
import { EmptyState } from '../components/states';

const ROLE_DESC: Record<WorkspaceRole, string> = {
  admin: 'Full configuration, billing, invites, repository bindings.',
  editor: 'Canvas creation, editing, re-syncing, blueprint loading.',
  reviewer: 'Read-only canvas + comments and PR approvals.',
  viewer: 'Read-only inspection and export.',
};

const field: CSSProperties = { height: 36, padding: '0 12px', border: '1px solid #E3E6EB', borderRadius: 6, font: 'inherit', background: '#FFFFFF', color: '#1B1F27' };
const btn: CSSProperties = { height: 36, padding: '0 14px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', font: 'inherit', fontWeight: 500, cursor: 'pointer', color: '#1B1F27' };
const btnPrimary: CSSProperties = { ...btn, border: 'none', background: '#4F46E5', color: '#FFFFFF', fontWeight: 600, padding: '0 16px' };
const ROW_COLS = '2.2fr 1.2fr 1.4fr auto';

function errText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === 'LAST_ADMIN') return 'A workspace needs at least one admin. Promote someone else first.';
    if (e.status === 402) return 'Plan limit reached for editors.';
    if (e.status === 403) return 'Only an admin can do that.';
    return e.message;
  }
  return e instanceof Error ? e.message : fallback;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function SettingsTeamScreen() {
  const { pushToast, pushLog } = useDiagram();
  const signedIn = isSignedIn();
  const selfEmail = getSession()?.email?.toLowerCase();
  const [s, setS] = useState(loadSettings);
  const [ws, setWs] = useState<WorkspaceDto | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(signedIn ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | WorkspaceRole>('all');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMemberDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, m] = await Promise.all([api.workspaces.current(), api.workspaces.members()]);
      setWs(w.data);
      setMembers(m.data.members);
      setInvites(m.data.invites);
      setState('ready');
      setLoadError(null);
    } catch (e) {
      setState('error');
      setLoadError(errText(e, 'Could not load the team.'));
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    Promise.all([api.workspaces.current(), api.workspaces.members()])
      .then(([w, m]) => {
        if (cancelled) return;
        setWs(w.data);
        setMembers(m.data.members);
        setInvites(m.data.invites);
        setState('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState('error');
        setLoadError(errText(e, 'Could not load the team.'));
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const isAdmin = ws?.role === 'admin';
  const meter = ws ? seatMeterText(ws) : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => (roleFilter === 'all' || m.role === roleFilter)
      && (!q || m.email.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q)));
  }, [members, query, roleFilter]);

  const setRole = async (m: WorkspaceMemberDto, role: WorkspaceRole) => {
    if (role === m.role) return;
    try {
      await api.workspaces.changeRole(m.userId, role);
      pushToast(`Role updated: ${ROLE_LABEL[role]}`);
    } catch (e) {
      pushToast(errText(e, 'Could not change the role'));
    }
    await load();
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const m = removing;
    setBusy(true);
    try {
      await api.workspaces.removeMember(m.userId);
      pushLog(`Removed member ${m.email}`);
      pushToast(`Removed ${m.name || m.email}. Their diagrams moved to you.`);
    } catch (e) {
      pushToast(errText(e, 'Could not remove the member'));
    }
    setBusy(false);
    setRemoving(null);
    await load();
  };

  const sendInvites = async () => {
    setInviteError(null);
    const parsed = parseEmails(inviteEmails);
    if (parsed.valid.length === 0 || parsed.invalid.length > 0) {
      setInviteError(parsed.invalid.length > 0 ? `Not a valid email: ${parsed.invalid.join(', ')}` : 'Enter at least one email');
      return;
    }
    setBusy(true);
    const failed: string[] = [];
    let sent = 0;
    for (const to of parsed.valid) {
      try {
        const r = await api.workspaces.invite(to, inviteRole);
        if (r.data.emailSent === false) failed.push(`${to}: invite created but the email could not be sent`);
        sent += 1;
      } catch (e) {
        failed.push(`${to}: ${errText(e, 'invite failed')}`);
      }
    }
    setBusy(false);
    if (failed.length > 0) setInviteError(failed.join('; '));
    else {
      setInviteEmails('');
      setShowInvite(false);
    }
    if (sent > 0) pushToast(`Invited ${sent} ${sent === 1 ? 'person' : 'people'} as ${ROLE_LABEL[inviteRole]}`);
    await load();
  };

  const revoke = async (inv: WorkspaceInviteDto) => {
    try {
      await api.workspaces.revokeInvite(inv.id);
      pushToast(`Invite for ${inv.email} revoked`);
    } catch (e) {
      pushToast(errText(e, 'Could not revoke the invite'));
    }
    await load();
  };

  /** No resend endpoint exists: revoke the old invite and send a fresh one (new link, new expiry). */
  const resend = async (inv: WorkspaceInviteDto) => {
    try {
      await api.workspaces.revokeInvite(inv.id);
      const r = await api.workspaces.invite(inv.email, inv.role);
      pushToast(r.data.emailSent === false ? `New invite for ${inv.email} created, but the email could not be sent` : `Invite re-sent to ${inv.email}`);
    } catch (e) {
      pushToast(errText(e, 'Could not resend the invite'));
    }
    await load();
  };

  const exportRoster = () => {
    const payload = { exportedAt: new Date().toISOString(), scope: 'server-roster', members, approvalPolicy: s.approvalCount };
    const url = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'archflux-team-roster.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    pushToast('Roster exported (members only; this is not the server audit log)');
  };

  const summary = state === 'ready' && signedIn
    ? [`${members.length} ${members.length === 1 ? 'member' : 'members'}`, isAdmin ? `${invites.length} pending ${invites.length === 1 ? 'invite' : 'invites'}` : null, meter]
        .filter(Boolean).join(' · ')
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="content-card">
        <div className="card-head">
          <span className="card-title">Members</span>
        </div>
        {!signedIn && (
          <EmptyState title="Sign in to manage your team" body="Members and invites live on the server. Local guest sessions have no team." />
        )}
        {signedIn && state === 'loading' && <p role="status" style={{ color: 'var(--text-muted)' }}>Loading members…</p>}
        {signedIn && state === 'error' && (
          <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#B91C1C' }}>
            <span>{loadError}</span>
            <button type="button" style={btn} onClick={() => { setState('loading'); void load(); }}>Try again</button>
          </div>
        )}
        {signedIn && state === 'ready' && ws && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <p style={{ margin: 0, flexGrow: 1, color: '#5B6474' }}>{summary}</p>
              <button type="button" style={btn} onClick={exportRoster}>Export roster</button>
              {isAdmin && <button type="button" style={btnPrimary} onClick={() => setShowInvite((v) => !v)} aria-expanded={showInvite}>Invite people</button>}
            </div>
            {meter && <div role="status" aria-label="Seat meter" style={{ fontSize: 12, color: '#3D4553' }}>{meter}</div>}
            {isAdmin && showInvite && (
              <div role="group" aria-label="Invite people" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input aria-label="Invite emails" style={{ ...field, flex: 1, minWidth: 220 }} placeholder="name@company.com, …" value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sendInvites(); }} />
                <select aria-label="Invite role" style={field} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => void sendInvites()}>Send invites</button>
                {inviteError && <span role="alert" style={{ color: '#B91C1C', fontSize: 12, flexBasis: '100%' }}>{inviteError}</span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <input aria-label="Search members" style={{ ...field, flexGrow: 1 }} placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
              <select aria-label="Role filter" style={field} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | WorkspaceRole)}>
                <option value="all">All roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <section aria-label="Team members" style={{ background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 12, padding: '10px 16px', background: '#F6F7F9', fontSize: 11, fontWeight: 600, color: '#5B6474', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <span>Member</span><span>Role</span><span>Joined</span><span />
              </div>
              {visible.length === 0 && (
                <div style={{ padding: '14px 16px', color: '#5B6474' }}>{members.length === 0 ? 'No members yet.' : 'No members match this search.'}</div>
              )}
              {visible.map((m) => {
                const isSelf = !!selfEmail && m.email.toLowerCase() === selfEmail;
                const display = m.name || m.email;
                return (
                  <div key={m.userId} role="group" aria-label={`Member ${display}`} style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 12, padding: '12px 16px', borderTop: '1px solid #F1F2F5', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 16, background: '#E8EAFD', color: '#4338CA', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{display.charAt(0).toUpperCase()}</span>
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{display}{isSelf ? ' (you)' : ''}</span>
                        <span style={{ fontSize: 12, color: '#5B6474' }}>{m.name ? m.email : ROLE_DESC[m.role]}</span>
                      </span>
                    </span>
                    <select aria-label={`Role for ${display}`} style={{ ...field, height: 32, width: 'fit-content' }} value={m.role} disabled={!isAdmin} onChange={(e) => void setRole(m, e.target.value as WorkspaceRole)}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <span style={{ color: '#3D4553' }}>{shortDate(m.joinedAt)}</span>
                    {isAdmin && !isSelf ? (
                      <button type="button" style={{ ...btn, height: 32, color: '#B91C1C' }} aria-label={`Remove ${display}`} onClick={() => setRemoving(m)}>Remove</button>
                    ) : <span />}
                  </div>
                );
              })}
            </section>
            {isAdmin && (
              <section aria-label="Pending invites" style={{ background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: '#F6F7F9', fontSize: 11, fontWeight: 600, color: '#5B6474', textTransform: 'uppercase', letterSpacing: '.04em' }}>Pending invites</div>
                {invites.length === 0 && <div style={{ padding: '14px 16px', color: '#5B6474' }}>No pending invites.</div>}
                {invites.map((inv) => (
                  <div key={inv.id} role="group" aria-label={`Invite ${inv.email}`} style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 12, padding: '12px 16px', borderTop: '1px solid #F1F2F5', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{inv.email}</span>
                    <span>{ROLE_LABEL[inv.role] ?? inv.role}</span>
                    <span style={{ color: '#92400E' }}>Invite pending · expires {shortDate(inv.expiresAt)}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={{ ...btn, height: 32 }} aria-label={`Resend invite to ${inv.email}`} onClick={() => void resend(inv)}>Resend</button>
                      <button type="button" style={{ ...btn, height: 32, color: '#B91C1C' }} aria-label={`Revoke invite for ${inv.email}`} onClick={() => void revoke(inv)}>Revoke</button>
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      {removing && (
        <div role="dialog" aria-modal="true" aria-label="Remove member" style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,25,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onKeyDown={(e) => { if (e.key === 'Escape') setRemoving(null); }}>
          <div style={{ width: 400, background: '#FFFFFF', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Remove {removing.name || removing.email}?</h2>
            <p style={{ margin: 0, color: '#5B6474' }}>Their diagrams move to you.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} autoFocus onClick={() => setRemoving(null)}>Cancel</button>
              <button type="button" style={{ ...btnPrimary, background: '#B91C1C' }} disabled={busy} onClick={() => void confirmRemove()}>Remove member</button>
            </div>
          </div>
        </div>
      )}

      <div className="content-card">
        <div className="card-head"><span className="card-title">Governance & SSO</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 11 }}>SSO provider
            <select className="theme-select" value={s.ssoProvider} onChange={(e) => { const next = { ...s, ssoProvider: e.target.value }; setS(next); saveSettings(next); }} aria-label="SSO provider" style={{ marginLeft: 8 }}>
              <option>Okta</option>
              <option>Azure AD</option>
              <option>Google Workspace</option>
            </select>
          </label>
          <label style={{ fontSize: 11 }}>Require approvals before .arch merge to main
            <input
              type="number"
              min={1}
              max={5}
              value={s.approvalCount}
              onChange={(e) => { const next = { ...s, approvalCount: Math.max(1, Math.min(5, Number(e.target.value) || 1)) }; setS(next); saveSettings(next); }}
              aria-label="Required approvals"
              style={{ width: 56, marginLeft: 8, border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 6px' }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
