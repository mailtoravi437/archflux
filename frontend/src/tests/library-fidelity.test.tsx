import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import DashboardScreen from '../screens/DashboardScreen';
import { sampleNodes, sampleEdges } from './fixtures/sampleDiagram';
import { relativeTime } from '../components/library/libraryModel';

// R1-E14-T04: Library page = docs/design/artboards/Library.dc.html.

const SERVER_ID = '123e4567-e89b-12d3-a456-426614174000';
const realFetch = globalThis.fetch;
const HOUR = 3600_000;

function seed() {
  const now = Date.now();
  const docs = [
    { id: SERVER_ID, title: 'server.arch', nodes: sampleNodes, edges: sampleEdges, createdAt: now - 48 * HOUR, updatedAt: now - 2 * 60_000, serverVersion: 12 },
    { id: 'doc-blank', title: 'untitled.arch', nodes: [], edges: [], createdAt: now, updatedAt: now - 1000 },
    { id: 'doc-pair', title: 'pair.arch', nodes: sampleNodes.slice(0, 2), edges: sampleEdges.slice(0, 1), createdAt: now, updatedAt: now - 30 * HOUR },
  ];
  localStorage.setItem(
    'archflux:v2-light',
    JSON.stringify({ docs, activeDocId: SERVER_ID, nodes: docs[0].nodes, edges: docs[0].edges, docTitle: docs[0].title }),
  );
}

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DiagramProvider>
        <DashboardScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

function cardFor(title: string): HTMLElement {
  const link = screen.getByRole('link', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  const card = link.closest('[data-testid="libpage-card"]');
  if (!(card instanceof HTMLElement)) throw new Error(`no card for ${title}`);
  return card;
}

beforeEach(() => {
  localStorage.clear();
  // Signed-in runs list server diagrams once on mount; answer with nothing new.
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: [], total: 0 }),
  })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe('Library page fidelity (R1-E14-T04)', () => {
  it('header shows h1, real counts and two actions', () => {
    seed();
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@example.com' }));
    const { unmount } = renderLibrary();
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
    expect(screen.getByText('3 diagrams · 1 saved to the server · 2 on this device')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import .arch' }).className).toContain('libpage-btn--secondary');
    const create = screen.getByRole('button', { name: 'New diagram' });
    expect(create.className).toContain('libpage-btn--primary');
    expect(create.querySelector('svg')).not.toBeNull();
    unmount();

    // Signed out (guest): one honest count, no server claim.
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderLibrary();
    expect(screen.getByText('3 diagrams on this device')).toBeTruthy();
    expect(screen.queryByText(/saved to the server/)).toBeNull();
  });

  it('source filter filters server vs device', () => {
    seed();
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderLibrary();
    expect(screen.getByPlaceholderText('Search diagrams by name or tag')).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: 'Source' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['All', 'Server', 'This device']);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByTestId('libpage-card')).toHaveLength(3);

    fireEvent.click(radios[1]);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByTestId('libpage-card')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /^server\.arch/ })).toBeTruthy();

    // Arrow keys move the selection (roving tabindex).
    fireEvent.keyDown(radios[1], { key: 'ArrowRight' });
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    expect(radios[2].tabIndex).toBe(0);
    expect(radios[0].tabIndex).toBe(-1);
    expect(screen.getAllByTestId('libpage-card')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /^server\.arch/ })).toBeNull();

    // Sort offers exactly the artboard's two options.
    const sort = screen.getByRole('combobox', { name: 'Sort' });
    expect(within(sort).getAllByRole('option').map((o) => o.textContent)).toEqual(['Last modified', 'Name']);
    // Grid/Table and Select are gone from the toolbar.
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });

  it('cards show thumbnail, title, source chip, meta', () => {
    seed();
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderLibrary();
    const grid = screen.getAllByTestId('libpage-card')[0].parentElement;
    expect(grid?.className).toContain('libpage-grid');

    const server = cardFor('server.arch');
    const thumb = within(server).getByTestId('libpage-thumb');
    // One rect per real node, from the doc's own positions.
    expect(thumb.querySelectorAll('rect[data-thumb-node]')).toHaveLength(sampleNodes.length);
    expect(thumb.querySelectorAll('line').length).toBe(sampleEdges.filter((e) => e.to).length);
    expect(within(server).getByText('server.arch')).toBeTruthy();
    expect(within(server).getByText('Saved v12').className).toContain('libpage-chip--server');
    expect(within(server).getByText(`${sampleNodes.length} nodes · 2 min ago`)).toBeTruthy();

    const blank = cardFor('untitled.arch');
    expect(within(blank).getByTestId('libpage-thumb').querySelectorAll('rect')).toHaveLength(0);
    expect(within(blank).getByText('This device').className).toContain('libpage-chip--device');
    expect(within(blank).getByText('0 nodes · just now')).toBeTruthy();

    const pair = cardFor('pair.arch');
    expect(within(pair).getByTestId('libpage-thumb').querySelectorAll('rect')).toHaveLength(2);
    expect(within(pair).getByText('2 nodes · yesterday')).toBeTruthy();

    // No git chip or "open" badge on the face; Pin and ⋯ live in the hover/focus action group.
    expect(screen.queryByText('[git:main]')).toBeNull();
    expect(screen.queryByLabelText('Status: open')).toBeNull();
    const pin = within(server).getByRole('button', { name: 'Pin diagram' });
    const more = within(server).getByRole('button', { name: 'Options for server.arch' });
    expect(pin.parentElement?.className).toContain('libpage-card__actions');
    expect(more.parentElement).toBe(pin.parentElement);

    // Pinning keeps the action visible and floats the doc to the top.
    fireEvent.click(within(pair).getByRole('button', { name: 'Pin diagram' }));
    const first = screen.getAllByTestId('libpage-card')[0];
    expect(within(first).getByRole('link', { name: /^pair\.arch/ })).toBeTruthy();
    expect(within(first).getByRole('button', { name: 'Unpin diagram' }).parentElement?.className).toContain('is-visible');

    // ⋯ opens the actions menu; Escape closes it.
    fireEvent.click(more);
    const menu = screen.getByRole('menu', { name: 'Actions for server.arch' });
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('storage is a footer line, not a card', () => {
    seed();
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderLibrary();
    expect(screen.queryByLabelText('Storage quota')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    const footer = screen.getByLabelText('Storage on this device');
    expect(footer.tagName).toBe('P');
    expect(footer.textContent).toMatch(/^This device: 3 of 25 diagrams · [\d.]+ KB used · Manage storage$/);
    expect(within(footer).getByRole('link', { name: 'Manage storage' }).getAttribute('href')).toBe('/settings/storage');
  });
});

describe('relativeTime', () => {
  it('uses the artboard wording', () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 5_000, now)).toBe('just now');
    expect(relativeTime(now - 2 * 60_000, now)).toBe('2 min ago');
    expect(relativeTime(now - 3 * HOUR, now)).toBe('3 hours ago');
    expect(relativeTime(now - 26 * HOUR, now)).toBe('yesterday');
    expect(relativeTime(now - 3 * 24 * HOUR, now)).toBe('3 days ago');
    expect(relativeTime(now - 8 * 24 * HOUR, now)).toBe('last week');
    expect(relativeTime(now - 15 * 24 * HOUR, now)).toBe('2 weeks ago');
  });
});
