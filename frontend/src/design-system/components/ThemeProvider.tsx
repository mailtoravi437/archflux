import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
});

const STORAGE_KEY = 'archflux-theme-v2';

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {}
  return 'system';
}

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function applyThemeToDocument(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(getInitialTheme()));
  const [, setHydrated] = useState(false);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    const r = resolveTheme(t);
    setResolved(r);
    applyThemeToDocument(r);
  }, []);

  useEffect(() => {
    // Synchronous apply on first client render to avoid flash
    const r = resolveTheme(theme);
    setResolved(r);
    applyThemeToDocument(r);
    setHydrated(true);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') {
        const r2 = resolveTheme('system');
        setResolved(r2);
        applyThemeToDocument(r2);
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  // Suppress flash before hydration completes: render nothing different, just attribute set above
  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      <ThemeScript />
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  return useContext(ThemeContext);
}

// Script injected before hydration (no reload, no flash)
function ThemeScript() {
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `
(function() {
  try {
    var k='archflux-theme-v2';
    var t = localStorage.getItem(k);
    if (t!=='light' && t!=='dark' && t!=='system') t='system';
    var r = t==='system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', r);
    document.documentElement.classList.add(r);
  } catch(e){}
})();
        `.trim(),
      }}
    />
  );
}
