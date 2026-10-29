// R1-E11-T04: Members screen backed by the server (SC-41).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import SettingsTeamScreen from '../screens/SettingsTeamScreen';
import { setSession } from '../state/session';

function respond(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

const workspace = (over: Record<string, unknown> = {}) => ({
  data: { id: 'w1', name: 'Acme', slug: 'acme', plan: 'free', joinPolicy: 'invite', role: 'admin', limits: { cloudDiagrams: 3, editors: 3 }, usage: { cloudDiagrams: 1, editors: 3 }, ...over },
});
const roster = {
  data: {
    members: [
      { userId: 'u1', email: 'me@acme.com', name: 'Me Admin', role: 'admin', status: 'active', joinedAt: '2026-10-01T00:00:00Z' },
      { userId: 'u2', email: 'pat@acme.com', name: 'Pat', role: 'editor', status: 'active', joinedAt: '2026-10-02T00:00:00Z' },
    ],
    invites: [{ id: 'i1', email: 'new@acme.com', role: 'viewer', status: 'pending', expiresAt: '2026-11-01T00:00:00Z', createdAt: '2026-10-20T00:00:00Z' }],
  },
};

let calls: { url: string; method: string; body?: string }[];
function mockServer(ws = workspace(), members: unknown = roster) {
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (method === 'GET' && url.endsWith('/workspaces/current')) return respond(200, ws);
    if (method === 'GET' && url.endsWith('/workspaces/current/members')) return respond(200, members);
    return respond(204);
  });
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <SettingsTeamScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setSession({ mode: 'email', email: 'me@acme.com' });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('settings team (R1-E11-T04)', () => {
  it('lists server members and invites', async () => {
    mockServer();
    renderScreen();
    const pat = await screen.findByRole('group', { name: 'Member Pat' });
    expect(within(pat).getByText('pat@acme.com')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Member Me Admin' })).toBeTruthy();
    const inv = screen.getByRole('group', { name: 'Invite new@acme.com' });
    expect(within(inv).getByRole('button', { name: 'Revoke invite for new@acme.com' })).toBeTruthy();
    expect(within(inv).getByRole('button', { name: 'Resend invite to new@acme.com' })).toBeTruthy();
    expect(screen.getByText(/2 members · 1 pending invite/)).toBeTruthy();
  });

  it('role change calls PATCH', async () => {
    mockServer();
    renderScreen();
    const select = await screen.findByLabelText('Role for Pat');
    fireEvent.change(select, { target: { value: 'reviewer' } });
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('/workspaces/current/members/u2');
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ role: 'reviewer' });
  });

  it('remove confirms that diagrams move to you, then DELETEs', async () => {
    mockServer();
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Pat' }));
    expect(screen.getByText('Their diagrams move to you.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/members/u2'))).toBe(true));
    expect(screen.queryByRole('button', { name: 'Remove Me Admin' })).toBeNull();
  });

  it('seat meter reads usage/limit', async () => {
    mockServer();
    renderScreen();
    const meter = await screen.findByRole('status', { name: 'Seat meter' });
    expect(meter.textContent).toBe('Editors 3 / 3 on Free');
  });

  it('non-admin sees the roster without invites or controls', async () => {
    mockServer(workspace({ role: 'viewer' }), { data: { members: roster.data.members, invites: [] } });
    renderScreen();
    await screen.findByRole('group', { name: 'Member Pat' });
    expect((screen.getByLabelText('Role for Pat') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Invite people' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pending invites' })).toBeNull();
  });

  it('signed-out state has no fake members', () => {
    localStorage.clear();
    setSession({ mode: 'guest' });
    const spy = vi.spyOn(globalThis, 'fetch');
    renderScreen();
    expect(screen.getByText('Sign in to manage your team')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Member / })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
