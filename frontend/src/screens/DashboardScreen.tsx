import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { track } from '../lib/analytics';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, Skeleton } from '../components/states';
import { DOC_DRAG_TYPE } from '../components/library/FolderTree';
import { LibrarySidebar } from '../components/library/LibrarySidebar';
import { MoveHereDialog, MoveToDialog, NameDialog } from '../components/library/LibraryDialogs';
import { useLibrary } from '../state/library';
import NewDiagramDialog from '../components/NewDiagramDialog';
import ImportDialog from '../components/import/ImportDialog';
import { DocThumbnail } from '../components/library/DocThumbnail';
import {
  cardMeta,
  librarySubtitle,
  matchesSource,
  relativeTime,
  sourceChip,
  storageLevel,
  storageLine,
  type SourceFilter,
} from '../components/library/libraryModel';
import { isSignedIn } from '../state/session';
import { isServerDocId } from '../lib/honesty';
import { saveAsTemplate, useTeamTemplates } from '../state/teamTemplates';
import { isTemplateDoc } from '../lib/teamTemplates';
import { useDiagram } from '../state/useDiagram';
import type { DiagramDoc } from '../types';

// Library page (R1-E14-T04): layout, copy and sizes from
// docs/design/artboards/Library.dc.html. Counts, thumbnails and chips are
// derived from the real docs in the store; nothing is sample data.

type SortKey = 'modified' | 'alpha';
type View = 'grid' | 'table';

const DASH_VIEW_KEY = 'archflux:dashboard:view:v1';
const PINNED_KEY = 'archflux:pinned';

function loadDashView(): { view: View; sort: SortKey } {
  try {
    const raw = localStorage.getItem(DASH_VIEW_KEY);
    if (!raw) return { view: 'grid', sort: 'modified' };
    const parsed = JSON.parse(raw) as { view?: unknown; sort?: unknown };
    return {
      view: parsed.view === 'table' ? 'table' : 'grid',
      sort: parsed.sort === 'alpha' ? 'alpha' : 'modified',
    };
  } catch {
    return { view: 'grid', sort: 'modified' };
  }
}

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const SOURCES: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'server', label: 'Server' },
  { value: 'device', label: 'This device' },
];

/**
 * Storage footer line (replaces the Storage card, UX-P2.2):
 * "This device: X of 25 diagrams · N KB used · Manage storage". At 80% / 95%
 * of the local limit it says so and offers "Free up space" (DSH-R4).
 */
export function StorageFooter({ docCount, usedKB, onFreeUp, onManage }: {
  docCount: number;
  usedKB: string;
  onFreeUp: () => void;
  onManage: () => void;
}) {
  const level = storageLevel(docCount);
  return (
    <p className={`libpage-footer${level === 'ok' ? '' : ` libpage-footer--${level}`}`} aria-label="Storage on this device">
      {storageLine(docCount, usedKB)}
      {level === 'full' ? ' — full' : level === 'warn' ? ' — nearly full' : ''}
      {' · '}
      {level !== 'ok' && (
        <>
          <button type="button" className="libpage-link" onClick={onFreeUp}>Free up space</button>
          {' · '}
        </>
      )}
      <a
        className="libpage-link"
        href="/settings/storage"
        onClick={(e) => {
          e.preventDefault();
          onManage();
        }}
      >
        Manage storage
      </a>
    </p>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function SourceChip({ doc }: { doc: DiagramDoc }) {
  const chip = sourceChip(doc);
  return (
    <span className={`libpage-chip libpage-chip--${chip.kind}`} title={chip.title}>
      {chip.label}
    </span>
  );
}

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { docs, openDoc, newDoc, renameDoc, setDocTags, duplicateDoc, deleteDoc, saveActiveDoc, exportArch, exportPNG, exportSVG, exportCSV, exportPrint, pushToast, activeDocId, nodes: liveNodes, edges: liveEdges, strokes: liveStrokes, texts: liveTexts, pages: livePages, layers: liveLayers, docDefaults } = useDiagram();
  const [signedIn] = useState(() => isSignedIn());
  // Team templates are tagged server diagrams; they live under Blueprints, not in the Library lists (E10-T07).
  const { ids: templateIds } = useTeamTemplates(signedIn);
  const lib = useLibrary();
  const { refresh: refreshLibrary } = lib;
  const [params] = useSearchParams();
  const viewParam = params.get('view');
  const libView: 'all' | 'recent' | 'starred' | 'shared' = viewParam === 'recent' || viewParam === 'starred' || viewParam === 'shared' ? viewParam : 'all';
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newDiagramOpen, setNewDiagramOpen] = useState(false);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [moveHereOpen, setMoveHereOpen] = useState(false);
  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(loadPinned);
  // Select mode is reached from "Free up space" in the storage footer only.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Import wizard (SC-10): opened by the Import button or by dropping a file.
  const [importOpen, setImportOpen] = useState<{ file?: File } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sourceRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key.toLowerCase() === 'n' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        e.preventDefault();
        setNewDiagramOpen(true);
        return;
      }
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inFolder = (d: DiagramDoc) => (lib.currentFolderId ? lib.docFolders[d.id] === lib.currentFolderId : true);
    const inView = (d: DiagramDoc) => (libView === 'starred' ? lib.starredIds.includes(d.id) : libView === 'shared' ? false : libView === 'all' ? inFolder(d) : true);
    const list = docs.filter((d) => {
      if (isTemplateDoc(d, templateIds)) return false;
      if (!inView(d)) return false;
      const okQ = !q || `${d.title} ${d.id} ${(d.tags ?? []).join(' ')}`.toLowerCase().includes(q);
      const okTag = !tagFilter || (d.tags ?? []).includes(tagFilter);
      return okQ && okTag && matchesSource(d, source);
    });
    const bySort = sort === 'alpha'
      ? (a: DiagramDoc, b: DiagramDoc) => a.title.localeCompare(b.title)
      : (a: DiagramDoc, b: DiagramDoc) => b.updatedAt - a.updatedAt;
    // Pinned diagrams lead, then the chosen sort.
    if (libView === 'recent') return list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    return list.sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || bySort(a, b));
  }, [docs, templateIds, query, sort, tagFilter, source, pinned, libView, lib.currentFolderId, lib.docFolders, lib.starredIds]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    (docs ?? []).filter((d) => !isTemplateDoc(d, templateIds)).forEach((d) => (d.tags ?? []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [docs, templateIds]);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
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
    if (!window.confirm(`Move ${selectedIds.size} diagram(s) to the trash? You can restore them from Trash for 30 days.`)) return;
    selectedIds.forEach((id) => deleteDoc(id));
    pushToast(`Moved ${selectedIds.size} diagram(s) to the trash`);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const usedKB = useMemo(() => {
    void docs; // recompute when the library changes
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

  const createNew = () => {
    newDoc();
    track('diagram_created', { source: 'blank' });
    navigate('/canvas');
  };

  // Breadcrumbs: Library › ancestors › current folder, or Library › view.
  const curFolder = lib.folders.find((f) => f.id === lib.currentFolderId) ?? null;
  const crumbs = useMemo(() => {
    const chain: { id: string; name: string }[] = [];
    for (let f = curFolder; f && chain.length < 20; f = lib.folders.find((x) => x.id === f?.parentId) ?? null) chain.unshift({ id: f.id, name: f.name });
    return chain;
  }, [curFolder, lib.folders]);
  useEffect(() => {
    if (lib.currentFolderId && !curFolder && !lib.loading) lib.setCurrentFolder(null);
  }, [lib, curFolder]);
  const viewName = libView === 'recent' ? 'Recent' : libView === 'starred' ? 'Starred' : libView === 'shared' ? 'Shared with me' : null;
  const breadcrumbs = (viewName || crumbs.length > 0) && (
    <nav className="libcrumbs" aria-label="Breadcrumb">
      <button type="button" onClick={() => { lib.setCurrentFolder(null); navigate('/dashboard'); }}>Library</button>
      {viewName ? (
        <>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{viewName}</span>
        </>
      ) : (
        crumbs.map((c, i) => (
          <span key={c.id} style={{ display: 'contents' }}>
            <span aria-hidden="true">›</span>
            {i === crumbs.length - 1 ? (
              <span aria-current="page">{c.name}</span>
            ) : (
              <button type="button" onClick={() => lib.setCurrentFolder(c.id)}>{c.name}</button>
            )}
          </span>
        ))
      )}
    </nav>
  );

  const freeUpSpace = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
    pushToast('Select diagrams to delete, then press Delete');
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

  const startRename = (d: DiagramDoc) => {
    setRenameText(d.title);
    setRenamingId(d.id);
  };

  const commitRename = (id: string) => {
    renameDoc(id, renameText);
    setRenamingId(null);
  };

  const closeMenu = (id: string) => {
    setMenuId(null);
    window.setTimeout(() => document.getElementById(`libpage-more-${id}`)?.focus(), 0);
  };

  // "Save as template" (E10-T07): a tagged server copy titled "<title> (template)". The doc itself is untouched.
  const makeTemplate = async (d: DiagramDoc) => {
    const live = d.id === activeDocId
      ? { ...d, nodes: liveNodes, edges: liveEdges, strokes: liveStrokes, texts: liveTexts, pages: livePages, layers: liveLayers, defaults: docDefaults }
      : d;
    try {
      await saveAsTemplate(live);
      pushToast(`Saved ${d.title} as a team template`);
    } catch (e) {
      pushToast(`Could not save the template: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const cardMenu = (d: DiagramDoc) => {
    const id = d.id;
    return (
      <div
        className="libpage-menu"
        role="menu"
        aria-label={`Actions for ${d.title}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            closeMenu(id);
          }
        }}
      >
        {[
          { label: 'Open', fn: () => open(id) },
          { label: 'Rename', fn: () => startRename(d) },
          { label: 'Duplicate', fn: () => { duplicateDoc(id); track('diagram_created', { source: 'duplicate' }); } },
          ...(signedIn && !isServerDocId(d.id) ? [{ label: 'Save to server', fn: () => { openDoc(id); window.setTimeout(() => { void saveActiveDoc(); }, 50); } }] : []),
          ...(signedIn ? [{ label: 'Save as template', fn: () => { void makeTemplate(d); } }] : []),
          { label: 'Move to…', fn: () => setMoveDocId(id) },
          { label: 'Export .arch', fn: () => { openDoc(id); window.setTimeout(exportArch, 50); } },
          { label: 'Export PNG', fn: () => exportPngFor(id) },
          { label: 'Export SVG (vector)', fn: () => { openDoc(id); window.setTimeout(exportSVG, 50); } },
          { label: 'Export CSV (shape data)', fn: () => { openDoc(id); window.setTimeout(exportCSV, 50); } },
          { label: 'Print / Save as PDF', fn: () => { openDoc(id); window.setTimeout(exportPrint, 50); } },
        ].map((a, i) => (
          <button
            key={a.label}
            role="menuitem"
            className="dock-action-btn libpage-menu__item"
            autoFocus={i === 0}
            onClick={() => { a.fn(); setMenuId(null); }}
          >
            {a.label}
          </button>
        ))}
        <button
          role="menuitem"
          className="dock-action-btn libpage-menu__item libpage-menu__item--danger"
          onClick={() => {
            setMenuId(null);
            deleteDoc(id);
            pushToast(`Moved ${d.title} to the trash`);
          }}
        >
          Move to trash
        </button>
        {tagEditingId === id ? (
          <form
            className="libpage-menu__tags"
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
              className="libpage-input"
              placeholder="tags, comma, separated"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              aria-label="Edit tags"
            />
            <button type="submit" className="btn btn--sm btn--primary">Save</button>
          </form>
        ) : (
          <button
            role="menuitem"
            className="dock-action-btn libpage-menu__item"
            onClick={() => {
              setTagText((d.tags ?? []).join(', '));
              setTagEditingId(id);
            }}
          >
            Edit tags…
          </button>
        )}
      </div>
    );
  };

  const renameInput = (d: DiagramDoc) => (
    <input
      autoFocus
      className="libpage-input"
      value={renameText}
      onChange={(e) => setRenameText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitRename(d.id);
        else if (e.key === 'Escape') setRenamingId(null);
      }}
      onBlur={() => { if (renamingId === d.id) commitRename(d.id); }}
      aria-label="Diagram title"
    />
  );

  // Roving tabindex for the Source radiogroup (arrow keys move + select).
  const onSourceKey = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + SOURCES.length) % SOURCES.length;
    setSource(SOURCES[next].value);
    sourceRefs.current[next]?.focus();
  };

  const header = (
    <PageHeader
      title="Library"
      subtitle={librarySubtitle(docs, signedIn, libView === 'all' ? undefined : { label: libView, shown: filtered.length })}
      actions={
        <>
          <button type="button" className="libpage-btn libpage-btn--secondary" onClick={() => setNewFolderOpen(true)}>New folder</button>
          <button type="button" className="libpage-btn libpage-btn--secondary" onClick={() => setImportOpen({})}>Import .arch</button>
          <button type="button" className="libpage-btn libpage-btn--primary" onClick={() => setNewDiagramOpen(true)} aria-keyshortcuts="N">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New diagram
          </button>
        </>
      }
    />
  );

  const toolbar = (
    <div className="libpage-toolbar">
      <label className="libpage-search">
        <SearchIcon />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search diagrams by name or tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search diagrams"
          aria-keyshortcuts="/"
        />
      </label>
      <div className="libpage-segmented" role="radiogroup" aria-label="Source">
        {SOURCES.map((s, i) => (
          <button
            key={s.value}
            ref={(el) => { sourceRefs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={source === s.value}
            tabIndex={source === s.value ? 0 : -1}
            className="libpage-segmented__item"
            onClick={() => setSource(s.value)}
            onKeyDown={(e) => onSourceKey(e, i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="libpage-sort">
        Sort
        <select value={sort} onChange={(e) => setSort(e.target.value === 'alpha' ? 'alpha' : 'modified')}>
          <option value="modified">Last modified</option>
          <option value="alpha">Name</option>
        </select>
      </label>
      <button
        type="button"
        className="libpage-icon-btn"
        aria-label="Table view"
        aria-pressed={view === 'table'}
        title={view === 'table' ? 'Show as cards' : 'Show as a table'}
        onClick={() => setView(view === 'table' ? 'grid' : 'table')}
      >
        <TableIcon />
      </button>
    </div>
  );

  const tagRow = allTags.length > 0 && (
    <div className="libpage-tags" role="group" aria-label="Filter by tag">
      <span className="libpage-tags__label">Tags:</span>
      {allTags.map((t) => (
        <button key={t} className={`btn btn--sm btn--${tagFilter === t ? 'primary' : 'secondary'}`} aria-pressed={tagFilter === t} aria-label={`Filter by #${t}`} onClick={() => setTagFilter((cur) => (cur === t ? null : t))}>
          #{t}
        </button>
      ))}
      {tagFilter && <button className="btn btn--sm btn--secondary" onClick={() => setTagFilter(null)}>Clear</button>}
    </div>
  );

  const selectBar = selectMode && (
    <div className="libpage-selectbar" role="group" aria-label="Free up space">
      <span>{selectedIds.size} selected</span>
      <button className="btn btn--sm btn--secondary" style={{ color: 'var(--accent-rose)' }} disabled={selectedIds.size === 0} onClick={bulkDelete}>Delete ({selectedIds.size})</button>
      <button className="btn btn--sm btn--secondary" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>Done</button>
    </div>
  );

  const filtersActive = query.trim() !== '' || tagFilter !== null || source !== 'all';
  const emptyState = !filtersActive && libView === 'shared' ? (
    <div className="content-card libpage-empty" role="status">
      <EmptyState title="Nothing has been shared with you yet" body="Diagrams other people share with you will show up here." />
    </div>
  ) : !filtersActive && libView === 'starred' ? (
    <div className="content-card libpage-empty" role="status">
      <EmptyState title="No starred diagrams" body="Star a diagram to find it here." />
    </div>
  ) : !filtersActive && libView === 'all' && lib.currentFolderId ? (
    <div className="content-card libpage-empty" role="status">
      <EmptyState
        title="This folder is empty"
        body="Create a diagram here, or move existing ones in."
        action={{ label: 'New diagram', onClick: () => setNewDiagramOpen(true) }}
        secondary={{ label: 'Move diagrams here', onClick: () => setMoveHereOpen(true) }}
      />
    </div>
  ) : docs.length > 0 ? (
    <div className="content-card libpage-empty" role="status">
      <EmptyState
        title="No diagrams match your filters"
        body="Try a different search term, or clear filters to see everything."
        action={{ label: 'Clear search & filters', onClick: () => { setQuery(''); setTagFilter(null); setSource('all'); } }}
      />
    </div>
  ) : (
    <div className="content-card libpage-empty" role="status">
      <EmptyState
        title="No diagrams yet"
        body="Create blank, load the e-commerce blueprint, or import an .arch file."
        action={{ label: 'Create blank', onClick: createNew }}
        secondary={{ label: 'Load e-commerce blueprint', onClick: () => navigate('/blueprints') }}
      />
      <div className="libpage-empty__actions">
        <button className="btn btn--sm btn--secondary" onClick={() => setImportOpen({})}>Import .arch</button>
      </div>
    </div>
  );

  const starButton = (d: DiagramDoc) => {
    const on = lib.starredIds.includes(d.id);
    return (
      <button
        type="button"
        className={`libpage-card__action libpage-card__star${on ? ' is-on' : ''}`}
        aria-label={`Star ${d.title}`}
        aria-pressed={on}
        title={on ? 'Unstar' : 'Star'}
        onClick={() => void lib.toggleStar(d.id)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
        </svg>
      </button>
    );
  };

  const grid = (
    <div className="libpage-grid">
      {filtered.map((d) => {
        const isPinned = pinned.has(d.id);
        const menuOpen = menuId === d.id;
        const body = (
          <span className="libpage-card__body">
            {renamingId === d.id ? null : <span className="libpage-card__title">{d.title}</span>}
            <span className="libpage-card__meta">
              <SourceChip doc={d} />
              <span>{cardMeta(d)}</span>
            </span>
          </span>
        );
        return (
          <div
            key={d.id}
            className={`libpage-card${menuOpen ? ' is-menu-open' : ''}`}
            data-testid="libpage-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DOC_DRAG_TYPE, d.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
          >
            {renamingId === d.id ? (
              <div className="libpage-card__link">
                <DocThumbnail doc={d} />
                <span className="libpage-card__body">{renameInput(d)}</span>
              </div>
            ) : (
              <a
                className="libpage-card__link"
                href="/canvas"
                onClick={(e) => {
                  e.preventDefault();
                  open(d.id);
                }}
              >
                <DocThumbnail doc={d} />
                {body}
              </a>
            )}
            {selectMode && (
              <input
                type="checkbox"
                className="libpage-card__check"
                checked={selectedIds.has(d.id)}
                onChange={() => toggleSelect(d.id)}
                aria-label={`Select ${d.title}`}
              />
            )}
            <div className={`libpage-card__actions${isPinned || menuOpen || lib.starredIds.includes(d.id) ? ' is-visible' : ''}`}>
              {starButton(d)}
              <button
                type="button"
                className={`libpage-card__action${isPinned ? ' is-on' : ''}`}
                aria-label={isPinned ? 'Unpin diagram' : 'Pin diagram'}
                aria-pressed={isPinned}
                title={isPinned ? 'Unpin' : 'Pin to top'}
                onClick={() => togglePin(d.id)}
              >
                <PinIcon filled={isPinned} />
              </button>
              <button
                type="button"
                id={`libpage-more-${d.id}`}
                className="libpage-card__action"
                aria-label={`Options for ${d.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuId(menuOpen ? null : d.id)}
              >
                <MoreIcon />
              </button>
            </div>
            {menuOpen && cardMenu(d)}
            {(d.tags ?? []).length > 0 && (
              <div className="libpage-card__tags">
                {(d.tags ?? []).map((t) => (
                  <button key={t} className="btn btn--sm btn--secondary" style={{ fontSize: 10 }} title={`Filter by #${t}`} onClick={() => setTagFilter(t)}>#{t}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const table = (
    <div className="content-card libpage-table" role="table" aria-label="Diagrams table">
      <div role="row" className="libpage-table__head">
        {([
          { key: 'alpha', label: 'Title' },
          { key: 'modified', label: 'Updated' },
        ] as const).map((col) => (
          <button
            key={col.key}
            role="columnheader"
            aria-sort={sort === col.key ? (col.key === 'alpha' ? 'ascending' : 'descending') : 'none'}
            onClick={() => setSort(col.key)}
            title={`Sort by ${col.label}`}
            className={`libpage-table__sort${sort === col.key ? ' is-active' : ''}`}
          >
            {col.label}{sort === col.key ? (col.key === 'alpha' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
      </div>
      {filtered.map((d) => (
        <div key={d.id} role="row" className="libpage-table__row" aria-label={`${d.title} — ${d.nodes.length} nodes, ${d.edges.length} edges, updated ${relativeTime(d.updatedAt)}`}>
          {selectMode && (
            <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} aria-label={`Select ${d.title}`} />
          )}
          {renamingId === d.id ? (
            <span style={{ flex: 1 }}>{renameInput(d)}</span>
          ) : (
            <button className="libpage-table__open" onClick={() => open(d.id)}>{d.title}</button>
          )}
          {starButton(d)}
          <SourceChip doc={d} />
          {(d.tags ?? []).map((t) => <span key={t} className="libpage-table__tag">#{t}</span>)}
          <span className="libpage-table__meta" aria-label={`${d.nodes.length} nodes, ${d.edges.length} edges`}>{d.nodes.length} nodes · {d.edges.length} edges</span>
          <span className="libpage-table__meta" aria-label="Last updated">{relativeTime(d.updatedAt)}</span>
          <button className="btn btn--sm btn--secondary" id={`libpage-more-${d.id}`} aria-label={`Options for ${d.title}`} aria-haspopup="menu" aria-expanded={menuId === d.id} onClick={() => setMenuId(menuId === d.id ? null : d.id)}>⋯</button>
          {menuId === d.id && cardMenu(d)}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="screen-view active libpage-screen"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && /\.(arch|json|drawio|xml|mmd|mermaid)$/i.test(f.name)) setImportOpen({ file: f });
        else if (f) pushToast('Drop a .arch, .drawio or .mmd file to import it');
      }}
    >
      <div className="libshell">
      <LibrarySidebar active={libView === 'all' ? 'all' : libView} />
      <div className="libpage-page">
        <div className="libpage-content">
          {header}
          {breadcrumbs}
          {toolbar}
          {tagRow}
          {selectBar}
          {importOpen && (
            <ImportDialog initialFile={importOpen.file} onClose={() => setImportOpen(null)} onImported={() => navigate('/canvas')} />
          )}
          {dragOver && <div className="libpage-drop">Drop a .arch, .drawio or .mmd file to import it</div>}
          {filtered.length === 0 && lib.loading ? <Skeleton label="Loading diagrams" /> : filtered.length === 0 ? emptyState : view === 'table' ? table : grid}
          <StorageFooter docCount={docs.length} usedKB={usedKB} onFreeUp={freeUpSpace} onManage={() => navigate('/settings/storage')} />
        </div>
      </div>
      </div>
      {newDiagramOpen && <NewDiagramDialog onClose={() => setNewDiagramOpen(false)} />}
      {newFolderOpen && (
        <NameDialog
          title="New folder"
          label="Folder name"
          submitLabel="Create"
          parentNote={curFolder ? `Created inside “${curFolder.name}”.` : undefined}
          onSubmit={async (name) => ((await lib.createFolder(name, lib.currentFolderId)) ? null : 'Could not create the folder. A folder with that name may already exist here.')}
          onClose={() => setNewFolderOpen(false)}
        />
      )}
      {moveDocId && (() => {
        const target = docs.find((d) => d.id === moveDocId);
        if (!target) return null;
        return (
          <MoveToDialog
            docTitle={target.title}
            folders={lib.folders}
            currentFolderId={lib.docFolders[target.id] ?? null}
            onClose={() => setMoveDocId(null)}
            onMove={(folderId) => {
              setMoveDocId(null);
              void lib.moveDoc(target.id, folderId).then((ok) => pushToast(ok ? `Moved ${target.title}` : `Could not move ${target.title}`));
            }}
          />
        );
      })()}
      {moveHereOpen && curFolder && (
        <MoveHereDialog
          folderName={curFolder.name}
          candidates={docs.filter((d) => lib.docFolders[d.id] !== curFolder.id).map((d) => ({ id: d.id, title: d.title }))}
          onClose={() => setMoveHereOpen(false)}
          onMove={(docId) => void lib.moveDoc(docId, curFolder.id)}
        />
      )}
    </div>
  );
}
