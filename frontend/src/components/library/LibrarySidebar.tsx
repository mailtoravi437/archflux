import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLibrary } from '../../state/library';
import { FolderTree } from './FolderTree';

export type SidebarActive = 'home' | 'all' | 'recent' | 'starred' | 'shared' | 'templates' | 'trash';

const ITEMS: { id: SidebarActive; label: string; to: string }[] = [
  { id: 'home', label: 'Home', to: '/home' },
  { id: 'all', label: 'All diagrams', to: '/dashboard' },
  { id: 'recent', label: 'Recent', to: '/dashboard?view=recent' },
  { id: 'starred', label: 'Starred', to: '/dashboard?view=starred' },
  { id: 'shared', label: 'Shared with me', to: '/dashboard?view=shared' },
  { id: 'templates', label: 'Templates', to: '/blueprints' },
];

/**
 * Workspace sub-nav (Home.dc.html sidebar, SC-06): views, the folder tree and
 * Trash. Folder data comes from `useLibrary()`; nothing here is sample data.
 */
export function LibrarySidebar({ active }: { active: SidebarActive }) {
  const navigate = useNavigate();
  const lib = useLibrary();
  const selectedFolder = active === 'all' ? lib.currentFolderId : null;
  // Phones: the sidebar collapses behind a toggle so content gets the full width.
  const [open, setOpen] = useState(false);

  return (
    <>
    <button
      type="button"
      className="libside-toggle"
      aria-expanded={open}
      aria-controls="libside-nav"
      onClick={() => setOpen((o) => !o)}
    >
      {open ? 'Hide workspace menu' : 'Show workspace menu'}
    </button>
    <nav id="libside-nav" aria-label="Workspace" className={`libside${open ? ' is-open' : ''}`}>
      {ITEMS.map((it) => (
        <Link
          key={it.id}
          to={it.to}
          className={`libside__item${active === it.id && !(it.id === 'all' && selectedFolder) ? ' is-active' : ''}`}
          aria-current={active === it.id && !(it.id === 'all' && selectedFolder) ? 'page' : undefined}
          onClick={() => { if (it.id === 'all' || it.id === 'recent' || it.id === 'starred' || it.id === 'shared') lib.setCurrentFolder(null); }}
        >
          {it.label}
        </Link>
      ))}
      <div className="libside__head">
        <span>Folders</span>
      </div>
      <FolderTree
        folders={lib.folders}
        selectedId={selectedFolder}
        onSelect={(id) => { lib.setCurrentFolder(id); navigate('/dashboard'); }}
        onDropDoc={(docId, folderId) => void lib.moveDoc(docId, folderId)}
      />
      {lib.folders.length === 0 && <p className="libside__note">No folders yet.</p>}
      {lib.mode === 'local' && <p className="libside__note">Folders sync when you sign in</p>}
      <div className="libside__spacer" />
      <Link to="/trash" className={`libside__item${active === 'trash' ? ' is-active' : ''}`} aria-current={active === 'trash' ? 'page' : undefined}>
        Trash
      </Link>
    </nav>
    </>
  );
}
