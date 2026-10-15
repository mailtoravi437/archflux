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

  return (
    <>
      <div className="vertical-tool-rail" role="toolbar" aria-label="Canvas tools" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          className={`rail-btn${libOpen ? ' active' : ''}`}
          title="Shape library — Compute, Storage, Database, Network, Messaging (L)"
          aria-label="Open shape library"
          onClick={() => setLibOpen((prev: boolean) => !prev)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}
        >
          <img src="/icons/general/database.svg" alt="" style={{ width: 16, height: 16 }} />
          <span className="rail-label">Shapes</span>
        </button>
        <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
        <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Navigate</div>
        <div className="rail-grid">
          {TOOLS.filter((t: typeof TOOLS[0]) => ['select', 'pan'].includes(t.id)).map((t: typeof TOOLS[0]) => (
            <button
              key={t.id}
              className={`rail-btn${tool === t.id ? ' active' : ''}`}
              data-tool={t.id}
              title={t.title}
              aria-label={t.title}
              onClick={() => pickTool(t.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 4px', justifyContent: 'center' }}
            >
              <img src={t.icon} alt="" style={{ width: 20, height: 20 }} />
              <span className="rail-label" style={{ fontSize: 11 }}>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
        <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Shapes</div>
        <div className="rail-grid">
          {TOOLS.filter((t: typeof TOOLS[0]) => ['service', 'gateway', 'db', 'stream'].includes(t.id)).map((t: typeof TOOLS[0]) => (
            <button
              key={t.id}
              className={`rail-btn${tool === t.id ? ' active' : ''}`}
              data-tool={t.id}
              title={t.title}
              aria-label={t.title}
              onClick={() => pickTool(t.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 4px', justifyContent: 'center' }}
            >
              <img src={t.icon} alt="" style={{ width: 20, height: 20 }} />
              <span className="rail-label" style={{ fontSize: 11 }}>{t.label}</span>
              {lockedTool === t.id && <span className="rail-lock" aria-label="locked"><img src="/icons/tools/lock.svg" alt="" style={{ width: 10, height: 10 }} /></span>}
            </button>
          ))}
        </div>
        <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
        <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Create</div>
        <div className="rail-grid">
          {TOOLS.filter((t: typeof TOOLS[0]) => ['draw', 'text'].includes(t.id)).map((t: typeof TOOLS[0]) => (
            <button
              key={t.id}
              className={`rail-btn${tool === t.id ? ' active' : ''}`}
              data-tool={t.id}
              title={t.title}
              aria-label={t.title}
              onClick={() => pickTool(t.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 4px', justifyContent: 'center' }}
            >
              <img src={t.icon} alt="" style={{ width: 20, height: 20 }} />
              <span className="rail-label" style={{ fontSize: 11 }}>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="rail-divider" style={{ margin: '4px 0', borderTop: '1px solid var(--border-panel)' }} />
        <div className="rail-group-label" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase' }}>Annotate</div>
        <div className="rail-grid">
          {TOOLS.filter((t: typeof TOOLS[0]) => ['connector', 'comment'].includes(t.id)).map((t: typeof TOOLS[0]) => (
            <button
              key={t.id}
              className={`rail-btn${tool === t.id ? ' active' : ''}`}
              data-tool={t.id}
              title={t.title}
              aria-label={t.title}
              onClick={() => pickTool(t.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 4px', justifyContent: 'center' }}
            >
              <img src={t.icon} alt="" style={{ width: 20, height: 20 }} />
              <span className="rail-label" style={{ fontSize: 11 }}>{t.label}</span>
              {lockedTool === t.id && <span className="rail-lock" aria-label="locked"><img src="/icons/tools/lock.svg" alt="" style={{ width: 10, height: 10 }} /></span>}
            </button>
          ))}
        </div>
      </div>

      {/* Library drawer renders in CanvasScreen (single source); this
          component only owns the rail toggle above. */}
    </>
  );
}