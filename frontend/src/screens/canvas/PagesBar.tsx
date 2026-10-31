import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useDiagram } from '../../state/useDiagram';
import { canEdit } from '../../lib/access';

export interface PagesBarProps {
  /** Number of layers, shown on the Layers button. */
  layerCount: number;
  layersOpen: boolean;
  onToggleLayers: () => void;
}

const TAB_BASE = { height: 30, padding: '0 12px', border: 'none', borderRadius: 6, font: 'inherit', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' } as const;

/**
 * R1-E03-T04 (CanvasPro.dc.html "Pages bar"): one tab per page ("2 · Containers"), a "+" button, and
 * the Layers toggle. Double-click or F2 renames a tab inline; the tab context menu (right-click,
 * Shift+F10) offers Rename, Duplicate, Delete, Move left, Move right. Ctrl+PageUp / Ctrl+PageDown
 * switch pages from anywhere on the canvas.
 */
export function PagesBar({ layerCount, layersOpen, onToggleLayers }: PagesBarProps) {
  const { pages, activePageId, setActivePageId, addPage, renamePage, deletePage, duplicatePage, reorderPages, role } = useDiagram();
  const editable = canEdit(role);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRef = useRef<HTMLDivElement>(null);

  // Ctrl+PageUp / Ctrl+PageDown: previous / next page (wraps off at the ends).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const at = pages.findIndex((p) => p.id === activePageId);
      const next = pages[at + (e.key === 'PageDown' ? 1 : -1)];
      e.preventDefault();
      if (next) setActivePageId(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages, activePageId, setActivePageId]);

  const startRename = (id: string) => {
    if (!editable) return;
    setDraft(pages.find((p) => p.id === id)?.name ?? '');
    setEditing(id);
  };
  const commit = () => {
    if (editing) {
      const name = draft.trim();
      if (name) renamePage(editing, name);
    }
    const id = editing;
    setEditing(null);
    if (id) requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  };

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, id: string, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = pages[index + (e.key === 'ArrowRight' ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      setActivePageId(next.id);
      tabRefs.current.get(next.id)?.focus();
    } else if (e.key === 'F2') {
      e.preventDefault();
      startRename(id);
    } else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      if (!editable) return;
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ id, x: r.left, y: r.top });
    }
  };

  // Focus the first menu item when the menu opens.
  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  const closeMenu = (restore: boolean) => {
    const id = menu?.id;
    setMenu(null);
    if (restore && id) tabRefs.current.get(id)?.focus();
  };

  const menuItems = (() => {
    if (!menu) return [];
    const at = pages.findIndex((p) => p.id === menu.id);
    const move = (dir: -1 | 1) => () => {
      const ids = pages.map((p) => p.id);
      [ids[at], ids[at + dir]] = [ids[at + dir], ids[at]];
      reorderPages(ids);
    };
    const items: { label: string; run: () => void }[] = [
      { label: 'Rename', run: () => startRename(menu.id) },
      { label: 'Duplicate', run: () => { duplicatePage(menu.id); } },
    ];
    if (pages.length > 1) items.push({ label: 'Delete', run: () => deletePage(menu.id) });
    if (at > 0) items.push({ label: 'Move left', run: move(-1) });
    if (at >= 0 && at < pages.length - 1) items.push({ label: 'Move right', run: move(1) });
    return items;
  })();

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
  };

  return (
    <div className="pages-bar">
      <div role="tablist" aria-label="Pages" style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', minWidth: 0 }}>
        {pages.map((p, i) => {
          const on = p.id === activePageId;
          if (editing === p.id) {
            return (
              <input
                key={p.id}
                autoFocus
                aria-label="Rename page"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); requestAnimationFrame(() => tabRefs.current.get(p.id)?.focus()); }
                }}
                style={{ height: 28, width: 150, padding: '0 8px', border: '1px solid var(--accent, #4F46E5)', borderRadius: 6, font: 'inherit' }}
              />
            );
          }
          return (
            <button
              key={p.id}
              ref={(el) => { if (el) tabRefs.current.set(p.id, el); else tabRefs.current.delete(p.id); }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              title={editable ? 'Double-click to rename' : undefined}
              onClick={() => setActivePageId(p.id)}
              onDoubleClick={() => startRename(p.id)}
              onContextMenu={(e) => { e.preventDefault(); if (editable) setMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}
              onKeyDown={(e) => onTabKeyDown(e, p.id, i)}
              style={{
                ...TAB_BASE,
                background: on ? '#EEF0FF' : 'transparent',
                color: on ? '#4338CA' : 'var(--text-muted, #5B6474)',
                fontWeight: on ? 600 : 400,
              }}
            >
              {i + 1} · {p.name}
            </button>
          );
        })}
      </div>
      {editable && <button type="button" aria-label="Add page" title="Add page" onClick={() => addPage()} style={{ ...TAB_BASE, width: 30, padding: 0, background: 'transparent', fontSize: 16, color: 'var(--text-muted, #5B6474)' }}>
        +
      </button>}
      <button
        type="button"
        aria-pressed={layersOpen}
        aria-label={`Layers, ${layerCount}`}
        onClick={onToggleLayers}
        style={{ ...TAB_BASE, marginLeft: 6, padding: '0 10px', border: '1px solid var(--border-panel, #E3E6EB)', background: layersOpen ? '#F6F7F9' : 'transparent', fontWeight: 500, color: 'var(--text-main, #1B1F27)' }}
      >
        Layers · {layerCount}
      </button>
      {menu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 89 }} onPointerDown={() => closeMenu(false)} onContextMenu={(e) => { e.preventDefault(); closeMenu(false); }} />
          <div
            ref={menuRef}
            role="menu"
            aria-label={`${pages.find((p) => p.id === menu.id)?.name ?? 'Page'} actions`}
            onKeyDown={onMenuKeyDown}
            style={{
              position: 'fixed', left: menu.x, top: Math.max(8, menu.y - menuItems.length * 32 - 16), zIndex: 90, width: 180, padding: 6,
              background: 'var(--bg-panel, #FFFFFF)', border: '1px solid var(--border-panel, #E3E6EB)', borderRadius: 10, boxShadow: '0 16px 40px rgba(16,24,40,.16)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {menuItems.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => { setMenu(null); it.run(); }}
                style={{ height: 30, padding: '0 10px', border: 'none', borderRadius: 6, background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: it.label === 'Delete' ? '#B91C1C' : 'var(--text-main, #1F2937)' }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
