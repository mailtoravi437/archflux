import { useDiagramDocs, useDiagramUI } from '../../state/useDiagram';
import { isServerDocId } from '../../lib/honesty';
import { MenuButton } from './MenuButton';
import type { MenuEntry } from './MenuButton';
import { statusLabel } from './status';
import type { SaveRunState } from './status';

interface StatusButtonProps {
  saveState: SaveRunState;
  onSave: () => void;
  onExport: () => void;
  onLinter: () => void;
  onResync: () => void;
  onResolveConflict: () => void;
}

/**
 * The one app-bar status control: source mode, save state and lint count
 * in a single label, with a menu for Save to server, Export, Linter, Re-sync.
 */
export function StatusButton({ saveState, onSave, onExport, onLinter, onResync, onResolveConflict }: StatusButtonProps) {
  const { freshnessLabel, isOnline, lintCount, syncError } = useDiagramUI();
  const { activeDocId, dirty, serverVersion, saveConflict, activeDocLimited } = useDiagramDocs();
  const isServerDoc = isServerDocId(activeDocId);
  const { label, tone } = statusLabel({
    isServerDoc,
    isOnline,
    lintCount,
    dirty,
    serverVersion,
    saveState,
    hasConflict: !!saveConflict,
    limited: activeDocLimited,
  });

  const items: MenuEntry[] = [
    {
      id: 'save',
      label: isServerDoc ? 'Save to server' : 'Save to server (local diagram)',
      onSelect: onSave,
      disabled: !isServerDoc || !isOnline || saveState === 'saving',
      hint: !isServerDoc ? 'This diagram is local; it autosaves in this browser' : !isOnline ? 'Offline' : undefined,
    },
    ...(saveConflict ? [{ id: 'conflict', label: 'Resolve save conflict…', onSelect: onResolveConflict } satisfies MenuEntry] : []),
    { id: 'export', label: 'Export .arch', onSelect: onExport },
    { id: 'linter', label: `Linter (${lintCount} issue${lintCount === 1 ? '' : 's'})`, onSelect: onLinter },
    { id: 'resync', label: 'Re-sync', onSelect: onResync, disabled: !isOnline },
  ];

  return (
    <MenuButton
      label={`Status: ${label}`}
      title={syncError ? `${label} · last re-sync failed: ${syncError}` : `${label} · ${freshnessLabel}`}
      menuLabel="Status"
      className={`appbar-status appbar-status--${tone}`}
      items={items}
      align="right"
      testId="status-button"
      header={
        <div className="appbar-menu__note">
          <div>{label}</div>
          <div className="appbar-menu__muted">{freshnessLabel}</div>
          {syncError && <div className="appbar-menu__error">Last re-sync failed: {syncError}</div>}
        </div>
      }
    >
      <span className="appbar-status__dot" aria-hidden="true" />
      <span className="appbar-status__label">{label}</span>
    </MenuButton>
  );
}
