// BUG-LIVE-010: the chosen theme survives reload and sign-in/out, per device.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { THEME_KEY, loadTheme, saveTheme, applyStoredTheme } from '../state/theme';
import { clearSession, setSession } from '../state/session';

const h: { api: ReturnType<typeof useDiagram> | null } = { api: null };
function Probe() {
  const d = useDiagram();
  useEffect(() => { h.api = d; });
  return <div data-testid="t">{d.theme}</div>;
}
const mount = () => render(<DiagramProvider><Probe /></DiagramProvider>);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  h.api = null;
});
afterEach(cleanup);

describe('theme persistence (BUG-LIVE-010)', () => {
  it('setTheme writes the device key immediately (no debounce)', () => {
    mount();
    act(() => h.api!.setTheme('dark'));
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('a fresh mount restores the saved theme, even with no other persisted state', () => {
    saveTheme('dark');
    const { getByTestId } = mount();
    expect(getByTestId('t').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('survives sign-in and sign-out (session changes do not touch it)', () => {
    saveTheme('blueprint');
    setSession({ mode: 'github', email: 'a@x.com' });
    clearSession();
    setSession({ mode: 'guest' });
    expect(loadTheme()).toBe('blueprint');
  });

  it('ignores garbage values and falls back to the legacy store theme, then light', () => {
    localStorage.setItem(THEME_KEY, 'neon');
    expect(loadTheme()).toBeNull();
    const { getByTestId } = mount();
    expect(getByTestId('t').textContent).toBe('light');
  });

  it('applyStoredTheme sets data-theme before render and defaults to light', () => {
    applyStoredTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    saveTheme('dark');
    applyStoredTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('does not throw when localStorage is unavailable', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('denied'); };
    try {
      expect(loadTheme()).toBeNull();
      expect(() => applyStoredTheme()).not.toThrow();
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
