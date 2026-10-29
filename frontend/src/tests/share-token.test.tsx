import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AccessStatesScreen from '../screens/AccessStatesScreen';
import { api, getShareToken } from '../lib/api';
import { shareLinkUrl } from '../lib/access';
import { setSession } from '../state/session';

// R1-BUG-07: share-link token in the URL, X-Share-Token on access/diagram requests, outsider request path.
const ID = '223e4567-e89b-12d3-a456-426614174000';
const OTHER = '323e4567-e89b-12d3-a456-426614174000';
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}
const headerOf = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string> | undefined)?.[name];

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/d/:id" element={<><AccessStatesScreen /><Where /></>} />
        <Route path="/login" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('share link token (R1-BUG-07)', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it('link format carries the token in the hash query', () => {
    expect(shareLinkUrl(`http://app/#/d/${ID}?link=1`, 'a b')).toBe(`http://app/#/d/${ID}?token=a%20b`);
    expect(shareLinkUrl(`http://app/#/d/${ID}`, TOKEN)).toBe(`http://app/#/d/${ID}?token=${TOKEN}`);
  });

  it('sends X-Share-Token on access and diagram load when a token is present, strips it, never persists it', async () => {
    setSession({ mode: 'email', email: 'me@x.test' });
    const seen: Array<{ url: string; token?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      seen.push({ url: String(input), token: headerOf(init, 'X-Share-Token') });
      return respond(200, { data: { state: 'request', title: 'Plan', ownerName: 'Dana' } });
    });
    renderAt(`/d/${ID}?token=${TOKEN}`);
    await screen.findByText(/You need access to “Plan”/);
    expect(seen.find((c) => c.url.endsWith(`/diagrams/${ID}/access`))?.token).toBe(TOKEN);
    await api.getDiagram(ID);
    expect(seen.find((c) => c.url.endsWith(`/diagrams/${ID}`))?.token).toBe(TOKEN);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/d/${ID}`));
    expect(getShareToken(ID)).toBe(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
  });

  it('does not send X-Share-Token without a token or for another diagram', async () => {
    const seen: Array<{ url: string; token?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      seen.push({ url: String(input), token: headerOf(init, 'X-Share-Token') });
      return respond(200, { data: {} });
    });
    await api.access.state(OTHER);
    await api.getDiagram(OTHER);
    expect(seen.length).toBe(2);
    expect(seen.every((c) => c.token === undefined)).toBe(true);
  });

  it('signed-out visitor keeps the token through login', async () => {
    renderAt(`/d/${ID}?token=${TOKEN}`);
    const where = await screen.findByTestId('where');
    expect(where.textContent).toBe(`/login?next=${encodeURIComponent(`/d/${ID}?token=${TOKEN}`)}`);
  });

  it('outsider holding a workspace-only link reaches request and posts a request', async () => {
    setSession({ mode: 'email', email: 'out@x.test' });
    const posts: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/access')) return respond(200, { data: { state: 'request', title: 'Plan', ownerName: 'Dana' } });
      if (url.endsWith('/access-requests') && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return respond(201, { data: { id: 'r1' } });
      }
      return respond(404, {});
    });
    renderAt(`/d/${ID}?token=${TOKEN}`);
    await screen.findByText(/You need access to “Plan”/);
    screen.getByRole('button', { name: 'Request access' }).click();
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Request sent — we’ll email you when Dana responds');
    expect(posts).toEqual([{ role: 'commenter', note: '' }]);
  });
});
