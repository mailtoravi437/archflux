import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DiagramActionsContext, DiagramUIContext } from '../../state/store';
import { listCommands, subscribeCommands, type CommandContext } from '../../lib/commands';

export interface CanvasToolbarProps {
  zoom: number;
  /** Set the zoom, keeping the viewport centre fixed. */
  zoomAt: (z: number) => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  miniOpen: boolean;
  setMiniOpen: (v: boolean) => void;
  /** False while the right dock is closed: the toolbar then offers "Show panel". */
  dockOpen: boolean;
  onShowPanel: () => void;
}

const ZOOM_STEP = 0.1;
const FOCUS_COMMAND = 'view.focus';

function Icon({ children, join }: { children: ReactNode; join?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin={join ? 'round' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Focus mode is owned by the app shell; it registers the `view.focus` command (R1-E10-T03). */
function useFocusCommand(): (() => void) | null {
  const actions = useContext(DiagramActionsContext);
  const ui = useContext(DiagramUIContext);
  const location = useLocation();
  const navigate = useNavigate();
  // Re-resolve when features (un)register commands.
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeCommands(() => setVersion((v) => v + 1)), []);
  return useMemo(() => {
    void version;
    if (!actions || !ui) return null;
    const ctx: CommandContext = {
      route: location.pathname,
      selectionIds: [],
      role: 'owner',
      actions,
      ui,
      navigate: (to: string) => navigate(to),
    };
    const cmd = listCommands(ctx).find((c) => c.id === FOCUS_COMMAND);
    return cmd ? () => cmd.run(ctx) : null;
  }, [actions, ui, location.pathname, navigate, version]);
}

/**
 * Undo/Redo stay enabled: the store's `canUndo`/`canRedo` live in a memo that does not track the
 * history refs, so they can be stale. An empty history answers with an honest "Nothing to undo".
 *
 * Bottom-left View toolbar (R1-E14-T02 / R1-E01-T05, Main.dc.html L146–L157):
 * Zoom out · 100% · Zoom in · Fit | Undo · Redo | minimap toggle · Focus mode.
 */
export function CanvasToolbar({
  zoom, zoomAt, onFit, onUndo, onRedo, miniOpen, setMiniOpen, dockOpen, onShowPanel,
}: CanvasToolbarProps) {
  const focus = useFocusCommand();
  const pct = `${Math.round(zoom * 100)}%`;
  return (
    <div className="canvas-view-toolbar" role="toolbar" aria-label="View">
      <button type="button" className="view-btn view-btn--glyph" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(zoom - ZOOM_STEP)}>
        −
      </button>
      <button type="button" className="view-btn view-btn--zoom" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={() => zoomAt(1)}>
        {pct}
      </button>
      <button type="button" className="view-btn view-btn--glyph" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(zoom + ZOOM_STEP)}>
        +
      </button>
      <button type="button" className="view-btn" aria-label="Fit to screen (F)" title="Fit to screen  F" onClick={onFit}>
        <Icon><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" /></Icon>
      </button>
      <span className="view-sep" aria-hidden="true" />
      <button type="button" className="view-btn" aria-label="Undo" title="Undo" onClick={onUndo}>
        <Icon join><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
      </button>
      <button type="button" className="view-btn" aria-label="Redo" title="Redo" onClick={onRedo}>
        <Icon join><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Icon>
      </button>
      <span className="view-sep" aria-hidden="true" />
      <button
        type="button"
        className={`view-btn${miniOpen ? ' active' : ''}`}
        data-testid="minimap-toggle"
        aria-label={miniOpen ? 'Hide minimap' : 'Show minimap'}
        aria-pressed={miniOpen}
        title={miniOpen ? 'Hide minimap' : 'Show minimap'}
        onClick={() => setMiniOpen(!miniOpen)}
      >
        <Icon join><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></Icon>
      </button>
      <button
        type="button"
        className="view-btn"
        aria-label="Focus mode"
        title={focus ? 'Focus mode' : 'Focus mode is unavailable here'}
        disabled={!focus}
        onClick={() => focus?.()}
      >
        <Icon><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></Icon>
      </button>
      {!dockOpen && (
        <>
          <span className="view-sep" aria-hidden="true" />
          <button type="button" className="view-btn view-btn--text" data-testid="dock-reopen" aria-label="Show panel" title="Show panel" onClick={onShowPanel}>
            Show panel
          </button>
        </>
      )}
    </div>
  );
}
