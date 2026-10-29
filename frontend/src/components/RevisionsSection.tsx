import { useCallback, useEffect, useState } from 'react';
import { api, isForbiddenError } from '../lib/api';
import { isServerDocId } from '../lib/honesty';
import type { ArchEdge, ArchNode } from '../types';
import {
  formatServerDiff,
  shortRef,
  snapshotGraph,
  validateRevisionPair,
  type ServerDiff,
  type ServerRevision,
} from '../state/revisions';
import { BlueprintThumb } from '../screens/BlueprintsScreen';

const ADMIN_NOTE = 'Reviews require an admin workspace role — ask a workspace admin for access.';
const LOCAL_HINT = 'Save this diagram to the server to enable versioned revisions and reviewable diffs.';

/**
 * Revisions section for ReviewsScreen ("review the change", PROD-020).
 * Server-backed docs list GET revisions with A/B diff + single-revision
 * preview. Local-only docs show the save-to-server hint; 403 shows the
 * admin-role note instead of an error.
 */
export default function RevisionsSection({ diagramId }: { diagramId: string }) {
  const serverBacked = isServerDocId(diagramId);
  const [revisions, setRevisions] = useState<ServerRevision[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [revA, setRevA] = useState('');
  const [revB, setRevB] = useState('');
  const [diff, setDiff] = useState<ServerDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<{ nodes: ArchNode[]; edges: ArchEdge[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!serverBacked) return;
    let cancelled = false;
    setRevisions(null);
    setLoadError(null);
    setForbidden(false);
    setDiff(null);
    setPreviewId(null);
    setPreviewSnapshot(null);
    api.listRevisions(diagramId).then(
      ({ data }) => {
        if (cancelled) return;
        setRevisions(data);
        setRevA((cur) => cur || data[0]?.id || '');
        setRevB((cur) => cur || data[1]?.id || data[0]?.id || '');
      },
      (e) => {
        if (cancelled) return;
        if (isForbiddenError(e)) setForbidden(true);
        else setLoadError(e instanceof Error ? e.message : 'Failed to load revisions');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [diagramId, serverBacked]);

  const loadDiff = useCallback(
    (a: string, b: string) => {
      if (validateRevisionPair(a, b) !== null || !serverBacked) {
        setDiff(null);
        return;
      }
      setDiffError(null);
      api.diffRevisions(diagramId, a, b).then(
        (d) => setDiff({ added: d.added ?? [], removed: d.removed ?? [], changed: d.changed ?? [] }),
        (e) => {
          setDiff(null);
          setDiffError(e instanceof Error ? e.message : 'Failed to load diff');
        },
      );
    },
    [diagramId, serverBacked],
  );

  useEffect(() => {
    loadDiff(revA, revB);
  }, [revA, revB, loadDiff]);

  const preview = (id: string) => {
    if (previewId === id) {
      setPreviewId(null);
      setPreviewSnapshot(null);
      return;
    }
    setPreviewId(id);
    setPreviewError(null);
    api.getRevision(diagramId, id).then(
      ({ data }) => setPreviewSnapshot(snapshotGraph(data?.snapshot)),
      (e) => {
        setPreviewSnapshot(null);
        setPreviewError(e instanceof Error ? e.message : 'Failed to load revision snapshot');
      },
    );
  };

  if (!serverBacked) {
    return (
      <div className="content-card">
        <div className="card-head"><span className="card-title">Revisions</span></div>
        <div className="callout-block">{LOCAL_HINT}</div>
      </div>
    );
  }

  const pairNote = validateRevisionPair(revA, revB);
  const diffLines = diff ? formatServerDiff(diff) : [];

  return (
    <div className="content-card">
      <div className="card-head">
        <span className="card-title">Revisions ({revisions?.length ?? '…'})</span>
      </div>
      <div className="card-sub">Immutable server snapshots with lineage. Compare two revisions or preview one.</div>
      {forbidden && <div className="callout-block" role="note">{ADMIN_NOTE}</div>}
      {loadError && <div role="alert" style={{ fontSize: 12, color: 'var(--accent-rose)' }}>Couldn&apos;t load revisions: {loadError}</div>}
      {revisions && revisions.length === 0 && <div className="callout-block">No revisions yet — save the diagram to record the first one.</div>}
      {revisions && revisions.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
            {revisions.map((r) => (
              <div key={r.id} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span title={r.id}>
                  <strong>{shortRef(r.id)}</strong> · {r.source || 'manual'} · {r.authorId ? shortRef(r.authorId) : 'you'} · hash {shortRef(r.contentHash)}
                  {r.message ? ` · ${r.message.slice(0, 60)}` : ''}
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dim)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span>
                  <button type="button" className="btn btn--sm btn--secondary" onClick={() => preview(r.id)} aria-expanded={previewId === r.id}>
                    {previewId === r.id ? 'Hide' : 'Preview'}
                  </button>
                </span>
              </div>
            ))}
          </div>
          {previewId && (
            <div style={{ marginBottom: 10 }}>
              {previewError && <div role="alert" style={{ fontSize: 12, color: 'var(--accent-rose)' }}>Couldn&apos;t load snapshot: {previewError}</div>}
              {previewSnapshot && (
                <div style={{ border: '1px solid var(--border-panel)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono-font)', padding: '4px 8px', background: 'var(--bg-panel-subtle)' }}>
                    {shortRef(previewId)} · {previewSnapshot.nodes.length} nodes, {previewSnapshot.edges.length} routes (read-only)
                  </div>
                  <BlueprintThumb nodes={previewSnapshot.nodes} edges={previewSnapshot.edges} title={`Revision ${shortRef(previewId)}`} />
                </div>
              )}
            </div>
          )}
          {revisions.length >= 2 && (
            <div style={{ borderTop: '1px solid var(--border-panel)', paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Compare revisions</div>
              <div className="compare-row" style={{ display: 'flex', gap: 6 }}>
                <select
                  className="theme-select"
                  value={revA}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRevA(next);
                    if (next === revB) {
                      const other = revisions.find((r) => r.id !== next);
                      if (other) setRevB(other.id);
                    }
                  }}
                  aria-label="Compare revision A"
                >
                  {revisions.map((r) => <option key={r.id} value={r.id}>{shortRef(r.id)} · {r.source || 'manual'}</option>)}
                </select>
                <select
                  className="theme-select"
                  value={revB}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRevB(next);
                    if (next === revA) {
                      const other = [...revisions].reverse().find((r) => r.id !== next);
                      if (other) setRevA(other.id);
                    }
                  }}
                  aria-label="Compare revision B"
                >
                  {revisions.map((r) => <option key={r.id} value={r.id}>{shortRef(r.id)} · {r.source || 'manual'}</option>)}
                </select>
              </div>
              {pairNote && <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', marginTop: 6, color: 'var(--accent-cyan)' }}>{pairNote}</div>}
              {diffError && <div role="alert" style={{ fontSize: 12, color: 'var(--accent-rose)' }}>Couldn&apos;t load diff: {diffError}</div>}
              {diffLines.map((l, i) => <div key={i} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: l.startsWith('+') ? '#16A34A' : l.startsWith('-') ? '#DC2626' : '#CA8A04' }} aria-label={l.startsWith('+') ? 'Added revision' : l.startsWith('-') ? 'Removed revision' : 'Modified revision'}><span aria-hidden="true">{l.startsWith('+') ? '+ ' : l.startsWith('-') ? '- ' : '~ '}</span>{l}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
