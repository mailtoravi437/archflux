import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CanvasTool } from '../useDiagram';
import { TOOLS, LOCKABLE } from '../screens/CanvasScreen';

interface ToolPaletteProps {
  tool: CanvasTool;
  setTool: (t: CanvasTool) => void;
  lockedTool: CanvasTool | null;
  setLockedTool: (t: CanvasTool | null) => void;
  setPendingFrom: (id: string | null) => void;
  pushToast: (text: string) => void;
  libOpen: boolean;
  setLibOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export function ToolPalette({
  tool,
  setTool,
  lockedTool,
  setLockedTool,
  setPendingFrom,
  pushToast,
  libOpen,
  setLibOpen,
}: ToolPaletteProps) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const pickTool = (id: CanvasTool) => {
    // Re-clicking the active add-tool locks it for repeat placement.
    if (tool === id && LOCKABLE.includes(id)) {
      const locking = lockedTool !== id;
      setLockedTool(locking ? id : null);
      pushToast(locking ? `${id} tool locked — re-click or Esc to unlock` : `${id} tool unlocked`);
    } else {
      if (tool !== id && id === 'text') pushToast('Text tool — click anywhere on canvas and start typing');
      setTool(id);
      setLockedTool(null);
    }
    setPendingFrom(null);
  };

  // WAI-ARIA toolbar pattern (SID-R15): one tab stop, arrows move focus.
  // The active tool holds tabIndex 0; every other control is -1 and reached
  // by arrow keys (Home/End jump to the ends of the rail).
  const onRailKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const NAV = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!NAV.includes(e.key)) return;
    const rail = railRef.current;
    if (!rail) return;
    const btns = Array.from(rail.querySelectorAll<HTMLButtonElement>('button'));
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    e.preventDefault();
    const next =
      e.key === 'Home' ? 0
        : e.key === 'End' ? btns.length - 1
          : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (idx + 1) % btns.length
            : (idx - 1 + btns.length) % btns.length;
    btns[next]?.focus();
  };

  const renderTool = (t: typeof TOOLS[0]) => (
    <button
      key={t.id}
      className={`rail-btn${tool === t.id ? ' active' : ''}`}
      data-tool={t.id}
      title={t.title}
      aria-label={t.label}
      aria-pressed={tool === t.id}
      tabIndex={tool === t.id ? 0 : -1}
      onClick={() => pickTool(t.id)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 4px', justifyContent: 'center' }}
    >
      <img src={t.icon} alt="" style={{ width: 20, height: 20 }} />
      <span className="rail-label" style={{ fontSize: 11 }}>{t.label}</span>
      {lockedTool === t.id && <span className="rail-lock" aria-label="locked"><img src="/icons/tools/lock.svg" alt="" style={{ width: 10, height: 10 }} /></span>}
    </button>
  );

  return (
    <div
      className="vertical-tool-rail"
      role="toolbar"
      aria-label="Canvas tools"
      aria-orientation="vertical"
      ref={railRef}
      onKeyDown={onRailKeyDown}
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <button
        className={`rail-btn${libOpen ? ' active' : ''}`}
        title="Shape library — browse and place shapes (L)"
        aria-label="Open shape library"
        aria-expanded={libOpen}
        aria-controls="shape-library-drawer"
        tabIndex={-1}
        onClick={() => setLibOpen((prev: boolean) => !prev)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}
      >
        <img src="/icons/general/shapes.svg" alt="" style={{ width: 16, height: 16 }} />
        <span className="rail-label">Library</span>
      </button>
      <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
      <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Navigate</div>
      <div className="rail-grid" role="group" aria-label="Navigate">
        {TOOLS.filter((t) => ['select', 'pan'].includes(t.id)).map(renderTool)}
      </div>
      <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
      <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Shapes</div>
      <div className="rail-grid" role="group" aria-label="Shapes">
        {TOOLS.filter((t) => ['service', 'gateway', 'db', 'stream'].includes(t.id)).map(renderTool)}
      </div>
      <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
      <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Create</div>
      <div className="rail-grid" role="group" aria-label="Create">
        {TOOLS.filter((t) => ['draw', 'text'].includes(t.id)).map(renderTool)}
      </div>
      <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
      <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Annotate</div>
      <div className="rail-grid" role="group" aria-label="Annotate">
        {TOOLS.filter((t) => ['connector', 'comment'].includes(t.id)).map(renderTool)}
      </div>
    </div>
  );
}
