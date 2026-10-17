import { useState } from 'react';
import { useDiagram } from '../useDiagram';
import { loadSettings, saveSettings } from '../settings';

type Role = 'Admin' | 'Editor' | 'Reviewer' | 'Viewer';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'invited';
}

const TEAM_KEY = 'archflux:team:v1';

const SEED: Member[] = [
  { id: 'u1', name: 'Ravi Kumar', email: 'ravi@acme.com', role: 'Admin', status: 'active' },
  { id: 'u2', name: 'Elena R.', email: 'elena@acme.com', role: 'Editor', status: 'active' },
  { id: 'u3', name: 'Marcus T.', email: 'marcus@acme.com', role: 'Reviewer', status: 'active' },
];

const ROLE_DESC: Record<Role, string> = {
  Admin: 'Full configuration, billing, invites, repository bindings.',
  Editor: 'Canvas creation, editing, re-syncing, blueprint loading.',
  Reviewer: 'Read-only canvas + comments and PR approvals.',
  Viewer: 'Read-only inspection and export.',
};

function loadTeam(): Member[] {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as Member[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED;
  } catch {
    return SEED;
  }
}

export default function SettingsTeamScreen() {
  const { pushToast, pushLog } = useDiagram();
  const [s, setS] = useState(loadSettings);
  const [team, setTeam] = useState<Member[]>(loadTeam);
  const [invite, setInvite] = useState('');

  const persist = (next: Member[]) => {
    setTeam(next);
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const setRole = (id: string, role: Role) => {
    const member = team.find((m) => m.id === id);
    if (member?.role === 'Admin' && role !== 'Admin' && team.filter((m) => m.role === 'Admin').length <= 1) {
      pushToast('Cannot demote the last Admin — promote someone else first');
      return;
    }
    persist(team.map((m) => (m.id === id ? { ...m, role } : m)));
    pushToast(`Role updated → ${role}`);
  };

  const sendInvite = () => {
    const email = invite.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      pushToast('Enter a valid email to invite');
      return;
    }
    if (team.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
      pushToast(`${email} is already on the team`);
      return;
    }
    persist([...team, { id: `u-${Date.now().toString(36)}`, name: email.split('@')[0], email, role: 'Viewer', status: 'invited' }]);
    setInvite('');
    pushLog(`Invite sent: ${email}`);
    pushToast(`Invited ${email} as Viewer`);
  };

  const exportAudit = () => {
    // Local-only trail: team roster + policy snapshot from this browser.
    // The server audit export (GET /api/v1/audit, admin workspace role) is
    // not wired yet — see the note below. Never label this as server data.
    const payload = { exportedAt: new Date().toISOString(), scope: 'local', members: team, approvalPolicy: s.approvalCount };
    const url = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'archflux-audit-trail.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    pushToast('Local audit trail exported (this browser only — not server-verified)');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="content-card">
        <div className="card-head">
          <span className="card-title">Team Members ({team.length})</span>
          <button className="btn-xs" onClick={exportAudit}>Export local audit trail</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          Local export only — covers this browser&apos;s roster and policy snapshot. Server-side audit
          (admin workspace role) is not connected yet.
        </div>
        <label htmlFor="team-invite" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Invite by email</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            id="team-invite"
            className="doc-title-input"
            style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
            placeholder="name@company.com"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }}
            aria-label="Invite email"
          />
          <button className="btn btn-primary" onClick={sendInvite}>Invite</button>
        </div>
        <div role="table" aria-label="Team members" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {team.map((m) => (
            <div key={m.id} role="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--border-panel)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-panel-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{m.name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{m.email}</span></div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ROLE_DESC[m.role]} {m.status === 'invited' && '· invite pending'}</div>
              </div>
              <select className="theme-select" value={m.role} onChange={(e) => setRole(m.id, e.target.value as Role)} aria-label={`Role for ${m.name}`}>
                {(['Admin', 'Editor', 'Reviewer', 'Viewer'] as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="btn-xs" style={{ color: 'var(--accent-rose)' }} aria-label={`Remove ${m.name}`} onClick={() => {
                if (m.role === 'Admin' && team.filter((x) => x.role === 'Admin').length <= 1) {
                  pushToast('Cannot remove the last Admin — promote someone else first');
                  return;
                }
                if (window.confirm(`Remove ${m.name} (${m.email}) from the team?`)) {
                  persist(team.filter((x) => x.id !== m.id));
                  pushToast(`Removed ${m.name}`);
                }
              }}>Remove</button>
            </div>
          ))}
        </div>
      </div>

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
