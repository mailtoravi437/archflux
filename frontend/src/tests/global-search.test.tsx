// R1-E10-T04: Global search (SC-07) inside the command palette.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import CommandPalette from '../components/CommandPalette';
import { SearchReveal } from '../components/search/SearchReveal';
import { useDiagram } from '../state/useDiagram';
import { setSession, clearSession } from '../state/session';
import { mergeDiagramHits, searchLocalDiagrams } from '../components/search/searchEngine';
import type { DiagramDoc } from '../types';

const track = vi.fn();
vi.mock('../lib/analytics', () => ({ track: (...a: unknown[]) => track(...a), flush: async () => {}, setAnalyticsEnabled: () => {} }));

const realFetch = globalThis.fetch;
const node = (id: string, label: string, technology: string, pageId: string) => ({
  id, type: 'service', label, tag: technology, technology, health: 'ok', x: 100, y: 100, w: 160, h: 70, stroke: '#2563EB', pageId,
});

function seed() {
  const now = Date.now();
  const docA = { id: 'doc-a', title: 'alpha.arch', nodes: [node('a1', 'Gateway', 'Envoy', 'pg-1')], edges: [], createdAt: now, updatedAt: now };
  const docB = {
    id: 'doc-b', title: 'payments-saga.arch', nodes: [node('b1', 'Order Service', 'Aurora PostgreSQL', 'pg-2')], edges: [], createdAt: now, updatedAt: now - 1,
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }, { id: 'pg-2', name: 'Page 2', order: 1 }],
  };
  localStorage.setItem('archflux:v2-light', JSON.stringify({ docs: [docA, docB], activeDocId: 'doc-a', nodes: docA.nodes, edges: [], docTitle: docA.title }));
}

function Probe() {
  const { activeDocId, selectedId, activePageId } = useDiagram();
  return <output data-testid="probe">{`${activeDocId}|${selectedId ?? ''}|${activePageId}`}</output>;
}

function renderPalette(onClose = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/canvas']}>
      <DiagramProvider>
        <SearchReveal />
        <Probe />
        <CommandPalette onClose={onClose} />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

const typeQuery = (v: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: v } });

beforeEach(() => {
  localStorage.clear();
  track.mockClear();
  seed();
  globalThis.fetch = (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], total: 0 }) })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  clearSession();
  act(() => cleanup());
});

describe('Global search (R1-E10-T04)', () => {
  it('finds element by technology in another loaded doc and opens it selected', async () => {
    renderPalette();
    typeQuery('/aurora');
    const opt = await screen.findByRole('option', { name: /Order Service/ });
    expect(opt.textContent).toContain('payments-saga.arch · Page 2');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('doc-b|b1|pg-2'));
  });

  it('server diagram results merge with local without duplicates', async () => {
    setSession({ mode: 'email', email: 'a@b.co' });
    globalThis.fetch = (async (url: string) => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => (String(url).includes('q=')
        ? { data: [
          { id: 'doc-b', title: 'payments-saga.arch', folderId: null, deletedAt: null, createdAt: null, updatedAt: null, starred: false, role: 'owner' },
          { id: '11111111-1111-4111-8111-111111111111', title: 'payments-ledger.arch', folderId: null, deletedAt: null, createdAt: null, updatedAt: null, starred: false, role: 'owner', version: 4 },
        ], total: 2 }
        : { data: [], total: 0 }),
    })) as unknown as typeof fetch;
    renderPalette();
    typeQuery('/payments');
    await screen.findByRole('option', { name: /payments-ledger\.arch/ });
    expect(screen.getAllByRole('option', { name: /payments-saga\.arch/ })).toHaveLength(1);
  });

  it('shows honest no-results and the open-diagrams-only note', async () => {
    renderPalette();
    typeQuery('/zzzz-nothing');
    expect(await screen.findByText(/No results for/)).toBeTruthy();
    expect(screen.getByText(/Workspace-wide element search is coming/)).toBeTruthy();
  });

  it('records search_performed event without the query text', async () => {
    renderPalette();
    typeQuery('/aurora');
    await screen.findByRole('option', { name: /Order Service/ });
    expect(track).toHaveBeenCalledWith('search_performed', { scope: 'palette', results: 1 });
    expect(JSON.stringify(track.mock.calls)).not.toContain('aurora');
  });

  it('merge helper keeps one row per id', () => {
    const docs = [{ id: 'x', title: 'x.arch', nodes: [], edges: [], createdAt: 1, updatedAt: 1 }] as DiagramDoc[];
    const local = searchLocalDiagrams(docs, 'x');
    const merged = mergeDiagramHits(local, [{ id: 'x', title: 'x.arch', folderId: null, deletedAt: null, createdAt: null, updatedAt: null, starred: false, role: null }], new Set(['x']));
    expect(merged).toHaveLength(1);
  });
});
