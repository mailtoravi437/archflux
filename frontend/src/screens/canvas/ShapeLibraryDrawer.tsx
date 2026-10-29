import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { LibraryShape, ShapeCategory } from '../../types';
import { libraryShapes } from '../../canvas/ShapeRegistry';

export interface ShapeLibraryDrawerProps {
  libQuery: string;
  setLibQuery: Dispatch<SetStateAction<string>>;
  libCategory: 'all' | ShapeCategory;
  setLibCategory: Dispatch<SetStateAction<'all' | ShapeCategory>>;
  /** Search input; CanvasScreen focuses it when the drawer opens (SHP-R8). */
  searchRef: RefObject<HTMLInputElement | null>;
  recentShapeIds: string[];
  /** Places a shape at the view centre. */
  onPlace: (shape: LibraryShape) => void;
  onClose: () => void;
}

/** Non-modal shape library drawer: search, recent shapes, categories and the shape grid. */
export function ShapeLibraryDrawer({
  libQuery,
  setLibQuery,
  libCategory,
  setLibCategory,
  searchRef,
  recentShapeIds,
  onPlace,
  onClose,
}: ShapeLibraryDrawerProps) {
  const libQ = libQuery.trim().toLowerCase();
  const libShapes = useMemo(
    () =>
      libraryShapes.filter(
        (s) =>
          (libCategory === 'all' || s.category === libCategory) &&
          (!libQ || `${s.label} ${s.tag} ${s.provider}`.toLowerCase().includes(libQ)),
      ),
    [libCategory, libQ],
  );

  return (
    <div className="library-drawer" id="shape-library-drawer" role="dialog" aria-modal="false" aria-label="Shape library">
      <div className="linter-header">
        <div className="linter-title">
          <img src="/icons/general/database.svg" alt="" style={{ width: 16, height: 16, marginRight: 6 }} />
          <span>Shape Library</span>
          <span className="badge-count cyan">{libShapes.length}</span>
        </div>
        <button className="btn btn--sm btn--secondary" onClick={onClose}>Close ✕</button>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          ref={searchRef}
          type="search"
          className="doc-title-input"
          style={{ background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}
          placeholder="Search shapes… (EC2, Kafka, Redis)"
          value={libQuery}
          onChange={(e) => setLibQuery(e.target.value)}
          aria-label="Search shapes"
        />
        {recentShapeIds.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Recently used</div>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }} role="group" aria-label="Recently used shapes">
              {recentShapeIds.map((id) => {
                const s = libraryShapes.find((sh) => sh.id === id);
                if (!s) return null;
                return (
                  <button
                    key={id}
                    className="btn btn--sm btn--secondary"
                    title={`${s.label} — ${s.tag}`}
                    aria-label={`Place recent shape ${s.label}, ${s.category} category`}
                    onClick={() => onPlace(s)}
                    style={{ flexShrink: 0 }}
                  >
                    {s.iconSrc ? (
                      <img src={s.iconSrc} alt="" style={{ width: 18, height: 18, display: 'block' }} />
                    ) : (
                      <span aria-hidden="true">{s.icon}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="tablist" aria-label="Shape categories">
          {(['all', 'general', 'compute', 'storage', 'database', 'network', 'messaging', 'observability'] as const).map((cat) => {
            // Live counts reflect the current search (LIB-R2).
            const inSearch = (s: LibraryShape) =>
              !libQ || `${s.label} ${s.tag} ${s.provider} ${s.category}`.toLowerCase().includes(libQ);
            const count = cat === 'all'
              ? libraryShapes.filter(inSearch).length
              : libraryShapes.filter((s) => s.category === cat && inSearch(s)).length;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={libCategory === cat}
                className={`btn btn--sm btn--${libCategory === cat ? 'primary' : 'secondary'}`}
                onClick={() => setLibCategory(cat)}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
              </button>
            );
          })}
        </div>
        <div className="lib-grid">
          {libShapes.map((s) => (
            <button
              key={s.id}
              className="lib-shape"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/archflux-shape', JSON.stringify(s))}
              onClick={() => onPlace(s)}
              title={`${s.label} — ${s.tag}. Click to place, or drag onto canvas.`}
            >
              {s.iconSrc ? (
                <img src={s.iconSrc} alt="" style={{ width: 28, height: 28 }} aria-hidden="true" />
              ) : (
                <span className="lib-shape-icon" aria-hidden="true">{s.icon}</span>
              )}
              <span className="lib-shape-label">{s.label}</span>
              <span className="lib-shape-tag">{s.provider}</span>
            </button>
          ))}
        </div>
        {libShapes.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No shapes match “{libQuery}”. <button className="btn btn--sm btn--secondary" style={{ marginLeft: 4 }} onClick={() => { setLibQuery(''); setLibCategory('all'); }}>Clear</button></div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)' }}>Click places at view center · drag places precisely</div>
      </div>
    </div>
  );
}
