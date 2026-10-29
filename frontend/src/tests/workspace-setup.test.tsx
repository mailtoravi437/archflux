// R1-E11-T03: Workspace setup and join (SC-02).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkspaceSetup from '../components/onboarding/WorkspaceSetup';
import InviteScreen from '../screens/InviteScreen';
import { getActiveWorkspaceId, setActiveWorkspaceId } from '../lib/api';
import { getKnownWorkspaces, getPendingInvite, setPendingInvite, slugify } from '../lib/workspaceSetup';
import { setSession } from '../state/session';

function respond(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}
const ws = (over: Record<string, unknown> = {}) => ({
  data: { id: 'w1', name: 'Ravi personal', slug: 'ravi-1', plan: 'free', joinPolicy: 'invite', role: 'admin', limits: { cloudDiagrams: 3, editors: 3 }, usage: {}, ...over },
});

let calls: { url: string; method: string; body?: string; headers: Record<string, string> }[];
function mockFetch(handler: (url: string, method: string) => Response) {
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body as string | undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    return handler(url, method);
  });
}

beforeEach(() => {
  localStorage.clear();
  setSession({ mode: 'email', email: 'me@acme.com' });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('workspace setup (R1-E11-T03)', () => {
  it('creates workspace with slug and skips invites', async () => {
    const onDone = vi.fn();
    mockFetch((url, method) => {
      if (method === 'PATCH') return respond(200, ws({ name: 'Acme Payments', slug: 'acme-payments' }));
      return respond(200, ws());
    });
    render(<WorkspaceSetup onDone={onDone} />);
    const name = await screen.findByLabelText('Workspace name');
    fireEvent.change(name, { target: { value: 'Acme Payments' } });
    expect((screen.getByLabelText('Workspace URL name') as HTMLInputElement).value).toBe('acme-payments');
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ name: 'Acme Payments', slug: 'acme-payments' });
    expect(calls.some((c) => c.url.includes('/invites'))).toBe(false);
  });

  it('reports a taken slug from the server', async () => {
    mockFetch((_u, method) => (method === 'PATCH' ? respond(409, { error: { code: 'SLUG_TAKEN', message: 'taken' } }) : respond(200, ws())));
    const onDone = vi.fn();
    render(<WorkspaceSetup onDone={onDone} />);
    await screen.findByLabelText('Workspace name');
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await screen.findByText(/already taken/i);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('pending invite shows join card', async () => {
    setPendingInvite('tok_abcdefghijklmnopqrstuvwxyz0123456789');
    mockFetch((url) => {
      if (url.includes('/accept')) return respond(200, { data: { workspaceId: 'w2', name: 'Acme', slug: 'acme', role: 'editor' } });
      return respond(200, ws());
    });
    const onDone = vi.fn();
    render(<WorkspaceSetup onDone={onDone} />);
    expect(screen.getByRole('region', { name: 'Join with your invite' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invite and join' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(getActiveWorkspaceId()).toBe('w2');
    expect(getPendingInvite()).toBeNull();
  });

  it('shows no join card without an invite (no invented companies)', async () => {
    mockFetch(() => respond(200, ws()));
    render(<WorkspaceSetup onDone={() => {}} />);
    await screen.findByLabelText('Workspace name');
    expect(screen.queryByRole('region', { name: 'Join with your invite' })).toBeNull();
  });

  it('invite route accepts and switches workspace', async () => {
    mockFetch((url) => {
      if (url.includes('/accept')) return respond(200, { data: { workspaceId: 'w9', name: 'Team Nine', slug: 'team-nine', role: 'viewer' } });
      return respond(404, {});
    });
    render(
      <MemoryRouter initialEntries={['/invite/tok_abcdefghijklmnopqrstuvwxyz0123456789']}>
        <Routes>
          <Route path="/invite/:token" element={<InviteScreen />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('dashboard');
    expect(getActiveWorkspaceId()).toBe('w9');
    expect(getKnownWorkspaces()).toEqual([{ id: 'w9', name: 'Team Nine' }]);
  });

  it('invite route signed out stores the token and goes to login', async () => {
    localStorage.clear();
    mockFetch(() => respond(500, {}));
    render(
      <MemoryRouter initialEntries={['/invite/tok_abcdefghijklmnopqrstuvwxyz0123456789']}>
        <Routes>
          <Route path="/invite/:token" element={<InviteScreen />} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('login page');
    expect(getPendingInvite()).toBe('tok_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(calls).toHaveLength(0);
  });

  it('sends X-Workspace-ID on workspace endpoints once chosen', async () => {
    setActiveWorkspaceId('w9');
    mockFetch(() => respond(200, ws({ id: 'w9' })));
    render(<WorkspaceSetup onDone={() => {}} />);
    await screen.findByLabelText('Workspace name');
    expect(calls[0].headers['X-Workspace-ID']).toBe('w9');
  });

  it('slugify makes URL-safe names', () => {
    expect(slugify('  Acme Payments Team! ')).toBe('acme-payments-team');
  });
});
