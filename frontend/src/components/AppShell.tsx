import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ThemeName } from '../types';
import { useDiagram } from '../state/useDiagram';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { ConflictAction } from '../state/conflict';
import ConflictDialog from './ConflictDialog';
import LintDialog from './LintDialog';
import { AppStatusBanner } from './states';
import { ErrorBoundary } from '../app/RouteErrorBoundary';
import { api, setUnauthorizedHandler } from '../lib/api';
import { getSession, setSession, isSignedIn } from '../state/session';
import { DocSwitcher } from './appbar/DocSwitcher';
import { StatusButton } from './appbar/StatusButton';
import type { SaveRunState } from './appbar/status';
import { MenuButton } from './appbar/MenuButton';
import type { MenuEntry } from './appbar/MenuButton';
import { useAppCommands } from './appbar/useAppCommands';
import CommandPalette from './CommandPalette';
import { SearchReveal } from './search/SearchReveal';
import QuickAddHost from './quickadd/QuickAddHost';
import { recordOpened } from '../state/recentDocs';
import ImportDialog from './import/ImportDialog';
import { LimitDialogHost } from './LimitDialog';
import ShareDialog from './ShareDialog';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import ExportDialog from './export/ExportDialog';
import { isServerDocId } from '../lib/honesty';

// Cached cookie-session probe: one GET /api/v1/auth/me per mount at most,
// shared across AppShell instances. Guest/null sessions never hit network.
let meProbeInflight: Promise<boolean> | null = null;
let meProbeCached: boolean | null = null;

export function probeAuthSession(): Promise<boolean> {
  if (meProbeCached !== null) return Promise.resolve(meProbeCached);
  if (meProbeInflight) return meProbeInflight;
  const s = getSession();
  if (!s || s.mode === 'guest') {
    meProbeCached = false;
    return Promise.resolve(false);
  }
  meProbeInflight = api
    .me()
    .then(() => {
      meProbeCached = true;
      return true;
    })
    .catch(() => {
      meProbeCached = false;
      return false;
    })
    .finally(() => {
      meProbeInflight = null;
    });
  return meProbeInflight;
}

export function resetMeProbeCache() {
  meProbeCached = null;
  meProbeInflight = null;
}

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Document Library',
  '/home': 'Home',
  '/dashboard': 'Document Library',
  '/trash': 'Trash',
  '/canvas': 'Precision Canvas',
  '/living': 'Living Sync',
  '/reviews': 'Reviews, Merge & Automation',
  '/git': 'Reviews, Merge & Automation',
  '/blueprints': 'Blueprints',
  '/settings': 'Settings',
  '/settings/general': 'Settings · General',
  '/settings/connectors': 'Settings · Connectors',
  '/settings/team': 'Settings · Team',
  '/settings/storage': 'Settings · Storage',
  '/proposal': 'Precision Canvas',
  '/login': 'Sign in',
  '/onboarding': 'Setup',
};
function ToastTray() {
  const { toasts, pauseToasts, resumeToasts } = useDiagram();
  return (
    <div
      className="toast-tray"
      role="status"
      aria-live="polite"
      onMouseEnter={pauseToasts}
      onMouseLeave={() => resumeToasts(toasts.map((t) => t.id))}
      onFocus={pauseToasts}
      onBlur={() => resumeToasts(toasts.map((t) => t.id))}
    >
      {toasts.map((t) => (
        <div key={t.id} className="toast-msg cyan">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { docTitle, pushToast, exportArch, resync, displayName, activeDocId, duplicateDoc, threads, theme, setTheme, saveConflict, saveActiveDoc, forceSaveActiveDoc, reloadActiveDoc, dismissSaveConflict, nodes: docNodes, edges: docEdges, strokes: docStrokes, texts: docTexts, pages: docPages, layers: docLayers, docDefaults, selectedId } = useDiagram();
  const unresolvedThreads = threads.filter((t) => !t.resolved).length;
  // The one status control's save state (R1-E01-T03): 'saving' while a run is
  // in flight, 'error' when a save attempt throws.
  const [saveState, setSaveState] = useState<SaveRunState>('idle');
  // Below 768 px the five nav links collapse into a "Menu ▾" control (§7).
  const [menuNavMode, setMenuNavMode] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setMenuNavMode(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Import wizard (SC-10): opened from the palette's import command (the ⋯ overflow was removed by R1-E14-T01).
  const [importOpen, setImportOpen] = useState(false);
  const onImport = () => setImportOpen(true);
  // Share dialog (SC-22, R1-E07-T05).
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  useEffect(() => {
    if (!shareOpen || !isSignedIn()) return;
    let cancelled = false;
    api.getCurrentWorkspace().then(
      (r) => { if (!cancelled) setWorkspaceName(r.data?.name ?? null); },
      () => { /* the label falls back to a generic one */ },
    );
    return () => { cancelled = true; };
  }, [shareOpen]);
  const [userOpen, setUserOpen] = useState(false);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  // Token-free account presence: local session mode + a cached /me probe
  // on mount when a non-guest session exists.
  const [signedIn, setSignedIn] = useState(() => {
    const s = getSession();
    return !!s && s.mode !== 'guest';
  });
  useEffect(() => {
    const s = getSession();
    if (!s || s.mode === 'guest') {
      setSignedIn(false);
      return;
    }
    let cancelled = false;
    void probeAuthSession().then((ok) => {
      if (!cancelled) setSignedIn(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setUnauthorizedHandler((info) => {
      if (info.hadSession) pushToast('Session expired — sign in again');
      setSignedIn(false);
      navigate('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [pushToast, navigate]);
  const userInitial = ((displayName ?? '').trim()[0] ?? 'G').toUpperCase();
  const signOut = () => {
    void (async () => {
      try {
        await api.logout();
      } catch {
        /* ignore logout failure — still drop to guest locally */
      }
      try {
        resetMeProbeCache();
        setSession({ mode: 'guest' });
        // Hygiene: drop any legacy pre-cookie bearer leftover.
        api.clearToken();
      } catch {
        /* ignore */
      }
      setSignedIn(false);
      setUserOpen(false);
      pushToast('Signed out — guest mode');
      navigate('/login');
    })();
  };
  const [paletteOpen, setPaletteOpen] = useState(false);  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const shortcutsTrap = useFocusTrap<HTMLDivElement>(shortcutsOpen);

  // Save-conflict dialog hosting (§6.2). A fresh conflict auto-opens the
  // dialog; Esc/X dismisses it but the "resolve" affordance persists in the
  // status button's menu until one of the three explicit actions runs.
  const [conflictOpen, setConflictOpen] = useState(false);
  const [lintOpen, setLintOpen] = useState(false);
  const [conflictBusy, setConflictBusy] = useState<ConflictAction | null>(null);
  const prevConflictRef = useRef(saveConflict);
  useEffect(() => {
    if (saveConflict && !prevConflictRef.current) setConflictOpen(true);
    prevConflictRef.current = saveConflict;
  }, [saveConflict]);

  // Account menu: Esc closes + restores focus to the trigger; arrows move
  // between items (TOP-R9). Outside click still closes via the overlay.
  useEffect(() => {
    if (!userOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setUserOpen(false);
        accountBtnRef.current?.focus();
        return;
      }
      const menu = accountMenuRef.current;
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const next =
          e.key === 'Home' ? 0
            : e.key === 'End' ? items.length - 1
              : e.key === 'ArrowDown' ? (idx + 1) % items.length
                : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userOpen]);

  const onSave = () => {
    setSaveState('saving');
    void (async () => {
      try {
        const r = await saveActiveDoc();
        if (r === 'conflict') setConflictOpen(true);
        setSaveState('idle');
      } catch {
        setSaveState('error');
      }
    })();
  };

  const runConflictAction = (action: ConflictAction) => {
    if (action === 'duplicate') {
      duplicateDoc(activeDocId);
      dismissSaveConflict();
      setConflictOpen(false);
      return;
    }
    setConflictBusy(action);
    const done = action === 'reload' ? reloadActiveDoc() : forceSaveActiveDoc();
    void done.finally(() => {
      setConflictBusy(null);
      setConflictOpen(false);
    });
  };

  const startPresenting = () => {
    setPresenting(true);
    navigate('/canvas');
    pushToast('Focus mode — Esc to exit');
    try {
      const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
      if (el.requestFullscreen && !document.fullscreenElement) {
        void el.requestFullscreen().catch(() => {
          /* fullscreen unavailable — CSS-only present mode still applies */
        });
      }
    } catch {
      /* ignore */
    }
  };
  const stopPresenting = () => {
    setPresenting(false);
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {
      /* ignore */
    }
  };
  const openShortcuts = () => setShortcutsOpen(true);

  // Palette shortcuts come from the registry (R1-E10-T03). The deps here are
  // the imperative handlers the built-in commands close over.
  useAppCommands({ onSave, onImport, onFocusMode: startPresenting, onShortcuts: openShortcuts });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (typing) return;
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setShortcutsOpen(false);
        stopPresenting();
      }
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // v2.4 §1 routing-matrix shortcuts. ⌘-chords are global; bare letters only
  // fire outside the canvas (and never inside inputs) to avoid tool conflicts.
  useEffect(() => {
    const onNavKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !typing) {
        const k = e.key.toLowerCase();
        if (k === 'o') { e.preventDefault(); navigate('/dashboard'); return; }
        if (k === 'b') { e.preventDefault(); navigate('/blueprints'); return; }
        if (k === 'g') { e.preventDefault(); navigate('/reviews', { state: { tab: 'merge' } }); return; }
        if (k === 's') { e.preventDefault(); navigate('/living'); return; }
        if (e.key === ',') { e.preventDefault(); navigate('/settings/general'); return; }
      }
      if (!mod && !typing && tag !== 'BUTTON' && location.pathname !== '/canvas') {
        const k = e.key.toLowerCase();
        if (k === 'b') navigate('/blueprints');
        else if (k === 'd') navigate('/reviews');
        else if (k === 'r') navigate('/living');
      }
    };
    window.addEventListener('keydown', onNavKey);
    return () => window.removeEventListener('keydown', onNavKey);
  }, [navigate, location.pathname]);

  useEffect(() => {
    const screen = ROUTE_TITLES[location.pathname] ?? 'ArchFlux';
    document.title = `${screen} · ArchFlux — Living System Canvas`;
  }, [location.pathname]);

  // Home's "Continue" lists the diagrams opened on the canvas, newest first.
  useEffect(() => {
    if (location.pathname === '/canvas') recordOpened(activeDocId);
  }, [location.pathname, activeDocId]);

  // Browser-chrome Esc exits fullscreen WITHOUT delivering keydown to the
  // page — without this the focus banner and hidden panels get stuck.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Primary nav (R1-E14-T01, AppBar.dc.html): text-only links in design
  // order, Home first (E10-T01); Blueprints left the nav
  // (reachable from Library, New diagram and the palette).
  const tabs: { to: string; label: string; badge?: number }[] = [
    { to: '/home', label: 'Home' },
    { to: '/dashboard', label: 'Library' },
    { to: '/canvas', label: 'Canvas' },
    { to: '/reviews', label: 'Review', badge: unresolvedThreads },
    { to: '/living', label: 'Sync' },
  ];
  const menuNavItems: MenuEntry[] = tabs.map((t, i) => ({
    kind: 'item' as const,
    id: `nav-${i}`,
    label: t.label,
    onSelect: () => navigate(t.to),
  }));
  // Doc switcher, status and the primary action belong to the canvas only
  // (Library.dc.html has none of them).
  const onCanvas = location.pathname === '/canvas';

  return (
    <ErrorBoundary fallback={<div style={{ padding: 24, textAlign: 'center', color: 'var(--text-main)' }}>Error recovered.</div>}>
      <>
        <header className="top-header appbar">
          <NavLink to="/dashboard" className="appbar-brand" aria-label="ArchFlux — go to Library" title="ArchFlux — Library">
            <span className="appbar-brand__tile" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M12 2 3 7v10l9 5 9-5V7z" />
                <path d="m3 7 9 5 9-5M12 12v10" />
              </svg>
            </span>
            <span className="appbar-brand__name">ArchFlux</span>
          </NavLink>

          {onCanvas && (
            <>
              <span className="appbar-divider" aria-hidden="true" />
              <DocSwitcher />
            </>
          )}

          {menuNavMode ? (
            <MenuButton
              label="Menu — screens navigation"
              menuLabel="Screens"
              className="appbar-menu-nav"
              align="left"
              items={menuNavItems}
              testId="appbar-menu-nav"
            >
              <span aria-hidden="true">Menu ▾</span>
            </MenuButton>
          ) : (
            <nav className="appbar-nav" aria-label="Primary">
              {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} className={({ isActive }) => `appbar-nav__link${isActive ? ' is-active' : ''}`}>
                  {t.label}
                  {t.badge != null && t.badge > 0 && (
                    <span className="appbar-nav__badge">{t.badge}</span>
                  )}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="appbar-spacer" aria-hidden="true" />

          <div className="header-actions">
            <button
              type="button"
              className="appbar-search"
              aria-label="Search ⌘K"
              title="Search and commands (⌘K)"
              onClick={() => setPaletteOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="appbar-search__text">Search</span>
              <kbd className="appbar-search__kbd">⌘K</kbd>
            </button>
            {onCanvas && (
              <>
                <StatusButton
                  saveState={saveState}
                  onSave={onSave}
                  onExport={exportArch}
                  onLinter={() => setLintOpen(true)}
                  onResync={resync}
                  onResolveConflict={() => setConflictOpen(true)}
                />
                <button
                  type="button"
                  className="appbar-primary"
                  onClick={() => setShareOpen(true)}
                >
                  Share
                </button>
              </>
            )}
            <div className="appbar-account">
              <button
                ref={accountBtnRef}
                type="button"
                className="appbar-avatar"
                aria-label={signedIn ? `Account (${displayName.trim() || 'signed in'})` : 'Account (guest)'}
                aria-haspopup="menu"
                aria-expanded={userOpen}
                title={signedIn ? 'Account' : 'Guest — sign in'}
                onClick={() => setUserOpen((v) => !v)}
              >
                <span aria-hidden="true">{userInitial}</span>
              </button>
              {userOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setUserOpen(false)} aria-hidden="true" />
                  <div ref={accountMenuRef} role="menu" aria-label="Account" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 91, minWidth: 190, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 10, boxShadow: 'var(--panel-shadow)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 8px', fontFamily: 'var(--mono-font)' }}>
                      {signedIn ? (displayName.trim() || 'Signed in') : 'Guest mode'}
                    </div>
                    {/* Theme moved out of the app bar (§4): it lives here and in Settings → General. */}
                    {([
                      ['light', '☀️ Theme: Engineering Light'],
                      ['blueprint', '📐 Theme: Cyber Blueprint'],
                      ['dark', '🌙 Theme: Obsidian Dark'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        className="btn btn--sm btn--secondary"
                        role="menuitemradio"
                        aria-checked={theme === id}
                        style={{ textAlign: 'left', fontWeight: theme === id ? 700 : 400 }}
                        onClick={() => setTheme(id as ThemeName)}
                      >
                        {label}
                      </button>
                    ))}
                    {signedIn && <WorkspaceSwitcher />}
                    {onCanvas && (
                      <button className="btn btn--sm btn--secondary" role="menuitem" style={{ textAlign: 'left' }} onClick={() => { setUserOpen(false); setExportOpen(true); }}>
                        ⇩ Export…
                      </button>
                    )}
                    {/* Settings moved here from the app bar's ⚙ button (R1-E14-T01). */}
                    <button autoFocus className="btn btn--sm btn--secondary" role="menuitem" style={{ textAlign: 'left' }} onClick={() => { setUserOpen(false); navigate('/settings/general'); }}>
                      ⚙ Settings
                    </button>
                    <button className="btn btn--sm btn--secondary" role="menuitem" style={{ textAlign: 'left' }} onClick={() => { setUserOpen(false); navigate('/settings/team'); }}>
                      👥 Profile & team
                    </button>
                    {signedIn ? (
                      <button className="btn btn--sm btn--secondary" role="menuitem" style={{ textAlign: 'left', color: 'var(--accent-rose)' }} onClick={signOut}>
                        ⎋ Sign out
                      </button>
                    ) : (
                      <button className="btn btn--primary" role="menuitem" style={{ textAlign: 'left' }} onClick={() => { setUserOpen(false); navigate('/login'); }}>
                        → Sign in
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

      <main className={`workspace-body${presenting ? ' presenting' : ''}`}>
        <AppStatusBanner onReviewConflict={() => setConflictOpen(true)} />
        <Outlet />
      </main>

      <SearchReveal />
      {onCanvas && <QuickAddHost />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {shortcutsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShortcutsOpen(false)}>
          <div ref={shortcutsTrap} className="content-card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shortcuts">
            <div className="card-head"><span className="card-title">⌨ Keyboard shortcuts</span><button autoFocus className="btn btn--sm btn--secondary" onClick={() => setShortcutsOpen(false)}>Close</button></div>
            <div style={{ fontSize: 12, fontFamily: 'var(--mono-font)', lineHeight: 2 }}>
              <div><strong>V / H</strong> — select / pan • <strong>P / T</strong> — freehand / text • <strong>S G D Q N</strong> — service, gateway, database, queue, note • <strong>C</strong> — connector • <strong>L</strong> — library (1–5 are aliases)</div>
              <div><strong>Click</strong> — place / select • <strong>Shift+Click</strong> — multi-select • <strong>Cmd+A</strong> — select all</div>
              <div><strong>Double-click</strong> — rename node • <strong>Q</strong> — lock tool for repeat use</div>
              <div><strong>Del</strong> — delete selected • <strong>Ctrl+D</strong> — duplicate</div>
              <div><strong>Arrows</strong> — nudge selected (Shift = 20px)</div>
              <div><strong>Scroll</strong> — pan canvas • <strong>Ctrl+Scroll</strong> — zoom to cursor • <strong>Drag</strong> — pan / move</div>
              <div><strong>Ctrl+Z / Ctrl+Shift+Z</strong> — undo / redo</div>
              <div><strong>F</strong> — fit view • <strong>Esc</strong> — clear / exit</div>
              <div><strong>Cmd+K</strong> — command palette</div>
              <div><strong>Cmd+O / Cmd+B / Cmd+G / Cmd+S / Cmd+,</strong> — library / blueprints / merge & automation / living sync / settings</div>
              <div><strong>B D R</strong> — blueprints / reviews / living (outside canvas, not while a button is focused)</div>
              <div><strong>Esc</strong> — also cancels a pending wire source</div>
            </div>
          </div>
        </div>
      )}

      {presenting && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontFamily: 'var(--mono-font)' }}>
          FOCUS MODE — Esc to exit
        </div>
      )}
      {conflictOpen && saveConflict && (
        <ConflictDialog
          conflict={saveConflict}
          busyAction={conflictBusy}
          onAction={runConflictAction}
          onClose={() => setConflictOpen(false)}
        />
      )}
      {lintOpen && <LintDialog onClose={() => setLintOpen(false)} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={() => navigate('/canvas')} />}
      {shareOpen && (
        <ShareDialog
          diagramId={activeDocId}
          title={docTitle}
          cloud={signedIn && isServerDocId(activeDocId)}
          workspaceName={workspaceName}
          selfEmail={getSession()?.email ?? null}
          onSaveToCloud={() => { void saveActiveDoc(); }}
          onClose={() => setShareOpen(false)}
        />
      )}
      {exportOpen && (
        <ExportDialog
          doc={{ id: activeDocId, title: docTitle, nodes: docNodes, edges: docEdges, strokes: docStrokes, texts: docTexts, pages: docPages, layers: docLayers, defaults: docDefaults, createdAt: 0, updatedAt: 0 }}
          activePageId={docPages[0]?.id}
          selectedIds={selectedId ? [selectedId] : []}
          isDark={theme !== 'light'}
          onClose={() => setExportOpen(false)}
        />
      )}
      <LimitDialogHost />
      <ToastTray />
      </>
    </ErrorBoundary>
  );
}