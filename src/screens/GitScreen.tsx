import { useMemo, useState } from 'react';
import HonestyBadge from '../components/HonestyBadge';
import { SAMPLE, SIMULATED } from '../honesty';
import { mockPRs, type PRItem } from '../mocks';
import { useDiagram } from '../useDiagram';
import { copyText } from '../clipboard';
import { api } from '../api';

const GIT_BRANCH_KEY = 'archflux:git-branch:v1';

const MERGED_KEY = 'archflux:merged-prs:v1';

// Session-scoped per MRG-R6: survives reloads within the tab session,
// resets when the session ends. sessionStorage (not localStorage).
function loadMerged(): string[] {
  try {
    const raw = sessionStorage.getItem(MERGED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function persistMerged(next: string[]) {
  try {
    sessionStorage.setItem(MERGED_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function deriveCheckpointPRs(checkpoints: { id: string; title: string; meta: string; active?: boolean; badge?: string; nodes: { label: string; tag: string }[]; edges: unknown[] }[]): PRItem[] {
  return checkpoints.map((cp) => ({
    id: `cp-${cp.id}`,
    title: `PR: ${cp.title}`,
    status: cp.active ? '✓ Checks Passed' : '○ Draft',
    file: 'canvas (local checkpoint)',
    summary: `${cp.nodes.length}n • ${cp.edges.length}e — ${cp.meta}`,
    note: cp.badge ?? '',
    branch: 'canvas → main',
    checks: [
      { name: 'arch-lint (snapshot)', pass: true },
      { name: 'schema-validate (.arch JSON)', pass: true },
    ],
    diff: cp.nodes.slice(0, 8).map((n) => ({ kind: 'add' as const, text: `+ service: ${n.label} (${n.tag})` })),
  }));
}

export default function GitScreen() {
  const store = useDiagram();
  const { nodes, edges, pushToast, pushLog, healOrphan, pruneWire, tagCheckpoint, freshness, checkpoints } = store;

  // PRs are derived from checkpoint history (newest first), then curated mocks.
  const allPRs: PRItem[] = useMemo(() => {
    return [...deriveCheckpointPRs(checkpoints), ...mockPRs];
  }, [checkpoints]);
  const [merged, setMerged] = useState<string[]>(loadMerged);
  const withMergeStatus = (p: PRItem): PRItem =>
    merged.includes(p.id) ? { ...p, status: '✓ Merged' } : p;

  const [selectedPR, setSelectedPR] = useState(allPRs[0]?.id ?? mockPRs[0].id);

  // Server branch filter (MRG-R8–R10): re-query checkpoints by branch.
  // Local docs (doc-* ids) have no server counterpart — show the hint instead.
  const { activeDocId } = store;
  const serverDiagramId =
    activeDocId && !activeDocId.startsWith('doc-') ? activeDocId : null;
  const [branchSel, setBranchSel] = useState<string>(() => {
    try {
      return localStorage.getItem(GIT_BRANCH_KEY) ?? 'main';
    } catch {
      return 'main';
    }
  });
  const [branchCps, setBranchCps] = useState<{ id: string; title: string; meta?: string; branch?: string }[] | null>(null);
  const [branchLoading, setBranchLoading] = useState(false);
  const loadBranch = (branch: string) => {
    if (!serverDiagramId) return;
    setBranchLoading(true);
    api
      .listCheckpoints(serverDiagramId, branch)
      .then(
        ({ data }) => {
          setBranchCps(Array.isArray(data) ? data : []);
          try {
            localStorage.setItem(GIT_BRANCH_KEY, branch);
          } catch {
            /* ignore */
          }
        },
        () => setBranchCps([]),
      )
      .finally(() => setBranchLoading(false));
  };
  const [endpoint, setEndpoint] = useState('POST /api/v1/sync');
  const [body, setBody] = useState('{\n  "diagramId": "checkout-event-driven-mesh",\n  "branch": "feature/mesh-v2"\n}');
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [responseJson, setResponseJson] = useState<string>(JSON.stringify({ status: 'idle', hint: 'Simulated worker — Send runs a local mock, no network call' }, null, 2));
  const [history, setHistory] = useState<string[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  const pr = withMergeStatus(allPRs.find((p) => p.id === selectedPR) ?? allPRs[0]);

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
  const failingChecks = liveChecks.filter((c) => !c.pass).map((c) => c.name);
  const mergeTooltip = canMerge
    ? 'Merge this diagram PR (simulated)'
    : `Blocked by: ${failingChecks.join('; ')} — resolve on Canvas before merging`;

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

  // Redact secret-bearing keys before the command leaves the browser (MRG-R4).
  const redactSecrets = (json: string): string => {
    try {
      const parsed = JSON.parse(json) as unknown;
      const scrub = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(scrub);
        if (v && typeof v === 'object') {
          return Object.fromEntries(
            Object.entries(v as Record<string, unknown>).map(([k, val]) => [
              k,
              /token|secret|password|api[-_]?key/i.test(k) ? '•••redacted•••' : scrub(val),
            ]),
          );
        }
        return v;
      };
      return JSON.stringify(scrub(parsed));
    } catch {
      return '{}';
    }
  };

  const copyCurl = () => {
    const [method, path] = endpoint.split(' ');
    const minBody = redactSecrets(body);
    const cmd = `curl -X ${method} "https://api.archflux.internal${path}" -H "Content-Type: application/json" -d '${minBody}'`;
    void copyText(cmd).then((ok) => pushToast(ok ? 'cURL copied to clipboard (secrets redacted)' : 'Copy unavailable here — select the command manually'));
  };

  return (
    <div className="screen-view active">
      <div className="screen-content-wrapper">
        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">GitHub Pull Request Previews</span>
              <span className="badge-count cyan">{allPRs.length} open</span>
            </div>
            <div className="card-sub">
              Diagrams live as <code>.arch</code> files inside git repositories with automated visual PR review checks. Live graph: {nodes.length} nodes / {edges.length} edges.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {allPRs.map((p) => (
                <button key={p.id} className={`btn-xs${p.id === selectedPR ? ' btn-xs-primary' : ''}`} onClick={() => setSelectedPR(p.id)} title={p.title}>
                  {p.id.startsWith('cp-') ? '◈' : '#'}
                  {p.id.startsWith('cp-') ? p.title.replace(/^PR:\s*/, '').slice(0, 18) : p.id}
                  {merged.includes(p.id) ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <div className="pr-visual-diff-card">
              <div className="pr-visual-head">
                <span>{pr.title}</span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {!pr.id.startsWith('cp-') && (
                  <HonestyBadge label={SAMPLE} tone="neutral" title="Curated example — cannot be merged for real" />
                )}
                {(() => {
                  const failing = pr.checks.some((c) => !c.pass);
                  return (
                    <span className="badge-count" style={{ background: failing ? '#FEE2E2' : '#DCFCE7', color: failing ? '#DC2626' : '#16A34A', fontWeight: 700 }} aria-label={failing ? 'Checks failed' : 'Checks passed'}>
                      {pr.status} — {failing ? 'BLOCKED' : 'READY'}
                    </span>
                  );
                })()}
                </span>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  feature/mesh-v2 → main • Ravi Kumar • Changed File: {pr.file}
                </div>
                <div style={{ background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: '6px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontFamily: 'var(--mono-font)', marginBottom: '6px' }}>{pr.summary}</div>
                  {pr.diff.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: d.kind === 'add' ? '#16A34A' : d.kind === 'del' ? '#DC2626' : '#CA8A04' }} aria-label={d.kind === 'add' ? 'Added' : d.kind === 'del' ? 'Removed' : 'Modified'}><span aria-hidden="true">{d.kind === 'add' ? '+ ' : d.kind === 'del' ? '- ' : '~ '}</span>{d.text}</div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>PR checks at open time (static snapshot)</div>
                  {pr.checks.map((c) => (
                    <div key={c.name} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: c.pass ? '#16A34A' : '#DC2626' }} aria-label={c.pass ? 'Check passed' : 'Check failed'}>
                      <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> <strong>{c.pass ? 'PASSED' : 'FAILED'}</strong> — {c.name}
                    </div>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 700, margin: '8px 0 4px' }}>Automated Gating Checks (live canvas state)</div>
                  {liveChecks.map((c) => (
                    <div key={c.name} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: c.pass ? '#16A34A' : '#DC2626' }} aria-label={c.pass ? 'Passed check' : 'Failed check'}>
                      <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> <strong>{c.pass ? 'PASSED' : 'FAILED'}</strong> — {c.name} — {c.detail}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <HonestyBadge label={SIMULATED} tone="demo" title="Merge tags a local checkpoint only — no server call occurs" />
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
                        if (!merged.includes(pr.id)) {
                          const next = [...merged, pr.id];
                          setMerged(next);
                          persistMerged(next);
                        }
                        pushLog(`Merged PR #${pr.id} (simulated) → checkpoint tagged`);
                        pushToast(`Merged PR #${pr.id}: checkpoint tagged`);
                      }}
                    >
                      {merged.includes(pr.id)
                        ? '✓ Merged'
                        : canMerge ? 'Merge Diagram PR (simulated)' : 'Merge Diagram PR — blocked'}
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
          <div className="content-card" style={{ marginTop: 12 }}>
            <div className="card-head">
              <span className="card-title">Branch History ({checkpoints.length})</span>
            </div>
            <div className="card-sub">Linear commit history from version checkpoints — newest first. Active marks the applied snapshot.</div>
            {serverDiagramId ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="doc-title-input"
                    style={{ flex: 1, minWidth: 140, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                    value={branchSel}
                    onChange={(e) => setBranchSel(e.target.value)}
                    aria-label="Server branch filter"
                    placeholder="Branch (e.g. main)"
                  />
                  <button type="button" className="btn-xs btn-xs-primary" onClick={() => loadBranch(branchSel.trim() || 'main')} disabled={branchLoading}>
                    {branchLoading ? 'Loading…' : 'Load branch'}
                  </button>
                </div>
                {branchCps !== null && (
                  <div style={{ marginTop: 8 }} role="status" aria-live="polite">
                    {branchCps.length === 0 ? (
                      <div className="callout-block">No checkpoints on this branch.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {branchCps.map((cp) => (
                          <div key={cp.id} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', padding: '4px 8px', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontWeight: 700 }}>{cp.title}</span>
                            <span style={{ fontSize: 10, color: '#6D28D9', fontWeight: 700, background: '#EDE9FE', padding: '1px 4px', borderRadius: 3 }} aria-label="Remote branch checkpoint">REMOTE</span>
                            <span style={{ color: 'var(--text-muted)' }}> — {cp.branch ?? branchSel}{cp.meta ? ` • ${cp.meta}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="callout-block" style={{ marginBottom: 10 }}>
                Save this diagram to the server to filter its checkpoints by branch.
              </div>
            )}
            {checkpoints.length === 0 ? (
              <div className="callout-block">No commits yet — tag a checkpoint on the Reviews tab to start history.</div>
            ) : (
              <div className="timeline-stream">
                {checkpoints.map((cp) => (
                  <div key={cp.id} className={cp.active ? 'timeline-entry active' : 'timeline-entry'}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{cp.title}</div>
                      <span className="badge-count" style={{ background: '#EDE9FE', color: '#6D28D9', fontSize: 10, fontWeight: 700 }} aria-label="Local checkpoint">LOCAL</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono-font)' }}>{cp.meta}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <span className="badge-count cyan">{cp.nodes.length}n/{cp.edges.length}e</span>
                      {cp.active && <span className="badge-count" style={{ background: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)' }}>active</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">REST & Automation Sandbox</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <HonestyBadge label={SIMULATED} tone="demo" title="Local mock worker — Send performs no network call" />
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
