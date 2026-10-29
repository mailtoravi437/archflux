import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfigForTests } from '../lib/config';
import { clearSession, setSession } from '../state/session';

type AnalyticsModule = typeof import('../lib/analytics');

interface SentBody {
  events: { name: string; props: Record<string, unknown> }[];
}

async function freshModule(): Promise<AnalyticsModule> {
  vi.resetModules();
  return import('../lib/analytics');
}

function bodyOf(call: unknown[]): SentBody {
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as SentBody;
}

describe('analytics', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setConfigForTests({ apiUrl: '/api', wsUrl: 'ws://localhost' });
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    setSession({ mode: 'email', email: 'user@example.com' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearSession();
  });

  it('batches and flushes at 50', async () => {
    const a = await freshModule();
    for (let i = 0; i < 49; i++) a.track('element_added', { kind: 'service' });
    expect(fetchMock).not.toHaveBeenCalled();
    a.track('element_added', { kind: 'service' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/events');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = bodyOf(fetchMock.mock.calls[0]);
    expect(body.events).toHaveLength(50);
    expect(body.events[0]).toEqual({ name: 'element_added', props: { kind: 'service' } });

    // Queue is empty afterwards; the next batch is capped at 50 too.
    await a.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    a.track('diagram_created', { source: 'blank' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1]).events).toEqual([
      { name: 'diagram_created', props: { source: 'blank' } },
    ]);
  });

  it('drops long string props', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await freshModule();
    const leak = 'Payments service talks to the ledger database over gRPC';
    a.track('search_performed', { scope: 'all', results: 3, exact: true, query: leak });
    await a.flush();
    const body = bodyOf(fetchMock.mock.calls[0]);
    expect(body.events[0].props).toEqual({ scope: 'all', results: 3, exact: true, query: '[redacted]' });
    expect(JSON.stringify(body)).not.toContain(leak);
    if (import.meta.env.DEV) expect(warn).toHaveBeenCalled();
  });

  it('keeps only the first 10 props keys', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await freshModule();
    const props: Record<string, string | number> = {};
    for (let i = 0; i < 12; i++) props[`k${i}`] = i;
    a.track('export_completed', props);
    await a.flush();
    const sent = bodyOf(fetchMock.mock.calls[0]).events[0].props;
    expect(Object.keys(sent)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
    expect(sent.k9).toBe(9);
    if (import.meta.env.DEV) expect(warn).toHaveBeenCalled();
  });

  it('no-op when disabled or signed out', async () => {
    const a = await freshModule();
    a.setAnalyticsEnabled(false);
    a.track('diagram_created', { source: 'blank' });
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();

    a.setAnalyticsEnabled(true);
    a.track('diagram_created', { source: 'template' });
    clearSession();
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();

    setSession({ mode: 'guest' });
    a.track('diagram_created', { source: 'blank' });
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();

    // The queue was dropped, not held: signing in later sends nothing old.
    setSession({ mode: 'email', email: 'user@example.com' });
    await a.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flush failure does not throw or retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const a = await freshModule();
    a.track('export_completed', { format: 'png', scope: 'page' });
    expect(() => a.track('import_completed', { format: 'arch', nodes: 4 })).not.toThrow();
    await expect(a.flush()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The failed batch is dropped: later flushes and timer ticks don't resend it.
    await a.flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    a.track('compare_opened');
    await expect(a.flush()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await a.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
