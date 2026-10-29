import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { listCommands, recordCommandUse, type Command, type CommandContext, type CommandGroup } from '../../lib/commands';
import { useDiagramActions, useDiagramUI } from '../../state/useDiagram';

/** One menu row: a command, or a submenu fed by command ids / an id prefix. */
type Entry =
  | { kind: 'command'; id: string; danger?: boolean }
  | { kind: 'submenu'; label: string; ids?: string[]; prefix?: string; strip?: string };

/** Menu layout (R1-E04-T07, Palette.dc.html "Context menu"): five groups, in this order. */
const LAYOUT: readonly { group: CommandGroup; entries: Entry[] }[] = [
  {
    group: 'Edit',
    entries: [
      { kind: 'command', id: 'edit.cut' },
      { kind: 'command', id: 'edit.copy' },
      { kind: 'command', id: 'edit.paste' },
      { kind: 'command', id: 'edit.duplicate' },
      { kind: 'command', id: 'edit.delete', danger: true },
      { kind: 'command', id: 'edit.selectSimilar' },
    ],
  },
  {
    group: 'Arrange',
    entries: [
      { kind: 'submenu', label: 'Align', ids: ['left', 'center', 'right', 'top', 'middle', 'bottom'].map((e) => `arrange.align.${e}`) },
      { kind: 'submenu', label: 'Distribute', ids: ['arrange.distributeH', 'arrange.distributeV'] },
      { kind: 'command', id: 'arrange.matchSize' },
      { kind: 'command', id: 'arrange.fitToContents' },
      { kind: 'command', id: 'arrange.addLaneBelow' },
      { kind: 'command', id: 'arrange.front' },
      { kind: 'command', id: 'arrange.back' },
      { kind: 'command', id: 'arrange.lock' },
      { kind: 'command', id: 'arrange.unlock' },
    ],
  },
  {
    group: 'Display',
    entries: [
      { kind: 'command', id: 'display.style.icon' },
      { kind: 'command', id: 'display.style.card' },
      { kind: 'command', id: 'display.style.shape' },
      { kind: 'command', id: 'display.collapse' },
      { kind: 'command', id: 'display.expand' },
      { kind: 'command', id: 'display.replaceIcon' },
    ],
  },
  {
    group: 'Review',
    entries: [
      { kind: 'command', id: 'review.comment' },
      { kind: 'command', id: 'review.copyLink' },
    ],
  },
  {
    group: 'Advanced',
    entries: [
      { kind: 'submenu', label: 'Move to layer', prefix: 'advanced.moveToLayer.', strip: 'Move to layer: ' },
      { kind: 'submenu', label: 'Move to page', prefix: 'advanced.moveToPage.', strip: 'Move to page: ' },
      { kind: 'submenu', label: 'Link to page', prefix: 'advanced.linkToPage.', strip: 'Link to page: ' },
      { kind: 'command', id: 'advanced.goToLinkedPage' },
      { kind: 'command', id: 'advanced.unlinkPage' },
      { kind: 'command', id: 'advanced.properties' },
    ],
  },
];

interface ResolvedItem {
  key: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  command?: Command;
  children?: ResolvedItem[];
}

function resolve(available: Command[]): { group: CommandGroup; items: ResolvedItem[] }[] {
  const byId = new Map(available.map((c) => [c.id, c]));
  const out: { group: CommandGroup; items: ResolvedItem[] }[] = [];
  for (const g of LAYOUT) {
    const items: ResolvedItem[] = [];
    for (const e of g.entries) {
      if (e.kind === 'command') {
        const c = byId.get(e.id);
        if (c) items.push({ key: c.id, label: c.title, shortcut: c.shortcut, danger: e.danger, command: c });
      } else {
        const cmds = e.ids ? e.ids.map((id) => byId.get(id)).filter((c): c is Command => !!c) : available.filter((c) => e.prefix && c.id.startsWith(e.prefix));
        if (cmds.length > 0) {
          items.push({
            key: `sub-${e.label}`,
            label: e.label,
            children: cmds.map((c) => ({ key: c.id, label: e.strip ? c.title.replace(e.strip, '') : c.title, shortcut: c.shortcut, command: c })),
          });
        }
      }
    }
    if (items.length > 0) out.push({ group: g.group, items });
  }
  return out;
}

export interface ContextMenuProps {
  /** Viewport point (client px) where the menu opens: the pointer, or the selection centre. */
  x: number;
  y: number;
  /** Ids of the selected elements (nodes and edges). */
  selectionIds: string[];
  /** Workspace role. Editing items are hidden for `viewer`. */
  role?: CommandContext['role'];
  /** Accessible name, e.g. "Order Service actions". */
  label: string;
  /** Closes the menu. `restoreFocus` is true for Esc and after an action. */
  onClose: (restoreFocus: boolean) => void;
  navigate?: (to: string) => void;
}

const ITEM: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 10px', borderRadius: 6, border: 'none',
  background: 'transparent', font: 'inherit', fontSize: 13, color: 'var(--text-main, #1F2937)', textAlign: 'left', cursor: 'pointer', width: '100%',
};
const MENU: CSSProperties = {
  background: 'var(--bg-panel, #FFFFFF)', border: '1px solid var(--border-panel, #E3E6EB)', borderRadius: 10,
  boxShadow: '0 16px 40px rgba(16,24,40,.16)', padding: 6, display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
};

/**
 * R1-E04-T07 (SC-18): the canvas context menu. Items come from the command registry, so titles and
 * shortcuts match the palette; unavailable items are hidden, not disabled. Arrow keys move, Enter
 * runs, Right opens a submenu, Left or Esc closes it. Esc closes the menu and focus returns to
 * where it was.
 */
export function ContextMenu({ x, y, selectionIds, role = 'owner', label, onClose, navigate }: ContextMenuProps) {
  const actions = useDiagramActions();
  const ui = useDiagramUI();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<string | null>(null);
  const [subPos, setSubPos] = useState<{ x: number; y: number } | null>(null);
  const focusSub = useRef(false);

  const ctx: CommandContext = useMemo(
    () => ({ route: '/canvas', selectionIds, role, actions, ui, navigate: navigate ?? (() => undefined) }),
    [selectionIds, role, actions, ui, navigate],
  );
  const groups = useMemo(() => resolve(listCommands(ctx)), [ctx]);

  // Keep the menu inside the window, then focus its first item.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const ny = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    menuItems(el)[0]?.focus();
    // Measure once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside press, window blur, resize and wheel close the menu without stealing focus.
  useEffect(() => {
    const away = (e: Event) => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest('[data-context-submenu]')) return;
      onClose(false);
    };
    const close = () => onClose(false);
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', away, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', away);
    };
  }, [onClose]);

  // After a submenu opens by keyboard, move focus into it.
  useEffect(() => {
    if (!open || !focusSub.current) return;
    focusSub.current = false;
    const sub = document.querySelector<HTMLElement>('[data-context-submenu]');
    if (sub) menuItems(sub)[0]?.focus();
  }, [open, subPos]);

  const run = (item: ResolvedItem) => {
    if (!item.command) return;
    recordCommandUse(item.command.id);
    onClose(true);
    item.command.run(ctx);
  };

  const openSub = (key: string, trigger: HTMLElement, byKeyboard: boolean) => {
    const r = trigger.getBoundingClientRect();
    focusSub.current = byKeyboard;
    setSubPos({ x: Math.min(r.right - 2, window.innerWidth - 228), y: Math.max(8, r.top - 6) });
    setOpen(key);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const menu = target.closest<HTMLElement>('[role="menu"]');
    if (!menu) return;
    const items = menuItems(menu);
    const at = items.indexOf(target as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown': go(at + 1); break;
      case 'ArrowUp': go(at < 0 ? -1 : at - 1); break;
      case 'Home': go(0); break;
      case 'End': go(items.length - 1); break;
      case 'ArrowRight':
        if (target.getAttribute('aria-haspopup') === 'menu') {
          e.preventDefault();
          openSub(target.dataset.key ?? '', target, true);
        }
        break;
      case 'ArrowLeft':
        if (menu !== rootRef.current) {
          e.preventDefault();
          const trigger = rootRef.current?.querySelector<HTMLElement>(`[data-key="${open ?? ''}"]`);
          setOpen(null);
          trigger?.focus();
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // the canvas Esc handler would also clear the selection
        onClose(true);
        break;
      case 'Tab':
        e.preventDefault();
        onClose(true);
        break;
      default:
    }
  };

  const itemStyle = (item: ResolvedItem): CSSProperties => ({ ...ITEM, color: item.danger ? '#B91C1C' : ITEM.color });

  const renderItem = (item: ResolvedItem) => {
    const shortcut = item.shortcut ? (
      <span aria-hidden="true" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8A93A3' }}>{item.shortcut}</span>
    ) : null;
    if (item.children) {
      return (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-haspopup="menu"
          aria-expanded={open === item.key}
          data-key={item.key}
          style={itemStyle(item)}
          onClick={(e) => openSub(item.key, e.currentTarget, false)}
          onMouseEnter={(e) => openSub(item.key, e.currentTarget, false)}
        >
          <span style={{ flexGrow: 1 }}>{item.label}</span>
          <span aria-hidden="true" style={{ color: '#8A93A3' }}>▸</span>
        </button>
      );
    }
    return (
      <button
        key={item.key}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-keyshortcuts={item.shortcut}
        style={itemStyle(item)}
        onClick={() => run(item)}
        onMouseEnter={() => setOpen(null)}
      >
        <span style={{ flexGrow: 1 }}>{item.label}</span>
        {shortcut}
      </button>
    );
  };

  const openItem = groups.flatMap((g) => g.items).find((i) => i.key === open && i.children);

  if (groups.length === 0) return null;
  return (
    <>
      <div
        ref={rootRef}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ ...MENU, position: 'fixed', left: pos.x, top: pos.y, width: 260, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', zIndex: 80 }}
      >
        {groups.map((g, gi) => (
          <div key={g.group} role="group" aria-label={g.group} style={{ display: 'flex', flexDirection: 'column' }}>
            {gi > 0 && <div role="separator" style={{ height: 1, background: '#EEF0F3', margin: '4px 6px' }} />}
            <div
              role="presentation"
              style={{ padding: '6px 10px 2px', fontSize: 11, fontWeight: 600, color: '#8A93A3', textTransform: 'uppercase', letterSpacing: '.04em' }}
            >
              {g.group}
            </div>
            {g.items.map(renderItem)}
          </div>
        ))}
      </div>
      {openItem?.children && subPos && (
        <div
          role="menu"
          aria-label={openItem.label}
          data-context-submenu=""
          onKeyDown={onKeyDown}
          style={{ ...MENU, position: 'fixed', left: subPos.x, top: subPos.y, width: 220, zIndex: 81 }}
        >
          {openItem.children.map(renderItem)}
        </div>
      )}
    </>
  );
}

/** The menuitems that belong directly to `menu` (not to a nested menu). */
function menuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter((el) => el.closest('[role="menu"]') === menu);
}
