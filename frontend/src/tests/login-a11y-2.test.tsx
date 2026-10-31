// Live audit 2026-10-31: BUG-LIVE-013 (not-found), 014 (h1 + main), 015 (provider notes),
// 016 (focus + email attributes), 026 (login and onboarding titles).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DiagramProvider } from '../state/store';
import { routes } from '../App';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { api } from '../lib/api';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <DiagramProvider>
      <RouterProvider router={router} />
    </DiagramProvider>,
  );
  return router;
}

function renderScreen(el: React.ReactElement) {
  return render(
    <MemoryRouter>
      <DiagramProvider>{el}</DiagramProvider>
    </MemoryRouter>,
  );
}

describe('BUG-LIVE-013 not-found when signed out', () => {
  it.each(['/foo', '/not-found', '/a/b/c'])('%s shows a not-found page, not the login form', async (path) => {
    const router = renderRoute(path);
    expect((await screen.findByRole('heading', { level: 1, name: 'Page not found' })).textContent).toBeTruthy();
    expect(router.state.location.pathname).toBe(path);
    expect(screen.getByRole('main')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('Work email')).toBeNull();
    expect(document.title).toBe('Page not found · ArchFlux');
  });

  it('a known app path signed out still redirects to /login', async () => {
    const router = renderRoute('/dashboard');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('/login and /onboarding still render', async () => {
    renderRoute('/login');
    expect(await screen.findByLabelText('Work email')).toBeTruthy();
    cleanup();
    renderRoute('/onboarding');
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('signed in, an unknown path keeps the in-app not-found inside the shell', async () => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderRoute('/foo');
    expect(await screen.findByRole('region', { name: 'Not found' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to home' })).toBeTruthy();
  });
});

describe('BUG-LIVE-014 headings and landmarks', () => {
  it('/login has one h1 and one main landmark', async () => {
    renderScreen(<LoginScreen />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.querySelector('main')).not.toBeNull();
  });

  it('every login region lives inside a landmark', () => {
    const { container } = renderScreen(<LoginScreen />);
    expect(container.querySelector('main')!.contains(screen.getByLabelText('Work email'))).toBe(true);
  });

  it('/onboarding has one h1 and one main landmark', () => {
    renderScreen(<OnboardingScreen />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});

describe('BUG-LIVE-016 focus and email field', () => {
  it('the email input is required and autocompletes as email', () => {
    renderScreen(<LoginScreen />);
    const input = screen.getByLabelText('Work email') as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.getAttribute('autocomplete')).toBe('email');
  });

  it('the brand block holds nothing focusable', () => {
    const { container } = renderScreen(<LoginScreen />);
    const brand = screen.getByText('ArchFlux', { selector: 'div' }).closest('[data-testid="login-brand"]')!;
    expect(brand).toBeTruthy();
    expect(brand.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').length).toBe(0);
    expect(container.querySelector('main')!.contains(brand)).toBe(false);
  });

  it('a visible focus style covers every focusable control', () => {
    const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    for (const sel of ['button:focus-visible', 'input:focus-visible', 'a:focus-visible', '[tabindex]:focus-visible']) {
      expect(css).toContain(sel);
    }
  });
});

describe('BUG-LIVE-015 provider notes (already fixed on main by PR #10)', () => {
  it('shows no repository-scope note under Google and no duplicate provider buttons per tab', async () => {
    const spy = vi.spyOn(api, 'getAuthProviders').mockResolvedValue({ data: { providers: [{ id: 'google' }, { id: 'github' }] } });
    renderScreen(<LoginScreen />);
    await screen.findByRole('button', { name: /continue with google/i });
    expect(spy).toHaveBeenCalled();
    expect(screen.queryByText(/repository/i)).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Magic Link']);
    expect(screen.getAllByRole('button', { name: /continue with google/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /continue with github/i })).toHaveLength(1);
  });
});

describe('BUG-LIVE-026 page titles', () => {
  it('/login is titled Sign in', () => {
    document.title = 'Home · ArchFlux — Living System Canvas';
    renderScreen(<LoginScreen />);
    expect(document.title).toBe('Sign in · ArchFlux');
  });
  it('/onboarding is titled Set up', () => {
    document.title = 'Sign in · ArchFlux';
    renderScreen(<OnboardingScreen />);
    expect(document.title).toBe('Set up · ArchFlux');
  });
});
