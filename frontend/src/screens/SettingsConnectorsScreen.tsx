import { useState } from 'react';
import { useDiagram } from '../state/useDiagram';
import { loadSettings, saveSettings } from '../state/settings';
import { copyText } from '../lib/clipboard';

export default function SettingsConnectorsScreen() {
  const { pushToast, pushLog } = useDiagram();
  const [s, setS] = useState(loadSettings);
  const [showPat, setShowPat] = useState(false);

  const set = (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  };

  const patValid = s.pat.trim().length >= 8;
  const rotateSecret = () => {
    if (s.webhookSecret && !window.confirm('Generate a new signing secret? CI integrations using the old secret will break.')) return;
    const secret = `whsec_${Math.random().toString(36).slice(2, 14)}`;
    set({ webhookSecret: secret });
    pushLog('Webhook signing secret rotated');
    pushToast('New webhook secret generated');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="content-card">
        <div className="card-head"><span className="card-title">Git Provider Integration</span></div>
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>GitHub / GitLab Personal Access Token (scoped: repo read/write)
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type={showPat ? 'text' : 'password'}
              autoComplete="new-password"
              className="doc-title-input"
              style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--mono-font)' }}
              placeholder="ghp_…"
              value={s.pat}
              onChange={(e) => set({ pat: e.target.value })}
              aria-label="Personal access token"
            />
            <button className="btn btn--sm btn--secondary" onClick={() => setShowPat((v) => !v)}>{showPat ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        <div style={{ fontSize: 11, marginTop: 4, color: patValid ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
          {s.pat.trim() === '' ? 'No token configured — Git push/merge simulation only.' : patValid ? '✓ Token length OK (8+ chars) — stored locally, never validated against the provider' : '✗ Token too short — needs 8+ characters'}
        </div>
        <div style={{ fontSize: 10, marginTop: 4, color: 'var(--text-dim)' }}>Token is stored in plain text in this browser&apos;s localStorage — use a scoped, revocable token.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11 }}>Target repository
            <input className="doc-title-input" style={{ display: 'block', width: '100%', maxWidth: 260, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', marginTop: 4, fontFamily: 'var(--mono-font)' }} value={s.targetRepo} onChange={(e) => set({ targetRepo: e.target.value })} aria-label="Target repository" />
          </label>
          <label style={{ fontSize: 11 }}>Target file path
            <input className="doc-title-input" style={{ display: 'block', width: '100%', maxWidth: 260, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', marginTop: 4, fontFamily: 'var(--mono-font)' }} value={s.targetPath} onChange={(e) => set({ targetPath: e.target.value })} aria-label="Target file path" />
          </label>
        </div>
      </div>

      <div className="content-card">
        <div className="card-head"><span className="card-title">Live Infrastructure Webhooks</span></div>
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Webhook listener URL (CI/CD notifies ArchFlux of K8s manifest updates)
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="doc-title-input" style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--mono-font)' }} value={s.webhookUrl} onChange={(e) => set({ webhookUrl: e.target.value })} aria-label="Webhook listener URL" />
            <button className="btn btn--sm btn--secondary" onClick={() => { void copyText(s.webhookUrl).then((ok) => pushToast(ok ? 'Webhook URL copied' : 'Copy unavailable')); }}>Copy</button>
          </div>
        </label>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono-font)' }}>Secret: {s.webhookSecret || '(none)'}</span>
          <button className="btn btn--sm btn--secondary" onClick={rotateSecret}>Generate signing key</button>
          <button className="btn btn--sm btn--secondary" onClick={() => pushToast(s.webhookSecret ? 'Signature verification passed (simulated — no network check)' : 'No secret set — verification skipped')}>Verify (simulated)</button>
        </div>
      </div>

      <div className="content-card">
        <div className="card-head"><span className="card-title">Polling Schedules</span></div>
        <label style={{ fontSize: 11 }}>Background drift polling interval
          <select className="theme-select" value={s.polling} onChange={(e) => set({ polling: e.target.value as typeof s.polling })} aria-label="Polling interval" style={{ marginLeft: 8 }}>
            <option value="realtime">Real-time (Webhook only)</option>
            <option value="5m">5 minutes</option>
            <option value="1h">1 hour</option>
            <option value="manual">Manual only</option>
          </select>
        </label>
      </div>
    </div>
  );
}
