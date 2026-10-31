import type { ThemeName } from '../types';

/** Per-device theme choice. Independent of the document store and of sign-in state. */
export const THEME_KEY = 'archflux:theme:v1';

const THEMES: readonly string[] = ['light', 'dark', 'blueprint'];

export function loadTheme(): ThemeName | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v && THEMES.includes(v) ? (v as ThemeName) : null;
  } catch {
    return null;
  }
}

export function saveTheme(t: ThemeName) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
}

/** Apply the saved theme to <html> before first paint (legacy store theme as fallback). */
export function applyStoredTheme() {
  let theme: string | null = loadTheme();
  if (!theme) {
    try {
      const raw = localStorage.getItem('archflux:v2-light');
      const legacy = raw ? (JSON.parse(raw).theme as string) : null;
      theme = legacy && THEMES.includes(legacy) ? legacy : null;
    } catch {
      theme = null;
    }
  }
  document.documentElement.setAttribute('data-theme', theme ?? 'light');
}
