import { useEffect, useId, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/states';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLibrary, type LibraryFolder, type TrashDoc } from '../state/library';
import { useDiagram } from '../state/useDiagram';

const DAY = 24 * 60 * 60 * 1000;

/** "Removed in" text and colour (Trash.dc.html): red at one day or less, amber within a week. */
function removedIn(purgeAt: number | null, now: number = Date.now()): { text: string; color: string } {
  if (purgeAt === null) return { text: '—', color: 'var(--text-muted)' };
  const days = Math.ceil((purgeAt - now) / DAY);
  if (days <= 0) return { text: 'Today', color: '#B91C1C' };
  if (days === 1) return { text: 'Tomorrow', color: '#B91C1C' };
  return { text: `${days} days`, color: days <= 7 ? '#92400E' : '#3D4553' };
}

const canPurge = (d: TrashDoc) => d.role === 'owner' || d.role === 'admin';

interface Row {
  key: string;
  kind: 'doc' | 'folder';
  name: string;
  detail: string;
  from: string;
  by: string;
  purgeAt: number | null;
  doc?: TrashDoc;
  folder?: LibraryFolder;
}

const GRID = '2fr 1.2fr 1.2fr 1fr 200px';

function DeleteForeverDialog({ doc, onCancel, onConfirm }: { doc: TrashDoc; onCancel: () => void; onConfirm: () => void }) {
  const trap = useFocusTrap<HTMLDivElement>(true);
  const titleId = useId();
  const [typed, setTyped] = useState('');
  const versions = doc.versions != null ? `${doc.versions} versions` : 'its versions';
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onCancel]);
  const matches = typed === doc.title;
  return (
    <div className="libdlg__scrim" onClick={onCancel}>
      <section ref={trap} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="libdlg" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="libdlg__title">Delete “{doc.title}” forever?</h2>
        <p className="libdlg__note">
          {doc.versions != null ? `Removes the diagram, its ${versions}` : `Removes the diagram, ${versions}`} and everything attached to it. This can't be undone
          {doc.source === 'server' ? ' and is recorded in the audit log.' : '.'}
        </p>
        <label className="libdlg__field">
          Type the name to confirm
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        <div className="libdlg__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!matches} style={{ background: matches ? '#B91C1C' : '#FCA5A5', borderColor: 'transparent' }} onClick={onConfirm}>
            Delete forever
          </button>
        </div>
      </section>
    </div>
  );
}

/** Trash (SC-08): restore or permanently delete removed diagrams and folders. */
export default function TrashScreen() {
  const lib = useLibrary();
  const { refresh } = lib;
  const { pushToast } = useDiagram();
  const [target, setTarget] = useState<TrashDoc | null>(null);
  useEffect(() => { void refresh(); }, [refresh]);

  const folderName = useMemo(() => {
    const m = new Map<string, string>();
    lib.folders.forEach((f) => m.set(f.id, f.name));
    lib.trash.folders.forEach((f) => m.set(f.id, f.name));
    return m;
  }, [lib.folders, lib.trash.folders]);

  const rows: Row[] = [
    ...lib.trash.docs.map((d): Row => ({
      key: `d-${d.id}`,
      kind: 'doc',
      name: d.title,
      detail: d.source === 'local' ? 'Diagram · on this device' : d.versions != null ? `Diagram · ${d.versions} versions` : 'Diagram',
      from: (d.folderId && folderName.get(d.folderId)) || (d.source === 'local' ? 'This device' : 'Library'),
      by: d.source === 'local' ? 'You' : '—',
      purgeAt: d.purgeAt,
      doc: d,
    })),
    ...lib.trash.folders.map((f): Row => ({
      key: `f-${f.id}`,
      kind: 'folder',
      name: f.name,
      detail: 'Folder',
      from: (f.parentId && folderName.get(f.parentId)) || 'Library',
      by: '—',
      purgeAt: null,
      folder: f,
    })),
  ];

  const restore = async (row: Row) => {
    if (row.doc) {
      const d = row.doc;
      const live = d.folderId ? lib.folders.find((f) => f.id === d.folderId) : undefined;
      if (await lib.restoreDoc(d.id)) pushToast(`Restored to ${live ? live.name : 'Library'}`);
      else pushToast(`Could not restore ${d.title}`);
    } else if (row.folder) {
      if (await lib.restoreFolder(row.folder.id)) pushToast(`Restored folder ${row.folder.name}`);
      else pushToast(`Could not restore ${row.folder.name}`);
    }
  };

  const purge = async () => {
    if (!target) return;
    const d = target;
    setTarget(null);
    if (await lib.purgeDoc(d.id, d.title)) {
      await refresh();
      pushToast(`Deleted ${d.title} forever`);
    } else pushToast(`Could not delete ${d.title}`);
  };

  return (
    <div className="screen-view active libpage-screen">
      <div className="libpage-page">
        <div className="libpage-content" style={{ maxWidth: 1100 }}>
          <PageHeader title="Trash" subtitle="Items are permanently removed after 30 days (Team: 90). Restoring puts them back where they were." />
          {lib.error && <div role="alert" className="callout-block">{lib.error}</div>}
          {rows.length === 0 ? (
            <div className="content-card libpage-empty" role="status">
              <EmptyState title="Trash is empty" body="Diagrams and folders you remove will wait here before they are deleted for good." />
            </div>
          ) : (
            <section aria-label="Trash" role="table" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 10, overflow: 'hidden' }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '10px 16px', background: 'var(--bg-app)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <span role="columnheader">Item</span>
                <span role="columnheader">From</span>
                <span role="columnheader">Deleted by</span>
                <span role="columnheader">Removed in</span>
                <span role="columnheader"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></span>
              </div>
              {rows.map((r) => {
                const left = removedIn(r.purgeAt);
                return (
                  <div key={r.key} role="row" aria-label={r.name} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 16px', borderTop: '1px solid var(--libpage-divider, #F1F2F5)', alignItems: 'center' }}>
                    <span role="cell" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.detail}</span>
                    </span>
                    <span role="cell" style={{ color: '#3D4553' }}>{r.from}</span>
                    <span role="cell" style={{ color: '#3D4553' }}>{r.by}</span>
                    <span role="cell" style={{ color: left.color, fontWeight: 500 }}>{left.text}</span>
                    <span role="cell" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button type="button" className="btn btn--sm btn--secondary" aria-label={`Restore ${r.name}`} onClick={() => void restore(r)}>Restore</button>
                      {r.doc && canPurge(r.doc) && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          style={{ color: '#B91C1C', background: 'transparent', border: 'none' }}
                          aria-label={`Delete ${r.name} forever`}
                          onClick={() => setTarget(r.doc ?? null)}
                        >
                          Delete forever
                        </button>
                      )}
                      {r.doc && !canPurge(r.doc) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Only owners can delete forever</span>}
                    </span>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </div>
      {target && <DeleteForeverDialog doc={target} onCancel={() => setTarget(null)} onConfirm={() => void purge()} />}
    </div>
  );
}
