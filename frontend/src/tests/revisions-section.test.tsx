import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RevisionsSection from '../components/RevisionsSection';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => { status: number; body: unknown }) {
  globalThis.fetch = (async (url: unknown) => {
    const { status, body } = handler(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    };
  }) as typeof fetch;
}

const revs = [
  { id: 'rev-aaa-1', diagramId: UUID, parentRevisionId: null, contentHash: 'hash1', authorId: 'u1', source: 'manual', message: 'first', createdAt: '2026-10-01T10:00:00Z' },
  { id: 'rev-bbb-2', diagramId: UUID, parentRevisionId: 'rev-aaa-1', contentHash: 'hash2', authorId: 'u2', source: 'sync', message: 'second', createdAt: '2026-10-02T10:00:00Z' },
];

const renderSection = (diagramId: string) =>
  render(
    <MemoryRouter>
      <RevisionsSection diagramId={diagramId} />
    </MemoryRouter>,
  );

describe('RevisionsSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.innerHTML = '';
  });

  it('shows the save-to-server hint for local-only docs without network', async () => {
    let called = 0;
    mockFetch(() => {
      called += 1;
      return { status: 200, body: { data: [] } };
    });
    renderSection('doc-local-1');
    expect(await screen.findByText(/save this diagram to the server/i)).toBeTruthy();
    expect(called).toBe(0);
  });

  it('lists server revisions with A/B diff', async () => {
    mockFetch((url) => {
      if (url.includes('/diff?')) {
        return {
          status: 200,
          body: { added: [{ id: 'n-new', label: 'New API', type: 'service' }], removed: [], changed: [] },
        };
      }
      return { status: 200, body: { data: revs } };
    });
    renderSection(UUID);
    expect(await screen.findByText(/first/)).toBeTruthy();
    expect(await screen.findByText(/second/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/New API/)).toBeTruthy();
    });
  });

  it('shows the admin-role note on 403, not an error', async () => {
    mockFetch(() => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'admin only' } } }));
    renderSection(UUID);
    expect(await screen.findByText(/admin workspace role/i)).toBeTruthy();
  });
});
