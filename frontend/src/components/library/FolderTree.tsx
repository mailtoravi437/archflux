import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { LibraryFolder } from '../../state/library';

export const DOC_DRAG_TYPE = 'application/x-archflux-doc';

interface FolderTreeProps {
  folders: LibraryFolder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A diagram card dropped on a folder. */
  onDropDoc: (docId: string, folderId: string) => void;
}

interface Row {
  folder: LibraryFolder;
  level: number;
  hasChildren: boolean;
  parentId: string | null;
}

/** Folder tree (SC-06): `role="tree"`, roving tabindex, arrow keys expand, collapse and move. */
export function FolderTree({ folders, selectedId, onSelect, onDropDoc }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const refs = useRef<Map<string, HTMLElement>>(new Map());

  const { rows } = useMemo(() => {
    const byParent = new Map<string | null, LibraryFolder[]>();
    const ids = new Set(folders.map((f) => f.id));
    for (const f of folders) {
      // A folder whose parent is missing (trashed) is shown at the root.
      const key = f.parentId && ids.has(f.parentId) ? f.parentId : null;
      byParent.set(key, [...(byParent.get(key) ?? []), f]);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const rows: Row[] = [];
    const walk = (parent: string | null, level: number) => {
      for (const f of byParent.get(parent) ?? []) {
        const hasChildren = (byParent.get(f.id) ?? []).length > 0;
        rows.push({ folder: f, level, hasChildren, parentId: parent });
        if (hasChildren && expanded.has(f.id)) walk(f.id, level + 1);
      }
    };
    walk(null, 1);
    return { rows };
  }, [folders, expanded]);

  const tabStop = focusId && rows.some((r) => r.folder.id === focusId) ? focusId : (selectedId && rows.some((r) => r.folder.id === selectedId) ? selectedId : rows[0]?.folder.id ?? null);

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    refs.current.get(id)?.focus();
  };

  const toggle = (id: string, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const onKey = (e: ReactKeyboardEvent<HTMLElement>, i: number) => {
    const row = rows[i];
    if (!row) return;
    const open = expanded.has(row.folder.id);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusRow(rows[i + 1]?.folder.id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusRow(rows[i - 1]?.folder.id);
        break;
      case 'Home':
        e.preventDefault();
        focusRow(rows[0]?.folder.id);
        break;
      case 'End':
        e.preventDefault();
        focusRow(rows[rows.length - 1]?.folder.id);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.hasChildren && !open) toggle(row.folder.id, true);
        else if (row.hasChildren) focusRow(rows[i + 1]?.folder.id);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.hasChildren && open) toggle(row.folder.id, false);
        else if (row.parentId) focusRow(row.parentId);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(row.folder.id);
        break;
    }
  };

  if (rows.length === 0) return null;

  return (
    <ul role="tree" aria-label="Folders" className="libside__tree">
      {rows.map((r, i) => {
        const f = r.folder;
        const selected = f.id === selectedId;
        const open = expanded.has(f.id);
        return (
          <li
            key={f.id}
            role="treeitem"
            aria-level={r.level}
            aria-selected={selected}
            aria-expanded={r.hasChildren ? open : undefined}
            tabIndex={tabStop === f.id ? 0 : -1}
            ref={(el) => {
              if (el) refs.current.set(f.id, el);
              else refs.current.delete(f.id);
            }}
            className={`libside__item libside__folder${selected ? ' is-active' : ''}${dropId === f.id ? ' is-drop' : ''}`}
            style={{ paddingLeft: 10 + (r.level - 1) * 14 }}
            onFocus={() => setFocusId(f.id)}
            onKeyDown={(e) => { if (e.target === e.currentTarget) onKey(e, i); }}
            onClick={(e) => { e.stopPropagation(); onSelect(f.id); }}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes(DOC_DRAG_TYPE)) {
                e.preventDefault();
                setDropId(f.id);
              }
            }}
            onDragLeave={() => setDropId((d) => (d === f.id ? null : d))}
            onDrop={(e) => {
              const docId = e.dataTransfer.getData(DOC_DRAG_TYPE);
              setDropId(null);
              if (docId) {
                e.preventDefault();
                e.stopPropagation();
                onDropDoc(docId, f.id);
              }
            }}
          >
            <span
              className="libside__chev"
              aria-hidden="true"
              onClick={(e) => {
                if (!r.hasChildren) return;
                e.stopPropagation();
                toggle(f.id, !open);
              }}
            >
              {r.hasChildren ? (open ? '▾' : '▸') : ''}
            </span>
            <span className="libside__name">{f.name}</span>
          </li>
        );
      })}
    </ul>
  );
}
