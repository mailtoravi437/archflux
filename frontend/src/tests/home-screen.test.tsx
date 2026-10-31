// R1-E10-T01: Home screen (SC-05).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import HomeScreen from '../screens/HomeScreen';
import { IndexRoute } from '../app/IndexRoute';
import { RECENT_OPENED_KEY } from '../state/recentDocs';
import { resetLibraryState } from '../state/library';
import { blueprintGraph, blueprints } from '../data/blueprints';
import { sampleNodes, sampleEdges } from './fixtures/sampleDiagram';

const realFetch = globalThis.fetch;

function seed(count: number, opened: string[]) {
  const now = Date.now();
  const docs = Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`, title: `diagram-${i}.arch`, nodes: sampleNodes, edges: sampleEdges, createdAt: now, updatedAt: now - i * 1000,
  }));
  localStorage.setItem('archflux:v2-light', JSON.stringify({ docs, activeDocId: 'doc-0', nodes: docs[0].nodes, edges: docs[0].edges, docTitle: docs[0].title }));
  localStorage.setItem(RECENT_OPENED_KEY, JSON.stringify(opened));
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <DiagramProvider>
        <HomeScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetLibraryState();
  globalThis.fetch = (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], total: 0 }) })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe('Home screen (R1-E10-T01)', () => {
  it('template cards show the counts of the graph they create (BUG-LIVE-009)', () => {
    renderHome();
    const section = screen.getByRole('region', { name: 'Start from a template' });
    for (const b of blueprints.slice(0, 4)) {
      const g = blueprintGraph(b.id);
      const btn = within(section).getAllByRole('button').find((x) => x.textContent?.startsWith(b.title));
      expect(btn?.textContent).toContain(`${b.category} · ${g.nodes.length} elements · ${g.edges.length} connections`);
      expect(btn.textContent).toContain(`${b.category} · ${g.nodes.length} elements · ${g.edges.length} connections`);
    }
  });

  it('continue shows last 4 opened docs', () => {
    seed(6, ['doc-5', 'doc-3', 'doc-1', 'doc-4', 'doc-2']);
    renderHome();
    const section = screen.getByRole('region', { name: 'Continue' });
    const rows = within(section).getAllByRole('button').map((b) => b.querySelector('span')?.textContent);
    expect(rows).toEqual(['diagram-5.arch', 'diagram-3.arch', 'diagram-1.arch', 'diagram-4.arch']);
  });

  it('for-you section hidden when there are no items', () => {
    seed(2, ['doc-0']);
    renderHome();
    expect(screen.queryByText('For you')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('empty account shows an honest empty state with New diagram and Import', () => {
    renderHome();
    const empty = screen.getByRole('status', { name: 'Empty library' });
    expect(within(empty).getByText('Your diagrams will show up here')).toBeTruthy();
    expect(within(empty).getByRole('button', { name: 'New diagram' })).toBeTruthy();
    expect(within(empty).getByRole('button', { name: 'Import' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Continue' })).toBeNull();
  });

  it('index route goes to /home when signed in', () => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@example.com' }));
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route index element={<IndexRoute />} />
          <Route path="home" element={<div>home page</div>} />
          <Route path="dashboard" element={<div>library page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('home page')).toBeTruthy();
  });
});
