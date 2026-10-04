import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { blueprintGraph, mockBlueprints } from '../mocks';
import { useDiagram } from '../useDiagram';
import { useFocusTrap } from '../useFocusTrap';

function badgeStyleFor(category: string): { className: string; style?: CSSProperties } {
  switch (category) {
    case 'Cloud Native':
      return { className: 'badge-count cyan', style: { width: 'fit-content' } };
    case 'Microservices':
      return {
        className: 'badge-count',
        style: { width: 'fit-content', background: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)' },
      };
    case 'Data & Streaming':
    case 'AI / RAG':
      return {
        className: 'badge-count',
        style: { width: 'fit-content', background: 'var(--accent-violet-bg)', color: 'var(--accent-violet)' },
      };
    case 'Security & Auth':
      return {
        className: 'badge-count',
        style: { width: 'fit-content', background: 'var(--accent-rose-bg)', color: 'var(--accent-rose)' },
      };
    default:
      return { className: 'badge-count warn', style: { width: 'fit-content' } };
  }
}

export default function BlueprintsScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'load' | 'insert'>('load');
  const navigate = useNavigate();
  const { loadGraph, mergeGraph, dirty } = useDiagram();

  const categories = useMemo(() => ['All', ...Array.from(new Set(mockBlueprints.map((b) => b.category)))], []);
  // Counts are derived from the real payloads so cards can never lie.
  const graphs = useMemo(() => {
    const m = new Map<string, { nodes: number; edges: number }>();
    mockBlueprints.forEach((b) => {
      const g = blueprintGraph(b.id);
      m.set(b.id, { nodes: g.nodes.length, edges: g.edges.length });
    });
    return m;
  }, []);
  const q = query.trim().toLowerCase();
  const filtered = mockBlueprints.filter((b) => {
    const okCat = category === 'All' || b.category === category;
    const okQ = !q || `${b.title} ${b.category} ${b.desc}`.toLowerCase().includes(q);
    return okCat && okQ;
  });

  const requestLoad = (id: string) => {
    setConfirmMode('load');
    if (dirty) setConfirmId(id);
    else confirmLoad(id);
  };

  const doInsert = (id: string) => {
    const bp = mockBlueprints.find((b) => b.id === id);
    const g = blueprintGraph(id);
    mergeGraph(g.nodes, g.edges, `Inserted blueprint: ${bp?.title ?? id} (${g.nodes.length}n)`);
    setPreviewId(null);
    setConfirmId(null);
    navigate('/canvas');
  };

  const insertBlueprint = (id: string) => {
    if (dirty) {
      setConfirmMode('insert');
      setConfirmId(id);
    } else {
      doInsert(id);
    }
  };

  const confirmLoad = (id: string) => {
    const bp = mockBlueprints.find((b) => b.id === id);
    const g = blueprintGraph(id);
    loadGraph(g.nodes, g.edges, `Loaded blueprint: ${bp?.title ?? id} (${g.nodes.length}n/${g.edges.length}e)`);
    setPreviewId(null);
    setConfirmId(null);
    navigate('/canvas');
  };

  const preview = previewId ? mockBlueprints.find((b) => b.id === previewId) ?? null : null;
  const previewGraph = preview ? blueprintGraph(preview.id) : null;
  const confirmBp = confirmId ? mockBlueprints.find((b) => b.id === confirmId) ?? null : null;
  const previewTrap = useFocusTrap<HTMLDivElement>(preview !== null);
  const confirmTrap = useFocusTrap<HTMLDivElement>(confirmBp !== null);

  // Esc closes preview / confirm (AppShell only clears its own modals).
  useEffect(() => {
    if (!previewId && !confirmId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewId(null);
        setConfirmId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewId, confirmId]);

  return (
    <div className="screen-view active">
      <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--heading-font)', fontSize: '20px', fontWeight: 800 }}>
            Curated Technical System Blueprints ({mockBlueprints.length})
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Load battle-tested distributed system designs directly onto your canvas with pre-configured schemas. Preview shows exact node/edge counts; Load replaces canvas (undoable).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="search"
            className="doc-title-input"
            placeholder="Filter by pattern, e.g. Event-Driven, VPC, Kafka"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search blueprints"
            style={{ maxWidth: '360px', background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
          />
          {categories.map((c) => (
            <button key={c} className={`btn-xs${category === c ? ' btn-xs-primary' : ''}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
          {(q || category !== 'All') && <button className="btn-xs" onClick={() => { setQuery(''); setCategory('All'); }}>Clear filters</button>}
        </div>
        <div className="template-card-grid">
          {filtered.map((b) => {
            const badge = badgeStyleFor(b.category);
            const counts = graphs.get(b.id);
            return (
              <div key={b.id} className="blueprint-card">
                <div className="blueprint-thumb" onClick={() => setPreviewId(b.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setPreviewId(b.id); }} title="Preview" aria-label={`Preview ${b.title}`}>
                  {b.icon}
                </div>
                <div className="blueprint-info">
                  <span className={badge.className} style={badge.style}>{b.category}</span>
                  <strong style={{ fontSize: '14px' }}>{b.title}</strong>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.desc}</p>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--accent-cyan)' }}>{counts?.nodes ?? b.nodeCount}n • {counts?.edges ?? b.edgeCount}e</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button className="btn-xs" onClick={() => setPreviewId(b.id)}>Preview</button>
                    <button className="btn-xs" onClick={() => insertBlueprint(b.id)} title="Append beside current canvas">Insert</button>
                    <button className="btn-xs btn-xs-primary" onClick={() => requestLoad(b.id)}>Load to Canvas</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <div className="callout-block">No blueprints match &quot;{query}&quot; in {category}. <button className="btn-xs" style={{ marginLeft: 8 }} onClick={() => { setQuery(''); setCategory('All'); }}>Clear search</button></div>
        ) : null}

        {preview && previewGraph && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }} onClick={() => setPreviewId(null)}>
            <div ref={previewTrap} className="content-card" style={{ maxWidth: 520, width: '90%' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${preview.title} preview`}>
              <div className="card-head">
                <span className="card-title">{preview.icon} {preview.title}</span>
                <button autoFocus className="btn-xs" onClick={() => setPreviewId(null)}>Close ✕</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{preview.desc}</p>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', margin: '8px 0' }}>{previewGraph.nodes.length} nodes • {previewGraph.edges.length} edges</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                {previewGraph.nodes.map((n) => (
                  <div key={n.id} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', padding: '4px 8px', borderRadius: 4 }}>{n.label} — {n.tag}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => insertBlueprint(preview.id)} title="Appends beside existing content with collision-safe UUID remapping">Insert into Current Canvas →</button>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => requestLoad(preview.id)} title="Clears current graph; confirms first if unsaved changes exist">Replace Canvas →</button>
              </div>
            </div>
          </div>
        )}

        {confirmBp && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 95 }} onClick={() => setConfirmId(null)}>
            <div ref={confirmTrap} className="content-card" style={{ maxWidth: 420, width: '90%' }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="Replace canvas">
              <div className="card-head"><span className="card-title">{confirmMode === 'load' ? 'Replace canvas?' : 'Insert blueprint?'}</span></div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {confirmMode === 'load' ? (
                    <>Load <strong>{confirmBp.title}</strong>? Current canvas changes stay undoable (Ctrl+Z), but checkpoint first if the version matters.</>
                  ) : (
                    <>Insert <strong>{confirmBp.title}</strong> beside your current canvas? Your unsaved changes stay intact.</>
                  )}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                  <button autoFocus className="btn-xs" onClick={() => setConfirmId(null)}>Keep canvas</button>
                  <button className="btn-xs btn-xs-primary" onClick={() => (confirmMode === 'load' ? confirmLoad(confirmBp.id) : doInsert(confirmBp.id))}>{confirmMode === 'load' ? 'Replace' : 'Insert'}</button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
