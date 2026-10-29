// R1-E10-T07: Team templates ("Save as template", CAP-S3).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import DashboardScreen from '../screens/DashboardScreen';
import BlueprintsScreen from '../screens/BlueprintsScreen';
import { resetLibraryState } from '../state/library';
import { resetTeamTemplates } from '../state/teamTemplates';
import { clearSession, setSession } from '../state/session';
import { isTemplateTagged, templateTitle, templateToImport } from '../lib/teamTemplates';
import { sampleNodes, sampleEdges } from './fixtures/sampleDiagram';

const realFetch = globalThis.fetch;
const TPL_ID = '22222222-2222-4222-8222-222222222222';
const row = (id: string, title: string, tags: string[]) => ({
  id, title, tags, folderId: null, deletedAt: null, createdAt: null, updatedAt: null, starred: false, role: 'owner',
});

interface Call { url: string; method: string; body: unknown }
let calls: Call[] = [];

function mockServer(list: unknown[], detail?: unknown) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    let data: unknown = { data: [], total: 0 };
    if (method === 'POST') data = { data: { id: TPL_ID } };
    else if (/\/v1\/diagrams\/[^/?]+$/.test(String(url))) data = { data: detail };
    else if (String(url).includes('/v1/diagrams')) data = { data: list, total: list.length };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => data };
  }) as unknown as typeof fetch;
}

function seed() {
  const now = Date.now();
  const docs = [
    { id: 'doc-a', title: 'alpha.arch', nodes: sampleNodes, edges: sampleEdges, createdAt: now, updatedAt: now - 1000 },
    { id: 'doc-t', title: 'old (template)', tags: ['template'], nodes: [], edges: [], createdAt: now, updatedAt: now - 2000 },
    { id: TPL_ID, title: 'server (template)', nodes: [], edges: [], createdAt: now, updatedAt: now - 3000 },
  ];
  localStorage.setItem('archflux:v2-light', JSON.stringify({ docs, activeDocId: 'doc-a', nodes: sampleNodes, edges: sampleEdges, docTitle: 'alpha.arch' }));
}

function Docs() {
  const { docs, activeDocId } = useDiagram();
  return <output data-testid="docs">{JSON.stringify({ activeDocId, docs: docs.map((d) => ({ id: d.id, title: d.title, tags: d.tags ?? [] })) })}</output>;
}

beforeEach(() => {
  localStorage.clear();
  calls = [];
  resetLibraryState();
  resetTeamTemplates();
  setSession({ mode: 'email', email: 'a@b.co' });
  seed();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  clearSession();
  act(() => cleanup());
});

describe('Team templates (R1-E10-T07)', () => {
  it('save as template creates tagged copy', async () => {
    mockServer([]);
    render(<MemoryRouter><DiagramProvider><DashboardScreen /></DiagramProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Options for alpha.arch' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as template' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/diagrams'))!;
    const body = post.body as { title: string; tags: string[]; graph: { nodes: unknown[] } };
    expect(body.title).toBe('alpha.arch (template)');
    expect(body.tags).toEqual(['template']);
    expect(body.graph.nodes).toHaveLength(sampleNodes.length);
  });

  it('library hides template-tagged docs', async () => {
    mockServer([row(TPL_ID, 'server (template)', ['template'])]);
    render(<MemoryRouter><DiagramProvider><DashboardScreen /></DiagramProvider></MemoryRouter>);
    await screen.findByRole('button', { name: 'Options for alpha.arch' });
    // doc-t is tagged locally; the other is known as a template from the server list.
    await waitFor(() => expect(screen.queryByRole('button', { name: `Options for server (template)` })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Options for old (template)' })).toBeNull();
  });

  it('using a template creates untagged copy', async () => {
    const detail = {
      id: TPL_ID, title: 'Payments (template)', version: 1, tags: ['template'],
      graph: { nodes: sampleNodes, edges: sampleEdges, strokes: [], texts: [] },
    };
    mockServer([row(TPL_ID, 'Payments (template)', ['template'])], detail);
    render(<MemoryRouter><DiagramProvider><Docs /><BlueprintsScreen /></DiagramProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Use team template Payments (template)' }));
    await waitFor(() => {
      const s = JSON.parse(screen.getByTestId('docs').textContent ?? '{}') as { docs: Array<{ id: string; title: string; tags: string[] }>; activeDocId: string };
      const created = s.docs.find((d) => d.id === s.activeDocId)!;
      expect(created.title).toBe('Payments');
      expect(created.tags).toEqual([]);
      expect(created.id).not.toBe(TPL_ID);
    });
  });

  it('helpers: tag test, title and copy conversion', () => {
    expect(isTemplateTagged(['x', 'Template'])).toBe(true);
    expect(isTemplateTagged(undefined)).toBe(false);
    expect(templateTitle('a.arch')).toBe('a.arch (template)');
    expect(templateTitle('x'.repeat(100))).toHaveLength(80);
  });

  it('guests see no team templates section', () => {
    clearSession();
    mockServer([]);
    render(<MemoryRouter><DiagramProvider><BlueprintsScreen /></DiagramProvider></MemoryRouter>);
    expect(screen.queryByRole('region', { name: 'Team templates' })).toBeNull();
    expect(templateToImport).toBeTypeOf('function');
  });
});
