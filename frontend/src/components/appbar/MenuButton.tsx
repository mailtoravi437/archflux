import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type MenuEntry =
  | { kind?: 'item'; id: string; label: ReactNode; onSelect: () => void; disabled?: boolean; hint?: string; danger?: boolean }
  | { kind: 'heading'; id: string; label: string }
  | { kind: 'separator'; id: string };

interface MenuButtonProps {
  /** Accessible name of the trigger. */
  label: string;
  /** Visible trigger content. */
  children: ReactNode;
  /** Accessible name of the menu itself. */
  menuLabel: string;
  items: MenuEntry[];
  className?: string;
  title?: string;
  align?: 'left' | 'right';
  /** Content rendered at the top of the menu (not a menu item). */
  header?: ReactNode;
  testId?: string;
  /** Inline style for the trigger (e.g. a max-width cap). */
  style?: React.CSSProperties;
}

/**
 * A button that opens a `role="menu"`. Arrow keys, Home and End move between
 * items; Esc closes and returns focus to the trigger; an outside click or Tab
 * closes it.
 */
export function MenuButton({ label, children, menuLabel, items, className, title, align = 'left', header, testId, style }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const first = menu?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const nodes = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    if (nodes.length === 0) return;
    const idx = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next =
        e.key === 'Home' ? 0
          : e.key === 'End' ? nodes.length - 1
            : e.key === 'ArrowDown' ? (idx + 1) % nodes.length
              : (idx - 1 + nodes.length) % nodes.length;
      nodes[next]?.focus();
    }
  };

  return (
    <div className="appbar-menu">
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-label={label}
        title={title}
        style={style}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          className={`appbar-menu__panel appbar-menu__panel--${align}`}
          onKeyDown={onMenuKey}
        >
          {header}
          {items.map((it) => {
            if (it.kind === 'separator') return <div key={it.id} role="separator" className="appbar-menu__sep" />;
            if (it.kind === 'heading') return <div key={it.id} role="presentation" className="appbar-menu__heading">{it.label}</div>;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`appbar-menu__item${it.danger ? ' is-danger' : ''}`}
                aria-disabled={it.disabled || undefined}
                title={it.hint}
                onClick={() => {
                  if (it.disabled) return;
                  close(true);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
