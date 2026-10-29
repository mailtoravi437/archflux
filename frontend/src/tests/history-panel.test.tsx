import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../lib/analytics', () => ({ track: vi.fn(), flush: vi.fn(), setAnalyticsEnabled: vi.fn() }));
import { track } from '../lib/analytics';
import HistoryPanel from '../components/history/HistoryPanel';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const T = Date.parse('2026-10-20T10:00:00Z');

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

const rev = (id: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id, diagramId: ID, parentRevisionId: null, contentHash: 'h', authorId: 'u1', authorName: 'Dana', source: 'import',
  message: null, name: null, description: null, createdAt: new Date(T + minutes * 60_000).toISOString(), ...extra,
});

interface Call { method: string; url: string; body: unknown }

function mockServer(revs: unknown[], calls: Call[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes('/checkpoints')) return respond(200, { data: [] });
    if (url.endsWith('/revisions') && method === 'GET') return respond(200, { data: revs });
    if (/\/revisions\/[^/]+$/.test(url) && method === 'PATCH') {
      return respond(200, { data: { ...rev('r2', 10), name: (JSON.parse(String(init?.body)) as { name: string }).name } });
    }
    if (url.endsWith('/restore') && method === 'POST') return respond(200, { data: {} });
    return respond(404, {});
  });
}

const base = { diagramId: ID, cloud: true, canEdit: true, localCheckpoints: [], onCompare: () => {}, onRestoreLocal: () => {}, onRestored: () => {} };

describe('HistoryPanel (R1-E08-T03)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('Name this version calls PATCH and shows name', async () => {
    const calls: Call[] = [];
    let current = [rev('r2', 10), rev('r1', 0)];
    mockServer(current, calls);
    render(<HistoryPanel {...base} />);
    await screen.findAllByRole('listitem');
    fireEvent.click(screen.getAllByRole('button', { name: /^Name this version/ })[1]);
    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: 'Saga orchestration' } });
    current = [rev('r2', 10, { name: 'Saga orchestration' }), rev('r1', 0)];
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/checkpoints')) return respond(200, { data: [] });
      if (url.endsWith('/revisions')) return respond(200, { data: current });
      return respond(200, { data: current[0] });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toMatch(/\/revisions\/r1$/);
    expect(patch?.body).toEqual({ name: 'Saga orchestration' });
    expect(await screen.findByText('Saga orchestration')).toBeTruthy();
  });

  it('Restore asks confirm then calls restore and reloads doc', async () => {
    const calls: Call[] = [];
    mockServer([rev('r2', 10), rev('r1', 0)], calls);
    const onRestored = vi.fn();
    render(<HistoryPanel {...base} onRestored={onRestored} />);
    await screen.findAllByRole('listitem');
    fireEvent.click(screen.getByRole('button', { name: /^Restore / }));
    expect(calls.some((c) => c.url.endsWith('/restore'))).toBe(false);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    const post = calls.find((c) => c.url.endsWith('/revisions/r1/restore'));
    expect(post?.method).toBe('POST');
    expect(track).toHaveBeenCalledWith('version_restored');
  });

  it('local doc shows sign-in note', async () => {
    const calls: Call[] = [];
    mockServer([], calls);
    render(<HistoryPanel {...base} cloud={false} localCheckpoints={[{ id: `v${(T).toString(36)}`, title: 'My snapshot', nodes: [], edges: [] }]} />);
    expect(screen.getByText(/Sign in to keep full history/)).toBeTruthy();
    expect(await screen.findByText('My snapshot')).toBeTruthy();
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Name this version/ })).toBeNull();
  });
});
