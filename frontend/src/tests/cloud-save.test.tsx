import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';

// FRONTEND_SPEC FE-Q1: signed-in users save to the server, see their server
// diagrams in every browser, and delete server diagrams on the server.

const SERVER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '9b2f6a1c-3d4e-4f5a-8b6c-7d8e9f0a1b2c';
const realFetch = globalThis.fetch;
const calls: { method: string; url: string; body?: unknown }[] = [];

function mockServer(listed: unknown[] = []) {
  calls.length = 0;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    });
    if (method === 'POST' && /\/v1\/diagrams$/.test(u)) return reply(201, { data: { id: SERVER_ID, version: 1 } });
    if (method === 'GET' && /\/v1\/diagrams\?/.test(u)) return reply(200, { data: listed, total: listed.length });
    if (method === 'PUT') return reply(200, { data: { id: SERVER_ID, version: 2 } });
    if (method === 'DELETE') return reply(204, null);
    return reply(404, { error: { code: 'NOT_FOUND' } });
  }) as typeof fetch;
}

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  latest.v = useDiagram();
  return null;
}
const api = () => latest.v!;

function mount() {
  latest.v = null;
  render(
    <DiagramProvider>
      <Probe />
    </DiagramProvider>,
  );
}

function signIn(mode: 'email' | 'guest') {
  localStorage.setItem('archflux:session', JSON.stringify({ mode, email: 'a@example.com' }));
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('save to server (FE-Q1)', () => {
  it('creates a local doc on the server and adopts the server id', async () => {
    signIn('email');
    mockServer();
    mount();
    act(() => api().addNode('service', 100, 100));
    let result = '';
    await act(async () => {
      result = await api().saveActiveDoc();
    });
    expect(result).toBe('saved');
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({ title: 'untitled.arch', graph: { nodes: [expect.objectContaining({ type: 'service' })] } });
    expect(api().activeDocId).toBe(SERVER_ID);
    expect(api().docs.find((d) => d.id === SERVER_ID)?.serverVersion).toBe(1);

    // The next save is a versioned update of that server diagram.
    await act(async () => {
      result = await api().saveActiveDoc();
    });
    expect(result).toBe('saved');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toContain(`/v1/diagrams/${SERVER_ID}`);
    expect(put?.body).toMatchObject({ version: 1 });
  });

  it('keeps review state with the doc when it is re-keyed', async () => {
    signIn('email');
    mockServer();
    mount();
    act(() => api().addNode('service', 100, 100));
    const nodeId = api().nodes[0].id;
    act(() => api().addThread(nodeId, 'keep me'));
    await act(async () => {
      await api().saveActiveDoc();
    });
    expect(api().threads.map((t) => t.text)).toContain('keep me');
  });

  it("returns 'limit' without a Save failed toast when the plan limit blocks the create", async () => {
    signIn('email');
    mockServer();
    const ok = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return {
          ok: false, status: 402, headers: { get: () => null },
          json: async () => ({ error: { code: 'LIMIT_REACHED', message: 'limit', limit: 'cloudDiagrams', current: 3, max: 3 } }),
        };
      }
      return ok(url as RequestInfo, init);
    }) as typeof fetch;
    mount();
    act(() => api().addNode('service', 100, 100));
    const localId = api().activeDocId;
    let result = '';
    await act(async () => {
      result = await api().saveActiveDoc();
    });
    expect(result).toBe('limit');
    expect(api().activeDocId).toBe(localId);
    expect(api().activeDocLimited).toBe(true);
    expect(api().toasts.some((t) => /Save failed/.test(t.text))).toBe(false);
  });

  it('tells guests to sign in and makes no network call', async () => {
    signIn('guest');
    mockServer();
    mount();
    let result = '';
    await act(async () => {
      result = await api().saveActiveDoc();
    });
    expect(result).toBe('local');
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});

describe('cross-device library (FE-Q1)', () => {
  it('adds server diagrams this browser has not seen', async () => {
    signIn('email');
    mockServer([
      { id: OTHER_ID, title: 'from-laptop.arch', version: 3, graph: { nodes: [{ id: 'a', type: 'service', label: 'A', x: 1, y: 2, w: 100, h: 50 }], edges: [] } },
    ]);
    mount();
    await waitFor(() => expect(api().docs.some((d) => d.id === OTHER_ID)).toBe(true));
    const doc = api().docs.find((d) => d.id === OTHER_ID)!;
    expect(doc.title).toBe('from-laptop.arch');
    expect(doc.nodes).toHaveLength(1);
    expect(doc.serverVersion).toBe(3);
  });

  it('does not call the server for guests', () => {
    signIn('guest');
    mockServer([{ id: OTHER_ID, title: 'x' }]);
    mount();
    expect(calls).toHaveLength(0);
  });
});

describe('delete (FE-Q1)', () => {
  it('deletes a server diagram on the server before removing it locally', async () => {
    signIn('email');
    mockServer([{ id: OTHER_ID, title: 'remote.arch', version: 1, graph: { nodes: [], edges: [] } }]);
    mount();
    await waitFor(() => expect(api().docs.some((d) => d.id === OTHER_ID)).toBe(true));
    act(() => api().deleteDoc(OTHER_ID));
    await waitFor(() => expect(api().docs.some((d) => d.id === OTHER_ID)).toBe(false));
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/v1/diagrams/${OTHER_ID}`))).toBe(true);
  });
});
