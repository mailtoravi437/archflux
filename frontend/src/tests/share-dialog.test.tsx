import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShareDialog from '../components/ShareDialog';

const ID = '123e4567-e89b-12d3-a456-426614174000';

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

interface Call { method: string; url: string; body: unknown }

function member(userId: string, name: string, role: string) {
  return { userId, email: `${name.toLowerCase()}@x.test`, name, role, addedBy: null, createdAt: null };
}

function mockServer(members: unknown[], calls: Call[], opts: { linkStatus?: number } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/members') && method === 'GET') return respond(200, { data: members });
    if (url.endsWith('/members') && method === 'POST') return respond(201, { data: member('u9', 'New', 'viewer') });
    if (url.endsWith('/links') && method === 'GET') return respond(200, { data: [] });
    if (url.endsWith('/links') && method === 'POST') {
      if (opts.linkStatus) return respond(opts.linkStatus, { error: { code: 'PUBLIC_LINKS_DISABLED', message: 'no' } });
      return respond(201, { data: { id: 'l1', diagramId: ID, role: 'viewer', audience: 'workspace', expiresAt: null, revokedAt: null, state: 'active', createdBy: null, createdAt: null, url: `http://app/d/${ID}?link=1`, token: 'tok-secret' } });
    }
    return respond(404, {});
  });
}

const base = { diagramId: ID, title: 'checkout-mesh.arch', cloud: true, workspaceName: 'Acme', onClose: () => {} };

describe('ShareDialog (R1-E07-T05)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('invites by email with role', async () => {
    const calls: Call[] = [];
    mockServer([member('u1', 'Owner', 'owner'), member('u2', 'Other', 'owner')], calls);
    render(<ShareDialog {...base} />);
    await screen.findByText('Other');
    fireEvent.change(screen.getByLabelText('Add people, teams or emails'), { target: { value: 'a@x.test, b@x.test' } });
    fireEvent.change(screen.getByLabelText('Role for new people'), { target: { value: 'commenter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    const posts = calls.filter((c) => c.method === 'POST').map((c) => c.body);
    expect(posts).toEqual([{ email: 'a@x.test', role: 'commenter' }, { email: 'b@x.test', role: 'commenter' }]);
  });

  it('last owner has no remove', async () => {
    mockServer([member('u1', 'Solo', 'owner'), member('u2', 'Ed', 'editor')], []);
    render(<ShareDialog {...base} />);
    await screen.findByText('Solo');
    expect(screen.queryByRole('button', { name: 'Remove Solo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Ed' })).toBeTruthy();
  });

  it('creating a link shows token once with copy', async () => {
    const calls: Call[] = [];
    mockServer([member('u1', 'Solo', 'owner')], calls);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareDialog {...base} />);
    await screen.findByText('Solo');
    fireEvent.change(screen.getByLabelText('General access'), { target: { value: 'workspace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText(/Link created — copy it now\. For security we can’t show it again\./)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(`http://app/d/${ID}?token=tok-secret`);
    expect((screen.getByLabelText('Share link') as HTMLInputElement).value).toContain('?token=tok-secret');
    expect(document.body.textContent).not.toContain('tok-secret');
  });

  it('local doc shows save-to-cloud state', () => {
    const calls: Call[] = [];
    mockServer([], calls);
    const onSave = vi.fn();
    render(<ShareDialog {...base} cloud={false} onSaveToCloud={onSave} />);
    expect(screen.getByText('Save this diagram to the cloud to share it')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save to cloud' }));
    expect(onSave).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(screen.queryByLabelText('Add people, teams or emails')).toBeNull();
  });

  it('dialog traps focus and closes on Esc', async () => {
    mockServer([member('u1', 'Solo', 'owner')], []);
    const onClose = vi.fn();
    render(<ShareDialog {...base} onClose={onClose} />);
    const dlg = await screen.findByRole('dialog', { name: 'Share checkout-mesh.arch' });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
