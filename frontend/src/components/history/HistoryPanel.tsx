import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { NamedRevision } from '../../lib/api';
import { buildTimeline, groupTimeline, sourceLabel, type CheckpointLike, type TimelineEntry } from '../../state/timeline';
import { docStateFromSnapshot } from '../../state/compare';
import { track } from '../../lib/analytics';
import type { DocState } from '../../state/ops/types';

/**
 * History panel (SC-27, R1-E08-T03): one timeline of server revisions, server checkpoints and local
 * checkpoints, grouped by day and editing session. Layout and copy follow History.dc.html.
 */
export interface LocalCheckpoint extends CheckpointLike {
  nodes: unknown[];
  edges: unknown[];
  strokes?: unknown[];
  texts?: unknown[];
  pages?: unknown[];
  layers?: unknown[];
}

export interface CompareTarget {
  label: string;
  /** Resolves the document state of the version being compared. */
  load: () => Promise<DocState>;
}

/** One side of a two-entry compare, resolved lazily; `isCurrent` marks the newest revision. */
export interface PairSide extends CompareTarget {
  isCurrent: boolean;
}

export interface HistoryPanelProps {
  diagramId: string;
  /** Cloud-backed doc: server history applies. Local-only docs list local checkpoints only. */
  cloud: boolean;
  /** Editor or owner: may name and restore. */
  canEdit: boolean;
  localCheckpoints: LocalCheckpoint[];
  /** Called when the user picks "Compare with current". */
  onCompare: (target: CompareTarget) => void;
  /** Called with (older, newer) when exactly two entries are ticked and "Compare selected" is used. */
  onComparePair?: (left: PairSide, right: PairSide) => void;
  /** Restore a local checkpoint (store action). */
  onRestoreLocal: (id: string) => void;
  /** After a server restore: reload the doc from the server. */
  onRestored: () => Promise<unknown> | void;
}

const SOURCE_TAG: Record<string, { bg: string; fg: string }> = {
  Import: { bg: '#FEF3E2', fg: '#92400E' },
  Restore: { bg: '#E8F0FE', fg: '#1D4ED8' },
  Revert: { bg: '#E8F0FE', fg: '#1D4ED8' },
  Sync: { bg: '#FEF3E2', fg: '#92400E' },
  Checkpoint: { bg: '#DCF3E6', fg: '#047857' },
};
const small = { height: 24, padding: '0 8px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', font: 'inherit', fontSize: 11, fontWeight: 500, color: '#1B1F27', cursor: 'pointer' } as const;

function clock(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}

export default function HistoryPanel({ diagramId, cloud, canEdit, localCheckpoints, onCompare, onComparePair, onRestoreLocal, onRestored }: HistoryPanelProps) {
  const [revs, setRevs] = useState<NamedRevision[]>([]);
  const [serverCps, setServerCps] = useState<Array<CheckpointLike & { snapshot?: unknown }>>([]);
  const [loading, setLoading] = useState(cloud);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'named'>('all');
  const [naming, setNaming] = useState<{ id: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!cloud) { setLoading(false); return; }
    try {
      const [r, c] = await Promise.all([
        api.revisions.list(diagramId),
        api.listCheckpoints(diagramId).catch(() => ({ data: [] as unknown[] })),
      ]);
      setRevs(r.data);
      setServerCps((c.data as Array<Record<string, unknown>>).map((x) => ({
        id: String(x.id),
        title: String(x.title ?? 'checkpoint'),
        meta: typeof x.meta === 'string' ? x.meta : undefined,
        createdAt: typeof x.createdAt === 'string' ? x.createdAt : undefined,
        snapshot: x.snapshot,
      })));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [cloud, diagramId]);

  useEffect(() => { void load(); }, [load]);

  const timeline = useMemo(
    () => buildTimeline(cloud ? revs : [], cloud ? serverCps : [], localCheckpoints),
    [cloud, revs, serverCps, localCheckpoints],
  );
  const shown = useMemo(() => (view === 'named' ? timeline.filter((e) => !!e.name) : timeline), [timeline, view]);
  const days = useMemo(() => groupTimeline(shown), [shown]);
  const latestRev = timeline.find((e) => e.kind === 'revision') ?? null;

  // Ctrl/Cmd+Shift+S names the latest version.
  useEffect(() => {
    if (!canEdit || !latestRev) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setNaming({ id: latestRev.id, value: latestRev.name ?? '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, latestRev]);

  const submitName = async () => {
    if (!naming) return;
    setBusy(true);
    try {
      await api.revisions.setName(diagramId, naming.id, naming.value.trim() || null);
      setNaming(null);
      setNotice(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not name this version');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (entry: TimelineEntry) => {
    setBusy(true);
    setError(null);
    try {
      if (entry.kind === 'local') {
        onRestoreLocal(entry.id);
        setNotice('Restored from the local checkpoint.');
        track('version_restored');
      } else {
        if (entry.kind === 'checkpoint') await api.restoreCheckpoint(diagramId, entry.id);
        else await api.revisions.restore(diagramId, entry.id);
        track('version_restored');
        await onRestored();
        setNotice('Restored. A new version was added on top; history is unchanged.');
        await load();
      }
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const keyOf = (e: TimelineEntry) => `${e.kind}:${e.id}`;
  const togglePick = (e: TimelineEntry) => setPicked((p) => (p.includes(keyOf(e)) ? p.filter((k) => k !== keyOf(e)) : [...p, keyOf(e)]));
  const pickedStatus = picked.length === 0 ? 'Select two versions to compare'
    : picked.length === 1 ? 'Select one more version'
    : picked.length === 2 ? '2 selected · older on the left'
    : `Select only two versions · ${picked.length} selected`;

  const loaderFor = (entry: TimelineEntry): (() => Promise<DocState>) => {
    if (entry.kind === 'revision') return async () => docStateFromSnapshot((await api.getRevision(diagramId, entry.id)).data?.snapshot);
    if (entry.kind === 'checkpoint') {
      const cp = serverCps.find((c) => c.id === entry.id);
      return async () => docStateFromSnapshot(cp?.snapshot);
    }
    const cp = localCheckpoints.find((c) => c.id === entry.id);
    return async () => docStateFromSnapshot(cp ?? {});
  };

  const comparePair = () => {
    if (picked.length !== 2 || !onComparePair) return;
    // `timeline` is newest first, so the later index is the older entry.
    const chosen = picked.map((k) => timeline.findIndex((e) => keyOf(e) === k)).filter((i) => i >= 0).sort((x, y) => y - x).map((i) => timeline[i]);
    if (chosen.length !== 2) return;
    const side = (e: TimelineEntry): PairSide => ({ label: e.name ?? (e.isCurrent ? 'Current' : sourceLabel(e.source)), load: loaderFor(e), isCurrent: e.isCurrent });
    onComparePair(side(chosen[0]), side(chosen[1]));
  };

  const compare = (entry: TimelineEntry) => {
    const label = entry.name ?? sourceLabel(entry.source);
    if (entry.kind === 'revision') {
      onCompare({ label, load: async () => docStateFromSnapshot((await api.getRevision(diagramId, entry.id)).data?.snapshot) });
    } else if (entry.kind === 'checkpoint') {
      const cp = serverCps.find((c) => c.id === entry.id);
      onCompare({ label, load: async () => docStateFromSnapshot(cp?.snapshot) });
    } else {
      const cp = localCheckpoints.find((c) => c.id === entry.id);
      onCompare({ label, load: async () => docStateFromSnapshot(cp ?? {}) });
    }
  };

  const row = (e: TimelineEntry) => {
    const title = e.name ?? (e.isCurrent ? 'Current' : sourceLabel(e.source));
    const tag = e.name ? { text: e.kind === 'revision' ? 'Named' : 'Checkpoint', bg: '#EEF0FF', fg: '#4338CA' }
      : e.isCurrent ? { text: 'Draft', bg: '#F1F2F5', fg: '#3D4553' }
      : SOURCE_TAG[sourceLabel(e.source)] ? { text: sourceLabel(e.source), ...SOURCE_TAG[sourceLabel(e.source)] } : null;
    const meta = [e.authorName ?? (e.kind === 'local' ? 'This browser' : null), e.createdAt > 0 ? new Date(e.createdAt).toLocaleString() : null].filter(Boolean).join(' · ');
    return (
      <li key={`${e.kind}:${e.id}`} aria-label={title} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 10, borderRadius: 8, background: e.name ? '#EEF0FF' : e.isCurrent ? '#F6F7F9' : 'transparent', boxShadow: e.name ? 'inset 2px 0 0 #4F46E5' : undefined }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" aria-label={`Select ${title} for compare${meta ? ` (${meta})` : ''}`} checked={picked.includes(keyOf(e))} onChange={() => togglePick(e)}
            style={{ width: 16, height: 16, margin: 0, accentColor: '#4F46E5', flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{title}</span>
          {tag && <span style={{ padding: '0 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: tag.bg, color: tag.fg }}>{tag.text}</span>}
        </span>
        {meta && <span style={{ fontSize: 12, color: '#5B6474' }}>{meta}</span>}
        {naming?.id === e.id ? (
          <span style={{ display: 'flex', gap: 4, paddingTop: 4 }}>
            <input aria-label="Version name" autoFocus maxLength={80} value={naming.value} onChange={(ev) => setNaming({ id: e.id, value: ev.target.value })}
              onKeyDown={(ev) => { if (ev.key === 'Enter') void submitName(); if (ev.key === 'Escape') { ev.stopPropagation(); setNaming(null); } }}
              style={{ flexGrow: 1, minWidth: 0, height: 26, border: '1px solid #E3E6EB', borderRadius: 6, padding: '0 6px', font: 'inherit' }} />
            <button type="button" style={small} disabled={busy} onClick={() => void submitName()}>Save name</button>
          </span>
        ) : confirm === `${e.kind}:${e.id}` ? (
          <span role="alertdialog" aria-label={`Confirm restore ${title}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
            <span style={{ fontSize: 12 }}>Restore “{title}”? A new version is added on top; nothing is deleted.</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" style={{ ...small, background: '#4F46E5', color: '#FFFFFF', border: 'none' }} disabled={busy} onClick={() => void doRestore(e)}>Confirm restore</button>
              <button type="button" style={small} onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          </span>
        ) : (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 4 }}>
            {!e.isCurrent && <button type="button" style={small} aria-label={`Compare ${title} with current`} onClick={() => compare(e)}>Compare with current</button>}
            {canEdit && !e.isCurrent && <button type="button" style={small} aria-label={`Restore ${title}`} onClick={() => setConfirm(`${e.kind}:${e.id}`)}>Restore</button>}
            {canEdit && e.kind === 'revision' && <button type="button" style={small} aria-label={`Name this version ${e.name ?? clock(e.createdAt)}`} onClick={() => setNaming({ id: e.id, value: e.name ?? '' })}>Name this version</button>}
          </span>
        )}
      </li>
    );
  };

  return (
    <aside aria-label="Version history" style={{ width: 280, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E3E6EB', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#1B1F27', minHeight: 0, height: '100%' }}>
      <div style={{ padding: 14, borderBottom: '1px solid #E3E6EB', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>History</span>
        <div role="radiogroup" aria-label="Show" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', padding: 2, background: '#F1F2F5', borderRadius: 8 }}>
          {(['all', 'named'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
              style={{ height: 28, border: 'none', borderRadius: 6, background: view === v ? '#FFFFFF' : 'transparent', boxShadow: view === v ? '0 1px 2px rgba(16,24,40,.08)' : undefined, font: 'inherit', fontSize: 12, fontWeight: view === v ? 600 : 400, cursor: 'pointer' }}>
              {v === 'all' ? 'All changes' : 'Named only'}
            </button>
          ))}
        </div>
        {onComparePair && (
          <div role="group" aria-label="Compare two versions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span id="pick-status" role="status" style={{ flexGrow: 1, fontSize: 12, color: '#5B6474' }}>{pickedStatus}</span>
            <button type="button" aria-label="Compare selected versions" aria-describedby="pick-status" disabled={picked.length !== 2} onClick={comparePair}
              style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 6, font: 'inherit', fontSize: 12, fontWeight: 600, background: picked.length === 2 ? '#4F46E5' : '#F1F2F5', color: picked.length === 2 ? '#FFFFFF' : '#5B6474', cursor: picked.length === 2 ? 'pointer' : 'not-allowed' }}>
              Compare selected
            </button>
          </div>
        )}
      </div>
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: 8 }}>
        {!cloud && <div role="note" style={{ padding: 8, fontSize: 12, color: '#5B6474' }}>Sign in to keep full history. Local checkpoints below stay in this browser.</div>}
        {error && <div role="alert" style={{ padding: 8, fontSize: 12, color: '#B91C1C' }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 8, fontSize: 12, color: '#047857' }}>{notice}</div>}
        {loading && <div style={{ padding: 8, color: '#5B6474' }}>Loading history…</div>}
        {!loading && shown.length === 0 && !error && (
          <div style={{ padding: 8, color: '#5B6474' }}>{view === 'named' ? 'No named versions yet.' : cloud ? 'No saved versions yet. Save the diagram to record the first one.' : 'No local checkpoints yet.'}</div>
        )}
        {days.map((d) => (
          <section key={d.day} aria-label={d.day} style={{ marginBottom: 8 }}>
            <h2 style={{ margin: '8px 4px 4px', fontSize: 11, fontWeight: 600, color: '#5B6474', textTransform: 'uppercase', letterSpacing: '.04em' }}>{d.day}</h2>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {d.items.map((it) => it.type === 'entry' ? row(it.entry) : (
                <li key={it.session} style={{ listStyle: 'none' }}>
                  <details open>
                    <summary style={{ padding: 10, cursor: 'pointer', fontWeight: 600 }}>
                      {it.authorName ?? 'Someone'} · {it.count} edits · {clock(it.from)}–{clock(it.to)}
                    </summary>
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>{it.entries.map(row)}</ol>
                  </details>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      {canEdit && latestRev && (
        <div style={{ margin: '4px 8px 8px', paddingTop: 10, borderTop: '1px solid #EEF0F3' }}>
          <button type="button" onClick={() => setNaming({ id: latestRev.id, value: latestRev.name ?? '' })} style={{ width: '100%', height: 32, border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', font: 'inherit', fontWeight: 500, cursor: 'pointer' }}>
            Name latest version  ⌘⇧S
          </button>
        </div>
      )}
      <span style={{ fontSize: 11, color: '#5B6474', padding: '0 14px 12px' }}>Restore and revert add a new version on top — history is never rewritten.</span>
    </aside>
  );
}
