import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ThemeName } from '../types';
import HonestyBadge from './HonestyBadge';
import { sourceModeForDoc, sourceModeLabel, sourceModeTooltip } from '../honesty';
import { libraryShapes } from '../mocks';
import { useDiagram, useDiagramUI } from '../useDiagram';
import { useFocusTrap } from '../useFocusTrap';
import { ErrorBoundary } from '../ErrorBoundary';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Document Library',
  '/dashboard': 'Document Library',
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

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

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
  const { theme, setTheme, freshness, freshnessLabel, driftCount, pushToast, exportArch, exportPNG, docTitle, setDocTitle, dirty, undo, redo, canUndo, canRedo, undoDepth, redoDepth, resetView, healAll, resync, threads, docs, activeDocId, openDoc, newDoc, renameDoc, duplicateDoc, deleteDoc, placeShape, applyLayout, displayName } = useDiagram();
  const isCanvas = location.pathname === '/canvas';
  const [userOpen, setUserOpen] = useState(false);
  const authToken = (() => {
    try {
      return localStorage.getItem('archflux:auth_token');
    } catch {
      return null;
    }
  })();
  const userInitial = ((displayName ?? '').trim()[0] ?? 'G').toUpperCase();
  const signOut = () => {
    try {
      localStorage.removeItem('archflux:auth_token');
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    } catch {
      /* ignore */
    }
    setUserOpen(false);
    pushToast('Signed out — guest mode');
    navigate('/login');
  };
  const { lintCount } = useDiagramUI();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [armDoc, setArmDoc] = useState<string | null>(null);
  // Disarm a pending delete when the Diagrams popover closes.
  useEffect(() => {
    if (!docsOpen) setArmDoc(null);
  }, [docsOpen]);
  const paletteTrap = useFocusTrap<HTMLDivElement>(paletteOpen);
  const shortcutsTrap = useFocusTrap<HTMLDivElement>(shortcutsOpen);
  const docsTrap = useFocusTrap<HTMLDivElement>(docsOpen);

  const commands: { id: string; label: string; run: () => void; disabled?: boolean }[] = useMemo(() => [
    { id: 'dashboard', label: 'Go to Document Library', run: () => navigate('/dashboard') },
    { id: 'canvas', label: 'Go to Precision Canvas', run: () => navigate('/canvas') },
    { id: 'living', label: 'Go to Living Sync', run: () => navigate('/living') },
    { id: 'reviews', label: 'Go to Reviews & Merge', run: () => navigate('/reviews') },
    { id: 'merge', label: 'Go to Reviews Merge & Automation', run: () => navigate('/reviews', { state: { tab: 'merge' } }) },
    { id: 'blueprints', label: 'Go to Blueprints', run: () => navigate('/blueprints') },
    { id: 'settings', label: 'Go to Settings', run: () => navigate('/settings/general') },
    { id: 'export', label: 'Export .arch file', run: () => exportArch() },
    { id: 'export-png', label: 'Export PNG snapshot', run: () => exportPNG() },
    { id: 'new-doc', label: 'New blank diagram', run: () => { newDoc(); navigate('/canvas'); } },
    { id: 'resync', label: 'Re-sync from upstream', run: () => resync() },
    { id: 'heal', label: 'Heal All Lint Issues', run: () => healAll() },
    { id: 'layout', label: 'Run Auto-Layout (DAG)', run: () => { navigate('/canvas'); applyLayout('dag'); } },
    ...libraryShapes.map((s) => ({
      id: `insert-${s.id}`,
      label: `Insert ${s.label} (${s.provider}) at canvas center`,
      run: () => { navigate('/canvas'); placeShape(s, 400, 300); },
    })),
    ...docs.map((d) => ({
      id: `open-${d.id}`,
      label: `Open diagram: ${d.title}`,
      run: () => { openDoc(d.id); navigate('/canvas'); },
    })),
    { id: 'undo', label: 'Undo', run: () => undo(), disabled: !canUndo },
    { id: 'redo', label: 'Redo', run: () => redo(), disabled: !canRedo },
    { id: 'fit', label: 'Fit canvas to view', run: () => { navigate('/canvas'); resetView(); } },
    { id: 'theme-dark', label: 'Theme: Obsidian Dark', run: () => setTheme('dark') },
    { id: 'theme-blue', label: 'Theme: Cyber Blueprint', run: () => setTheme('blueprint') },
    { id: 'theme-light', label: 'Theme: Engineering Light', run: () => setTheme('light') },
  ], [navigate, exportArch, exportPNG, newDoc, resync, healAll, applyLayout, placeShape, openDoc, docs, undo, redo, canUndo, canRedo, resetView, setTheme]);

  // Subsequence fuzzy match: every query char appears in order ("expt" → "Export PNG").
  const fuzzyMatch = (label: string, q: string) => {
    const h = label.toLowerCase();
    let i = 0;
    const needle = q.toLowerCase();
    for (let j = 0; j < h.length && i < needle.length; j++) {
      if (h[j] === needle[i]) i++;
    }
    return i === needle.length;
  };
  const filtered = query.trim() ? commands.filter((c) => fuzzyMatch(c.label, query.trim())) : commands;
  const clampedIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1));

  // Reset active index when query changes (UX: clear selection on new filter).
  // This is an intentional synchronization with external input (query), not a cascading render bug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (typing) return;
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setQuery('');
        setActiveIdx(0);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setShortcutsOpen(false);
        setDocsOpen(false);
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

  // Browser-chrome Esc exits fullscreen WITHOUT delivering keydown to the
  // page — without this the focus banner and hidden panels get stuck.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <ErrorBoundary fallback={<div style={{ padding: 24, textAlign: 'center', color: 'var(--text-main)' }}>Error recovered.</div>}>
      <>
        <header className="top-header">
        <div className="brand-group">
          <div className="brand-logo" onClick={() => navigate('/canvas')} title="Go to canvas" role="button" tabIndex={0} aria-label="Go to canvas" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/canvas'); } }}>
            <div className="brand-icon-hex">⚡</div>
            <div className="brand-title-wrap">
              <span className="brand-name" title={dirty ? 'Modified in this session (auto-saved locally)' : 'No unsaved session changes'}>ArchFlux{dirty ? ' •' : ''}</span>
              <span className="brand-tagline">Living System Canvas</span>
            </div>
          </div>
          <div className="doc-breadcrumb">
            <button
              className="btn-xs"
              title="All diagrams — new, open, rename, duplicate, delete"
              aria-label={`Diagrams (${docs.length}). Open manager.`}
              onClick={() => setDocsOpen((v) => !v)}
            >
              🗂 {docs.length}
            </button>
            <span>repo/</span>
            <input
              type="text"
              className="doc-title-input"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              aria-label="Diagram file name"
              maxLength={80}
              style={{ width: 200 }}
            />
            <span style={{ color: 'var(--text-dim)' }} title={dirty ? 'Modified in this session (auto-saved locally)' : 'No unsaved session changes'}>[git:main]{dirty ? ' ●' : ''}</span>
          </div>
          {(() => {
            const mode = sourceModeForDoc(activeDocId);
            return (
              <HonestyBadge
                label={sourceModeLabel(mode)}
                tone={mode === 'local' ? 'neutral' : 'info'}
                title={sourceModeTooltip(mode)}
                data-testid="source-mode-badge"
              />
            );
          })()}
          <div className={`freshness-pill ${freshness}`} onClick={() => navigate('/living')} role="button" tabIndex={0} aria-label={`${freshnessLabel} — open Living Sync`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/living'); } }}>
            <span className="status-pulse-dot"></span>
            <span>{freshnessLabel}</span>
          </div>
          <button
            className={`btn linter-chip${lintCount > 0 ? ' pulse' : ''}`}
            title={`${lintCount} linter issues — open the canvas (linter lives in the right dock)`}
            aria-label={`${lintCount} linter issues. Open canvas.`}
            onClick={() => navigate('/canvas')}
            style={lintCount > 0 ? { borderColor: 'var(--status-warning, #D97706)', color: 'var(--status-warning, #D97706)' } : { borderColor: 'var(--status-success, #16A34A)', color: 'var(--status-success, #16A34A)' }}
          >
            🔍 {lintCount}
          </button>
        </div>

<nav className="screen-tabs" aria-label="Screens">
          <NavLink to="/dashboard" className={({ isActive }) => `screen-tab-btn${isActive ? ' active' : ''}`}><img src="/icons/general/library.svg" alt="" style={{width:16,height:16,marginRight:6}}/> Library</NavLink>
          <NavLink to="/canvas" className={({ isActive }) => `screen-tab-btn${isActive ? ' active' : ''}`}><img src="/icons/tools/select.svg" alt="" style={{width:16,height:16,marginRight:6}}/> Precision Canvas</NavLink>
          <NavLink to="/living" className={({ isActive }) => `screen-tab-btn${isActive ? ' active' : ''}`}>
            <img src="/icons/general/sync.svg" alt="" style={{width:16,height:16,marginRight:6}}/> Living Sync
            {driftCount > 0 && <span className="badge-count warn">{driftCount}</span>}
          </NavLink>
          <NavLink to="/reviews" className={({ isActive }) => `screen-tab-btn${isActive ? ' active' : ''}`}>
            <img src="/icons/tools/comment.svg" alt="" style={{width:16,height:16,marginRight:6}}/> Reviews & Merge
            {threads.filter((t) => !t.resolved).length > 0 && (
              <span className="badge-count cyan">{threads.filter((t) => !t.resolved).length}</span>
            )}
          </NavLink>
          <NavLink to="/blueprints" className={({ isActive }) => `screen-tab-btn${isActive ? ' active' : ''}`}><img src="/icons/general/blueprint.svg" alt="" style={{width:16,height:16,marginRight:6}}/> Blueprints</NavLink>
          <NavLink to="/settings/general" className={() => `screen-tab-btn${location.pathname.startsWith('/settings') ? ' active' : ''}`} aria-current={location.pathname.startsWith('/settings') ? 'page' : undefined}><img src="/icons/tools/settings.svg" alt="" style={{width:16,height:16,marginRight:6}}/> Settings{!authToken && <span className="badge-count warn" title="Not signed in — configure auth">!</span>}</NavLink>
        </nav>

        <div className="header-actions">
          <button className="btn" title="Command palette (Cmd+K)" aria-label="Open command palette" onClick={() => { setPaletteOpen(true); setQuery(''); setActiveIdx(0); }}>⌘K</button>
          <button className="btn" title="Keyboard shortcuts" aria-label="Show keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>?</button>
          {isCanvas && (
            <>
              <button className="btn" title={`Undo (${undoDepth} in stack)`} aria-label="Undo" onClick={undo} disabled={!canUndo}>↩</button>
              <button className="btn" title={`Redo (${redoDepth} in stack)`} aria-label="Redo" onClick={redo} disabled={!canRedo}>↪</button>
            </>
          )}
          <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)} aria-label="Theme">
            <option value="light">☀️ Engineering Light</option>
            <option value="blueprint">📐 Cyber Blueprint</option>
            <option value="dark">🌙 Obsidian Dark</option>
          </select>
          <button className="btn" onClick={startPresenting} title="Hide panels and go fullscreen">
            <span>⛶ Focus</span>
          </button>
          <button className="btn btn-primary" onClick={exportArch}>
            <span>Export .arch</span>
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="btn"
              aria-label={authToken ? `Account (${displayName.trim() || 'signed in'})` : 'Account (guest)'}
              aria-haspopup="menu"
              aria-expanded={userOpen}
              title={authToken ? 'Account' : 'Guest — sign in'}
              onClick={() => setUserOpen((v) => !v)}
              style={{ position: 'relative' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                  background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)',
                }}
              >
                {userInitial}
              </span>
              <span
                aria-hidden="true"
                title={authToken ? 'Signed in' : 'Guest'}
                style={{
                  position: 'absolute', top: 2, right: 2, width: 8, height: 8,
                  borderRadius: '50%', background: authToken ? '#16A34A' : '#D97706',
                  border: '1px solid var(--bg-panel)',
                }}
              />
            </button>
            {userOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setUserOpen(false)} aria-hidden="true" />
                <div role="menu" aria-label="Account" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 91, minWidth: 190, background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 10, boxShadow: 'var(--panel-shadow)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 8px', fontFamily: 'var(--mono-font)' }}>
                    {authToken ? (displayName.trim() || 'Signed in') : 'Guest mode'}
                  </div>
                  <button className="btn-xs" role="menuitem" style={{ textAlign: 'left' }} onClick={() => { setUserOpen(false); navigate('/settings/team'); }}>
                    👥 Profile & Team
                  </button>
                  {authToken ? (
                    <button className="btn-xs" role="menuitem" style={{ textAlign: 'left', color: 'var(--accent-rose)' }} onClick={signOut}>
                      ⎋ Sign out
                    </button>
                  ) : (
                    <button className="btn-xs btn-xs-primary" role="menuitem" style={{ textAlign: 'left' }} onClick={() => { setUserOpen(false); navigate('/login'); }}>
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
        <Outlet />
      </main>

      {docsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 92 }} onClick={() => setDocsOpen(false)}>
          <div
            ref={docsTrap}
            className="content-card"
            style={{ position: 'fixed', top: 62, left: 12, width: 380, maxWidth: '92vw', maxHeight: 440, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Diagrams"
          >
            <div className="card-head" style={{ padding: '14px 16px 0' }}>
              <span className="card-title">Diagrams ({docs.length})</span>
              <button className="btn-xs btn-xs-primary" onClick={() => { newDoc(); setDocsOpen(false); navigate('/canvas'); }}>+ New diagram</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {docs.length === 0 && <div className="callout-block">No diagrams yet — create one to get started.</div>}
              {docs.map((d) => {
                const active = d.id === activeDocId;
                const renaming = renamingId === d.id;
                return (
                  <div key={d.id} className="connector-row" style={active ? { borderColor: 'var(--accent-cyan)' } : undefined}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renaming ? (
                        <input
                          autoFocus
                          className="doc-title-input"
                          style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--accent-cyan)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameDoc(d.id, renameText);
                              setRenamingId(null);
                            } else if (e.key === 'Escape') {
                              e.stopPropagation();
                              setRenamingId(null);
                            }
                          }}
                          onBlur={() => {
                            if (renamingId === d.id) {
                              renameDoc(d.id, renameText);
                              setRenamingId(null);
                            }
                          }}
                          aria-label="Diagram name"
                        />
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.title} {active && <span className="badge-count cyan" style={{ marginLeft: 4 }}>open</span>}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>
                        {d.nodes.length}n · {d.edges.length}e · {relTime(d.updatedAt)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {!active && <button className="btn-xs" onClick={() => { openDoc(d.id); setDocsOpen(false); navigate('/canvas'); }}>Open</button>}
                      <button
                        className="btn-xs"
                        title="Rename"
                        onClick={() => {
                          if (renaming) {
                            renameDoc(d.id, renameText);
                            setRenamingId(null);
                          } else {
                            setRenameText(d.title);
                            setRenamingId(d.id);
                          }
                        }}
                      >
                        ✎
                      </button>
                      <button className="btn-xs" title="Duplicate" onClick={() => { duplicateDoc(d.id); setDocsOpen(false); navigate('/canvas'); }}>⧉</button>
                      <button
                        className="btn-xs"
                        title={armDoc === d.id ? 'Click again to permanently delete' : 'Delete (click twice to confirm)'}
                        aria-label={armDoc === d.id ? `Confirm delete ${d.title}` : `Delete ${d.title}`}
                        aria-live="polite"
                        style={armDoc === d.id ? { borderColor: 'var(--accent-rose)', color: '#FFFFFF', background: 'var(--accent-rose)' } : { color: 'var(--accent-rose)' }}
                        onClick={() => {
                          if (armDoc === d.id) {
                            setArmDoc(null);
                            deleteDoc(d.id);
                          } else {
                            setArmDoc(d.id);
                            window.setTimeout(() => setArmDoc((cur) => (cur === d.id ? null : cur)), 3000);
                          }
                        }}
                      >
                        {armDoc === d.id ? 'Sure?' : '✕'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '0 12px 12px', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)' }}>
              Autosaved locally · switching diagrams clears undo
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 95, display: 'flex', justifyContent: 'center', paddingTop: 90 }} onClick={() => setPaletteOpen(false)}>
          <div ref={paletteTrap} className="content-card" style={{ width: 480, height: 'fit-content', maxHeight: 420, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <input
              autoFocus
              className="doc-title-input"
              style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}
              placeholder="Type a command… (canvas, sync, export, theme…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && filtered[clampedIdx] && !filtered[clampedIdx].disabled) {
                  filtered[clampedIdx].run();
                  setPaletteOpen(false);
                }
              }}
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-listbox"
              aria-label="Command palette"
              aria-autocomplete="list"
              aria-activedescendant={filtered[clampedIdx] ? `cmd-${filtered[clampedIdx].id}` : undefined}
            />
            <div id="cmd-listbox" role="listbox" style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === clampedIdx}
                  aria-disabled={c.disabled}
                  disabled={c.disabled}
                  className="dock-action-btn"
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', borderColor: i === clampedIdx ? 'var(--accent-cyan)' : undefined }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => { if (c.disabled) return; c.run(); setPaletteOpen(false); }}
                >
                  {c.label}
                </button>
              ))}
              {filtered.length === 0 && <div role="status" style={{ fontSize: 12, color: 'var(--text-muted)' }}>No commands match “{query}”.</div>}
            </div>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShortcutsOpen(false)}>
          <div ref={shortcutsTrap} className="content-card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shortcuts">
            <div className="card-head"><span className="card-title">⌨ Keyboard shortcuts</span><button autoFocus className="btn-xs" onClick={() => setShortcutsOpen(false)}>Close</button></div>
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
      <ToastTray />
      </>
    </ErrorBoundary>
  );
}