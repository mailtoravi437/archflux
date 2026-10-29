import { useState } from 'react';
import { track } from '../../lib/analytics';
import { useNavigate } from 'react-router-dom';
import { useDiagramDocs } from '../../state/useDiagram';
import { MenuButton } from './MenuButton';
import type { MenuEntry } from './MenuButton';

const RECENT_DOCS = 5;

/**
 * App-bar document switcher (UI_REVAMP_SPEC §4): shows the current title;
 * its menu holds Rename, Duplicate, New and the 5 most recent docs.
 */
export function DocSwitcher() {
  const navigate = useNavigate();
  const { docTitle, docs, activeDocId, openDoc, newDoc, renameDoc, duplicateDoc } = useDiagramDocs();
  const [renaming, setRenaming] = useState(false);
  const [text, setText] = useState('');
  const title = docTitle.trim() || 'Untitled diagram';

  const recent = docs
    .filter((d) => d.id !== activeDocId)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECENT_DOCS);

  const commitRename = () => {
    const next = text.trim();
    if (next) renameDoc(activeDocId, next);
    setRenaming(false);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        className="appbar-doc__input"
        aria-label="Rename diagram"
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitRename();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setRenaming(false);
          }
        }}
        onBlur={commitRename}
      />
    );
  }

  const items: MenuEntry[] = [
    { id: 'rename', label: 'Rename…', onSelect: () => { setText(docTitle); setRenaming(true); } },
    { id: 'duplicate', label: 'Duplicate', onSelect: () => { duplicateDoc(activeDocId); track('diagram_created', { source: 'duplicate' }); navigate('/canvas'); } },
    { id: 'new', label: 'New diagram', onSelect: () => { newDoc(); track('diagram_created', { source: 'blank' }); navigate('/canvas'); } },
    { kind: 'separator', id: 'sep-recent' },
    { kind: 'heading', id: 'h-recent', label: 'Recent' },
    ...(recent.length === 0
      ? [{ id: 'no-recent', label: 'No other diagrams yet', onSelect: () => {}, disabled: true } satisfies MenuEntry]
      : recent.map((d): MenuEntry => ({
        id: `open-${d.id}`,
        label: d.title || 'Untitled diagram',
        onSelect: () => { openDoc(d.id); navigate('/canvas'); },
      }))),
    { kind: 'separator', id: 'sep-all' },
    { id: 'all', label: `All diagrams (${docs.length})`, onSelect: () => navigate('/dashboard') },
  ];

  return (
    <MenuButton
      label={`Diagram: ${title}. Switch, rename or create`}
      title={title}
      menuLabel="Diagram"
      className="appbar-doc"
      style={{ maxWidth: 240 }}
      items={items}
    >
      <span className="appbar-doc__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{title}</span>
      <svg className="appbar-doc__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </MenuButton>
  );
}
