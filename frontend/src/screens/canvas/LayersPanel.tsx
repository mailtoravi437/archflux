import { useMemo, useRef, useState } from 'react';
import { useDiagram } from '../../state/useDiagram';
import { canEdit } from '../../lib/access';
import { firstPageId } from '../../lib/pageView';
import { DEFAULT_LAYER_ID } from '../../state/ops/layers';

export interface LayersPanelProps {
  /** Ids of the selected elements (nodes, ink, text): "Move selection here" moves these. */
  selectionIds: string[];
  onClose: () => void;
}

const ICON_BTN = { width: 26, height: 26, border: '1px solid var(--border-panel, #E3E6EB)', borderRadius: 6, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 12, padding: 0, color: 'var(--text-main, #1B1F27)' } as const;

/**
 * R1-E03-T05 (CanvasPro.dc.html "Layers popover"): the layer list, top layer first. Each row has a
 * visibility toggle ("Hide <name>", aria-pressed when hidden), a lock toggle, double-click rename, Move up /
 * Move down (drag a row for the same), and "Move selection here". Hidden layers are not drawn or
 * hit-tested; locked layers are drawn but cannot be selected or moved.
 */
export function LayersPanel({ selectionIds, onClose }: LayersPanelProps) {
  const { layers, nodes, strokes, texts, addLayer, updateLayer, deleteLayer, reorderLayers, moveToLayer, role, pages, activePageId } = useDiagram();
  const editable = canEdit(role);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const dragId = useRef<string | null>(null);
  const topFirst = useMemo(() => [...layers].sort((a, b) => b.order - a.order), [layers]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    // BUG-LIVE-023: count the active page only (layers are shared by all pages of the diagram).
    const first = firstPageId(pages);
    for (const e of [...nodes, ...strokes, ...texts]) {
      if ((e.pageId ?? first) !== activePageId) continue;
      const id = e.layerId ?? DEFAULT_LAYER_ID;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [nodes, strokes, texts, pages, activePageId]);

  const bottomToTop = () => topFirst.map((l) => l.id).reverse();
  const move = (id: string, dir: 'up' | 'down') => {
    const ids = bottomToTop();
    const at = ids.indexOf(id);
    const to = dir === 'up' ? at + 1 : at - 1;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    reorderLayers(ids);
  };
  const dropOn = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    // The dragged layer lands just above the drop target in stacking order.
    const ids = bottomToTop().filter((id) => id !== from);
    ids.splice(ids.indexOf(targetId) + 1, 0, from);
    reorderLayers(ids);
  };
  const commit = () => {
    if (editing && draft.trim()) updateLayer(editing, { name: draft.trim() });
    setEditing(null);
  };

  return (
    <section
      aria-label="Layers"
      onKeyDown={(e) => { if (e.key === 'Escape' && !editing) { e.stopPropagation(); onClose(); } }}
      style={{
        position: 'absolute', right: 16, bottom: 66, width: 260, zIndex: 46, padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
        background: 'var(--bg-panel, #FFFFFF)', border: '1px solid var(--border-panel, #E3E6EB)', borderRadius: 10, boxShadow: '0 8px 24px rgba(16,24,40,.12)',
        maxHeight: 'calc(100% - 140px)', overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, flexGrow: 1 }}>Layers</span>
        {editable && <button type="button" className="btn btn--sm btn--secondary" onClick={() => addLayer()}>Add layer</button>}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {topFirst.map((l, i) => (
          <li
            key={l.id}
            draggable={editable && editing !== l.id}
            onDragStart={() => { dragId.current = l.id; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); dropOn(l.id); }}
            aria-label={`${l.name} layer`}
            style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px', borderRadius: 6, background: l.visible ? 'transparent' : 'var(--bg-panel-subtle, #F6F7F9)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 28 }}>
              <button type="button" disabled={!editable} aria-pressed={!l.visible} aria-label={`Hide ${l.name}`} title={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} onClick={() => updateLayer(l.id, { visible: !l.visible })} style={{ ...ICON_BTN, background: l.visible ? 'transparent' : '#EEF0FF' }}>
                {l.visible ? '◉' : '◌'}
              </button>
              <button type="button" disabled={!editable} aria-pressed={l.locked} aria-label={`Lock ${l.name}`} title={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} onClick={() => updateLayer(l.id, { locked: !l.locked })} style={{ ...ICON_BTN, background: l.locked ? '#EEF0FF' : 'transparent' }}>
                {l.locked ? '🔒' : '🔓'}
              </button>
              {editing === l.id ? (
                <input
                  autoFocus
                  aria-label="Rename layer"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commit();
                    else if (e.key === 'Escape') setEditing(null);
                  }}
                  style={{ flexGrow: 1, minWidth: 0, height: 26, padding: '0 6px', border: '1px solid var(--accent, #4F46E5)', borderRadius: 6, font: 'inherit' }}
                />
              ) : (
                <span
                  style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  title="Double-click to rename"
                  tabIndex={0}
                  onDoubleClick={() => { if (editable) { setDraft(l.name); setEditing(l.id); } }}
                  onKeyDown={(e) => { if (editable && (e.key === 'F2' || e.key === 'Enter')) { e.preventDefault(); setDraft(l.name); setEditing(l.id); } }}
                >
                  {l.name}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-muted, #5B6474)' }} aria-label={`${counts.get(l.id) ?? 0} elements`}>{counts.get(l.id) ?? 0}</span>
            </div>
            {editable && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" style={ICON_BTN} aria-label={`Move ${l.name} up`} title="Move up" disabled={i === 0} onClick={() => move(l.id, 'up')}>↑</button>
              <button type="button" style={ICON_BTN} aria-label={`Move ${l.name} down`} title="Move down" disabled={i === topFirst.length - 1} onClick={() => move(l.id, 'down')}>↓</button>
              {selectionIds.length > 0 && (
                <button type="button" className="btn btn--sm btn--secondary" aria-label={`Move selection to ${l.name}`} onClick={() => moveToLayer(selectionIds, l.id)}>
                  Move selection here
                </button>
              )}
              {l.id !== DEFAULT_LAYER_ID && (
                <button type="button" className="btn btn--sm btn--secondary" style={{ marginLeft: 'auto' }} aria-label={`Delete ${l.name}`} onClick={() => deleteLayer(l.id)}>
                  Delete
                </button>
              )}
            </div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
