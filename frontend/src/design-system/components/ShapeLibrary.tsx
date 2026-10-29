import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { BOUNDARY_NOTATION, KIND_NOTATION } from '../../canvas/notation';
import { loadIconManifest, searchIcons } from '../../lib/icons';
import type { IconEntry } from '../../lib/icons';
import {
  BOUNDARY_KINDS, ELEMENT_KINDS, TILE_DRAG_MIME, boundaryTile, buildNodeFromTile, elementTile, iconTile,
} from '../../lib/shapeTiles';
import type { ShapeTile } from '../../lib/shapeTiles';
import { loadRecentShapes, recordShapeUse } from '../../screens/canvas/recentShapes';
import type { ArchNode, DiagramDoc } from '../../types';

type DocDefaultsLike = NonNullable<DiagramDoc['defaults']>;
const COLUMNS = 4;

/**
 * R1-E05-T04: the "Shapes" left-dock panel (SC-17, FL-19; Palette.dc.html, left aside).
 * Search spans element kinds, boundaries and the icon manifest. Tiles insert on click or Enter at
 * the viewport centre, or are dragged (MIME `text/archflux-tile`, JSON of the ArchNode to create).
 * Presentational: the caller adds the node to the diagram through `onInsert`.
 */

export interface ShapeLibraryProps {
  /** Manifest entries; when omitted the panel loads `/icons/manifest.json`. */
  entries?: IconEntry[];
  /** Canvas-space point new elements are centred on (the viewport centre). */
  viewportCenter: { x: number; y: number };
  pageId?: string;
  docDefaults?: DocDefaultsLike;
  onInsert: (node: ArchNode) => void;
}

type Filter = 'all' | 'elements' | 'boundaries' | 'aws' | 'k8s' | 'generic';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'elements', label: 'Elements' }, { id: 'boundaries', label: 'Boundaries' },
  { id: 'aws', label: 'AWS' }, { id: 'k8s', label: 'Kubernetes' }, { id: 'generic', label: 'Generic' },
];

interface Section { id: string; title: string; tiles: ShapeTile[]; }

const chip = (on: boolean): CSSProperties => ({
  height: 24, padding: '0 8px', border: 'none', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 11,
  background: on ? 'var(--accent-soft, #EEF0FF)' : 'var(--bg-panel-subtle, #F1F2F5)',
  color: on ? 'var(--accent-cyan-text, #4338CA)' : 'var(--text-main)', fontWeight: on ? 600 : 400,
});
const titleStyle: CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' };

function TileGlyph({ tile }: { tile: ShapeTile }) {
  if (tile.type === 'icon' && tile.icon) {
    return <img src={tile.icon.src} alt="" width={30} height={30} style={{ borderRadius: 4 }} draggable={false} />;
  }
  if (tile.type === 'boundary' && tile.boundary) {
    const n = BOUNDARY_NOTATION[tile.boundary];
    return (
      <span aria-hidden="true" style={{
        width: 30, height: 22, boxSizing: 'border-box', borderRadius: n.radius ? 6 : 2, margin: '4px 0',
        border: `${n.width}px ${n.dash.length ? 'dashed' : 'solid'} ${n.stroke}`, background: n.fill ?? 'transparent',
      }} />
    );
  }
  const color = tile.element ? KIND_NOTATION[tile.element].color : '#2563EB';
  return (
    <span aria-hidden="true" className="shape-tile-letter" data-letter={tile.name.charAt(0)} style={{
      width: 30, height: 30, borderRadius: 6, boxSizing: 'border-box', border: `1.5px solid ${color}`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13,
      background: 'var(--bg-panel)',
    }} />
  );
}

export const ShapeLibrary = ({ entries: entriesProp, viewportCenter, pageId, docDefaults, onInsert }: ShapeLibraryProps) => {
  const rootRef = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState<IconEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [recentIds, setRecentIds] = useState<string[]>(loadRecentShapes);
  const [hovered, setHovered] = useState<ShapeTile | null>(null);
  const entries = entriesProp ?? loaded;

  useEffect(() => {
    if (entriesProp) return;
    let alive = true;
    loadIconManifest().then(
      (list) => { if (alive) setLoaded(list); },
      (err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : 'Icon manifest failed to load'); },
    );
    return () => { alive = false; };
  }, [entriesProp]);

  const allTiles = useMemo(() => {
    const byId = new Map<string, ShapeTile>();
    for (const k of ELEMENT_KINDS) byId.set(`el:${k}`, elementTile(k));
    for (const b of BOUNDARY_KINDS) byId.set(`bd:${b}`, boundaryTile(b));
    for (const e of entries ?? []) byId.set(`ic:${e.id}`, iconTile(e));
    return byId;
  }, [entries]);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (t: ShapeTile) => !q || `${t.name} ${t.element ?? ''} ${t.boundary ?? ''}`.toLowerCase().includes(q);
    const out: Section[] = [];
    const recent = recentIds.map((id) => allTiles.get(id)).filter((t): t is ShapeTile => !!t && matches(t));
    if (filter === 'all' && recent.length > 0 && !q) out.push({ id: 'recent', title: 'Recent', tiles: recent });
    if (filter === 'all' || filter === 'elements') {
      const tiles = ELEMENT_KINDS.map(elementTile).filter(matches);
      if (tiles.length > 0) out.push({ id: 'elements', title: 'Elements', tiles });
    }
    if (filter === 'all' || filter === 'boundaries') {
      const tiles = BOUNDARY_KINDS.map(boundaryTile).filter(matches);
      if (tiles.length > 0) out.push({ id: 'boundaries', title: 'Boundaries', tiles });
    }
    if (entries) {
      const iconSection = (set: 'aws' | 'k8s' | 'generic') => searchIcons(entries, query, { set });
      if (filter === 'all' || filter === 'aws') {
        // AWS grouped by the icon's first manifest kind.
        const groups = new Map<string, IconEntry[]>();
        for (const e of iconSection('aws')) {
          const k = e.kinds[0];
          const title = k && k !== 'boundary' ? KIND_NOTATION[k].label : k === 'boundary' ? 'Groups' : 'Other services';
          groups.set(title, [...(groups.get(title) ?? []), e]);
        }
        const ordered = [...groups.entries()].sort(([a], [b]) => (a === 'Other services' ? 1 : b === 'Other services' ? -1 : a.localeCompare(b)));
        for (const [title, list] of ordered) out.push({ id: `aws-${title}`, title: `AWS · ${title}`, tiles: list.map(iconTile) });
      }
      if (filter === 'all' || filter === 'k8s') {
        const list = iconSection('k8s');
        if (list.length > 0) out.push({ id: 'k8s', title: 'Kubernetes', tiles: list.map(iconTile) });
      }
      if (filter === 'all' || filter === 'generic') {
        const list = iconSection('generic');
        if (list.length > 0) out.push({ id: 'generic', title: 'Generic', tiles: list.map(iconTile) });
      }
    }
    return out;
  }, [query, filter, entries, recentIds, allTiles]);

  const insert = (tile: ShapeTile) => {
    recordShapeUse(tile.id);
    setRecentIds(loadRecentShapes());
    onInsert(buildNodeFromTile(tile, viewportCenter, { pageId, docDefaults }));
  };

  const focusTile = (sectionIdx: number, pos: number) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-sec="${sectionIdx}"][data-pos="${pos}"]`);
    el?.focus();
  };

  const onTileKey = (e: ReactKeyboardEvent, tile: ShapeTile, si: number, pos: number) => {
    const size = sections[si].tiles.length;
    const col = pos % COLUMNS;
    let target: [number, number] | null = null;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insert(tile); return; }
    if (e.key === 'ArrowRight') target = pos + 1 < size ? [si, pos + 1] : si + 1 < sections.length ? [si + 1, 0] : null;
    else if (e.key === 'ArrowLeft') target = pos > 0 ? [si, pos - 1] : si > 0 ? [si - 1, sections[si - 1].tiles.length - 1] : null;
    else if (e.key === 'ArrowDown') {
      if (pos + COLUMNS < size) target = [si, pos + COLUMNS];
      else if (si + 1 < sections.length) target = [si + 1, Math.min(col, sections[si + 1].tiles.length - 1)];
    } else if (e.key === 'ArrowUp') {
      if (pos - COLUMNS >= 0) target = [si, pos - COLUMNS];
      else if (si > 0) {
        const prev = sections[si - 1].tiles.length;
        const lastRowStart = Math.floor((prev - 1) / COLUMNS) * COLUMNS;
        target = [si - 1, Math.min(lastRowStart + col, prev - 1)];
      }
    } else return;
    e.preventDefault();
    if (target) focusTile(target[0], target[1]);
  };

  const total = ELEMENT_KINDS.length + BOUNDARY_KINDS.length + (entries?.length ?? 0);

  return (
    <aside ref={rootRef} aria-label="Shapes" style={{ width: 300, flex: '1 1 auto', background: 'var(--bg-panel)', borderRight: '1px solid var(--border-panel)', display: 'flex', flexDirection: 'column', minHeight: 0, color: 'var(--text-main)', fontSize: 13 }}>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--border-panel)' }}>
        <span style={{ fontWeight: 600 }}>Shapes</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', border: '1px solid var(--border-panel)', borderRadius: 6 }}>
          <input
            aria-label="Search shapes"
            type="search"
            placeholder={`Search ${total} shapes`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); focusTile(0, 0); } }}
            style={{ border: 'none', outline: 'none', font: 'inherit', flexGrow: 1, minWidth: 0, background: 'transparent', color: 'inherit' }}
          />
        </label>
        <div role="group" aria-label="Shape sets" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} style={chip(filter === f.id)} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flexGrow: 1, minHeight: 0 }}>
        {loadError && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--accent-rose)' }}>Icons could not be loaded: {loadError}</p>}
        {!entries && !loadError && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Loading icons…</p>}
        {sections.map((sec, si) => (
          <section key={sec.id} aria-label={sec.title} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={titleStyle}>{sec.title}</span>
            <div role="group" aria-label={`${sec.title} shapes`} style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`, gap: 6 }}>
              {sec.tiles.map((tile, pos) => (
                <button
                  key={tile.id}
                  type="button"
                  aria-label={tile.label}
                  title={tile.name}
                  data-sec={si}
                  data-pos={pos}
                  tabIndex={si === 0 && pos === 0 ? 0 : -1}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TILE_DRAG_MIME, JSON.stringify(buildNodeFromTile(tile, viewportCenter, { pageId, docDefaults })));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => insert(tile)}
                  onKeyDown={(e) => onTileKey(e, tile, si, pos)}
                  onMouseEnter={() => setHovered(tile)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(tile)}
                  onBlur={() => setHovered(null)}
                  style={{
                    height: 68, minWidth: 0, padding: '0 2px', textAlign: 'center', border: '1px solid var(--border-panel)', borderRadius: 8, cursor: 'pointer',
                    background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 4, font: 'inherit', fontSize: 11, lineHeight: '13px', color: 'var(--text-main)',
                  }}
                >
                  <TileGlyph tile={tile} />
                  <span aria-hidden="true" data-tile-label style={{ maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflowWrap: 'anywhere' }}>{tile.short}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {entries && sections.length === 0 && (
          <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No shapes match &quot;{query.trim()}&quot;.</p>
        )}
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-panel)', minHeight: 44, fontSize: 11, color: 'var(--text-muted)' }}>
        {hovered ? (
          <>
            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{hovered.name}</div>
            <div>{hovered.provider} · Drag or press Enter to add</div>
          </>
        ) : 'Drag a shape onto the canvas, or select one and press Enter.'}
      </div>
    </aside>
  );
};
