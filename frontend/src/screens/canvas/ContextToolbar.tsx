import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ArchNode, DisplayStyle } from '../../types';
import { nodeBounds, sharedNodeStyle } from '../../lib/canvasGeometry';
import type { AlignEdge } from '../../state/ops/arrange';
import { placeContextToolbar, TOOLBAR_HEIGHT } from './contextToolbarPlacement';

const OPTIONS: readonly { id: DisplayStyle; label: string; key: string }[] = [
  { id: 'icon', label: 'Icon', key: 'Alt+1' },
  { id: 'card', label: 'Card', key: 'Alt+2' },
  { id: 'shape', label: 'Shape', key: 'Alt+3' },
];

/** Arrange actions (R1-E04-T08): the toolbar shows only the buttons that apply to the selection size. */
export interface ArrangeActions {
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: 'h' | 'v') => void;
  onMatchSize: () => void;
  onZOrder: (cmd: 'front' | 'back') => void;
  onSetLocked: (locked: boolean) => void;
}

const ICON_PROPS = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const ALIGN_BUTTONS: readonly { edge: AlignEdge; label: string; key: string; d: string }[] = [
  { edge: 'left', label: 'Align left', key: 'Alt+Shift+L', d: 'M4 3v18M8 7h10M8 15h6' },
  { edge: 'center', label: 'Align center', key: 'Alt+Shift+C', d: 'M12 3v18M6 7h12M8 15h8' },
  { edge: 'right', label: 'Align right', key: 'Alt+Shift+R', d: 'M20 3v18M6 7h10M10 15h6' },
  { edge: 'top', label: 'Align top', key: 'Alt+Shift+T', d: 'M3 4h18M7 8v10M15 8v6' },
  { edge: 'middle', label: 'Align middle', key: 'Alt+Shift+M', d: 'M3 12h18M7 6v12M15 8v8' },
  { edge: 'bottom', label: 'Align bottom', key: 'Alt+Shift+B', d: 'M3 20h18M7 6v10M15 10v6' },
];

const TB_BTN = { width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 } as const;

/** Dark icon group from the CanvasPro "Context toolbar over multi-selection" artboard. */
function ArrangeGroup({ nodes, arrange }: { nodes: readonly ArchNode[]; arrange: ArrangeActions }) {
  const many = nodes.length >= 2;
  const allLocked = nodes.every((n) => n.locked);
  const btn = (label: string, key: string | undefined, onClick: () => void, icon: ReactNode) => (
    <button key={label} type="button" aria-label={label} title={key ? `${label} (${key})` : label} aria-keyshortcuts={key} onClick={onClick} style={TB_BTN}>
      {icon}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Arrange"
      style={{ display: 'flex', alignItems: 'center', gap: 2, height: 36, padding: '0 4px', background: '#1B1F27', borderRadius: 8 }}
    >
      {many && ALIGN_BUTTONS.map((a) => btn(a.label, a.key, () => arrange.onAlign(a.edge), <svg {...ICON_PROPS}><path d={a.d} /></svg>))}
      {nodes.length >= 3 && (
        <>
          {btn('Distribute horizontally', 'Alt+Shift+H', () => arrange.onDistribute('h'), <svg {...ICON_PROPS}><path d="M4 3v18M20 3v18" /><rect x="9" y="7" width="6" height="10" rx="1" /></svg>)}
          {btn('Distribute vertically', 'Alt+Shift+V', () => arrange.onDistribute('v'), <svg {...ICON_PROPS}><path d="M3 4h18M3 20h18" /><rect x="7" y="9" width="10" height="6" rx="1" /></svg>)}
        </>
      )}
      {many && btn('Match size', undefined, arrange.onMatchSize, <svg {...ICON_PROPS}><rect x="3" y="6" width="8" height="12" rx="1" /><rect x="13" y="6" width="8" height="12" rx="1" /></svg>)}
      {btn('Bring to front', 'Ctrl+Shift+]', () => arrange.onZOrder('front'), <svg {...ICON_PROPS}><rect x="3" y="3" width="12" height="12" rx="1" /><rect x="9" y="9" width="12" height="12" rx="1" fill="#FFFFFF" /></svg>)}
      {btn('Send to back', 'Ctrl+Shift+[', () => arrange.onZOrder('back'), <svg {...ICON_PROPS}><rect x="9" y="9" width="12" height="12" rx="1" /><rect x="3" y="3" width="12" height="12" rx="1" fill="#FFFFFF" /></svg>)}
      {btn(allLocked ? 'Unlock' : 'Lock', 'Ctrl+Shift+L', () => arrange.onSetLocked(!allLocked), <svg {...ICON_PROPS}><rect x="5" y="11" width="14" height="9" rx="2" /><path d={allLocked ? 'M8 11V8a4 4 0 0 1 7-2.6' : 'M8 11V8a4 4 0 0 1 8 0v3'} /></svg>)}
    </div>
  );
}

/** Boundary actions for a single selected boundary (R1-E03-T03, T06). */
export interface BoundaryActions {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Present when the boundary has children. */
  onFit?: () => void;
  /** Present for swimlanes. */
  onAddLane?: () => void;
}

export interface ContextToolbarProps {
  /** The selected nodes (at least one). */
  nodes: readonly ArchNode[];
  zoom: number;
  pan: { x: number; y: number };
  onSetDisplayStyle: (ids: string[], style: DisplayStyle) => void;
  /** "Replace icon": opens the icon picker for one node at the viewport point `at`. */
  onReplaceIcon?: (id: string, at: { x: number; y: number }) => void;
  /** "Format painter": copies the primary node's style and arms a one-shot paste. */
  onFormatPainter?: () => void;
  formatPainterArmed?: boolean;
  /** Arrange group (align, distribute, match size, z-order, lock). Omitted = group hidden (read-only). */
  arrange?: ArrangeActions;
  /** Collapse / expand, fit to contents and add lane below: shown for one selected boundary. */
  boundary?: BoundaryActions;
}

/**
 * R1-E02-T05: floating bar above the selection. First control: the "Display style" radiogroup
 * (Icon · Card · Shape). Arrow keys move and select; Alt+1/2/3 does the same from the canvas.
 */
export function ContextToolbar({ nodes, zoom, pan, onSetDisplayStyle, onReplaceIcon, onFormatPainter, formatPainterArmed = false, arrange, boundary }: ContextToolbarProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  const [barW, setBarW] = useState(0);
  const [barH, setBarH] = useState(TOOLBAR_HEIGHT);
  // The bar grows with the arrange group: measure it so it never slides under the tool rail.
  useLayoutEffect(() => {
    const w = barRef.current?.offsetWidth ?? 0;
    setBarW((prev) => (prev === w ? prev : w));
    const h = barRef.current?.offsetHeight || TOOLBAR_HEIGHT;
    setBarH((prev) => (prev === h ? prev : h));
  }, [nodes, arrange, boundary, onReplaceIcon, onFormatPainter]);
  if (nodes.length === 0) return null;
  const ids = nodes.map((n) => n.id);
  const checked = sharedNodeStyle(nodes);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const b = nodeBounds(n);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  // Keep clear of the tool rail on the left (about 64 px) and keep the wider bar (display, replace icon, format painter) on screen and the viewport's right edge.
  const left = Math.max(76 + barW / 2, ((minX + maxX) / 2) * zoom + pan.x);
  const { top } = placeContextToolbar({ selTop: minY * zoom + pan.y, selBottom: maxY * zoom + pan.y, barHeight: barH });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const at = OPTIONS.findIndex((o) => o.id === checked);
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = at < 0 ? (step > 0 ? 0 : OPTIONS.length - 1) : (at + step + OPTIONS.length) % OPTIONS.length;
    onSetDisplayStyle(ids, OPTIONS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Element actions"
      style={{
        position: 'absolute', left, top, transform: 'translateX(-50%)', zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
        background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 10,
        boxShadow: '0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.06)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Display</span>
      <div
        role="radiogroup"
        aria-label="Display style"
        onKeyDown={onKeyDown}
        style={{ display: 'flex', padding: 2, background: 'var(--bg-panel-subtle)', borderRadius: 8 }}
      >
        {OPTIONS.map((o, i) => {
          const on = o.id === checked;
          return (
            <button
              key={o.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-keyshortcuts={o.key}
              title={`${o.label} (${o.key})`}
              tabIndex={on || (checked === null && i === 0) ? 0 : -1}
              onClick={() => onSetDisplayStyle(ids, o.id)}
              style={{
                height: 28, padding: '0 12px', border: 'none', borderRadius: 6, font: 'inherit', fontSize: 12, cursor: 'pointer',
                fontWeight: on ? 600 : 500,
                color: on ? 'var(--text-main)' : 'var(--text-muted)',
                background: on ? 'var(--bg-panel)' : 'transparent',
                boxShadow: on ? '0 1px 2px rgba(16,24,40,.08)' : 'none',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {boundary && (
        <div role="group" aria-label="Boundary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="btn btn--sm btn--secondary" aria-keyshortcuts="Alt+C" title={`${boundary.collapsed ? 'Expand' : 'Collapse'} (Alt+C)`} onClick={boundary.onToggleCollapse}>
            {boundary.collapsed ? 'Expand' : 'Collapse'}
          </button>
          {boundary.onFit && <button type="button" className="btn btn--sm btn--secondary" onClick={boundary.onFit}>Fit to contents</button>}
          {boundary.onAddLane && <button type="button" className="btn btn--sm btn--secondary" onClick={boundary.onAddLane}>Add lane below</button>}
        </div>
      )}
      {arrange && <ArrangeGroup nodes={nodes} arrange={arrange} />}
      {onReplaceIcon && nodes.length === 1 && (
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          aria-label="Replace icon"
          title="Replace icon"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onReplaceIcon(nodes[0].id, { x: r.left, y: r.bottom + 6 });
          }}
        >
          Replace icon
        </button>
      )}
      {onFormatPainter && (
        <button
          type="button"
          className={`btn btn--sm btn--${formatPainterArmed ? 'primary' : 'secondary'}`}
          aria-label="Format painter"
          aria-pressed={formatPainterArmed}
          title="Format painter: copy this style, then click another element (Ctrl+Alt+C / V)"
          onClick={onFormatPainter}
        >
          Format painter
        </button>
      )}
    </div>
  );
}
