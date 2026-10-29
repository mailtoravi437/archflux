import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../components/states';
import { useNavigate } from 'react-router-dom';
import ImportWarnings from '../components/ImportWarnings';
import { NOT_CONNECTED, connectorDisplayStatus } from '../lib/honesty';
import type { Connector } from '../types';
import { useDiagram } from '../state/useDiagram';
import { PageHeader } from '../components/PageHeader';
import { useFocusTrap } from '../hooks/useFocusTrap';

const CONNECTORS_KEY = 'archflux:connectors:v1';

function loadConnectors(): Connector[] {
  try {
    const raw = localStorage.getItem(CONNECTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
  } catch {
    return [];
  }
}

/** Sync.dc.html (SC-32): drift pill colours (text and background meet 4.5:1). */
const DRIFT_PILL = {
  orphan: { label: 'Isolated', bg: '#FEF3C7', fg: '#92400E' },
  dangle: { label: 'Dangling', bg: '#FDE8E8', fg: '#B91C1C' },
} as const;

interface DriftRow {
  id: string;
  kind: 'orphan' | 'dangle';
  name: string;
  reason: string;
  /** Node to open on the canvas. */
  refId: string;
  /** Dangling route to remove. */
  edgeId?: string;
}

const SOURCE_KINDS: { label: string; kind: string }[] = [
  { label: 'Kubernetes cluster', kind: 'Kubernetes' },
  { label: 'OpenAPI contract', kind: 'OpenAPI' },
  { label: 'Terraform state', kind: 'Terraform' },
];

export default function LivingScreen() {
  const navigate = useNavigate();
  const store = useDiagram();
  const { resync, exportArch, exportSVG, exportCSV, importArch, pushToast, pushLog, pruneWire, syncLog, freshness, syncError, nodes, edges, isOnline, panToNode } = store;

  const [connectors, setConnectors] = useState<Connector[]>(loadConnectors);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<{ fileName: string; warnings: string[] } | null>(null);
  const [armRemove, setArmRemove] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  // Last re-sync that actually synced something. No live source exists in R1, so an attempt
  // never counts: this stays "Never" (the attempt itself is logged in Activity). FE-Q7.
  const lastResync = 'Never';

  const persistConnectors = (next: Connector[]) => {
    setConnectors(next);
    try {
      localStorage.setItem(CONNECTORS_KEY, JSON.stringify(next));
    } catch {
      /* quota ignore */
    }
  };

  // Drift is derived from the canvas only (isolated elements, dangling routes); no connector run exists
  // yet (FE-M4). Dismissing hides a row for this browser session (sessionStorage), so navigating away
  // and back does not resurrect it.
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
  const driftRows = useMemo(() => {
    const deg = new Map<string, number>();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      if (e.to) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    });
    const rows: DriftRow[] = [];
    nodes
      .filter((n) => (deg.get(n.id) ?? 0) === 0 || n.isOrphan)
      .forEach((n) => rows.push({ id: `lint-orphan-${n.id}`, kind: 'orphan', name: n.label, reason: 'No routes in or out', refId: n.id }));
    edges
      .filter((e) => !e.to || e.isDangling)
      .forEach((e) => rows.push({
        id: `lint-dangle-${e.id}`,
        kind: 'dangle',
        name: `${nodes.find((n) => n.id === e.from)?.label ?? e.from} \u2192 ?`,
        reason: 'Route has no target',
        refId: e.from,
        edgeId: e.id,
      }));
    return rows.filter((r) => !ackDrift.includes(r.id));
  }, [nodes, edges, ackDrift]);

  const statusText = syncError ? 'Sync failed'
    : freshness === 'syncing' ? 'Syncing\u2026'
    : freshness === 'fresh' ? 'In sync'
    : freshness === 'drift' ? 'Drift detected'
    : NOT_CONNECTED;
  const statusDot = syncError || freshness === 'drift' ? '#D97706' : freshness === 'fresh' ? '#15803D' : '#8A93A3';

  const runResync = () => {
    if (freshness === 'syncing') return;
    // resync() is synchronous and honest: with no connected source it only logs
    // "No re-sync: no live source is connected". No progress bar for work that is not running.
    resync();
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

  const openConnectorModal = (kind = 'Kubernetes') => {
    setConnModal({ name: `Custom Connector ${connectors.length + 1}`, kind, target: '' });
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
      Kubernetes: { detail: `cluster: ${target || 'default'} | ns: default`, icon: '☸️' },
      OpenAPI: { detail: `${target || 'openapi.yaml'} (unversioned)`, icon: '📄' },
      Terraform: { detail: `workspace: ${target || 'default'}`, icon: '🛠️' },
      Custom: { detail: target || 'manual • just added', icon: '🔌' },
    };
    const conf = byKind[connModal.kind] ?? byKind.Custom;
    const id = `c-${Date.now().toString(36)}`;
    persistConnectors([
      ...connectors,
      { id, name, detail: conf.detail, icon: conf.icon, status: 'saved', statusLabel: `○ ${NOT_CONNECTED}` },
    ]);
    setConnModal(null);
    // Saved as configuration only: nothing is polled or verified (HON-R2).
    pushToast('Source saved. Not connected: no provider is verified yet.');
    pushLog(`Source saved: ${name} (${connModal.kind}), not connected`);
  };

  const jumpToRef = (refId: string) => {
    navigate('/canvas');
    // Let the route render before panning.
    window.setTimeout(() => panToNode(refId), 60);
  };

  // Bind: open the element on the canvas so the user connects it. It never invents a route.
  const bindRow = (row: DriftRow) => {
    ackLintRow(row.id);
    pushLog(`Drift row opened on canvas: ${row.id}`);
    jumpToRef(row.refId);
  };
  // Remove: delete the dangling route (undoable on the canvas).
  const removeRow = (row: DriftRow) => {
    if (row.edgeId) pruneWire(row.edgeId);
  };
  const dismissRow = (row: DriftRow) => {
    ackLintRow(row.id);
    pushToast('Drift row dismissed (fix it on canvas when ready)');
  };

  const onImportFile = (f: File | undefined) => {
    if (!f) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const result = importArch(parsed);
        if (!result.imported) {
          setImportError('Import rejected — previous diagram unchanged');
          return; // hard failure: nothing imported, toast already shown
        }
        if (result.warnings.length > 0) {
          setImportWarnings({ fileName: f.name, warnings: result.warnings });
        } else {
          setImportWarnings(null);
          pushToast(`Imported ${f.name} — ${parsed.nodes?.length ?? 0} nodes loaded`);
        }
        navigate('/canvas');
      } catch {
        setImportError('Invalid JSON — expected { nodes[], edges[] }');
        pushToast('Import failed: invalid .arch JSON');
      }
    };
    reader.readAsText(f);
  };

  return (
    <div className="screen-view active libpage-screen">
      <div className="libpage-page">
        <div className="libpage-content">
          <PageHeader
            title="Sync"
            subtitle="Compare this diagram with what is running. Connect a source to detect drift."
            actions={
              <>
                <button type="button" className="libpage-btn libpage-btn--secondary" onClick={runResync} disabled={freshness === 'syncing'} title="No live source yet: re-sync reports Not connected">Re-sync</button>
                <button type="button" className="libpage-btn libpage-btn--primary" onClick={() => openConnectorModal()}>Add source</button>
              </>
            }
          />

          {!isOnline && (
            <div className="syncpage-notice" role="alert">
              <strong>You are offline.</strong> Re-sync is paused until the connection returns. Nothing is lost.
            </div>
          )}
          {syncError && (
            <div className="syncpage-notice" role="alert" aria-label="Sync failed">
              <strong>Sync failed.</strong>
              <span style={{ fontSize: 12, flexGrow: 1 }}>{syncError}</span>
              <button type="button" className="btn btn--sm btn--primary" onClick={runResync} disabled={freshness === 'syncing'}>Retry sync</button>
            </div>
          )}

          <div className="syncpage-stats" data-testid="sync-stats">
            <div className="syncpage-stat"><span className="syncpage-stat__label">Status</span><span className="syncpage-stat__value"><span className="syncpage-dot" style={{ background: statusDot }} aria-hidden="true" />{statusText}</span></div>
            <div className="syncpage-stat"><span className="syncpage-stat__label">Sources</span><span className="syncpage-stat__value">{connectors.length}</span></div>
            <div className="syncpage-stat"><span className="syncpage-stat__label">Mapped services</span><span className="syncpage-stat__value">{nodes.length}</span></div>
            <div className="syncpage-stat"><span className="syncpage-stat__label">Last re-sync</span><span className="syncpage-stat__value">{lastResync}</span></div>
          </div>

          <div className="syncpage-grid">
            <section className="syncpage-card syncpage-card--wide">
              <div className="syncpage-card__head">
                <h2>Drift</h2>
                <span className="syncpage-card__hint">Derived from the canvas until a source is connected</span>
              </div>
              {driftRows.length === 0 ? (
                <EmptyState
                  title="No drift on the canvas"
                  body="Every element has a route in or out, and every route has a target. Nothing is compared with a running system until a source is connected."
                />
              ) : (
                driftRows.map((row) => (
                  <div key={row.id} className="syncpage-drift" data-testid={`drift-row-${row.id}`}>
                    <span className="syncpage-pill" style={{ background: DRIFT_PILL[row.kind].bg, color: DRIFT_PILL[row.kind].fg }}>{DRIFT_PILL[row.kind].label}</span>
                    <span className="syncpage-drift__name">{row.name}</span>
                    <span className="syncpage-drift__reason">{row.reason}</span>
                    {row.kind === 'orphan' ? (
                      <button type="button" className="syncpage-btn" onClick={() => bindRow(row)} title="Open on the canvas to connect it">Bind</button>
                    ) : (
                      <button type="button" className="syncpage-btn" onClick={() => removeRow(row)} title="Delete this route (undo on the canvas)">Remove</button>
                    )}
                    <button type="button" className="syncpage-btn syncpage-btn--ghost" onClick={() => dismissRow(row)}>Dismiss</button>
                  </div>
                ))
              )}
            </section>

            <section className="syncpage-card">
              <h2>Sources</h2>
              {connectors.length === 0 && (
                <p className="syncpage-muted" data-testid="connectors-empty">No sources yet. Record where this diagram&apos;s truth lives.</p>
              )}
              {connectors.map((c) => (
                <div key={c.id} className="connector-row syncpage-source">
                  <span className="syncpage-source__head">
                    <span className="syncpage-source__name">{c.name}</span>
                    <span className="syncpage-source__state" title="Not verified against a real provider: form details only">
                      <span className="syncpage-dot syncpage-dot--sm" style={{ background: '#8A93A3' }} aria-hidden="true" />
                      {connectorDisplayStatus(c.status)}
                    </span>
                  </span>
                  <span className="syncpage-source__detail syncpage-code">{c.detail}</span>
                  <span className="syncpage-muted" style={{ fontSize: 12 }}>Saved as configuration only. No provider check has run.</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="syncpage-btn syncpage-btn--sm" onClick={() => removeConnector(c.id)} title="Remove (click twice)" aria-label={`Remove ${c.name}`}>{armRemove === c.id ? 'Sure?' : 'Remove'}</button>
                  </span>
                </div>
              ))}
              {SOURCE_KINDS.map((k) => (
                <button key={k.kind} type="button" className="syncpage-dashed" onClick={() => openConnectorModal(k.kind)}>{k.label}</button>
              ))}
            </section>
          </div>

          <section className="syncpage-card syncpage-card--row">
            <h2 style={{ flexGrow: 1 }}>Files</h2>
            <button type="button" className="syncpage-btn syncpage-btn--md" onClick={() => exportArch()}>Download .arch</button>
            <button type="button" className="syncpage-btn syncpage-btn--md" onClick={() => exportSVG()}>SVG</button>
            <button type="button" className="syncpage-btn syncpage-btn--md" onClick={() => exportCSV()}>CSV</button>
            <button type="button" className="syncpage-btn syncpage-btn--md" onClick={() => importInput.current?.click()}>Import .arch</button>
            <input ref={importInput} type="file" accept=".arch,.json,application/json" hidden tabIndex={-1} aria-hidden="true" onChange={(e) => { onImportFile(e.target.files?.[0]); e.target.value = ''; }} />
          </section>
          {importError && <div role="alert" style={{ color: 'var(--accent-rose)', fontSize: 12 }}>{importError}</div>}
          {importWarnings && (
            <ImportWarnings fileName={importWarnings.fileName} warnings={importWarnings.warnings} onClose={() => setImportWarnings(null)} />
          )}

          <section className="syncpage-card" aria-label="Activity">
            <div className="syncpage-card__head" style={{ justifyContent: 'flex-start', gap: 8 }}>
              <h2>Activity</h2>
              <span className="syncpage-card__hint">Newest first</span>
            </div>
            {syncLog.length === 0 && <p className="syncpage-muted">No re-sync attempts yet.</p>}
            {syncLog.map((l) => (
              <div key={l.id} className="syncpage-log syncpage-code"><span>{l.text}</span><span className="syncpage-muted">{l.time}</span></div>
            ))}
          </section>
        </div>
      </div>
      {connModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConnModal(null)}>
          <div ref={connTrap} className="content-card" style={{ maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add source">
            <div className="card-head">
              <span className="card-title">Add source</span>
              <button className="btn btn--sm btn--secondary" onClick={() => setConnModal(null)}>Close ✕</button>
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
              No credentials needed. Secrets are never collected here. Saving records the source only; nothing is checked.
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn btn--sm btn--secondary" onClick={() => setConnModal(null)}>Cancel</button>
              <button className="btn btn--sm btn--primary" onClick={saveConnector} disabled={!connModal.name.trim()} title={connModal.name.trim() ? 'Save connector' : 'Name the connector first'}>
                Save connector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
