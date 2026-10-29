import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { api, ApiError } from '../lib/api';
import type { DiagramMember, DiagramRoleWire, ShareLinkInfo } from '../lib/api';
import { track } from '../lib/analytics';
import { useFocusTrap } from '../hooks/useFocusTrap';
import AccessRequests from './access/AccessRequests';
import { shareLinkUrl } from '../lib/access';

/**
 * Share dialog (SC-22, R1-E07-T05). Layout and copy follow Share.dc.html.
 * Everything shown comes from the members / links endpoints. A link's token is
 * returned once at creation; afterwards only the link's metadata is listed.
 */
export interface ShareDialogProps {
  diagramId: string;
  title: string;
  /** False for local-only docs and guest sessions: shows the save-to-cloud state. */
  cloud: boolean;
  /** Real workspace name for "Anyone in <workspace>"; omitted when unknown. */
  workspaceName?: string | null;
  /** Signed-in user's email, to mark "(you)" on their own row. */
  selfEmail?: string | null;
  onSaveToCloud?: () => void;
  onClose: () => void;
}

const INVITE_ROLES: Array<{ id: DiagramRoleWire; label: string }> = [
  { id: 'editor', label: 'Can edit' },
  { id: 'commenter', label: 'Can comment' },
  { id: 'viewer', label: 'Can view' },
];
const AVATAR: Array<[string, string]> = [['#E8EAFD', '#4338CA'], ['#DCF3E6', '#047857'], ['#E8F0FE', '#1D4ED8'], ['#FEF3E2', '#92400E']];

type Audience = 'restricted' | 'workspace' | 'anyone';

const selectStyle: CSSProperties = { height: 32, padding: '0 8px', border: '1px solid #E3E6EB', borderRadius: 6, font: 'inherit', background: '#FFFFFF', color: '#1B1F27' };
const sectionLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5B6474' };
const outlineBtn: CSSProperties = { height: 36, padding: '0 14px', border: '1px solid #E3E6EB', borderRadius: 8, background: '#FFFFFF', font: 'inherit', fontWeight: 500, color: '#1B1F27', cursor: 'pointer' };

function emailsFrom(text: string): string[] {
  return text.split(/[,\s;]+/).map((e) => e.trim()).filter(Boolean);
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function isActive(l: ShareLinkInfo): boolean {
  return !l.revokedAt && l.state !== 'expired' && l.state !== 'revoked';
}

export default function ShareDialog({ diagramId, title, cloud, workspaceName, selfEmail, onSaveToCloud, onClose }: ShareDialogProps) {
  const trap = useFocusTrap<HTMLElement>(true);
  const restoreTo = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const [members, setMembers] = useState<DiagramMember[] | null>(null);
  const [links, setLinks] = useState<ShareLinkInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [inviteRole, setInviteRole] = useState<DiagramRoleWire>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteErrors, setInviteErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>('restricted');
  const [linkRole, setLinkRole] = useState<'viewer' | 'commenter'>('viewer');
  const [expires, setExpires] = useState('');
  const [created, setCreated] = useState<{ url: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicDisabled, setPublicDisabled] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([api.sharing.members(diagramId), api.sharing.links(diagramId).catch(() => ({ data: [] as ShareLinkInfo[] }))]);
      setMembers(m.data);
      setLinks(l.data);
      setLoadError(null);
      const active = l.data.find(isActive);
      if (active) {
        setAudience(active.audience);
        setLinkRole(active.role);
      }
    } catch (e) {
      setLoadError(errText(e, 'Failed to load sharing settings'));
    }
  }, [diagramId]);

  useEffect(() => {
    if (!cloud) return;
    void reload();
  }, [cloud, reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = restoreTo.current;
    return () => {
      if (el instanceof HTMLElement) el.focus();
    };
  }, []);

  const pushChips = (text: string) => {
    const found = emailsFrom(text);
    if (found.length === 0) return;
    setChips((cur) => [...cur, ...found.filter((e) => !cur.includes(e))]);
  };

  const invite = async () => {
    const all = [...chips, ...emailsFrom(draft).filter((e) => !chips.includes(e))];
    if (all.length === 0) return;
    setInviting(true);
    setInviteErrors([]);
    setNotice(null);
    const failed: string[] = [];
    const errors: string[] = [];
    let added = 0;
    for (const email of all) {
      try {
        await api.sharing.addMember(diagramId, email, inviteRole);
        track('share_invited', { role: inviteRole });
        added += 1;
      } catch (e) {
        failed.push(email);
        errors.push(`${email}: ${e instanceof ApiError && e.code === 'USER_NOT_FOUND' ? 'Invite them to the workspace first' : errText(e, 'could not be added')}`);
      }
    }
    setChips(failed);
    setDraft('');
    setInviteErrors(errors);
    if (added > 0) setNotice(`Invited ${added} ${added === 1 ? 'person' : 'people'}.`);
    setInviting(false);
    if (added > 0) await reload();
  };

  const changeRole = async (m: DiagramMember, role: DiagramRoleWire) => {
    setNotice(null);
    try {
      await api.sharing.setRole(diagramId, m.userId, role);
      await reload();
    } catch (e) {
      setInviteErrors([`${m.name || m.email || 'Member'}: ${errText(e, 'role change failed')}`]);
      await reload();
    }
  };

  const remove = async (m: DiagramMember) => {
    try {
      await api.sharing.removeMember(diagramId, m.userId);
      await reload();
    } catch (e) {
      setInviteErrors([`${m.name || m.email || 'Member'}: ${errText(e, 'could not be removed')}`]);
    }
  };

  const activeLink = (links ?? []).find(isActive) ?? null;

  const revokeActive = async () => {
    for (const l of (links ?? []).filter(isActive)) {
      await api.sharing.revokeLink(diagramId, l.id);
    }
  };

  const onAudience = async (next: Audience) => {
    setLinkError(null);
    setAudience(next);
    setCreated(null);
    if (next === 'restricted' && activeLink) {
      setBusy(true);
      try {
        await revokeActive();
        await reload();
      } catch (e) {
        setLinkError(errText(e, 'Could not revoke the link'));
      } finally {
        setBusy(false);
      }
    }
  };

  const copyLink = async () => {
    setLinkError(null);
    if (audience === 'restricted') return;
    setBusy(true);
    try {
      if (activeLink && (activeLink.audience !== audience || activeLink.role !== linkRole)) await revokeActive();
      const res = await api.sharing.createLink(diagramId, {
        role: linkRole,
        audience,
        ...(expires ? { expiresAt: new Date(`${expires}T23:59:59`).toISOString() } : {}),
      });
      track('link_published', { audience, role: linkRole });
      const url = shareLinkUrl(res.data.url, res.data.token);
      setCreated({ url, token: res.data.token });
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PUBLIC_LINKS_DISABLED') {
        setPublicDisabled(true);
        setAudience('restricted');
        setLinkError('This workspace does not allow links for anyone.');
      } else {
        setLinkError(errText(e, 'Could not create the link'));
      }
    } finally {
      setBusy(false);
    }
  };

  const ownerCount = (members ?? []).filter((m) => m.role === 'owner').length;
  const wsLabel = workspaceName ? `Anyone in ${workspaceName}` : 'Anyone in the workspace';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,25,.45)', zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 110 }} onClick={onClose}>
      <section
        ref={trap}
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${title}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', boxSizing: 'border-box', background: '#FFFFFF', color: '#1B1F27', borderRadius: 14, boxShadow: '0 24px 64px rgba(16,24,40,.25)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, flexGrow: 1 }}>Share “{title}”</h1>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: 6, fontSize: 18, color: '#5B6474', cursor: 'pointer' }}>×</button>
        </div>

        {!cloud ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: '#3D4553' }}>Save this diagram to the cloud to share it</p>
            <span>
              <button type="button" onClick={onSaveToCloud} style={{ height: 40, padding: '0 16px', border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Save to cloud</button>
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flexGrow: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 40, padding: '4px 8px', border: '1px solid #4F46E5', borderRadius: 8, boxShadow: '0 0 0 3px rgba(79,70,229,.15)' }}>
                {chips.map((c) => (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', borderRadius: 999, background: '#EEF0FF', color: '#4338CA', fontWeight: 500 }}>
                    {c}
                    <button type="button" aria-label={`Remove ${c}`} onClick={() => setChips((cur) => cur.filter((x) => x !== c))} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0 }}>×</button>
                  </span>
                ))}
                <input
                  aria-label="Add people, teams or emails"
                  placeholder="Add people, teams or emails"
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/[,;]$/.test(v)) {
                      pushChips(v);
                      setDraft('');
                    } else setDraft(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (draft.trim()) {
                        pushChips(draft);
                        setDraft('');
                      } else void invite();
                    }
                  }}
                  style={{ flexGrow: 1, minWidth: 120, border: 'none', outline: 'none', font: 'inherit' }}
                />
              </label>
              <select aria-label="Role for new people" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as DiagramRoleWire)} style={{ ...selectStyle, height: 40, borderRadius: 8 }}>
                {INVITE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button type="button" disabled={inviting} onClick={() => void invite()} style={{ height: 40, padding: '0 16px', border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Invite</button>
            </div>
            {inviteErrors.length > 0 && (
              <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>
                {inviteErrors.map((m) => <div key={m}>{m}</div>)}
              </div>
            )}
            {notice && <div role="status" style={{ color: '#047857', fontSize: 12 }}>{notice}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={sectionLabel}>People with access</span>
              {loadError && <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>Couldn’t load people: {loadError}</div>}
              {!members && !loadError && <span style={{ color: '#5B6474' }}>Loading…</span>}
              {(members ?? []).map((m, i) => {
                const name = m.name || m.email || 'Unknown user';
                const lastOwner = m.role === 'owner' && ownerCount <= 1;
                const [bg, fg] = AVATAR[i % AVATAR.length];
                const isSelf = !!selfEmail && !!m.email && m.email.toLowerCase() === selfEmail.toLowerCase();
                return (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                    <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 16, background: bg, color: fg, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{name.charAt(0).toUpperCase()}</span>
                    <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{name}{isSelf ? ' (you)' : ''}</span>
                      {m.email && m.name && <span style={{ fontSize: 12, color: '#5B6474' }}>{m.email}</span>}
                    </span>
                    <select aria-label={`Role for ${name}`} value={m.role} disabled={lastOwner} onChange={(e) => void changeRole(m, e.target.value as DiagramRoleWire)} style={selectStyle}>
                      <option value="owner">Owner</option>
                      {INVITE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    {!lastOwner && (
                      <button type="button" aria-label={`Remove ${name}`} onClick={() => void remove(m)} style={{ ...selectStyle, cursor: 'pointer' }}>Remove</button>
                    )}
                  </div>
                );
              })}
              {members && members.length === 0 && <span style={{ color: '#5B6474' }}>No one else has access yet.</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: '1px solid #EEF0F3' }}>
              <span style={sectionLabel}>General access</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, background: '#E8F0FE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>
                </span>
                <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <select aria-label="General access" value={audience} disabled={busy} onChange={(e) => void onAudience(e.target.value as Audience)} style={{ width: 'fit-content', height: 30, border: 'none', font: 'inherit', fontWeight: 600, padding: 0, background: 'transparent', color: '#1B1F27' }}>
                    <option value="restricted">Restricted</option>
                    <option value="workspace">{wsLabel}</option>
                    {!publicDisabled && <option value="anyone">Anyone with the link</option>}
                  </select>
                  <span style={{ fontSize: 12, color: '#5B6474' }}>
                    {audience === 'restricted' ? 'Only people added above can open it' : `can find and ${linkRole === 'viewer' ? 'view' : 'comment'}; link expires ${activeLink?.expiresAt && audience === activeLink.audience ? new Date(activeLink.expiresAt).toLocaleDateString() : expires ? new Date(`${expires}T00:00:00`).toLocaleDateString() : 'never'}`}
                  </span>
                </span>
                {audience !== 'restricted' && (
                  <>
                    <select aria-label="Link role" value={linkRole} onChange={(e) => setLinkRole(e.target.value as 'viewer' | 'commenter')} style={selectStyle}>
                      <option value="viewer">Can view</option>
                      <option value="commenter">Can comment</option>
                    </select>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: '#5B6474' }}>
                      Expires
                      <input aria-label="Link expiry date" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} style={{ ...selectStyle, height: 28 }} />
                    </label>
                  </>
                )}
              </div>
              {linkError && <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>{linkError}</div>}
              {created && (
                <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#F6F7F9', border: '1px solid #E3E6EB', borderRadius: 8, padding: 10 }}>
                  <input aria-label="Share link" readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} style={{ border: '1px solid #E3E6EB', borderRadius: 6, height: 30, padding: '0 8px', font: 'inherit' }} />
                  <span style={{ fontSize: 12, color: '#3D4553' }}>
                    {copied ? 'Copied. ' : ''}Link created — copy it now. For security we can’t show it again.
                  </span>
                </div>
              )}
              {!created && activeLink && audience !== 'restricted' && (
                <span style={{ fontSize: 12, color: '#5B6474' }}>A link is active. For security we can’t show it again; copy a new one to replace it.</span>
              )}
            </div>
          </>
        )}

        {cloud && <AccessRequests diagramId={diagramId} onDecided={() => void reload()} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 14, borderTop: '1px solid #EEF0F3' }}>
          {cloud && (
            <button type="button" disabled={busy || audience === 'restricted'} title={audience === 'restricted' ? 'Choose who can open the link first' : undefined} onClick={() => void copyLink()} style={{ ...outlineBtn, opacity: audience === 'restricted' ? 0.55 : 1 }}>Copy link</button>
          )}
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={onClose} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: '#1B1F27', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Done</button>
        </div>
      </section>
    </div>
  );
}
