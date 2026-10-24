import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HonestyBadge from '../components/HonestyBadge';
import ImportWarnings from '../components/ImportWarnings';
import { sourceModeForDoc, sourceModeLabel, sourceModeTooltip } from '../honesty';
import { useDiagram } from '../useDiagram';

type SortKey = 'modified' | 'created' | 'nodes' | 'alpha';
type View = 'grid' | 'table';

const DASH_VIEW_KEY = 'archflux:dashboard:view:v1';

function loadDashView(): { view: View; sort: SortKey } {
  try {
    const raw = localStorage.getItem(DASH_VIEW_KEY);
    if (!raw) return { view: 'grid', sort: 'modified' };
    const parsed = JSON.parse(raw) as { view?: unknown; sort?: unknown };
    return {
      view: parsed.view === 'table' ? 'table' : 'grid',
      sort: parsed.sort === 'created' || parsed.sort === 'nodes' || parsed.sort === 'alpha' ? parsed.sort : 'modified',
    };
  } catch {
    return { view: 'grid', sort: 'modified' };
  }
}

/** Storage meter with warn/error thresholds and a free-up action (DSH-R4). */
export function StorageCard({ docCount, usedKB, onFreeUp, onManage }: {
  docCount: number;
  usedKB: string;
  onFreeUp: () => void;
  onManage: () => void;
}) {
  const pct = Math.min(100, (docCount / 25) * 100);
  const bar = pct >= 95 ? 'var(--semantic-error, #DC2626)' : pct >= 80 ? 'var(--semantic-warning, #CA8A04)' : 'var(--semantic-success, #16A34A)';
  return (
    <div className="content-card" style={{ maxWidth: 340 }} aria-label="Storage quota">
      <div className="card-title" style={{ fontSize: 12 }}>
        Storage — {docCount}/25 Diagrams · {usedKB} KB used
        {pct >= 95 ? ' — full' : pct >= 80 ? ' — nearly full' : ''}
      </div>
      <div
        style={{ height: 8, borderRadius: 4, background: 'var(--bg-panel-subtle)', overflow: 'hidden', marginTop: 8 }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Diagram storage used"
      >
        <div style={{ width: `${pct}%`, height: '100%', background: bar }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {pct >= 80 && (
          <button className="btn-xs btn-xs-primary" onClick={onFreeUp}>Free up space</button>
        )}
        <button className="btn-xs" onClick={onManage}>Manage storage →</button>
      </div>
    </div>
  );
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `Edited ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Edited ${h}h ago`;
  return `Edited ${new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { docs, activeDocId, openDoc, newDoc, renameDoc, setDocTags, duplicateDoc, deleteDoc, exportArch, exportPNG, exportSVG, exportCSV, importArch, pushToast, freshness } = useDiagram();
  const [query, setQuery] = useState('');
  const [sort, setSortState] = useState<SortKey>(() => loadDashView().sort);
  const [view, setViewState] = useState<View>(() => loadDashView().view);
  const persistDashView = (nextView: View, nextSort: SortKey) => {
    try {
      localStorage.setItem(DASH_VIEW_KEY, JSON.stringify({ view: nextView, sort: nextSort }));
    } catch {
      /* ignore */
    }
  };
  const setSort = (s: SortKey) => {
    setSortState(s);
    persistDashView(view, s);
  };
  const setView = (v: View) => {
    setViewState(v);
    persistDashView(v, sort);
  };
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagEditingId, setTagEditingId] = useState<string | null>(null);
  const [tagText, setTagText] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [armDelete, setArmDelete] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('archflux:pinned');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Last import's non-fatal warnings (PROD-007). Shown inline; navigation
  // to canvas still proceeds since the import itself succeeded.
  const [importWarnings, setImportWarnings] = useState<{ fileName: string; warnings: string[] } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!armDelete) return;
    const t = window.setTimeout(() => setArmDelete(null), 4000);
    return () => window.clearTimeout(t);
  }, [armDelete]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = docs.filter((d) => {
      const okQ = !q || `${d.title} ${d.id} ${(d.tags ?? []).join(' ')}`.toLowerCase().includes(q);
      const okTag = !tagFilter || (d.tags ?? []).includes(tagFilter);
      return okQ && okTag;
    });
    switch (sort) {
      case 'created':
        return list.sort((a, b) => b.createdAt - a.createdAt);
      case 'nodes':
        return list.sort((a, b) => b.nodes.length - a.nodes.length);
      case 'alpha':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }, [docs, query, sort, tagFilter]);

  const allTags = useMemo(() => {
    const safeDocs = docs ?? [];
    const set = new Set<string>();
    safeDocs.forEach((d) => (d.tags ?? []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [docs]);

  const pinnedDocs = useMemo(() => docs.filter((d) => pinned.has(d.id)), [docs, pinned]);
  const recentDocs = useMemo(() => [...docs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5), [docs]);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('archflux:pinned', JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} diagram(s)? This cannot be undone.`)) return;
    selectedIds.forEach((id) => deleteDoc(id));
    setSelectedIds(new Set());
    setSelectMode(false);
    pushToast(`Deleted ${selectedIds.size} diagram(s)`);
  };

  const usedKB = useMemo(() => {
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('archflux:')) bytes += (localStorage.getItem(k) ?? '').length;
      }
      return (bytes / 1024).toFixed(1);
    } catch {
      return '—';
    }
  }, [docs]);

  const open = (id: string) => {
    openDoc(id);
    navigate('/canvas');
  };

  const freeUpSpace = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
    pushToast('Select diagrams to delete, then use Delete in select mode');
  };

  const exportPngFor = (id: string) => {
    openDoc(id);
    navigate('/canvas');
    // Wait for canvas to mount and render before exporting.
    const tryExport = (attempt: number) => {
      const canvas = document.getElementById('architectureCanvas') as HTMLCanvasElement | null;
      if (canvas && canvas.width > 0) {
        exportPNG();
      } else if (attempt < 20) {
        window.setTimeout(() => tryExport(attempt + 1), 100);
      } else {
        pushToast('Canvas not ready — try again');
      }
    };
    window.setTimeout(() => tryExport(0), 50);
  };

  const importFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const result = importArch(parsed);
        if (!result.imported) return; // hard failure: previous graph untouched, toast already shown
        if (result.warnings.length > 0) {
          setImportWarnings({ fileName: f.name, warnings: result.warnings });
        } else {
          setImportWarnings(null);
          pushToast(`Imported ${f.name} — validating schema`);
        }
        navigate('/canvas');
      } catch {
        pushToast('Import failed: invalid .arch JSON');
      }
    };
    reader.readAsText(f);
  };

  const cardMenu = (id: string) => {
    const doc = docs.find((d) => d.id === id);
    return (
      <div style={{ position: 'absolute', top: 32, right: 8, zIndex: 20, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }} role="menu">
        {[
          { label: 'Duplicate', fn: () => duplicateDoc(id) },
          { label: 'Rename', fn: () => { setRenameText(doc?.title ?? ''); setRenamingId(id); } },
                  { label: 'Export .arch', fn: () => { openDoc(id); window.setTimeout(exportArch, 50); } },
                  { label: 'Export PNG', fn: () => exportPngFor(id) },
                  { label: 'Export SVG (vector)', fn: () => { openDoc(id); window.setTimeout(exportSVG, 50); } },
                  { label: 'Export CSV (shape data)', fn: () => { openDoc(id); window.setTimeout(exportCSV, 50); } },
        ].map((a) => (
          <button key={a.label} role="menuitem" className="dock-action-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px' }} onClick={() => { a.fn(); setMenuId(null); }}>
            {a.label}
          </button>
        ))}
      <button
        role="menuitem"
        className="dock-action-btn"
        style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', color: armDelete === id ? '#fff' : 'var(--accent-rose)', background: armDelete === id ? 'var(--accent-rose)' : undefined }}
        onClick={() => {
          if (armDelete === id) {
            setArmDelete(null);
            setMenuId(null);
            deleteDoc(id);
          } else {
            setArmDelete(id);
          }
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>
          {armDelete === id ? 'Click again to permanently delete' : 'Delete…'}
          {armDelete === id && <span key={`arm-${id}`} className="arm-progress" />}
        </span>
      </button>
      {tagEditingId === id ? (
        <form
          style={{ display: 'flex', gap: 4, padding: '6px 4px 2px' }}
            onSubmit={(e) => {
              e.preventDefault();
              const tags = tagText.split(',').map((t) => t.trim()).filter(Boolean);
              if (tags.length === 0) {
                pushToast('No valid tags — use comma-separated names');
                return;
              }
              setDocTags(id, tags);
              setTagEditingId(null);
              pushToast('Tags updated');
            }}
        >
          <input
            autoFocus
            className="doc-title-input"
            style={{ flex: 1, border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
            placeholder="tags, comma, separated"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            aria-label="Edit tags"
          />
          <button type="submit" className="btn-xs btn-xs-primary">Save</button>
        </form>
      ) : (
        <button
          role="menuitem"
          className="dock-action-btn"
          style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px' }}
          onClick={() => {
            setTagText((docs.find((d) => d.id === id)?.tags ?? []).join(', '));
            setTagEditingId(id);
          }}
        >
          Edit tags…
        </button>
      )}
      </div>
    );
  };

  const thumb = (nodes: { x: number; y: number; w: number; h: number; stroke: string }[]) => {
    if (nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const vw = Math.max(1, maxX - minX), vh = Math.max(1, maxY - minY);
    return (
      <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} style={{ width: '100%', height: 110, background: 'var(--bg-panel-subtle)', borderRadius: '8px 8px 0 0' }} aria-hidden="true">
        {nodes.slice(0, 30).map((n, i) => (
          <rect key={i} x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill="var(--bg-panel)" stroke={n.stroke} strokeWidth={3} />
        ))}
      </svg>
    );
  };

  // Shared toolbar: search, sort, view toggle, New/Select + bulk bar.
  // Rendered in every branch so grid view is never a dead end.
  const toolbar = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        ref={searchRef}
        type="search"
        className="doc-title-input"
        placeholder="Search diagrams…  ( / )"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search diagrams"
        style={{ flex: 1, minWidth: 200, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '8px 12px' }}
      />
      <select className="theme-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort diagrams">
        <option value="modified">Last Modified</option>
        <option value="created">Creation Date</option>
        <option value="nodes">Node Count</option>
        <option value="alpha">Alphabetical</option>
      </select>
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="View">
        {(['grid', 'table'] as View[]).map((v) => (
          <button key={v} className={`btn-xs${view === v ? ' btn-xs-primary' : ''}`} onClick={() => setView(v)}>{v === 'grid' ? '▦ Grid' : '☰ Table'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-primary" onClick={() => { newDoc(); navigate('/canvas'); }}>+ New Diagram</button>
        <button className={`btn-xs${selectMode ? ' btn-xs-primary' : ''}`} onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}>
          {selectMode ? 'Done' : 'Select'}
        </button>
        {selectMode && selectedIds.size > 0 && (
          <button className="btn-xs" style={{ color: 'var(--accent-rose)' }} onClick={bulkDelete}>Delete ({selectedIds.size})</button>
        )}
      </div>
    </div>
  );

  if (filtered.length === 0) {
    return (
      <div className="screen-view active">
        <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
          {toolbar}
          {importWarnings && (
            <ImportWarnings fileName={importWarnings.fileName} warnings={importWarnings.warnings} onClose={() => setImportWarnings(null)} />
          )}
          {docs.length > 0 ? (
            <div className="content-card" style={{ textAlign: 'center', padding: 40 }} role="status">
              <div className="card-title">No diagrams match your filters</div>
              <p className="card-sub">Try a different search term, or clear filters to see everything.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn-xs btn-xs-primary" onClick={() => { setQuery(''); setTagFilter(null); }}>Clear search & filters</button>
              </div>
            </div>
          ) : (
            <div className="content-card" style={{ textAlign: 'center', padding: 40 }} role="status">
              <img src="/icons/tools/select.svg" alt="" style={{ width: 32, height: 32 }} />
              <div className="card-title">No diagrams yet</div>
              <p className="card-sub">Create blank, load the e-commerce blueprint, or import an .arch file.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn-xs btn-xs-primary" onClick={() => { newDoc(); navigate('/canvas'); }}>Create blank</button>
                <button className="btn-xs" onClick={() => navigate('/blueprints')}>Load e-commerce blueprint</button>
                <button className="btn-xs" onClick={() => document.getElementById('dash-import')?.click()}>Import .arch</button>
              </div>
            </div>
          )}
          <StorageCard docCount={docs.length} usedKB={usedKB} onFreeUp={freeUpSpace} onManage={() => navigate('/settings/storage')} />
        </div>
      </div>
    );
  }

  if (view === 'grid') {
    return (
      <div className="screen-view active">
        <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
          {toolbar}
          {importWarnings && (
            <ImportWarnings fileName={importWarnings.fileName} warnings={importWarnings.warnings} onClose={() => setImportWarnings(null)} />
          )}
          <div className="template-card-grid">
            {filtered.map((d) => {
              if (!d) return null;
              return (
                <div key={d.id} className="blueprint-card" style={{ position: 'relative' }}>
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      aria-label={`Select ${d.title}`}
                      style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, width: 18, height: 18, cursor: 'pointer' }}
                    />
                  )}
                  <div onClick={() => open(d.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(d.id); }} title={`Open ${d.title}`} style={{ cursor: 'pointer' }}>
                    {thumb(d.nodes)}
                  </div>
                  <button
                    className="btn-xs"
                    style={{ position: 'absolute', top: 8, right: 8, color: 'var(--text-muted)' }}
                    title={pinned.has(d.id) ? 'Unpin' : 'Pin to top'}
                    aria-label={pinned.has(d.id) ? 'Unpin diagram' : 'Pin diagram'}
                    onClick={() => togglePin(d.id)}
                  >
                    {pinned.has(d.id) ? '📌 Pinned' : '☆ Pin'}
                  </button>
                  <button className="btn-xs" style={{ position: 'absolute', top: 32, right: 8 }} aria-label={`Options for ${d.title}`} onClick={() => setMenuId(menuId === d.id ? null : d.id)}>⋯</button>
                  {menuId === d.id && cardMenu(d.id)}
                  <div className="blueprint-info">
                    {renamingId === d.id ? (
                      <input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { renameDoc(d.id, renameText); setRenamingId(null); }
                          else if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => { if (renamingId === d.id) { renameDoc(d.id, renameText); setRenamingId(null); } }}
                        aria-label="Diagram title"
                        style={{ width: '100%', border: '1px solid var(--accent-cyan)', borderRadius: 6, padding: '4px 8px' }}
                      />
                    ) : (
                      <strong style={{ fontSize: 13 }}>{d.title} {d.id === activeDocId && <span className="badge-count" style={{ width: 'fit-content', background: 'var(--bg-panel-subtle)', color: 'var(--text-muted)' }} aria-label="Status: open">open</span>}</strong>
                    )}
                    <div style={{ display: 'flex', gap: 6, fontSize: 10, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ border: '1px solid var(--border-panel)', borderRadius: 4, padding: '0 4px' }} title="Git tracking branch">[git:main]</span>
                      {(() => {
                        const mode = sourceModeForDoc(d.id);
                        return (
                          <HonestyBadge label={sourceModeLabel(mode)} tone={mode === 'local' ? 'neutral' : 'info'} title={sourceModeTooltip(mode)} />
                        );
                      })()}
                      <span>{d.nodes.length}n</span><span>{d.edges.length}e</span><span>{relTime(d.updatedAt)}</span>
                    </div>
                    {(d.tags ?? []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(d.tags ?? []).map((t) => (
                          <button key={t} className="btn-xs" style={{ fontSize: 10 }} title={`Filter by #${t}`} onClick={(e) => { e.stopPropagation(); setTagFilter(t); }}>#{t}</button>
                        ))}
                      </div>
                    )}
                    <span className="badge-count" style={{ width: 'fit-content', background: freshness === 'fresh' ? 'var(--accent-emerald-bg)' : 'var(--accent-amber-bg)', color: freshness === 'fresh' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }} aria-label={freshness === 'fresh' ? 'Status: Synced' : 'Status: Drift'}>
                      {freshness === 'fresh' ? '● Synced' : '⚠ Drift'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <StorageCard docCount={docs.length} usedKB={usedKB} onFreeUp={freeUpSpace} onManage={() => navigate('/settings/storage')} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="screen-view active"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && /\.arch$|\.json$/i.test(f.name)) importFile(f);
        else if (f) pushToast('Only .arch JSON files can be dropped here');
      }}
    >
      <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
        {/* Top action bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={searchRef}
            type="search"
            className="doc-title-input"
            placeholder="Search diagrams…  ( / )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search diagrams"
            style={{ flex: 1, minWidth: 200, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '8px 12px' }}
          />
          <select className="theme-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort diagrams">
            <option value="modified">Last Modified</option>
            <option value="created">Creation Date</option>
            <option value="nodes">Node Count</option>
            <option value="alpha">Alphabetical</option>
          </select>
          <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="View">
            {(['grid', 'table'] as View[]).map((v) => (
              <button key={v} className={`btn-xs${view === v ? ' btn-xs-primary' : ''}`} onClick={() => setView(v)}>{v === 'grid' ? '▦ Grid' : '☰ Table'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-primary" onClick={() => { newDoc(); navigate('/canvas'); }}>+ New Diagram</button>
            <button className={`btn-xs${selectMode ? ' btn-xs-primary' : ''}`} onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}>
              {selectMode ? 'Done' : 'Select'}
            </button>
          {selectMode && selectedIds.size > 0 && (
            <button className="btn-xs" style={{ color: 'var(--accent-rose)' }} onClick={bulkDelete}>Delete ({selectedIds.size})</button>
            )}
          </div>
        </div>
        {importWarnings && (
          <ImportWarnings fileName={importWarnings.fileName} warnings={importWarnings.warnings} onClose={() => setImportWarnings(null)} />
        )}
        {pinnedDocs.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>              <span>📌 Pinned</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({pinnedDocs.length})</span>
            </div>
            <div className="template-card-grid">
              {pinnedDocs.map((d) => (
                <div key={d.id} className="blueprint-card" style={{ position: 'relative' }}>
                  <div onClick={() => open(d.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(d.id); }} title={`Open ${d.title}`} style={{ cursor: 'pointer' }}>
                    {thumb(d.nodes)}
                  </div>
                  <button className="btn-xs" style={{ position: 'absolute', top: 8, right: 8, color: 'var(--text-muted)' }} title="Unpin" aria-label="Unpin diagram" onClick={() => togglePin(d.id)}>📌 Unpin</button>
                  <button className="btn-xs" style={{ position: 'absolute', top: 8, left: 8 }} aria-label={`Options for ${d.title}`} onClick={() => setMenuId(menuId === d.id ? null : d.id)}>⋯</button>
                  {menuId === d.id && cardMenu(d.id)}
                  <div className="blueprint-info">
                    <strong style={{ fontSize: 13 }}>{d.title} {d.id === activeDocId && <span className="badge-count" style={{ width: 'fit-content', background: 'var(--bg-panel-subtle)', color: 'var(--text-muted)' }} aria-label="Status: open">open</span>}</strong>
                    <div style={{ display: 'flex', gap: 6, fontSize: 10, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                      {(() => {
                        const mode = sourceModeForDoc(d.id);
                        return (
                          <HonestyBadge label={sourceModeLabel(mode)} tone={mode === 'local' ? 'neutral' : 'info'} title={sourceModeTooltip(mode)} />
                        );
                      })()}
                      <span>{d.nodes.length}n</span><span>{d.edges.length}e</span><span>{relTime(d.updatedAt)}</span>
                    </div>
                    <span className="badge-count" style={{ width: 'fit-content', background: freshness === 'fresh' ? 'var(--accent-emerald-bg)' : 'var(--accent-amber-bg)', color: freshness === 'fresh' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }} aria-label={freshness === 'fresh' ? 'Status: Synced' : 'Status: Drift'}>
                      {freshness === 'fresh' ? '● Synced' : '⚠ Drift'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {recentDocs.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Recently opened</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {recentDocs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => open(d.id)}
                  style={{ minWidth: 140, maxWidth: 140, padding: 8, border: '1px solid var(--border-panel)', borderRadius: 8, background: 'var(--bg-panel)', cursor: 'pointer', textAlign: 'left' }}
                  title={d.title}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{relTime(d.updatedAt)}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {['Blank Canvas', 'From Template', 'Import .arch File'].map((label) => (
            <button
              key={label}
              className="btn-xs"
              onClick={() => {
                if (label === 'Blank Canvas') { newDoc(); navigate('/canvas'); }
                else if (label === 'From Template') navigate('/blueprints');
                else document.getElementById('dash-import')?.click();
              }}
            >
              {label}
            </button>
          ))}
          <input id="dash-import" type="file" accept=".arch,.json" style={{ display: 'none' }} onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Filter by tag">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tags:</span>
            {allTags.map((t) => (
              <button key={t} className={`btn-xs${tagFilter === t ? ' btn-xs-primary' : ''}`} aria-pressed={tagFilter === t} aria-label={`Filter by #${t}`} onClick={() => setTagFilter((cur) => (cur === t ? null : t))}>
                #{t}
              </button>
            ))}
            {tagFilter && <button className="btn-xs" onClick={() => setTagFilter(null)}>Clear</button>}
          </div>
        )}

        {dragOver && (
          <div style={{ border: '2px dashed var(--accent-cyan)', borderRadius: 8, padding: 20, textAlign: 'center', fontSize: 13 }}>
            Drop .arch file to validate & open
          </div>
        )}

        {/* Table view (empty + grid handled by early returns above) */}
        <div className="content-card" role="table" aria-label="Diagrams table">
          <div role="row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 4px 8px', borderBottom: '1px solid var(--border-panel)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {([
              { key: 'alpha', label: 'Title' },
              { key: 'nodes', label: 'Size' },
              { key: 'modified', label: 'Updated' },
            ] as const).map((col) => (
              <button
                key={col.key}
                role="columnheader"
                aria-sort={sort === col.key ? (col.key === 'alpha' ? 'ascending' : 'descending') : 'none'}
                onClick={() => setSort(col.key)}
                title={`Sort by ${col.label}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: sort === col.key ? 'var(--accent-cyan)' : 'inherit', padding: 0 }}
              >
                {col.label}{sort === col.key ? (col.key === 'alpha' ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
          </div>
          {filtered.map((d) => {
            if (!d) return null;
            return (
                <div key={d.id} role="row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--border-panel)', position: 'relative' }} aria-label={`${d.title} — ${d.nodes.length} nodes, ${d.edges.length} edges, updated ${relTime(d.updatedAt)}`}>
                  <button style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={() => open(d.id)}>{d.title}</button>
                  {(() => {
                    const mode = sourceModeForDoc(d.id);
                    return (
                      <HonestyBadge label={sourceModeLabel(mode)} tone={mode === 'local' ? 'neutral' : 'info'} title={sourceModeTooltip(mode)} />
                    );
                  })()}
                {(d.tags ?? []).map((t) => <span key={t} style={{ fontSize: 10, color: 'var(--accent-cyan)' }}>#{t}</span>)}
                <span style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }} aria-label={`${d.nodes.length} nodes, ${d.edges.length} edges`}>{d.nodes.length}n · {d.edges.length}e</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }} aria-label="Last updated">{relTime(d.updatedAt)}</span>
                <button className="btn-xs" aria-label={`Options for ${d.title}`} onClick={() => setMenuId(menuId === d.id ? null : d.id)}>⋯</button>
                {menuId === d.id && cardMenu(d.id)}
              </div>
            );
          })}
        </div>

        {/* Storage quota widget */}
        <div className="content-card" style={{ maxWidth: 340 }} aria-label="Storage quota">
          <div className="card-title" style={{ fontSize: 12 }}>Storage — {docs.length}/25 Diagrams · {usedKB} KB used</div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-panel-subtle)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${Math.min(100, (docs.length / 25) * 100)}%`, height: '100%', background: (docs.length / 25) >= 0.95 ? 'var(--accent-rose)' : (docs.length / 25) >= 0.8 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }} />
          </div>
          <button className="btn-xs" style={{ marginTop: 8 }} onClick={() => navigate('/settings/storage')}>Manage storage →</button>
        </div>
      </div>
    </div>
  );
}
