import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockConnectors, mockDriftLines } from '../mocks';
import type { Connector } from '../types';
import { useDiagram } from '../useDiagram';

const CONNECTORS_KEY = 'archflux:connectors:v1';

function loadConnectors(): Connector[] {
  try {
    const raw = localStorage.getItem(CONNECTORS_KEY);
    if (!raw) return mockConnectors;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return mockConnectors;
    if (!parsed.every((c) => c && typeof c.id === 'string' && typeof c.name === 'string')) return mockConnectors;
    return parsed;
  } catch {
    return mockConnectors;
  }
}

export default function LivingScreen() {
  const navigate = useNavigate();
  const store = useDiagram();
  const { resync, exportArch, importArch, pushToast, pushLog, syncLog, freshness, nodes, edges, isOnline } = store;

  const [connectors, setConnectors] = useState<Connector[]>(loadConnectors);
  const [drift, setDrift] = useState(mockDriftLines.map((d, i) => ({ ...d, id: `d${i}`, dismissed: false })));
  const [newName, setNewName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [armRemove, setArmRemove] = useState<string | null>(null);
  const [preserveLayout, setPreserveLayout] = useState(() => {
    try {
      return localStorage.getItem('archflux:preserve-layout') !== 'false';
    } catch {
      return true;
    }
  });
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState(() => {
    try {
      return localStorage.getItem('archflux:last-ping') ?? new Date().toLocaleTimeString();
    } catch {
      return new Date().toLocaleTimeString();
    }
  });

  const persistConnectors = (next: Connector[]) => {
    setConnectors(next);
    try {
      localStorage.setItem(CONNECTORS_KEY, JSON.stringify(next));
    } catch {
      /* quota ignore */
    }
  };

  const activeDrift = drift.filter((d) => !d.dismissed);
  const syncLabel = freshness === 'syncing' ? 'Syncing…' : freshness === 'fresh' ? '✓ In sync' : 'Execute Idempotent Re-Sync';

  // Structured reconciler rows: change type, service, live vs canvas, proposed action.
  const driftRows = activeDrift.map((d) => {
    const m = d.text.match(/^([+-~])\s*([^:]+):\s*(.*)$/);
    const service = (m?.[2] ?? d.text).trim();
    const detail = (m?.[3] ?? '').trim();
    const changeType = d.kind === 'add' ? 'ADDED' : d.kind === 'del' ? 'DELETED' : 'MODIFIED';
    let live = detail, canvas = '—', action = detail;
    if (d.kind === 'del') {
      live = '—'; canvas = detail; action = `Remove ${service}`;
    } else if (d.kind === 'add') {
      live = detail; canvas = '—'; action = `Add ${service}`;
    } else {
      const parts = detail.match(/^(.*)\((.*)\)\s*$/);
      if (parts) {
        live = `${parts[1].trim()} (${parts[2].trim()})`;
        canvas = parts[1].trim();
        action = `Update ${service} → ${parts[2].trim()}`;
      } else {
        action = `Review ${service}`;
      }
    }
    return { ...d, changeType, service, live, canvas, action };
  });

  const runResync = () => {
    if (freshness === 'syncing') return;
    setSyncProgress(0);
    const tick = window.setInterval(() => {
      setSyncProgress((p) => (p === null ? null : Math.min(90, p + 25)));
    }, 180);
    resync();
    window.setTimeout(() => {
      window.clearInterval(tick);
      setSyncProgress(100);
      const now = new Date().toLocaleTimeString();
      setLastPing(now);
      try {
        localStorage.setItem('archflux:last-ping', now);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setSyncProgress(null), 600);
    }, 750);
  };

  const retryConnector = (id: string) => {
    if (!isOnline) {
      pushToast('Connector unreachable — you are offline');
      pushLog(`Connector retry failed: offline (${id})`);
      return;
    }
    persistConnectors(connectors.map((c) => (c.id === id ? { ...c, status: 'polling', statusLabel: '● Polling…' } : c)));
    pushLog(`Connector retry: ${id}`);
    window.setTimeout(() => {
      persistConnectors(loadConnectors().map((c) => (c.id === id ? { ...c, status: 'verified', statusLabel: '● Verified' } : c)));
      pushToast(`Connector ${id} verified`);
      pushLog(`Connector ${id}: verified`);
    }, 800);
  };

  const removeConnector = (id: string) => {
    if (armRemove !== id) {
      setArmRemove(id);
      window.setTimeout(() => setArmRemove((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setArmRemove(null);
    persistConnectors(connectors.filter((c) => c.id !== id));
    pushToast(`Removed connector ${id}`);
  };

  const addConnector = () => {
    const name = newName.trim() || `Custom Connector ${connectors.length + 1}`;
    if (connectors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      pushToast(`Connector "${name}" already exists`);
      return;
    }
    const id = `c-${Date.now().toString(36)}`;
    persistConnectors([
      ...connectors,
      { id, name, detail: 'manual • just added', icon: '🔌', status: 'polling', statusLabel: '● Polling…' },
    ]);
    setNewName('');
    pushToast(`Added connector: ${name}`);
    pushLog(`Connector added: ${name}`);
    if (isOnline) {
      window.setTimeout(() => {
        persistConnectors(loadConnectors().map((c) => (c.id === id ? { ...c, status: 'verified', statusLabel: '● Verified' } : c)));
        pushToast(`Connector ${name} verified`);
        pushLog(`Connector ${name}: verified`);
      }, 800);
    }
  };

  const acceptDrift = (id: string) => {
    setDrift((prev) => prev.map((d) => (d.id === id ? { ...d, dismissed: true } : d)));
    pushLog(`Drift accepted: ${id}`);
    // One sync per batch: resync() is idempotent, but concurrent timeouts
    // would stack duplicate toasts.
    if (freshness !== 'syncing') resync();
  };

  const rejectDrift = (id: string) => {
    setDrift((prev) => prev.map((d) => (d.id === id ? { ...d, dismissed: true } : d)));
    pushToast('Drift line dismissed (kept canvas as-is)');
  };

  const onImportFile = (f: File | undefined) => {
    if (!f) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        importArch(parsed);
        pushToast(`Imported ${f.name} — ${parsed.nodes?.length ?? 0} nodes loaded`);
        navigate('/canvas');
      } catch {
        setImportError('Invalid JSON — expected { nodes[], edges[] }');
        pushToast('Import failed: invalid .arch JSON');
      }
    };
    reader.readAsText(f);
  };

  return (
    <div className="screen-view active">
      <div className="screen-content-wrapper">
        <div className="column-half">
          <div className="content-card" aria-label="Sync status overview">
            <div className="card-head">
              <span className="card-title">Live Status Overview</span>
              <span className="badge-count cyan">{freshness === 'fresh' ? '● Synced' : freshness === 'syncing' ? '● Syncing' : '⚠ Drift Detected'}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>
              <span>Connected repos: <strong>{connectors.length}</strong></span>
              <span>Mapped services: <strong>{nodes.length}</strong></span>
              <span>Last webhook ping: <strong>{lastPing}</strong></span>
            </div>
          </div>
          {!isOnline && (
            <div className="callout-block" role="alert" style={{ borderLeftColor: 'var(--accent-rose)' }}>
              <strong>You are offline.</strong> Sync and connector retry are paused until the connection returns — nothing is lost.
            </div>
          )}
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">Active Live Data Connectors ({connectors.length})</span>
            </div>
            <div className="card-sub">
              Deterministic, non-AI synchronization that monitors ASTs, OpenAPI schemas, and Kubernetes deployments. {nodes.length} nodes / {edges.length} edges live.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="doc-title-input"
                style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                placeholder="New connector name (e.g. ArgoCD prod)…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label="New connector name"
              />
              <button type="button" className="btn btn-primary" onClick={addConnector}>+ Add Connector</button>
            </div>
            {connectors.length === 0 && (
              <div className="callout-block">No connectors. Add Kubernetes, OpenAPI or Terraform to start live sync.</div>
            )}
            {connectors.map((c) => (
              <div
                key={c.id}
                className="connector-row"
                style={c.status === 'drift' ? { borderColor: 'var(--accent-amber)', background: 'var(--accent-amber-bg)' } : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="connector-icon-box">{c.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>{c.detail}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="badge-count" style={{ background: c.status === 'drift' ? '#D97706' : '#DCFCE7', color: c.status === 'drift' ? '#FFFFFF' : '#16A34A' }}>
                    {c.statusLabel}
                  </span>
                  <button className="btn-xs" onClick={() => retryConnector(c.id)} title="Retry sync">Retry</button>
                  <button className="btn-xs" onClick={() => removeConnector(c.id)} title="Remove (click twice)">{armRemove === c.id ? 'Sure?' : '✕'}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="content-card">
            <div className="card-head">
              <span className="card-title">Live Schema &amp; Topology Drift ({activeDrift.length})</span>
              <button type="button" className="btn btn-primary" onClick={runResync} disabled={freshness === 'syncing'}>
                {syncLabel}
              </button>
            </div>
            {syncProgress !== null && (
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-panel-subtle)', overflow: 'hidden', marginBottom: 8 }} role="progressbar" aria-valuenow={syncProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Re-sync progress">
                <div style={{ width: `${syncProgress}%`, height: '100%', background: 'var(--accent-cyan, #2563EB)', transition: 'width 180ms' }} />
              </div>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={preserveLayout}
                onChange={(e) => {
                  setPreserveLayout(e.target.checked);
                  try {
                    localStorage.setItem('archflux:preserve-layout', String(e.target.checked));
                  } catch {
                    /* ignore */
                  }
                  pushToast(e.target.checked ? 'Manual positions preserved during sync' : 'Sync may reposition shapes');
                }}
              />
              Preserve manual shape positions and annotations during sync (default: on)
            </label>
            <div style={{ fontSize: '12px', marginBottom: '8px', color: 'var(--text-muted)' }}>
              Upstream repository merged PR #142 introducing an asynchronous <strong>Fraud Detection Service</strong>. Accept stages the update for merge; Reject marks drift as ignored.
              <span style={{ fontFamily: 'var(--mono-font)', fontSize: 10 }}> (simulated upstream diff)</span>
            </div>
            {activeDrift.length === 0 ? (
              <div className="callout-block">✓ No pending drift — canvas matches upstream.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <div role="table" aria-label="Drift reconciler" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 640 }}>
                <div role="row" style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr auto', gap: 8, fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <span role="columnheader">Change</span><span role="columnheader">Service</span><span role="columnheader">Live spec / Canvas</span><span role="columnheader">Proposed action</span><span role="columnheader">Decision</span>
                </div>
                {driftRows.map((row) => (
                  <div key={row.id} role="row" style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr auto', gap: 8, alignItems: 'center', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 8px', fontSize: 11 }}>
                    <span role="cell" className="badge-count" style={{ width: 'fit-content', background: row.changeType === 'ADDED' ? '#DCFCE7' : row.changeType === 'DELETED' ? '#FEE2E2' : '#FEF3C7', color: row.changeType === 'ADDED' ? '#16A34A' : row.changeType === 'DELETED' ? '#DC2626' : '#D97706' }}>
                      {row.changeType}
                    </span>
                    <span role="cell" style={{ fontWeight: 700 }}>{row.service}</span>
                    <span role="cell" style={{ fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>
                      <div>live: {row.live}</div>
                      <div>canvas: {row.canvas}</div>
                    </span>
                    <span role="cell">{row.action}{preserveLayout ? '' : ' (+re-layout)'}</span>
                    <span role="cell" style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-xs btn-xs-primary" onClick={() => acceptDrift(row.id)}>Accept</button>
                      <button className="btn-xs" onClick={() => rejectDrift(row.id)}>Reject</button>
                    </span>
                  </div>
                ))}
              </div>
              </div>
            )}
          </div>
        </div>

        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">File Transfer</span>
            </div>
            <div className="card-sub">Versioned file transfer for the diagram on this canvas.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button type="button" className="dock-action-btn" style={{ padding: '12px' }} onClick={() => exportArch()}>
                <span style={{ fontSize: '20px' }}>💾</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700 }}>Download .arch JSON</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Deterministic file for Git versioning and backup</div>
                </div>
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Tip: PNG snapshots live on the canvas — open Precision Canvas and use the 🖼
                button in the bottom bar, or ⌘K → Export PNG snapshot.
              </div>
              <label className="dock-action-btn" style={{ padding: '12px', cursor: 'pointer' }}>
                <span style={{ fontSize: '20px' }}>📥</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700 }}>Import .arch JSON</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Round-trip validation: must contain nodes[] + edges[]</div>
                </div>
                <input type="file" accept=".arch,.json,application/json" style={{ display: 'none' }} onChange={(e) => onImportFile(e.target.files?.[0])} />
              </label>
              {importError && <div role="alert" style={{ color: 'var(--accent-rose)', fontSize: 12 }}>{importError}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Connectors sync workspace state locally. Use Download .arch JSON above for
                versioned backups, and re-sync to apply the pending upstream diff to your canvas.
              </div>
            </div>
          </div>

          <div className="content-card">
            <div className="card-head"><span className="card-title">Sync Activity Log ({syncLog.length})</span></div>
            <div className="card-sub">Append-only deterministic log (newest first).</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {syncLog.length === 0 && <div className="callout-block">No sync events yet — run a re-sync to populate the log.</div>}
              {syncLog.map((l) => (
                <div key={l.id} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{l.text}</span><span style={{ color: 'var(--text-dim)' }}>{l.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
