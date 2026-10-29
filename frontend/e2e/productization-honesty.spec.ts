import { test, expect } from '@playwright/test';

// Phase 0 honesty contract (PRODUCTIZATION_SPEC §3 release rule, §6.1 status
// language): simulated or local-only surfaces must say so in the UI.
// Guest session => source mode is Local everywhere; no live connector exists.
// The app ships no mock data (FRONTEND_SPEC v1.5.0): a fresh browser shows
// empty states. TEXT selectors only; web-first assertions, no sleeps.
test.describe('Productization honesty contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
  });

  test('Living screen states Not connected and lists no fake connectors', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();
    await expect(page.getByTestId('sync-stats')).toContainText('Not connected');
    await expect(page.getByTestId('connectors-empty')).toBeVisible();
    await expect(page.locator('.connector-row')).toHaveCount(0);
  });

  test('merge and automation surfaces disclose simulation', async ({ page }) => {
    // #/git redirects to the Merge & Automation sub-tab of Reviews.
    await page.goto('/#/git');
    await expect(page.getByRole('button', { name: /Merge & Automation/ })).toBeVisible();
    await expect(page.getByText(/Simulated/i).first()).toBeVisible();
  });

  test('reviewers surface shows No team when team is unconfigured', async ({ page }) => {
    await page.goto('/#/reviews');
    await expect(page.getByText('Architecture Review Comments')).toBeVisible();
    await expect(page.getByText('No team', { exact: true }).first()).toBeVisible();
  });

  test('fresh workspace starts empty (no demo diagram, PRs or comments)', async ({ page }) => {
    await page.goto('/#/canvas');
    await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-nodes', '0', { timeout: 30000 });
    await expect(page.getByRole('status', { name: 'Empty canvas' })).toBeVisible();

    await page.goto('/#/git');
    await expect(page.getByTestId('pr-empty')).toBeVisible();
  });

  test('canvas and dashboard show Local source-mode as guest', async ({ page }) => {
    await page.goto('/#/canvas');
    await expect(page.locator('#architectureCanvas')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Local/i).first()).toBeVisible();

    await page.goto('/#/dashboard');
    // Library.dc.html (R1-E14-T04): the local source chip reads "This device".
    await expect(page.getByText('This device', { exact: true }).first()).toBeVisible();
  });
});
