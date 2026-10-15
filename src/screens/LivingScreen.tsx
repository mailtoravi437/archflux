import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HonestyBadge from '../components/HonestyBadge';
import { DEMO, NOT_CONNECTED, SIMULATED, connectorDisplayStatus } from '../honesty';
import { mockConnectors, mockDriftLines } from '../mocks';
import type { Connector } from '../types';
import { useDiagram } from '../useDiagram';
import { useFocusTrap } from '../useFocusTrap';

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
  const { resync, exportArch, importArch, pushToast, pushLog, syncLog, freshness, nodes, edges, isOnline, panToNode } = store;

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

  // Dynamic drift: live lint state (isolated nodes, dangling wires) merged
  // with the upstream simulated rows. Lint rows resolve by fixing the canvas;
  // acknowledging them hides them for this browser session (sessionStorage,
  // so navigating away and back does not resurrect them).
  const [ackDrift, setAckDrift] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem('archflux:ack-drift:v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const ackLintRow = (id: string) => {
    setAckDrift((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        sessionStorage.setItem('archflux:ack-drift:v1', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const lintDrift = useMemo(() => {
    const deg = new Map<string, number>();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      if (e.to) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    });
    const rows: { id: string; kind: 'add' | 'del' | 'mod'; text: string; refId: string }[] = [];
    nodes
      .filter((n) => (deg.get(n.id) ?? 0) === 0 || n.isOrphan)
      .forEach((n) => rows.push({
        id: `lint-orphan-${n.id}`,
        kind: 'mod',
        text: `~ service: ${n.label} (isolated — bind or delete)`,
        refId: n.id,
      }));
    edges
      .filter((e) => !e.to || e.isDangling)
      .forEach((e) => rows.push({
        id: `lint-dangle-${e.id}`,
        kind: 'del',
        text: `- route: ${e.label} (dangling wire)`,
        refId: e.from,
      }));
    return rows.filter((r) => !ackDrift.includes(r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, ackDrift]);

  const activeDrift = [
    ...lintDrift.map((d) => ({ ...d, dismissed: false })),
    ...drift.filter((d) => !d.dismissed),
  ];
  const syncLabel = freshness === 'syncing' ? 'Syncing…' : freshness === 'fresh' ? '✓ In sync' : 'Execute Idempotent Re-Sync';

  // Structured reconciler rows: change type, service, live vs canvas, proposed action.
  // Deterministic order: severity (deleted > modified > added), then service name.
  const severityRank = (kind: string) => (kind === 'del' ? 0 : kind === 'mod' ? 1 : 2);
  const driftRows = [...activeDrift]
    .sort((a, b) => severityRank(a.kind) - severityRank(b.kind) || a.text.localeCompare(b.text))
    .map((d) => {
    const m = d.text.match(/^([+-~])\s*([^:]+):\s*(.*)$/);
    const service = (m?.[2] ?? d.text).trim();
    const detail = (m?.[3] ?? '').trim();
    const changeType = d.kind === 'add' ? 'ADDED' : d.kind === 'del' ? 'DELETED' : 'MODIFIED';
    const source = d.id.startsWith('lint-') ? 'Derived from canvas' : 'Upstream (simulated)';
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
    return { ...d, changeType, service, live, canvas, action, source };
  });

  const syncTimers = useRef<{ interval: number | null; timeout: number | null }>({ interval: null, timeout: null });
  const runResync = () => {
    if (freshness === 'syncing') return;
    setSyncProgress(0);
    syncTimers.current.interval = window.setInterval(() => {
      setSyncProgress((p) => (p === null ? null : Math.min(90, p + 25)));
    }, 180);
    resync();
    syncTimers.current.timeout = window.setTimeout(() => {
      if (syncTimers.current.interval !== null) window.clearInterval(syncTimers.current.interval);
      syncTimers.current = { interval: null, timeout: null };
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

  const cancelResync = () => {
    if (syncTimers.current.interval !== null) window.clearInterval(syncTimers.current.interval);
    if (syncTimers.current.timeout !== null) window.clearTimeout(syncTimers.current.timeout);
    syncTimers.current = { interval: null, timeout: null };
    setSyncProgress(null);
    pushLog('Re-sync cancelled by user');
    pushToast('Re-sync cancelled');
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
      // No real provider verification happens here — keep the row honest.
      persistConnectors(loadConnectors().map((c) => (c.id === id ? { ...c, status: 'polling', statusLabel: `○ ${NOT_CONNECTED}` } : c)));
      pushToast(`Connector ${id} retry ran (${SIMULATED.toLowerCase()} — not verified against a real provider)`);
      pushLog(`Connector ${id}: retry finished without provider verification`);
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

  const [connModal, setConnModal] = useState<{ name: string; kind: string; target: string } | null>(null);
  const connTrap = useFocusTrap<HTMLDivElement>(connModal !== null);

  // Esc cancels the modal with no side effects; focus returns to Add via unmount.
  useEffect(() => {
    if (!connModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConnModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Boolean dep: subscribe once per open/close, not per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connModal !== null]);

  const openConnectorModal = () => {
    setConnModal({
      name: newName.trim() || `Custom Connector ${connectors.length + 1}`,
      kind: 'Kubernetes',
      target: '',
    });
  };

  const saveConnector = () => {
    if (!connModal) return;
    const name = connModal.name.trim() || `Custom Connector ${connectors.length + 1}`;
    if (connectors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      pushToast(`Connector "${name}" already exists`);
      return;
    }
    const target = connModal.target.trim();
    const byKind: Record<string, { detail: string; icon: string }> = {
      Kubernetes: { detail: `cluster: ${target || 'us-east-1-prod'} | ns: default`, icon: '☸️' },
      OpenAPI: { detail: `${target || 'openapi.yaml'} (unversioned)`, icon: '📄' },
      Terraform: { detail: `workspace: ${target || 'default'}`, icon: '🛠️' },
      Custom: { detail: target || 'manual • just added', icon: '🔌' },
    };
    const conf = byKind[connModal.kind] ?? byKind.Custom;
    const id = `c-${Date.now().toString(36)}`;
    persistConnectors([
      ...connectors,
      { id, name, detail: conf.detail, icon: conf.icon, status: 'polling', statusLabel: '● Polling…' },
    ]);
    setConnModal(null);
    setNewName('');
    pushToast(`Added connector: ${name}`);
    pushLog(`Connector added: ${name} (${connModal.kind})`);
    if (isOnline) {
      window.setTimeout(() => {
        // Nothing here verifies credentials against a real provider (HON-R2).
        persistConnectors(loadConnectors().map((c) => (c.id === id ? { ...c, status: 'polling', statusLabel: `○ ${NOT_CONNECTED}` } : c)));
        pushToast(`Connector ${name} added (${SIMULATED.toLowerCase()} — not verified against a real provider)`);
        pushLog(`Connector ${name}: added without provider verification`);
      }, 800);
    }
  };

  const jumpToRef = (refId: string) => {
    navigate('/canvas');
    // Let the route render before panning.
    window.setTimeout(() => panToNode(refId), 60);
  };

  const acceptDrift = (id: string) => {
    const lint = lintDrift.find((d) => d.id === id);
    if (lint) {
      // Lint rows resolve on canvas: acknowledge here, highlight there.
      ackLintRow(id);
      pushLog(`Drift acknowledged, opening on canvas: ${id}`);
      jumpToRef(lint.refId);
      return;
    }
    setDrift((prev) => prev.map((d) => (d.id === id ? { ...d, dismissed: true } : d)));
    pushLog(`Drift accepted: ${id}`);
    // One sync per batch: resync() is idempotent, but concurrent timeouts
    // would stack duplicate toasts.
    if (freshness !== 'syncing') resync();
  };

  const rejectDrift = (id: string) => {
    if (id.startsWith('lint-')) {
      ackLintRow(id);
      pushToast('Drift line acknowledged (fix it on canvas when ready)');
      return;
    }
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
      <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
        <div className="callout-block" role="note" aria-label="Demo data notice">
          <HonestyBadge label={DEMO} tone="demo" title="Illustrative only — no live provider connection exists" />{' '}
          <strong>Demo data</strong> — connectors and re-sync are {SIMULATED} until a real connector run exists.
          No live provider connection backs these rows.
        </div>
      </div>
      <div className="screen-content-wrapper">
        <div className="column-half">
          <div className="content-card" aria-label="Sync status overview">
            <div className="card-head">
              <span className="card-title">Live Status Overview</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <HonestyBadge label={DEMO} tone="demo" title="Simulated re-sync result — not produced by a real connector run" />
                <span className="badge-count cyan">{freshness === 'fresh' ? '● Synced' : freshness === 'syncing' ? '● Syncing' : '⚠ Drift Detected'}</span>
              </span>
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
              <button type="button" className="btn btn-primary" onClick={openConnectorModal}>+ Add Connector</button>
            </div>
            {connModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConnModal(null)}>
                <div ref={connTrap} className="content-card" style={{ maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Configure connector">
                  <div className="card-head">
                    <span className="card-title">Configure connector</span>
                    <button className="btn-xs" onClick={() => setConnModal(null)}>Close ✕</button>
                  </div>
                  <label style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                    Name
                    <input
                      autoFocus
                      className="doc-title-input"
                      style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}
                      value={connModal.name}
                      onChange={(e) => setConnModal({ ...connModal, name: e.target.value })}
                      aria-label="Connector name"
                      maxLength={60}
                    />
                  </label>
                  <label style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                    Type
                    <select
                      className="theme-select"
                      style={{ width: '100%', marginTop: 4 }}
                      value={connModal.kind}
                      onChange={(e) => setConnModal({ ...connModal, kind: e.target.value })}
                      aria-label="Connector type"
                    >
                      {['Kubernetes', 'OpenAPI', 'Terraform', 'Custom'].map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>
                    {connModal.kind === 'Kubernetes' ? 'Cluster (namespace defaults to default)'
                      : connModal.kind === 'OpenAPI' ? 'Spec path (e.g. checkout-service/openapi.yaml)'
                      : connModal.kind === 'Terraform' ? 'Workspace'
                      : 'Detail'}
                    <input
                      className="doc-title-input"
                      style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}
                      value={connModal.target}
                      onChange={(e) => setConnModal({ ...connModal, target: e.target.value })}
                      aria-label="Connector target"
                      placeholder={connModal.kind === 'Kubernetes' ? 'us-east-1-prod' : connModal.kind === 'OpenAPI' ? 'service/openapi.yaml' : connModal.kind === 'Terraform' ? 'default' : 'anything…'}
                    />
                  </label>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
                    No credentials needed — connectors poll public or local specs. Secrets are never collected here.
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-xs" onClick={() => setConnModal(null)}>Cancel</button>
                    <button className="btn-xs btn-xs-primary" onClick={saveConnector} disabled={!connModal.name.trim()} title={connModal.name.trim() ? 'Save connector' : 'Name the connector first'}>
                      Save connector
                    </button>
                  </div>
                </div>
              </div>
            )}
            {connectors.length === 0 && (
              <div className="callout-block">No connectors. Add Kubernetes, OpenAPI or Terraform to start live sync.</div>
            )}
            {connectors.map((c) => (
              <div
                key={c.id}
                className="connector-row"
                style={c.status === 'drift' ? { borderColor: 'var(--accent-amber)', background: 'var(--accent-amber-bg)' } : undefined}
              >
                <div className="connector-main" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="connector-icon-box">{c.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{c.name}</div>
                    <div className="connector-detail" style={{ fontSize: '11px', fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>{c.detail}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span
                    className="badge-count"
                    style={{ background: 'var(--bg-panel-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-panel)' }}
                    title="Not verified against a real provider — form details only"
                  >
                    ○ {connectorDisplayStatus(c.status)}
                  </span>
                  <HonestyBadge label={DEMO} tone="demo" title="Illustrative connector — no live provider connection exists" />
                  <button className="btn-xs" onClick={() => retryConnector(c.id)} title="Retry sync">Retry</button>
                  <button className="btn-xs" onClick={() => removeConnector(c.id)} title="Remove (click twice)">{armRemove === c.id ? 'Sure?' : '✕'}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="content-card">
            <div className="card-head">
              <span className="card-title">Live Schema &amp; Topology Drift ({activeDrift.length})</span>
              <button type="button" className="btn btn-primary" onClick={runResync} disabled={freshness === 'syncing'} title="Simulated re-sync — no real connector run">
                {syncLabel} · {DEMO}
              </button>
            </div>
            {syncProgress !== null && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-panel-subtle)', overflow: 'hidden' }} role="progressbar" aria-valuenow={syncProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Re-sync progress">
                  <div style={{ width: `${syncProgress}%`, height: '100%', background: 'var(--accent-cyan, #2563EB)', transition: 'width 180ms' }} />
                </div>
                <button type="button" className="btn-xs" onClick={cancelResync}>Cancel</button>
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
                    <span role="cell" style={{ fontWeight: 700 }}>{row.service}
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)' }}>{row.source}</div>
                    </span>
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
