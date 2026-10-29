import { test, expect } from '@playwright/test';

// Phase 1 auth/session contract (PRODUCTIZATION_SPEC Phase 1: real identity,
// safe guest mode). Frontend-only and deterministic: no backend required, no
// sleeps, web-first assertions. Guest localStorage session pattern mirrors
// e2e/critical-journeys.spec.ts (hash routing; canvas-status/canvas probes).
test.describe('Auth session contract', () => {
  test('unauthenticated deep link to /dashboard lands on /login', async ({ page }) => {
    // Fresh context: no session at all.
    await page.goto('/#/dashboard');
    await expect(page).toHaveURL(/.*login/);
    await expect(page.getByRole('main', { name: 'Sign in' })).toBeVisible();
  });

  test('guest entry reaches canvas with zero failed auth requests', async ({ page }) => {
    const failedAuth: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401 && res.url().includes('/api/v1/')) {
        failedAuth.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
    await page.goto('/#/canvas');
    await expect(page.locator('#architectureCanvas')).toBeVisible({ timeout: 30000 });
    expect(failedAuth).toEqual([]);
  });

  test('sign-out clears the session and the gate returns to /login', async ({ page }) => {
    // Auth is cookie-based: a non-guest session + GET /api/v1/auth/me probe
    // decides signed-in state. Stub probe + logout so the test is
    // backend-independent and deterministic.
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { email: 'e2e@example.com' } }),
      });
    });
    await page.route('**/api/v1/auth/logout', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    // The signed-in app fetches the server docs list on load; stub it so the
    // canvas renders without a real backend cookie (deterministic, Hermetic).
    await page.route('**/api/v1/diagrams**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) });
    });
    // Hash-router navigations commit per step; record them to prove the
    // sign-out path travels through /login (it is transient: LoginScreen
    // auto-continues guests to /dashboard).
    const visitedHashes: string[] = [];
    page.on('framenavigated', () => {
      try {
        visitedHashes.push(new URL(page.url()).hash);
      } catch {
        /* ignore */
      }
    });
    // Start signed in (session mode + onboarded; no legacy bearer — the app
    // actively wipes pre-cookie tokens).
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'e2e@example.com' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
    await page.goto('/#/canvas');
    await expect(page.locator('#architectureCanvas')).toBeVisible({ timeout: 30000 });

    // UI sign-out via the account menu (probe stubbed 200, so it is offered).
    await page.getByRole('button', { name: /Account/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    // Authenticated identity is cleared back to a guest session.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            try {
              return JSON.parse(localStorage.getItem('archflux:session') ?? 'null')?.mode ?? null;
            } catch {
              return null;
            }
          }),
        { timeout: 10000 },
      )
      .toBe('guest');
    // Sign-out navigates through /login before the guest bounce lands.
    await expect
      .poll(async () => visitedHashes.some((h) => h.includes('login')), { timeout: 10000 })
      .toBe(true);
    // Guest auto-continue lands back on /dashboard with a clean guest session
    // (the null-session gate itself is covered deterministically by the
    // 'unauthenticated deep link' test, which loads without any session).
    await expect(page).toHaveURL(/.*dashboard/);
    expect(await page.evaluate(() => localStorage.getItem('archflux:auth_token'))).toBeNull();
  });

  test('oauth callback with ?error shows login', async ({ page }) => {
    await page.goto('/#/auth/callback?error=access_denied');
    await expect(page).toHaveURL(/.*login/);
    await expect(page.getByRole('main', { name: 'Sign in' })).toBeVisible();
  });
});
