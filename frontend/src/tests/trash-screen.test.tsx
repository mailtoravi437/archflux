// R1-E06-T05: Trash screen (SC-08).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import TrashScreen from '../screens/TrashScreen';
import { resetLibraryState } from '../state/library';

const realFetch = globalThis.fetch;
const A = '123e4567-e89b-12d3-a456-426614174000';
const B = '223e4567-e89b-12d3-a456-426614174000';

let removed: string[] = [];
const row = (id: string, title: string, role: string) => ({
  id, title, folderId: null, deletedAt: '2026-10-20T00:00:00Z', purgeAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  createdAt: null, updatedAt: null, starred: false, role, version: 4, nodes: [], edges: [],
});

function mock() {
  removed = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    const reply = (status: number, body: unknown) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body });
    if (method === 'POST' && u.includes('/restore')) {
      removed.push(u.split('/').slice(-2)[0]);
      return reply(200, { data: { id: A, restoredTo: 'root' } });
    }
    if (method === 'GET' && u.includes('/v1/diagrams?')) {
      const q = new URL(u, 'http://x').searchParams;
      if (q.get('trashed') === 'true') {
        return reply(200, { data: [row(A, 'payments-v1.arch', 'owner'), row(B, 'shared.arch', 'viewer')].filter((r) => !removed.includes(r.id)), total: 2, page: 1, limit: 100 });
      }
      return reply(200, { data: [], total: 0, page: 1, limit: 100 });
    }
    if (method === 'GET' && u.includes('/v1/folders')) return reply(200, { data: [] });
    return reply(404, { error: { code: 'NOT_FOUND' } });
  }) as typeof fetch;
}

function Toasts() {
  const { toasts } = useDiagram();
  return <ul data-testid="toasts">{toasts.map((t) => <li key={t.id}>{t.text}</li>)}</ul>;
}

function renderTrash() {
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <TrashScreen />
        <Toasts />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@example.com' }));
  resetLibraryState();
  mock();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe('Trash screen (R1-E06-T05)', () => {
  it('restore removes row and toasts "Restored to <folder>"', async () => {
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore payments-v1.arch' }));
    await waitFor(() => expect(screen.queryByRole('row', { name: 'payments-v1.arch' })).toBeNull());
    expect(within(screen.getByTestId('toasts')).getByText('Restored to Library')).toBeTruthy();
  });

  it('delete forever button disabled until name typed exactly', async () => {
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete payments-v1.arch forever' }));
    const dlg = screen.getByRole('alertdialog');
    expect(within(dlg).getByRole('heading', { name: 'Delete “payments-v1.arch” forever?' })).toBeTruthy();
    const confirm = within(dlg).getByRole('button', { name: 'Delete forever' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const input = within(dlg).getByLabelText('Type the name to confirm');
    fireEvent.change(input, { target: { value: 'payments-v1' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'payments-v1.arch' } });
    expect(confirm.disabled).toBe(false);
  });

  it('non-owner does not see delete forever', async () => {
    renderTrash();
    await screen.findByRole('row', { name: 'shared.arch' });
    expect(screen.queryByRole('button', { name: 'Delete shared.arch forever' })).toBeNull();
    expect(screen.getByText('Only owners can delete forever')).toBeTruthy();
  });
});
