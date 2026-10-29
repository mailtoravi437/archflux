import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AccessStatesScreen from '../screens/AccessStatesScreen';
import ReadOnlyBanner from '../components/access/ReadOnlyBanner';
import { canComment, canEdit, loginUrlFor, readOnlyBannerText, safeNext } from '../lib/access';
import { setSession } from '../state/session';

const ID = '123e4567-e89b-12d3-a456-426614174000';

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={[`/d/${ID}`]}>
      <Routes>
        <Route path="/d/:id" element={<AccessStatesScreen />} />
        <Route path="/login" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('access states (R1-E07-T06)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('request state submits request', async () => {
    setSession({ mode: 'email', email: 'me@x.test' });
    const posts: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/access')) return respond(200, { data: { state: 'request', title: 'checkout-mesh.arch', ownerName: 'Dana' } });
      if (url.endsWith('/access-requests') && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return respond(201, { data: { id: 'r1' } });
      }
      return respond(404, {});
    });
    renderRoute();
    await screen.findByText(/You need access to “checkout-mesh.arch”/);
    fireEvent.change(screen.getByLabelText('Access level'), { target: { value: 'editor' } });
    fireEvent.change(screen.getByLabelText('Message to owner'), { target: { value: 'please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));
    expect(await screen.findByText('Request sent — we’ll email you when Dana responds')).toBeTruthy();
    expect(posts).toEqual([{ role: 'editor', note: 'please' }]);
  });

  it('not_found never shows a title', async () => {
    setSession({ mode: 'email', email: 'me@x.test' });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      respond(200, { data: { state: 'not_found', title: 'secret-plan.arch' } }));
    renderRoute();
    await screen.findByText('We can\'t open this diagram');
    expect(document.body.textContent).not.toContain('secret-plan.arch');
    expect(screen.getByRole('button', { name: 'Switch account' })).toBeTruthy();
  });

  it('viewer sees no editing tools and banner', () => {
    // Banner and role predicates. Hiding the canvas tools is wired by the store `role` (see EPIC-07 T06 notes).
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit('commenter')).toBe(false);
    expect(canEdit('editor')).toBe(true);
    expect(readOnlyBannerText('viewer')).toBe('View only · Request edit access');
    const onRequest = vi.fn();
    render(<ReadOnlyBanner role="viewer" title="checkout-mesh.arch" onRequestEdit={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request edit access' }));
    expect(onRequest).toHaveBeenCalled();
    expect(screen.getByText('View only')).toBeTruthy();
  });

  it('commenter can add a comment but not edit', () => {
    expect(canComment('commenter')).toBe(true);
    expect(canEdit('commenter')).toBe(false);
    expect(canComment('viewer')).toBe(false);
    expect(readOnlyBannerText('commenter')).toBe('Can comment');
    render(<ReadOnlyBanner role="commenter" onRequestEdit={() => {}} />);
    expect(screen.getByText('Can comment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request edit access' })).toBeNull();
  });

  it('signed-out deep link returns after login', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    renderRoute();
    const where = await screen.findByTestId('where');
    expect(where.textContent).toBe(`/login?next=${encodeURIComponent(`/d/${ID}`)}`);
    expect(f).not.toHaveBeenCalled();
    expect(loginUrlFor(`/d/${ID}`)).toContain('next=%2Fd%2F');
    expect(safeNext(`/d/${ID}`)).toBe(`/d/${ID}`);
    expect(safeNext('//evil.test')).toBeNull();
    expect(safeNext('https://evil.test')).toBeNull();
    await waitFor(() => expect(f).not.toHaveBeenCalled());
  });
});
