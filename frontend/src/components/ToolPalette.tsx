import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { CanvasTool } from '../state/useDiagram';
import { LOCKABLE } from '../screens/CanvasScreen';
import { readShortcuts } from '../screens/canvas/useCanvasKeyboard';

const TIP_ID = 'tool-rail-tooltip';

/** One rail entry. `shortcutName` is the Settings-screen key (DEFAULT_SHORTCUTS). */
interface RailItem {
  id: CanvasTool | 'library';
  /** Accessible name before the shortcut: "Select" → aria-label "Select (V)". */
  name: string;
  /** Name in the native `title` ("Shapes  L"); defaults to `name`. */
  titleName?: string;
  shortcutName: string;
  icon: ReactNode;
}

/** Shared SVG frame: 18 px, 24-unit viewBox, 2 px stroke in the button's colour (Main.dc.html L74–L88). */
function RailIcon({ children, cap, join }: { children: ReactNode; cap?: boolean; join?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap={cap ? 'round' : undefined}
      strokeLinejoin={join ? 'round' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Rail order and groups from Main.dc.html L73–L89: Select, Pan | five shape tools | four create tools. */
const GROUPS: RailItem[][] = [
  [
    { id: 'select', name: 'Select', shortcutName: 'Select', icon: <RailIcon join><path d="m4 3 7 18 2.5-7.5L21 11z" /></RailIcon> },
    {
      id: 'pan', name: 'Pan', shortcutName: 'Pan',
      icon: (
        <RailIcon cap join>
          <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
        </RailIcon>
      ),
    },
  ],
  [
    {
      id: 'service', name: 'Service', shortcutName: 'Service',
      icon: (
        <RailIcon>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </RailIcon>
      ),
    },
    { id: 'gateway', name: 'Gateway', shortcutName: 'Gateway', icon: <RailIcon join><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></RailIcon> },
    {
      id: 'db', name: 'Database', shortcutName: 'Database',
      icon: <RailIcon><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></RailIcon>,
    },
    { id: 'stream', name: 'Queue', shortcutName: 'Queue', icon: <RailIcon cap><path d="M4 6h16M4 12h16M4 18h16" /></RailIcon> },
    {
      id: 'library', name: 'Shapes library', titleName: 'Shapes', shortcutName: 'Library',
      icon: <RailIcon cap><circle cx="7" cy="7" r="4" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><path d="m7 13 5 8H2zM17 13v8M13 17h8" /></RailIcon>,
    },
  ],
  [
    { id: 'connector', name: 'Connect', shortcutName: 'Connector', icon: <RailIcon cap join><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 17 17 7" /></RailIcon> },
    { id: 'draw', name: 'Draw', shortcutName: 'Draw', icon: <RailIcon cap join><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></RailIcon> },
    { id: 'text', name: 'Text', shortcutName: 'Text', icon: <RailIcon cap><path d="M4 7V5h16v2M9 19h6M12 5v14" /></RailIcon> },
    { id: 'comment', name: 'Comment', shortcutName: 'Note', icon: <RailIcon join><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></RailIcon> },
  ],
];

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

/**
 * Floating 48 px canvas tool rail (R1-E14-T02, Main.dc.html L73–L89). Each button is named
 * "<Tool> (<key>)" with a native `title` "<Tool>  <key>"; keyboard focus also shows the name in
 * a tooltip. Re-clicking an active add-tool locks it for repeat placement.
 */
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
  const keys = readShortcuts();

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

  // Keyboard-focus tooltip: one fixed-position bubble beside the focused button. Pointer hover
  // uses the native `title` from the artboard.
  const [tip, setTip] = useState<{ text: string; top: number; left: number; owner: string } | null>(null);

  const renderItem = (item: RailItem) => {
    const key = (keys[item.shortcutName] ?? '').toUpperCase();
    const label = key ? `${item.name} (${key})` : item.name;
    const title = key ? `${item.titleName ?? item.name}  ${key}` : item.titleName ?? item.name;
    const isLibrary = item.id === 'library';
    const active = isLibrary ? libOpen : tool === item.id;
    const common = {
      type: 'button' as const,
      className: `rail-btn${active ? ' active' : ''}`,
      'aria-label': label,
      title,
      'aria-describedby': tip?.owner === item.id ? TIP_ID : undefined,
      onFocus: (e: { currentTarget: HTMLElement }) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ text: label, top: r.top + r.height / 2, left: r.right + 8, owner: item.id });
      },
      onBlur: () => setTip(null),
    };
    if (isLibrary) {
      return (
        <button
          key={item.id}
          {...common}
          aria-expanded={libOpen}
          aria-controls="shape-library-drawer"
          tabIndex={-1}
          onClick={() => setLibOpen((prev: boolean) => !prev)}
        >
          {item.icon}
        </button>
      );
    }
    const id = item.id as CanvasTool;
    return (
      <button
        key={item.id}
        {...common}
        data-tool={id}
        aria-pressed={tool === id}
        tabIndex={tool === id ? 0 : -1}
        onClick={() => pickTool(id)}
      >
        {item.icon}
        {lockedTool === id && (
          <span className="rail-lock" aria-label="locked">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="vertical-tool-rail"
      role="toolbar"
      aria-label="Canvas tools"
      aria-orientation="vertical"
      ref={railRef}
      onKeyDown={onRailKeyDown}
    >
      {GROUPS.map((items, i) => [
        i > 0 ? <span key={`sep-${i}`} role="separator" className="rail-divider" /> : null,
        ...items.map(renderItem),
      ])}
      {tip && (
        <div
          id={TIP_ID}
          role="tooltip"
          style={{
            position: 'fixed', top: tip.top, left: tip.left, transform: 'translateY(-50%)', zIndex: 60,
            background: '#20242D', color: '#F2F4F8', padding: '4px 8px', borderRadius: 6,
            fontSize: 'var(--text-sm)', fontFamily: 'var(--ui-font)', whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
