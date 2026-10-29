import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccessRequests from '../components/access/AccessRequests';
import { setSession } from '../state/session';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const row = (over: Record<string, unknown>) => ({
  id: 'r1', diagramId: ID, diagramTitle: 'Orders', requesterId: 'u2', requesterName: 'Sam Lee',
  requesterEmail: 'sam@x.test', role: 'commenter', note: 'Need to review', status: 'pending', createdAt: null, ...over,
});
function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

describe('access requests list (R1-BUG-07)', () => {
  beforeEach(() => { localStorage.clear(); setSession({ mode: 'email', email: 'owner@x.test' }); });
  afterEach(() => vi.restoreAllMocks());

  it('lists only this diagram and approves with the chosen role', async () => {
    const posts: { url: string; body: unknown }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') { posts.push({ url, body: JSON.parse(String(init.body ?? '{}')) }); return respond(200, { data: row({ status: 'approved' }) }); }
      return respond(200, { data: [row({}), row({ id: 'r2', diagramId: 'other', requesterName: 'Elsewhere' })] });
    });
    const onDecided = vi.fn();
    render(<AccessRequests diagramId={ID} onDecided={onDecided} />);
    expect(await screen.findByText('Sam Lee')).toBeTruthy();
    expect(screen.queryByText('Elsewhere')).toBeNull();
    fireEvent.change(screen.getByLabelText('Role to grant Sam Lee'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve Sam Lee' }));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
    expect(posts[0].url).toContain('/v1/access-requests/r1/approve');
    expect(posts[0].body).toEqual({ role: 'viewer' });
    expect(screen.queryByText('Sam Lee')).toBeNull();
  });

  it('denies a request and renders nothing when none are pending', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      urls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return init?.method === 'POST' ? respond(200, { data: row({ status: 'denied' }) }) : respond(200, { data: [row({})] });
    });
    const { container } = render(<AccessRequests diagramId={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deny Sam Lee' }));
    await waitFor(() => expect(screen.queryByText('Sam Lee')).toBeNull());
    expect(urls.some((u) => u.startsWith('POST') && u.includes('/access-requests/r1/deny'))).toBe(true);
    expect(container.firstChild).toBeNull();
  });
});
