// R1-E06-T03: Frontend API and library state.
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { resetLibraryState, useLibrary, type Library } from '../state/library';
import { LOCAL_TRASH_KEY, readLocalTrash } from '../state/libraryLocal';
import type { DiagramDoc } from '../types';

const SERVER_ID = '123e4567-e89b-12d3-a456-426614174000';
const realFetch = globalThis.fetch;
const calls: { method: string; url: string }[] = [];

type Handler = (method: string, url: string) => { status: number; body: unknown } | undefined;
function mockServer(handler: Handler) {
  calls.length = 0;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    calls.push({ method, url: u });
    const r = handler(method, u) ?? { status: 404, body: { error: { code: 'NOT_FOUND' } } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => null }, json: async () => r.body };
  }) as typeof fetch;
}

const view: { lib: Library | null; docs: ReturnType<typeof useDiagram> | null } = { lib: null, docs: null };
function Probe() {
  const lib = useLibrary();
  const docs = useDiagram();
  useEffect(() => {
    view.lib = lib;
    view.docs = docs;
  });
  return null;
}
const lib = () => view.lib!;
const docs = () => view.docs!;

function mount() {
  view.lib = null;
  view.docs = null;
  render(
    <DiagramProvider>
      <Probe />
    </DiagramProvider>,
  );
}
const signIn = () => localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@example.com' }));

const serverRow = (over: Record<string, unknown> = {}) => ({
  id: SERVER_ID,
  title: 'orders.arch',
  folderId: null,
  deletedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  starred: false,
  role: 'owner',
  nodes: [],
  edges: [],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  resetLibraryState();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('library state', () => {
  it('signed-in delete calls DELETE and lists doc in trash', async () => {
    signIn();
    let trashed = false;
    mockServer((method, url) => {
      if (method === 'DELETE' && url.endsWith(`/v1/diagrams/${SERVER_ID}`)) {
        trashed = true;
        return { status: 204, body: null };
      }
      if (method === 'GET' && url.includes('/v1/diagrams?')) {
        const q = new URL(url, 'http://x').searchParams;
        if (q.get('trashed') === 'true') {
          return { status: 200, body: { data: trashed ? [serverRow({ deletedAt: '2026-10-25T00:00:00Z', purgeAt: '2026-11-24T00:00:00Z' })] : [], total: 1, page: 1, limit: 100 } };
        }
        return { status: 200, body: { data: trashed ? [] : [serverRow()], total: 1, page: 1, limit: 100 } };
      }
      if (method === 'GET' && url.includes('/v1/folders')) return { status: 200, body: { data: [] } };
      return undefined;
    });
    mount();
    await waitFor(() => expect(docs().docs.some((d) => d.id === SERVER_ID)).toBe(true));
    act(() => docs().deleteDoc(SERVER_ID));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/v1/diagrams/${SERVER_ID}`))).toBe(true));
    await act(async () => {
      await lib().refresh();
    });
    expect(lib().mode).toBe('server');
    expect(lib().trash.docs.map((d) => [d.id, d.title, d.source])).toEqual([[SERVER_ID, 'orders.arch', 'server']]);
    expect(lib().trash.docs[0].purgeAt).toBe(Date.parse('2026-11-24T00:00:00Z'));
  });

  it('local delete goes to local trash and restores', async () => {
    mount();
    const id = docs().activeDocId;
    act(() => docs().addNode('service', 100, 100));
    act(() => docs().newDoc()); // keep a second doc so the first can go
    act(() => docs().deleteDoc(id));
    expect(docs().docs.some((d) => d.id === id)).toBe(false);
    const stored = readLocalTrash();
    expect(stored.map((e) => e.doc.id)).toEqual([id]);
    expect(stored[0].doc.nodes).toHaveLength(1);
    await act(async () => {
      await lib().refresh();
    });
    expect(lib().trash.docs.map((d) => d.id)).toEqual([id]);
    let ok = false;
    await act(async () => {
      ok = await lib().restoreDoc(id);
    });
    expect(ok).toBe(true);
    expect(docs().docs.some((d) => d.id === id)).toBe(true);
    expect(readLocalTrash()).toEqual([]);
  });

  it('local trash entries older than 30 days are dropped on load', async () => {
    const mk = (id: string): DiagramDoc => ({ id, title: id, nodes: [], edges: [], createdAt: 1, updatedAt: 1 });
    const day = 24 * 60 * 60 * 1000;
    localStorage.setItem(
      LOCAL_TRASH_KEY,
      JSON.stringify([
        { doc: mk('doc-old'), deletedAt: Date.now() - 31 * day },
        { doc: mk('doc-new'), deletedAt: Date.now() - 2 * day },
      ]),
    );
    mount();
    await act(async () => {
      await lib().refresh();
    });
    expect(lib().trash.docs.map((d) => d.id)).toEqual(['doc-new']);
    expect(JSON.parse(localStorage.getItem(LOCAL_TRASH_KEY) ?? '[]')).toHaveLength(1);
  });

  it('toggleStar is optimistic and rolls back on error', async () => {
    signIn();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'PUT' && String(url).endsWith(`/v1/diagrams/${SERVER_ID}/star`)) {
        await gate;
        return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: { message: 'boom' } }) };
      }
      const empty = String(url).includes('/v1/folders') ? { data: [] } : { data: [], total: 0, page: 1, limit: 100 };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => empty };
    }) as typeof fetch;
    mount();
    await act(async () => {
      await lib().refresh();
    });
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = lib().toggleStar(SERVER_ID);
    });
    expect(lib().starredIds).toContain(SERVER_ID); // optimistic, before the server answered
    await act(async () => {
      release();
      await pending;
    });
    expect(lib().starredIds).not.toContain(SERVER_ID);
    expect(lib().error).toBe('boom');
  });
});
