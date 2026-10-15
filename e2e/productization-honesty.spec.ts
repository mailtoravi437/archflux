import { test, expect } from '@playwright/test';

// Phase 0 honesty contract (PRODUCTIZATION_SPEC §3 release rule, §6.1 status
// language): simulated or local-only surfaces must say so in the UI.
// Guest session => source mode is Local everywhere; connectors and merge
// paths run on mocks. TEXT selectors only; web-first assertions, no sleeps.
test.describe('Productization honesty contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
  });

  test('Living screen marks mock data as Demo', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByText('Live Status Overview')).toBeVisible();
    await expect(page.getByText(/Demo/i).first()).toBeVisible();
  });

  test('Living screen shows Not connected for mock connectors', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByText('Live Status Overview')).toBeVisible();
    await expect(page.getByText(/Not connected/i).first()).toBeVisible();
  });

  test('merge and automation surfaces disclose simulation', async ({ page }) => {
    // #/git redirects to the Merge & Automation sub-tab of Reviews.
    await page.goto('/#/git');
    await expect(page.getByRole('button', { name: /Merge & Automation/ })).toBeVisible();
    await expect(page.getByText(/Simulated/i).first()).toBeVisible();
  });

  test('reviewers surface shows Sample when team is unconfigured', async ({ page }) => {
    await page.goto('/#/reviews');
    await expect(page.getByText('Architecture Review Comments')).toBeVisible();
    await expect(page.getByText('Sample', { exact: true }).first()).toBeVisible();
  });

  test('canvas and dashboard show Local source-mode as guest', async ({ page }) => {
    await page.goto('/#/canvas');
    await expect(page.locator('#architectureCanvas')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Local/i).first()).toBeVisible();

    await page.goto('/#/dashboard');
    await expect(page.getByText(/Local/i).first()).toBeVisible();
  });
});
