import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Minimal focus trap for modal dialogs: Tab cycles inside while active. */
export function useFocusTrap<T extends HTMLElement>(active: boolean): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(selector)).filter(
        (i) => !i.hasAttribute('disabled') && i.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [active]);
  return ref;
}
