import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';

// One status indicator in the app bar (UX-P1.2): source mode + save state +
// lint count in a single StatusButton; freshness pills and the lint chip go.

const SERVER_ID = '123e4567-e89b-12d3-a456-426614174000';
const realFetch = globalThis.fetch;

function mockServer() {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    });
    if (method === 'POST' && /\/v1\/diagrams$/.test(u)) return reply(201, { data: { id: SERVER_ID, version: 1 } });
    if (method === 'GET' && /\/v1\/diagrams\?/.test(u)) return reply(200, { data: [], total: 0 });
    if (method === 'PUT') return reply(200, { data: { id: SERVER_ID, version: 2 } });
    return reply(404, { error: { code: 'NOT_FOUND' } });
  }) as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  globalThis.innerWidth = 1440;
  window.dispatchEvent(new Event('resize'));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.innerWidth = 1024;
  cleanup();
});

// The doc switcher, status and primary action live on /canvas only
// (R1-E14-T01), so the shell mounts there unless a test says otherwise.
function setupShell(withProbe = false, route = '/canvas') {
  const latest: { v: DiagramContextValue | null } = { v: null };
  function Probe() {
    latest.v = useDiagram();
    return null;
  }
  render(
    <MemoryRouter initialEntries={[route]}>
      <DiagramProvider>
        {withProbe && <Probe />}
        <AppShell />
      </DiagramProvider>
    </MemoryRouter>,
  );
  return () => latest.v;
}

describe('app bar per IA (R1-E01-T03, UX-P1.2)', () => {
  it('has at most 9 action controls at 1440px (nav is a link set, counted separately)', () => {
    setupShell();
    const banner = screen.getByRole('banner');
    const all = banner.querySelectorAll('button, a');
    const navLinks = Array.from(banner.querySelectorAll('nav[aria-label="Primary"] a')) as HTMLAnchorElement[];
    expect(navLinks.length).toBe(5);
    // Non-navigation controls: logo, doc switcher, search, status, Save, avatar.
    const actions = all.length - navLinks.length;
    expect(actions).toBeLessThanOrEqual(9);
    // And the five canonical destinations are present (Blueprints left the nav, R1-E14-T01).
    expect(navLinks.map((a) => a.pathname).sort()).toEqual(
      ['/canvas', '/dashboard', '/home', '/living', '/reviews'],
    );
  });

  it('shows exactly one status indicator', () => {
    setupShell();
    expect(screen.getAllByTestId('status-button').length).toBe(1);
    expect(document.querySelectorAll('.freshness-pill').length).toBe(0);
    expect(document.querySelectorAll('[data-testid="source-mode-badge"]').length).toBe(0);
  });

  it('status label reads "Unsaved changes" when a server doc is dirty', async () => {
    mockServer();
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@example.com' }));
    const api = setupShell(true);
    // Make the active doc a server doc with a server version, then dirty it.
    await act(async () => {
      api()?.addNode('service', 100, 100);
    });
    await act(async () => {
      await api()?.saveActiveDoc();
    });
    act(() => {
      api()?.addNode('service', 200, 200);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('status-button')[0].textContent).toContain('Unsaved changes');
    });
  });

  it('doc switcher menu holds Rename, Duplicate, New and the recent docs', async () => {
    const api = setupShell(true);
    // Creating a doc keeps the previous one in the library: it becomes a
    // recent entry in the switcher. (Reads happen after act: state updates
    // flush at the end of the act scope, not mid-callback.)
    await act(async () => {
      api()?.newDoc();
    });
    const docCount = api()?.docs.length ?? 0;
    const recentCount = (api()?.docs ?? []).filter((d) => d.id !== api()?.activeDocId).length;
    expect(recentCount).toBeGreaterThanOrEqual(1);
    // Open the switcher menu.
    const switcher = screen
      .getAllByRole('button', { name: /Diagram: .+ Switch, rename or create/ })[0];
    expect(switcher).toBeTruthy();
    act(() => {
      switcher.click();
    });
    const menu = document.querySelector('[role="menu"][aria-label="Diagram"]');
    expect(menu).toBeTruthy();
    const items = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []).map((m) => m.textContent ?? '');
    expect(items.some((t) => t.includes('Rename'))).toBe(true);
    expect(items.some((t) => t.includes('Duplicate'))).toBe(true);
    expect(items.some((t) => t.includes('New diagram'))).toBe(true);
    expect(items.some((t) => t.includes(`All diagrams (${docCount})`))).toBe(true);
    // A recent doc entry exists (the previous doc's title) and the disabled
    // empty-state does not.
    expect(items.some((t) => t.includes('untitled.arch'))).toBe(true);
    expect(items.some((t) => t.includes('No other diagrams yet'))).toBe(false);
  });

  it('below 768px the nav collapses into one Menu control', () => {
    globalThis.innerWidth = 600;
    window.dispatchEvent(new Event('resize'));
    setupShell();
    expect(screen.getAllByTestId('appbar-menu-nav').length).toBe(1);
    expect(document.querySelectorAll('nav[aria-label="Primary"]').length).toBe(0);
  });
});

describe('app bar = AppBar.dc.html (R1-E14-T01)', () => {
  it('a long doc title is truncated with an ellipsis, with the full name in title and aria-label (R1-E14-T08)', () => {
    const long = 'untitled-2 [branch-2026-10-13].arch with a very long descriptive suffix';
    const get = setupShell(true);
    act(() => { get()!.renameDoc(get()!.activeDocId, long); });
    const btn = screen.getByRole('button', { name: `Diagram: ${long}. Switch, rename or create` });
    expect(btn.getAttribute('title')).toBe(long);
    expect(btn.style.maxWidth).toBe('240px');
    const label = within(btn).getByText(long);
    expect(label.style.overflow).toBe('hidden');
    expect(label.style.textOverflow).toBe('ellipsis');
    expect(label.style.whiteSpace).toBe('nowrap');
  });

  it('nav is text-only Home·Library·Canvas·Review·Sync with active styling', () => {
    setupShell();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'Library', 'Canvas', 'Review', 'Sync']);
    // Text only: no icons, no pill container.
    expect(nav.querySelectorAll('img, svg').length).toBe(0);
    expect(nav.classList.contains('screen-tabs')).toBe(false);
    // Blueprints left the nav; Home is first now that /home exists.
    expect(screen.queryByRole('link', { name: 'Blueprints' })).toBeNull();
    // Active link: is-active styling + aria-current; the others are plain.
    const canvas = screen.getByRole('link', { name: 'Canvas' });
    expect(canvas.getAttribute('aria-current')).toBe('page');
    expect(canvas.classList.contains('is-active')).toBe(true);
    for (const name of ['Library', 'Review', 'Sync']) {
      const l = screen.getByRole('link', { name });
      expect(l.classList.contains('is-active')).toBe(false);
      expect(l.getAttribute('aria-current')).toBeNull();
    }
  });

  it('search field opens the palette', () => {
    setupShell();
    const search = screen.getByRole('button', { name: 'Search ⌘K' });
    expect(search.textContent).toContain('Search');
    expect(search.querySelector('kbd')?.textContent).toBe('⌘K');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    fireEvent.click(search);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('primary action reads Share and opens the share dialog', async () => {
    const api = setupShell(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const dlg = await screen.findByRole('dialog', { name: /^Share / });
    // Guest + local doc: the dialog offers save-to-cloud, and saving answers honestly with a sign-in toast.
    expect(dlg.textContent).toContain('Save this diagram to the cloud to share it');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save to cloud' }));
    });
    await waitFor(() => {
      expect(api()?.toasts.some((t) => t.text.includes('Sign in to save'))).toBe(true);
    });
  });

  it('no notifications bell in R1', () => {
    setupShell();
    const banner = screen.getByRole('banner');
    expect(banner.querySelector('[aria-label*="otification"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /notification/i })).toBeNull();
  });

  it('library route has no doc switcher, status or primary action', () => {
    setupShell(false, '/dashboard');
    expect(screen.queryByRole('button', { name: /Switch, rename or create/ })).toBeNull();
    expect(screen.queryByTestId('status-button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    // Search and the avatar stay.
    expect(screen.getByRole('button', { name: 'Search ⌘K' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Account/ })).toBeTruthy();
  });
});
