import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GettingStarted from '../components/checklist/GettingStarted';
import ImportDialog from '../components/import/ImportDialog';
import { LibrarySidebar } from '../components/library/LibrarySidebar';
import { relativeTime } from '../components/library/libraryModel';
import NewDiagramDialog from '../components/NewDiagramDialog';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/states';
import { blueprints } from '../data/blueprints';
import { readRecentOpened } from '../state/recentDocs';
import { useLibrary } from '../state/library';
import { useDiagram } from '../state/useDiagram';
import type { DiagramDoc } from '../types';

const card: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 10 };

function greeting(name: string, hour: number): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

type StartKind = 'blank' | 'template' | 'import' | 'ai';

/** Home (SC-05): start something, continue where you left off, pick a template. Real data only. */
export default function HomeScreen() {
  const navigate = useNavigate();
  const { docs, openDoc, displayName } = useDiagram();
  const lib = useLibrary();
  const [dialog, setDialog] = useState<'new' | 'new-template' | 'import' | null>(null);

  const continueDocs = useMemo(() => {
    const byId = new Map(docs.map((d) => [d.id, d]));
    return readRecentOpened()
      .map((id) => byId.get(id))
      .filter((d): d is DiagramDoc => d !== undefined)
      .slice(0, 4);
    // `docs` changes when a doc is opened or edited; the opened list is read fresh each time.
  }, [docs]);

  const hasContent = docs.some((d) => d.nodes.length > 0 || d.edges.length > 0);
  const name = displayName.trim() && displayName.trim() !== 'You' ? displayName.trim() : '';
  const subtitle = `${docs.length} ${docs.length === 1 ? 'diagram' : 'diagrams'} in your library`;

  const spaceOf = (d: DiagramDoc): string => {
    const f = lib.docFolders[d.id];
    return (f && lib.folders.find((x) => x.id === f)?.name) || (/^doc-/.test(d.id) ? 'This device' : 'Library');
  };

  const starts: { kind: StartKind; title: string; sub: string; glyph: string; bg: string; fg: string; disabled?: boolean }[] = [
    { kind: 'blank', title: 'Blank diagram', sub: 'Context, container or free', glyph: '+', bg: '#EEF0FF', fg: '#4338CA' },
    { kind: 'template', title: 'From template', sub: `${blueprints.length} architecture blueprints`, glyph: '▦', bg: '#E8F0FE', fg: '#1D4ED8' },
    { kind: 'import', title: 'Import', sub: 'draw.io, Mermaid, .arch', glyph: '↥', bg: '#F1EBFE', fg: '#6D28D9' },
    { kind: 'ai', title: 'Generate with AI', sub: 'Arrives in R2', glyph: '✦', bg: '#FEF3E2', fg: '#B45309', disabled: true },
  ];

  const open = (id: string) => {
    openDoc(id);
    navigate('/canvas');
  };

  return (
    <div className="screen-view active libpage-screen">
      <div className="libshell">
        <LibrarySidebar active="home" />
        <div className="libpage-page">
          <div className="libpage-content" style={{ gap: 24 }}>
            <PageHeader
              title={greeting(name, new Date().getHours())}
              subtitle={subtitle}
              actions={
                <>
                  <button type="button" className="libpage-btn libpage-btn--secondary" onClick={() => setDialog('import')}>Import</button>
                  <button type="button" className="libpage-btn libpage-btn--primary" onClick={() => setDialog('new')} aria-keyshortcuts="N">New diagram</button>
                </>
              }
            />

            <section aria-label="Start" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {starts.map((s) => (
                <button
                  key={s.kind}
                  type="button"
                  aria-disabled={s.disabled || undefined}
                  onClick={() => setDialog(s.kind === 'import' ? 'import' : s.kind === 'template' ? 'new-template' : 'new')}
                  style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: 14, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', opacity: s.disabled ? 0.75 : 1 }}
                >
                  <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.fg, fontWeight: 700, fontSize: 16, flexShrink: 0 }}>{s.glyph}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{s.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.sub}</span>
                  </span>
                </button>
              ))}
            </section>

            {!hasContent ? (
              <section className="content-card libpage-empty" role="status" aria-label="Empty library">
                <EmptyState
                  title="Your diagrams will show up here"
                  body="Start with a blank diagram, or bring in a file you already have."
                  action={{ label: 'New diagram', onClick: () => setDialog('new') }}
                  secondary={{ label: 'Import', onClick: () => setDialog('import') }}
                />
              </section>
            ) : (
              continueDocs.length > 0 && (
                <section aria-label="Continue" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flexGrow: 1 }}>Continue</h2>
                    <a href="/dashboard" style={{ fontSize: 12, fontWeight: 500, color: "var(--accent-text)" }}>View all</a>
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {continueDocs.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => open(d.id)}
                          style={{ width: '100%', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 8, border: 'none', borderBottom: '1px solid var(--border-panel)', background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <span style={{ fontWeight: 600 }}>{d.title}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{spaceOf(d)}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500, color: d.serverVersion != null ? '#047857' : '#3D4553' }}>
                            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: d.serverVersion != null ? '#15803D' : '#8A93A3' }} />
                            {d.serverVersion != null ? `Saved v${d.serverVersion}` : 'Local'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{relativeTime(d.updatedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            )}

            <section aria-label="Start from a template" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flexGrow: 1 }}>Start from a template</h2>
                <a href="/blueprints" style={{ fontSize: 12, fontWeight: 500, color: "var(--accent-text)" }}>All templates →</a>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {blueprints.slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setDialog('new-template')}
                      style={{ ...card, width: '100%', padding: 14, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                    >
                      <span style={{ fontWeight: 600 }}>{b.title}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.category} · {b.nodeCount} elements · {b.edgeCount} connections</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
      <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 20 }}><GettingStarted /></div>
      {(dialog === 'new' || dialog === 'new-template') && <NewDiagramDialog initialTab={dialog === 'new-template' ? 'template' : 'blank'} onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} onImported={() => navigate('/canvas')} />}
    </div>
  );
}
