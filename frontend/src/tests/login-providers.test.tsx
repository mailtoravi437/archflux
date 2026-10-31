import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import LoginScreen from '../screens/LoginScreen';
import { api } from '../lib/api';

// H4 (2026-10-31): the login screen offers only providers the server reports as configured.
// With none configured it shows the magic-link form only, with no fake provider buttons.

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function renderLogin(url = '/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DiagramProvider>
        <LoginScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

const providers = (ids: string[]) =>
  vi.spyOn(api, 'getAuthProviders').mockResolvedValue({ data: { providers: ids.map((id) => ({ id })) } });

describe('login providers', () => {
  it('shows no provider buttons when none is configured', async () => {
    const spy = providers([]);
    renderLogin();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /github/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Magic Link']);
  });

  it('shows no provider buttons when the providers request fails', async () => {
    const spy = vi.spyOn(api, 'getAuthProviders').mockRejectedValue(new Error('down'));
    renderLogin();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /continue with/i })).toBeNull();
  });

  it('shows only the configured provider', async () => {
    providers(['google']);
    renderLogin();
    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /github/i })).toBeNull();
    // The old repository-scope claim is gone: sign-in asks for identity only.
    expect(screen.queryByText(/repository read\/write/i)).toBeNull();
  });

  it('adds SSO tabs only for configured SSO providers', async () => {
    providers(['saml', 'oidc']);
    renderLogin();
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Magic Link', 'SSO (SAML)', 'OIDC']));
  });

  it.each([
    ['email_not_verified', /verified/i],
    ['no_email', /email address/i],
  ])('explains the %s sign-in error honestly', async (code, text) => {
    providers([]);
    renderLogin(`/login?error=${code}`);
    expect((await screen.findByRole('alert')).textContent).toMatch(text);
  });
});
