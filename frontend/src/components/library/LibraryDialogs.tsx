import { useEffect, useId, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { LibraryFolder } from '../../state/library';

/** Shared modal frame: focus trap, Esc closes, focus returns to the opener. */
function Modal({ titleId, title, onClose, children }: { titleId: string; title: string; onClose: () => void; children: React.ReactNode }) {
  const trap = useFocusTrap<HTMLDivElement>(true);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);
  return (
    <div className="libdlg__scrim" onClick={onClose}>
      <div ref={trap} role="dialog" aria-modal="true" aria-labelledby={titleId} className="libdlg" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="libdlg__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

interface NameDialogProps {
  title: string;
  label: string;
  submitLabel: string;
  parentNote?: string;
  /** Resolves to an error message, or null when it worked (the dialog then closes). */
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}

/** Single-field dialog (new folder). */
export function NameDialog({ title, label, submitLabel, parentNote, onSubmit, onClose }: NameDialogProps) {
  const id = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal titleId={id} title={title} onClose={onClose}>
      <form
        className="libdlg__body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          const err = await onSubmit(name);
          setBusy(false);
          if (err) setError(err);
          else onClose();
        }}
      >
        {parentNote && <p className="libdlg__note">{parentNote}</p>}
        <label className="libdlg__field">
          {label}
          <input autoFocus value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </label>
        {error && <div role="alert" className="libdlg__error">{error}</div>}
        <div className="libdlg__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={!name.trim() || busy}>{submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

interface MoveToDialogProps {
  docTitle: string;
  folders: LibraryFolder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}

/** Folder chooser for "Move to…" (the keyboard alternative to dragging a card). */
export function MoveToDialog({ docTitle, folders, currentFolderId, onMove, onClose }: MoveToDialogProps) {
  const id = useId();
  const firstRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  const ids = new Set(folders.map((f) => f.id));
  const ordered: { folder: LibraryFolder; level: number }[] = [];
  const walk = (parent: string | null, level: number) => {
    folders
      .filter((f) => (f.parentId && ids.has(f.parentId) ? f.parentId : null) === parent)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        ordered.push({ folder: f, level });
        walk(f.id, level + 1);
      });
  };
  walk(null, 0);
  return (
    <Modal titleId={id} title={`Move “${docTitle}”`} onClose={onClose}>
      <div className="libdlg__body">
        <ul className="libdlg__list" aria-label="Destination folder">
          <li>
            <button ref={firstRef} type="button" className="libdlg__opt" aria-current={currentFolderId === null ? 'true' : undefined} onClick={() => onMove(null)}>
              Library (no folder)
            </button>
          </li>
          {ordered.map(({ folder, level }) => (
            <li key={folder.id}>
              <button
                type="button"
                className="libdlg__opt"
                style={{ paddingLeft: 10 + level * 16 }}
                aria-current={currentFolderId === folder.id ? 'true' : undefined}
                onClick={() => onMove(folder.id)}
              >
                {folder.name}
              </button>
            </li>
          ))}
        </ul>
        {ordered.length === 0 && <p className="libdlg__note">You have no folders yet. Create one with New folder.</p>}
        <div className="libdlg__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

interface MoveHereDialogProps {
  folderName: string;
  candidates: { id: string; title: string }[];
  onMove: (docId: string) => void;
  onClose: () => void;
}

/** "Move diagrams here" from an empty folder: pick the diagrams to bring in. */
export function MoveHereDialog({ folderName, candidates, onMove, onClose }: MoveHereDialogProps) {
  const id = useId();
  return (
    <Modal titleId={id} title={`Move diagrams to “${folderName}”`} onClose={onClose}>
      <div className="libdlg__body">
        {candidates.length === 0 ? (
          <p className="libdlg__note">There are no other diagrams to move.</p>
        ) : (
          <ul className="libdlg__list" aria-label="Diagrams to move">
            {candidates.map((c) => (
              <li key={c.id}>
                <button type="button" className="libdlg__opt" aria-label={`Move ${c.title} here`} onClick={() => onMove(c.id)}>{c.title}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="libdlg__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
