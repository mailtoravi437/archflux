import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import HonestyBadge from '../components/HonestyBadge';
import RevisionsSection from '../components/RevisionsSection';
import { SIMULATED } from '../honesty';
import { useDiagram } from '../useDiagram';
import { BlueprintThumb } from './BlueprintsScreen';
import GitScreen from './GitScreen';

type SubTab = 'discuss' | 'merge';

export interface ReviewerSlot {
  name: string;
  approved: boolean;
  /** True when approval comes from the Admin role rather than a user decision. */
  auto?: boolean;
}

/** True when the team store is empty/invalid, i.e. the sample trio shows. */
export function isSampleTeamReviewers(teamRaw: string | null): boolean {
  try {
    const team = teamRaw ? (JSON.parse(teamRaw) as { name?: string; status?: string }[]) : [];
    const active = Array.isArray(team) ? team.filter((m) => m && m.status !== 'invited' && m.name) : [];
    return active.length === 0;
  } catch {
    return true;
  }
}

export function resolveReviewers(
  teamRaw: string | null,
  decision: 'approved' | 'changes' | null,
  displayName: string,
): ReviewerSlot[] {
  if (!isSampleTeamReviewers(teamRaw)) {
    try {
      const team = JSON.parse(teamRaw as string) as { name?: string; role?: string }[];
      return (team as { name?: string; role?: string; status?: string }[])
        .filter((m) => m && m.status !== 'invited' && m.name)
        .slice(0, 3)
        .map((m) => ({
          name: String(m.name),
          approved: m.role === 'Admin' ? true : decision === 'approved',
          auto: m.role === 'Admin' ? true : undefined,
        }));
    } catch {
      /* fall through to static trio */
    }
  }
  return [
    { name: 'Elena R.', approved: true },
    { name: 'Marcus T.', approved: decision === 'approved' },
    { name: displayName.trim() || 'You', approved: decision === 'approved' },
  ];
}

export default function ReviewsScreen() {
  const { threads, addThread, replyThread, toggleResolveThread, deleteThread, displayName, setDisplayName, checkpoints, tagCheckpoint, restoreCheckpoint, deleteCheckpoint, createBranch, branchError, retryBranch, nodes, panToNode, pushToast, pushLog, docs, activeDocId } = useDiagram();
  const navigate = useNavigate();
  const location = useLocation();
  // Merge & Automation (ex-#/git) lives here as a sub-tab; deep links and
  // the ⌘G shortcut arrive via location.state. Derive directly during render
  // instead of using state + effect (avoids setState-in-effect lint warning).
  const subTab: SubTab = (() => {
    const tab = (location.state as { tab?: SubTab } | null)?.tab;
    return (tab === 'merge' || tab === 'discuss') ? tab : 'discuss';
  })();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [newText, setNewText] = useState('');
  const [newPin, setNewPin] = useState(nodes[0]?.id ?? '');
  const [cpTitle, setCpTitle] = useState('');
  const [branchName, setBranchName] = useState('');
  const [compareA, setCompareA] = useState(checkpoints[0]?.id ?? '');
  const [compareB, setCompareB] = useState(checkpoints[1]?.id ?? checkpoints[0]?.id ?? '');
  const [decision, setDecision] = useState<'approved' | 'changes' | null>(null);

  // Reviewer slots come from Team settings (archflux:team:v1) — Admins arrive
  // pre-approved. Falls back to the static trio when the team list is empty.
  const teamRaw = (() => {
    try {
      return localStorage.getItem('archflux:team:v1');
    } catch {
      return null;
    }
  })();
  const reviewers = resolveReviewers(teamRaw, decision, displayName);
  const usingSampleReviewers = isSampleTeamReviewers(teamRaw);

  // Guards against stale ids when nodes/checkpoints change underneath.
  const effectivePin = nodes.some((n) => n.id === newPin) ? newPin : (nodes[0]?.id ?? '');
  const cpA = checkpoints.find((c) => c.id === compareA) ?? checkpoints[0];
  const cpB = checkpoints.find((c) => c.id === compareB) ?? checkpoints[0];
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [armThread, setArmThread] = useState<string | null>(null);
  // Resolved threads render collapsed; explicit false reopens. Open threads ignore this.
  const [collapsedThreads, setCollapsedThreads] = useState<Record<string, boolean>>({});
  const isCollapsed = (t: { id: string; resolved: boolean }) =>
    t.resolved && collapsedThreads[t.id] !== false;
  // Two-click delete: arm first, confirm within 3s. Checkpoint deletion
  // has no undo, so it must never fire on a stray click.
  const [armDelete, setArmDelete] = useState<string | null>(null);

  const requestDeleteCheckpoint = (id: string) => {
    if (armDelete === id) {
      setArmDelete(null);
      deleteCheckpoint(id);
    } else {
      setArmDelete(id);
      window.setTimeout(() => setArmDelete((cur) => (cur === id ? null : cur)), 3000);
    }
  };

  const jumpToNode = (nodeId: string) => {
    navigate('/canvas');
    if (nodeId === '__canvas') return; // canvas-area pin: canvas itself is the context
    if (!nodes.some((n) => n.id === nodeId)) {
      pushToast('Pinned node no longer on canvas (detached)');
      return;
    }
    // Let the route render before panning.
    window.setTimeout(() => panToNode(nodeId), 60);
  };

  const visible = threads.filter((t) => (filter === 'all' ? true : filter === 'open' ? !t.resolved : t.resolved));

  const mentionNames = ['ravi', 'elena', 'marcus', 'priya', 'you'];

  /** Markdown-lite: **bold**, `code`, and @mention chips. */
  const renderRich = (text: string, keyPrefix: string) => {
    const parts = text.split(/(@[\w.]+|\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      const key = `${keyPrefix}-${i}`;
      if (p.startsWith('@') && p.length > 1) {
        return <span key={key} style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{p}</span>;
      }
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={key}>{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
        return <code key={key} style={{ fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', borderRadius: 4, padding: '0 4px' }}>{p.slice(1, -1)}</code>;
      }
      return <span key={key}>{p}</span>;
    });
  };

  const submitThread = () => {
    if (!effectivePin) {
      pushToast('No nodes on canvas to pin to — add services first');
      return;
    }
    if (!newText.trim()) {
      pushToast('Write a comment before posting');
      return;
    }
    addThread(effectivePin, newText);
    setNewText('');
  };

  let diffSummary: string | null = null;
  let diffLines: string[] = [];
  if (cpA && cpB) {
    if (cpA.id === cpB.id) {
      diffSummary = 'No differences — same checkpoint selected.';
    } else {
      const dn = cpA.nodes.length - cpB.nodes.length;
      const de = cpA.edges.length - cpB.edges.length;
      diffSummary = `${dn >= 0 ? '+' : ''}${dn} nodes / ${de >= 0 ? '+' : ''}${de} routes (A vs B)`;
      const idsA = new Set(cpA.nodes.map((n) => n.id));
      const idsB = new Set(cpB.nodes.map((n) => n.id));
      [...idsA].filter((id) => !idsB.has(id)).slice(0, 5).forEach((id) => diffLines.push(`+ node: ${id} (only in A)`));
      [...idsB].filter((id) => !idsA.has(id)).slice(0, 5).forEach((id) => diffLines.push(`- node: ${id} (only in B)`));
      if (diffLines.length === 0) diffLines.push('~ same node set — edge/label changes only');
    }
  }

  // Derive PR title from active document or use a default
  const activeDoc = docs.find(d => d.id === activeDocId);
  const prTitle = activeDoc ? `PR: ${activeDoc.title.replace(/\.arch$/i, '')}` : 'PR: Untitled Architecture';

  return (
    <div className="screen-view active">
      <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
        {/* Header review status bar */}
        <div className="content-card" aria-label="Review session status">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{prTitle}</strong>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-label="Reviewers">
              {reviewers.map((r) => (
                <span key={r.name} title={`${r.name}${r.approved ? (r.auto ? ' — auto-approved (Admin)' : ' — approved ✓') : ''}`} style={{ width: 26, height: 26, borderRadius: '50%', background: r.approved ? '#DCFCE7' : 'var(--bg-panel-subtle)', border: `2px solid ${r.approved ? '#16A34A' : 'var(--border-panel)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                  {r.name.charAt(0)}{r.approved ? '✓' : ''}
                </span>
              ))}
              {usingSampleReviewers && (
                <span className="badge-count" title="Sample reviewers — configure your team in Settings → Team">Sample</span>
              )}
            </div>
            <span style={{ flex: 1 }} />
            <HonestyBadge label={SIMULATED} tone="demo" title="Review decisions stay local — no server call occurs" />
            <button className="btn-xs" onClick={() => { setDecision('changes'); pushLog(`Review: requested changes on ${prTitle}`); pushToast(`Requested changes on ${prTitle}`); }}>Request Changes</button>
            <button className="btn-xs btn-xs-primary" onClick={() => { setDecision('approved'); pushLog(`Review: approved ${prTitle}`); pushToast(`Approved ${prTitle} ✓`); }}>Approve Architecture</button>
          </div>
          {decision && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }} role="status"><span>Decision recorded: {decision === 'approved' ? 'Approved ✓' : 'Changes requested'}</span><HonestyBadge label={SIMULATED} tone="demo" title="Local-only decision — no server call occurs" /></div>}
        </div>
        <nav style={{ display: 'flex', gap: 6 }} aria-label="Reviews sections">
          <button className={`btn-xs${subTab === 'discuss' ? ' btn-xs-primary' : ''}`} aria-pressed={subTab === 'discuss'} onClick={() => navigate('/reviews', { state: { tab: 'discuss' } })}>💬 Discussion & Diff</button>
          <button className={`btn-xs${subTab === 'merge' ? ' btn-xs-primary' : ''}`} aria-pressed={subTab === 'merge'} onClick={() => navigate('/reviews', { state: { tab: 'merge' } })}>🐙 Merge & Automation</button>
        </nav>
      {subTab === 'discuss' ? (
      <div className="screen-content-wrapper">
        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">Named Version Checkpoints ({checkpoints.length})</span>
            </div>
            <div className="card-sub">Deterministic visual diffing between snapshots. Tag captures current graph.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="doc-title-input"
                style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                placeholder="Checkpoint name (e.g. v2.3-candidate)…"
                value={cpTitle}
                onChange={(e) => setCpTitle(e.target.value)}
                aria-label="Checkpoint name"
              />
              <button type="button" className="btn btn-primary" onClick={() => { tagCheckpoint(cpTitle); setCpTitle(''); }}>+ Tag Checkpoint</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="doc-title-input"
                style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                placeholder="Branch name (e.g. feature/mesh-v2)…"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                aria-label="Branch name"
              />
              <button type="button" className="btn" onClick={() => { createBranch(branchName); setBranchName(''); }}>⑂ Create Branch</button>
            </div>
            {branchError && (
              <div role="alert" style={{ fontSize: 11, color: 'var(--accent-rose)', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Server branch failed: {branchError} — local branch kept.</span>
                <button type="button" className="btn-xs" onClick={retryBranch}>Retry</button>
              </div>
            )}
            <div className="timeline-stream">
              {checkpoints.length === 0 && <div className="callout-block">No checkpoints yet — tag one to capture the current graph.</div>}
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className={cp.active ? 'timeline-entry active' : 'timeline-entry'}
                  title="Checkpoint snapshot — use Restore to apply it to the canvas"
                >
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{cp.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono-font)' }}>{cp.meta}</div>
                  {cp.badge ? <span className="badge-count cyan" style={{ marginTop: '4px', display: 'inline-block' }}>{cp.badge}</span> : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <button className="btn-xs" onClick={() => restoreCheckpoint(cp.id)}>Restore</button>
                    <button
                      className="btn-xs"
                      onClick={() => requestDeleteCheckpoint(cp.id)}
                      style={armDelete === cp.id ? { borderColor: 'var(--accent-rose)', color: '#FFFFFF', background: 'var(--accent-rose)' } : { color: 'var(--accent-rose)' }}
                    >
                      {armDelete === cp.id ? 'Confirm delete' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {checkpoints.length >= 2 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border-panel)', paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Compare versions</div>
                <div className="compare-row" style={{ display: 'flex', gap: 6 }}>
                  <select
                    className="theme-select"
                    value={cpA?.id ?? ''}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCompareA(next);
                      // A = B shows nothing — nudge B to a different checkpoint.
                      if (next === compareB) {
                        const other = checkpoints.find((c) => c.id !== next);
                        if (other) setCompareB(other.id);
                      }
                    }}
                    aria-label="Compare A"
                  >
                    {checkpoints.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <select
                    className="theme-select"
                    value={cpB?.id ?? ''}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCompareB(next);
                      if (next === compareA) {
                        const other = [...checkpoints].reverse().find((c) => c.id !== next);
                        if (other) setCompareA(other.id);
                      }
                    }}
                    aria-label="Compare B"
                  >
                    {checkpoints.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                {diffSummary && <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', marginTop: 6, color: 'var(--accent-cyan)' }}>{diffSummary}</div>}
                {diffLines.map((l, i) => <div key={i} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: l.startsWith('+') ? '#16A34A' : l.startsWith('-') ? '#DC2626' : '#CA8A04' }} aria-label={l.startsWith('+') ? 'Added' : l.startsWith('-') ? 'Removed' : 'Modified'}><span aria-hidden="true">{l.startsWith('+') ? '●' : l.startsWith('-') ? '●' : '●'}</span> {l}</div>)}
                {cpA && cpB && cpA.id !== cpB.id && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }} role="group" aria-label="Visual checkpoint comparison">
                    {[
                      { cp: cpA, tag: 'A' },
                      { cp: cpB, tag: 'B' },
                    ].map(({ cp, tag }) => (
                      <div key={tag} style={{ border: '1px solid var(--border-panel)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono-font)', padding: '4px 8px', background: 'var(--bg-panel-subtle)' }}>
                          {tag} · {cp.title}
                        </div>
                        <BlueprintThumb nodes={cp.nodes} edges={cp.edges} title={`${tag}: ${cp.title}`} />
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }} aria-label="Diff legend">
                  <span><span style={{ color: '#16A34A' }} aria-hidden="true">●</span> <strong style={{ color: '#16A34A' }}>Added</strong> — new in this revision</span>
                  <span><span style={{ color: '#CA8A04' }} aria-hidden="true">●</span> <strong style={{ color: '#CA8A04' }}>Modified</strong> — label / route changed</span>
                  <span><span style={{ color: '#DC2626' }} aria-hidden="true">●</span> <strong style={{ color: '#DC2626' }}>Removed</strong> — component gone</span>
                </div>
              </div>
            )}
          </div>
          <RevisionsSection diagramId={activeDocId} />
        </div>

        <div className="column-half">
          <div className="content-card">
            <div className="card-head">
              <span className="card-title">Architecture Review Comments ({threads.length})</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'open', 'resolved'] as const).map((f) => (
                  <button key={f} className={`btn-xs${filter === f ? ' btn-xs-primary' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                ))}
              </div>
            </div>
            <div className="card-sub">Threaded discussions bound to specific nodes with resolve/reopen lifecycle.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Commenting as
                <input
                  className="doc-title-input"
                  style={{ width: 140, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
                  aria-label="Your display name"
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {nodes.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No nodes on canvas — add services before starting threads.</span>
              ) : (
                <select className="theme-select" value={effectivePin} onChange={(e) => setNewPin(e.target.value)} aria-label="Pin to node">
                  {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              )}
              <input
                className="doc-title-input"
                style={{ flex: 1, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
                placeholder="Start a thread… (supports **bold**, `code`, @mentions)"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                aria-label="New thread text"
                list="mention-names"
              />
              <datalist id="mention-names">
                {mentionNames.map((m) => <option key={m} value={`@${m} `} />)}
              </datalist>
              <button className="btn btn-primary" onClick={submitThread}>Post</button>
            </div>
            {visible.length === 0 && <div className="callout-block">No threads in “{filter}”. Start the first thread pinned to a node.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {visible.map((t) => {
                const detached = t.pinnedTo !== '__canvas' && !nodes.some((n) => n.id === t.pinnedTo);
                return (
                <div key={t.id} className="lint-card" style={{ borderLeft: t.resolved ? '3px solid var(--accent-emerald)' : '3px solid var(--accent-cyan)', cursor: 'default' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (t.resolved) setCollapsedThreads((p) => ({ ...p, [t.id]: !isCollapsed(t) }));
                    }}
                    aria-expanded={!isCollapsed(t)}
                    aria-label={`${t.resolved ? 'Resolved' : 'Open'} thread by ${t.author}${t.resolved ? ' — activate to expand' : ''}`}
                    style={{ all: 'unset', display: 'flex', justifyContent: 'space-between', fontSize: '11px', width: '100%', cursor: t.resolved ? 'pointer' : 'default', boxSizing: 'border-box' }}
                  >
                    <strong style={{ color: 'var(--accent-cyan)' }}>{t.author} ({t.role}) {t.resolved ? '✓ resolved' : ''}</strong>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono-font)' }}>{t.time}{t.resolved ? (isCollapsed(t) ? ' ▸' : ' ▾') : ''}</span>
                  </button>
                  {!isCollapsed(t) && (
                  <>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--mono-font)', color: 'var(--accent-emerald)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>Pinned to: [{t.pinnedLabel}]</span>
                    {detached && <span className="badge-count warn">detached</span>}
                    {!detached && <button className="btn-xs" onClick={() => jumpToNode(t.pinnedTo)}>{t.pinnedTo === '__canvas' ? 'Open canvas →' : 'Jump to Node on Canvas'}</button>}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.4 }}>{renderRich(t.text, t.id)}</p>
                  {t.replies.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, background: 'var(--bg-panel)', borderRadius: 6, padding: '6px 8px', border: '1px solid var(--border-panel)' }}>
                      <strong>{r.author}</strong> <span style={{ color: 'var(--text-dim)' }}>{r.time}</span>
                      <div>{renderRich(r.text, `${t.id}-r${i}`)}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="doc-title-input"
                      style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
                      placeholder="Reply… (Enter to send)"
                      value={replyDrafts[t.id] ?? ''}
                      onChange={(e) => setReplyDrafts((p) => ({ ...p, [t.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (replyDrafts[t.id] ?? '').trim()) {
                          replyThread(t.id, replyDrafts[t.id] ?? '');
                          setReplyDrafts((p) => ({ ...p, [t.id]: '' }));
                        }
                      }}
                      aria-label={`Reply to ${t.id}`}
                    />
                    <button type="button" className="btn-xs" disabled={!(replyDrafts[t.id] ?? '').trim()} onClick={() => { const text = (replyDrafts[t.id] ?? '').trim(); if (!text) { pushToast('Write a reply before sending'); return; } replyThread(t.id, text); setReplyDrafts((p) => ({ ...p, [t.id]: '' })); }}>Reply</button>
                    <button type="button" className={t.resolved ? 'btn-xs' : 'btn-xs btn-xs-primary'} onClick={() => toggleResolveThread(t.id)}>{t.resolved ? 'Reopen' : '✓ Resolve'}</button>
                    <button
                      type="button"
                      className="btn-xs"
                      style={armThread === t.id ? { borderColor: 'var(--accent-rose)', color: '#FFFFFF', background: 'var(--accent-rose)' } : { color: 'var(--accent-rose)' }}
                      onClick={() => {
                        if (armThread === t.id) {
                          setArmThread(null);
                          deleteThread(t.id);
                        } else {
                          setArmThread(t.id);
                          window.setTimeout(() => setArmThread((cur) => (cur === t.id ? null : cur)), 3000);
                        }
                      }}
                    >
                      {armThread === t.id ? 'Confirm delete' : 'Delete'}
                    </button>
                  </div>
                  </>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      ) : (
        <GitScreen />
      )}
      </div>
    </div>
  );
}
