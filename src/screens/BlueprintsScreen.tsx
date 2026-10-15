import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { blueprintGraph, mockBlueprints } from '../mocks';
import type { ArchEdge, ArchNode, Blueprint } from '../types';
import { useDiagram } from '../useDiagram';
import { useFocusTrap } from '../useFocusTrap';

const CUSTOM_BP_KEY = 'archflux:blueprints:custom:v1';

export interface CustomBlueprint extends Blueprint {
  nodes: ArchNode[];
  edges: ArchEdge[];
  custom: true;
}

export function loadCustomBlueprints(): CustomBlueprint[] {
  try {
    const raw = localStorage.getItem(CUSTOM_BP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is CustomBlueprint =>
        b && typeof b.id === 'string' && typeof b.title === 'string'
        && Array.isArray(b.nodes) && Array.isArray(b.edges),
    );
  } catch {
    return [];
  }
}

export function persistCustomBlueprints(next: CustomBlueprint[]) {
  try {
    localStorage.setItem(CUSTOM_BP_KEY, JSON.stringify(next));
  } catch {
    /* quota ignore */
  }
}

/** Deterministic mini-map: nodes as rects, routes as lines, fitted to viewBox. */
export function BlueprintThumb({ nodes, edges, title }: { nodes: ArchNode[]; edges: ArchEdge[]; title: string }) {
  const W = 300;
  const H = 110;
  const xs = nodes.flatMap((n) => [n.x, n.x + n.w]);
  const ys = nodes.flatMap((n) => [n.y, n.y + n.h]);
  if (xs.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} preview (empty)`} style={{ width: '100%', height: 110, display: 'block' }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11" fill="var(--text-muted)">Empty</text>
      </svg>
    );
  }
  const pad = 12;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const bw = Math.max(1, Math.max(...xs) - minX);
  const bh = Math.max(1, Math.max(...ys) - minY);
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  const ox = (W - bw * s) / 2 - minX * s;
  const oy = (H - bh * s) / 2 - minY * s;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} preview`} style={{ width: '100%', height: 110, display: 'block' }}>
      {edges.map((e) => {
        const a = byId.get(e.from);
        const b = e.to ? byId.get(e.to) : null;
        if (!a || !b) return null;
        return (
          <line
            key={e.id}
            x1={(a.x + a.w / 2) * s + ox}
            y1={(a.y + a.h / 2) * s + oy}
            x2={(b.x + b.w / 2) * s + ox}
            y2={(b.y + b.h / 2) * s + oy}
            stroke={e.color ?? '#94A3B8'}
            strokeWidth={1.5}
          />
        );
      })}
      {nodes.map((n) => (
        <rect
          key={n.id}
          x={n.x * s + ox}
          y={n.y * s + oy}
          width={Math.max(3, n.w * s)}
          height={Math.max(3, n.h * s)}
          rx={2}
          fill={n.fill ?? '#DBEAFE'}
          stroke={n.stroke ?? '#2563EB'}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

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
  const { loadGraph, mergeGraph, dirty, nodes, edges, pushToast } = useDiagram();
  const [custom, setCustom] = useState<CustomBlueprint[]>(loadCustomBlueprints);
  const [customTitle, setCustomTitle] = useState('');

  const allBlueprints: Blueprint[] = useMemo(() => [...custom, ...mockBlueprints], [custom]);
  const graphFor = (id: string): { nodes: ArchNode[]; edges: ArchEdge[] } => {
    const c = custom.find((b) => b.id === id);
    if (c) return { nodes: c.nodes, edges: c.edges };
    return blueprintGraph(id);
  };

  const saveCurrentAsBlueprint = () => {
    const title = customTitle.trim().slice(0, 60);
    if (!title) {
      pushToast('Name your blueprint first');
      return;
    }
    if (nodes.length === 0) {
      pushToast('Canvas is empty — nothing to save');
      return;
    }
    const entry: CustomBlueprint = {
      id: `custom-${Date.now().toString(36)}`,
      title,
      category: 'Custom',
      icon: '⭐',
      desc: `Saved from canvas • ${nodes.length} nodes • ${edges.length} routes`,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      custom: true,
    };
    const next = [entry, ...custom].slice(0, 25);
    setCustom(next);
    persistCustomBlueprints(next);
    setCustomTitle('');
    pushToast(`Saved blueprint: ${title}`);
  };

  const deleteCustom = (id: string) => {
    const next = custom.filter((b) => b.id !== id);
    setCustom(next);
    persistCustomBlueprints(next);
    pushToast('Deleted custom blueprint');
  };

  const categories = useMemo(() => ['All', ...Array.from(new Set(allBlueprints.map((b) => b.category)))], [allBlueprints]);
  // Counts are derived from the real payloads so cards can never lie.
  const graphs = useMemo(() => {
    const m = new Map<string, { nodes: number; edges: number }>();
    allBlueprints.forEach((b) => {
      const g = graphFor(b.id);
      m.set(b.id, { nodes: g.nodes.length, edges: g.edges.length });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBlueprints]);
  const q = query.trim().toLowerCase();
  const filtered = allBlueprints.filter((b) => {
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
    const bp = allBlueprints.find((b) => b.id === id);
    const g = graphFor(bp?.id ?? id);
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
    const bp = allBlueprints.find((b) => b.id === id);
    const g = graphFor(bp?.id ?? id);
    loadGraph(g.nodes, g.edges, `Loaded blueprint: ${bp?.title ?? id} (${g.nodes.length}n/${g.edges.length}e)`);
    setPreviewId(null);
    setConfirmId(null);
    navigate('/canvas');
  };

  const preview = previewId ? allBlueprints.find((b) => b.id === previewId) ?? null : null;
  const previewGraph = preview ? graphFor(preview.id) : null;
  const confirmBp = confirmId ? allBlueprints.find((b) => b.id === confirmId) ?? null : null;
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
            Curated Technical System Blueprints ({allBlueprints.length})
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Load battle-tested distributed system designs directly onto your canvas with pre-configured schemas. Preview shows exact node/edge counts; Load replaces canvas (undoable).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
          <input
            className="doc-title-input"
            style={{ flex: 1, minWidth: 200, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
            placeholder="Name current canvas as blueprint…"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            aria-label="Custom blueprint name"
            maxLength={60}
          />
          <button type="button" className="btn btn-primary" onClick={saveCurrentAsBlueprint}>⭐ Save current canvas as blueprint</button>
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
            const g = graphFor(b.id);
            const isCustom = 'custom' in b && (b as CustomBlueprint).custom === true;
            return (
              <div key={b.id} className="blueprint-card">
                <div className="blueprint-thumb" onClick={() => setPreviewId(b.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setPreviewId(b.id); }} title="Preview" aria-label={`Preview ${b.title}`} style={{ padding: 6 }}>
                  <BlueprintThumb nodes={g.nodes} edges={g.edges} title={b.title} />
                </div>
                <div className="blueprint-info">
                  <span className={badge.className} style={badge.style}>{b.category}</span>
                  <strong style={{ fontSize: '14px' }}>{b.title}</strong>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.desc}</p>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--accent-cyan)' }}>{counts?.nodes ?? b.nodeCount}n • {counts?.edges ?? b.edgeCount}e</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <button className="btn-xs" onClick={() => setPreviewId(b.id)}>Preview</button>
                    <button className="btn-xs" onClick={() => insertBlueprint(b.id)} title="Append beside current canvas">Insert</button>
                    <button className="btn-xs btn-xs-primary" onClick={() => requestLoad(b.id)}>Load to Canvas</button>
                    {isCustom && (
                      <button className="btn-xs" onClick={() => deleteCustom(b.id)} style={{ color: 'var(--accent-rose)' }} aria-label={`Delete ${b.title}`}>
                        Delete
                      </button>
                    )}
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
              <div style={{ marginBottom: 10, border: '1px solid var(--border-panel)', borderRadius: 8, overflow: 'hidden' }}>
                <BlueprintThumb nodes={previewGraph.nodes} edges={previewGraph.edges} title={preview.title} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Nodes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
                {previewGraph.nodes.map((n) => (
                  <div key={n.id} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', padding: '4px 8px', borderRadius: 4 }}>{n.label} — {n.tag}</div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Routes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto', marginBottom: 10 }}>
                {previewGraph.edges.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No routes in this blueprint.</div>
                )}
                {previewGraph.edges.map((e) => (
                  <div key={e.id} style={{ fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', padding: '4px 8px', borderRadius: 4 }}>
                    {e.label} <span style={{ color: 'var(--text-muted)' }}>({e.from} → {e.to ?? '∅'})</span>
                  </div>
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
