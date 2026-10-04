import { useMemo, useState } from 'react';
import { mockPRs } from '../mocks';
import { useDiagram } from '../useDiagram';
import { copyText } from '../clipboard';

export default function GitScreen() {
  const store = useDiagram();
  const { nodes, edges, pushToast, pushLog, healOrphan, pruneWire, tagCheckpoint, freshness } = store;

  const [selectedPR, setSelectedPR] = useState(mockPRs[0].id);
  const [endpoint, setEndpoint] = useState('POST /api/v1/sync');
  const [body, setBody] = useState('{\n  "diagramId": "checkout-event-driven-mesh",\n  "branch": "feature/mesh-v2"\n}');
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [responseJson, setResponseJson] = useState<string>(JSON.stringify({ status: 'idle', hint: 'Simulated worker — Send runs a local mock, no network call' }, null, 2));
  const [history, setHistory] = useState<string[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  const pr = mockPRs.find((p) => p.id === selectedPR) ?? mockPRs[0];

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach((n) => m.set(n.id, 0));
    edges.forEach((e) => {
      m.set(e.from, (m.get(e.from) ?? 0) + 1);
      if (e.to) m.set(e.to, (m.get(e.to) ?? 0) + 1);
    });
    return m;
  }, [nodes, edges]);
  const orphans = nodes.filter((n) => (degree.get(n.id) ?? 0) === 0 || n.isOrphan).length;
  const dangling = edges.filter((e) => !e.to || e.isDangling).length;
  // Spec gating checks: schema, linter (blocks merge), drift verification.
  const liveChecks = [
    { name: 'Schema Validation Check (.arch JSON integrity)', pass: nodes.length > 0, detail: nodes.length > 0 ? 'Passed' : 'Failed — canvas is empty' },
    { name: `Architecture Linter Check (${orphans} orphans, ${dangling} dangling — zero required)`, pass: orphans === 0 && dangling === 0, detail: orphans === 0 && dangling === 0 ? 'Passed' : 'Failed (Blocks Merge)' },
    { name: 'Drift Verification Check (no unacknowledged upstream changes)', pass: freshness !== 'drift', detail: freshness === 'drift' ? 'Failed — re-sync on Living tab' : 'Passed' },
  ];
  const canMerge = liveChecks.every((c) => c.pass);
  const mergeTooltip = canMerge ? 'Merge this diagram PR (simulated)' : 'Resolve failing lint/drift issues on Canvas before merging';

  const handleExecute = () => {
    try {
      JSON.parse(body);
      setBodyError(null);
    } catch {
      setBodyError('Invalid JSON body — fix syntax before sending');
      return;
    }
    if (executing) return;
    setExecuting(true);
    const started = performance.now();
    setResponseJson('// Invoking CI/CD webhook worker (simulated)…');
    window.setTimeout(() => {
      const latency = Math.round(performance.now() - started + 12);
      const [method, path] = endpoint.split(' ');
      const payload = {
        status: 'SUCCESS (simulated — no network call)',
        engine: 'ArchFlux-Deterministic-Core (mock)',
        method,
        endpoint: path,
        latencyMs: latency,
        cluster: 'us-east-1-prod',
        driftEvaluated: orphans + dangling === 0 ? 'NONE' : `${orphans + dangling} issues`,
        nodesSynced: nodes.length,
        edgesSynced: edges.length,
        timestamp: new Date().toISOString(),
      };
      setResponseJson(JSON.stringify(payload, null, 2));
      setLastLatency(latency);
      setHistory((h) => [`${endpoint} → 200 (${latency}ms)`, ...h].slice(0, 5));
      setExecuting(false);
      pushToast(`REST API response 200 OK — ${latency}ms (simulated)`);
    }, 350);
  };

  const copyCurl = () => {
    const [method, path] = endpoint.split(' ');
    const minBody = (() => {
      try {
        return JSON.stringify(JSON.parse(body));
      } catch {
        return '{}';
      }
    })();
    const cmd = `curl -X ${method} "https://api.archflux.internal${path}" -H "Content-Type: application/json" -d '${minBody}'`;
    void copyText(cmd).then((ok) => pushToast(ok ? 'cURL copied to clipboard' : 'Copy unavailable here — select the command manually'));
  };

  return (
    <div className="screen-view active">
      <div className="screen-content-wrapper">
        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">GitHub Pull Request Previews</span>
              <span className="badge-count cyan">{mockPRs.length} open</span>
            </div>
            <div className="card-sub">
              Diagrams live as <code>.arch</code> files inside git repositories with automated visual PR review checks. Live graph: {nodes.length} nodes / {edges.length} edges.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {mockPRs.map((p) => (
                <button key={p.id} className={`btn-xs${p.id === selectedPR ? ' btn-xs-primary' : ''}`} onClick={() => setSelectedPR(p.id)}>
                  #{p.id}
                </button>
              ))}
            </div>
            <div className="pr-visual-diff-card">
              <div className="pr-visual-head">
                <span>{pr.title}</span>
                {(() => {
                  const failing = pr.checks.some((c) => !c.pass);
                  return (
                    <span className="badge-count" style={{ background: failing ? '#FEF3C7' : '#DCFCE7', color: failing ? '#D97706' : '#16A34A' }}>
                      {pr.status}
                    </span>
                  );
                })()}
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  feature/mesh-v2 → main • Ravi Kumar • Changed File: {pr.file}
                </div>
                <div style={{ background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: '6px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontFamily: 'var(--mono-font)', marginBottom: '6px' }}>{pr.summary}</div>
                  {pr.diff.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: d.kind === 'add' ? '#16A34A' : d.kind === 'del' ? '#DC2626' : '#D97706' }}>{d.text}</div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>PR checks at open time (static snapshot)</div>
                  {pr.checks.map((c) => (
                    <div key={c.name} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: c.pass ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                      {c.pass ? '✓' : '✗'} {c.name}
                    </div>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 700, margin: '8px 0 4px' }}>Automated Gating Checks (live canvas state)</div>
                  {liveChecks.map((c) => (
                    <div key={c.name} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: c.pass ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                      {c.pass ? '✓' : '✗'} {c.name} — {c.detail}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      className="btn-xs btn-xs-primary"
                      disabled={!canMerge}
                      title={mergeTooltip}
                      onClick={() => {
                        if (!canMerge) {
                          pushToast('Merge blocked: resolve lint/drift issues first');
                          return;
                        }
                        tagCheckpoint(`merge-pr-${pr.id}`);
                        pushLog(`Merged PR #${pr.id} (simulated) → checkpoint tagged`);
                        pushToast(`Merged PR #${pr.id}: checkpoint tagged`);
                      }}
                    >
                      {canMerge ? 'Merge Diagram PR (simulated)' : 'Merge Diagram PR — blocked'}
                    </button>
                    {!canMerge && (
                      <>
                        <button className="btn-xs" onClick={() => healOrphan()}>Auto-bind orphan</button>
                        <button className="btn-xs" onClick={() => pruneWire()}>Prune wire</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">REST & Automation Sandbox</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {lastLatency !== null && <span className="badge-count cyan">200 OK · {lastLatency}ms (simulated)</span>}
                <button className="btn-xs" onClick={copyCurl}>Copy cURL Command</button>
              </div>
            </div>
            <div className="card-sub">Interactive console simulating CI/CD webhook invocations.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <select className="theme-select" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} aria-label="API endpoint">
                <option>POST /api/v1/sync</option>
                <option>GET /api/v1/export</option>
                <option>POST /api/v1/lint</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={handleExecute} disabled={executing}>Send Simulated Request</button>
            </div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Request body (JSON)
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                aria-label="Request body JSON"
                style={{ width: '100%', marginTop: 4, fontFamily: 'var(--mono-font)', fontSize: 11, background: 'var(--bg-panel-subtle)', border: `1px solid ${bodyError ? 'var(--accent-rose)' : 'var(--border-panel)'}`, borderRadius: 6, padding: '8px 10px', color: 'var(--text-main)' }}
              />
            </label>
            {bodyError && <div role="alert" style={{ color: 'var(--accent-rose)', fontSize: 12, marginBottom: 8 }}>{bodyError}</div>}
            <div className="diff-terminal" id="apiOutputTerminal">{responseJson}</div>
            {history.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Recent calls</div>
                {history.map((h, i) => <div key={i} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>{h}</div>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
