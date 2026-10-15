import { test, expect, type Page } from '@playwright/test';

// Mobile-first smoke: layout integrity + canvas usability on small screens.
// Runs on every project (including mobile devices); assertions adapt to width.
async function isNarrow(page: Page): Promise<boolean> {
  return (await page.evaluate(() => window.innerWidth)) <= 600;
}

test.describe('Responsive smoke', () => {
  // Touch input must be exercisable on every project (mobile devices have it
  // natively; desktop contexts need the flag).
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
  });

  test('header never overflows the viewport', async ({ page }) => {
    for (const route of ['dashboard', 'canvas', 'living']) {
      await page.goto(`/#/${route}`);
      await expect(page.locator('#architectureCanvas, main').first()).toBeVisible({ timeout: 15000 });
      const overflow = await page.evaluate(() => {
        const header = document.querySelector('.top-header') as HTMLElement | null;
        return header ? header.scrollWidth - header.clientWidth : -1;
      });
      expect(overflow, `header overflow on #${route}`).toBeLessThanOrEqual(0);
    }
  });

  test('canvas stays usable with dock collapsed', async ({ page }) => {
    await page.goto('/#/canvas');
    const status = page.getByTestId('canvas-status');
    await expect(status).toBeAttached({ timeout: 30000 });

    // Icon-only rail fits a phone column.
    const rail = page.locator('.vertical-tool-rail');
    await expect(rail).toBeVisible();
    expect(await rail.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(70);

    if (await isNarrow(page)) {
      // Dock starts collapsed; canvas keeps almost the full width.
      await expect(page.locator('#linterDrawer')).toBeHidden();
      await expect(page.getByTestId('dock-reopen')).toBeVisible();
      const viewportW = await page.evaluate(() => window.innerWidth);
      const canvasW = await page.locator('#architectureCanvas').evaluate((el) => el.getBoundingClientRect().width);
      expect(canvasW).toBeGreaterThan(viewportW - 100);

      // Reopen → bottom sheet inside the viewport → collapse again.
      await page.getByTestId('dock-reopen').click();
      const dock = page.locator('#linterDrawer');
      await expect(dock).toBeVisible();
      const box = await dock.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewportW + 1);
      await page.getByRole('button', { name: 'Collapse inspector dock' }).click();
      await expect(dock).toBeHidden();
    }
  });

  test('tool rail places nodes on a phone viewport', async ({ page }) => {
    await page.goto('/#/canvas');
    const status = page.getByTestId('canvas-status');
    await expect(status).toBeAttached({ timeout: 30000 });
    const before = Number(await status.getAttribute('data-nodes'));

    await page.locator('[data-tool="service"]').click();
    // Phone viewport keeps zoom 1: screen y=700 maps below the seed mesh.
    await page.touchscreen.tap(195, 700);
    await expect(status).toHaveAttribute('data-nodes', String(before + 1), { timeout: 10000 });
  });

  test('dashboard table has no page-level overflow', async ({ page }) => {
    await page.goto('/#/dashboard');
    await page.getByRole('button', { name: /Table/ }).click();
    await expect(page.getByRole('table', { name: 'Diagrams table' })).toBeVisible({ timeout: 15000 });
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });

  test('living screen has no page-level overflow', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByText('Live Status Overview')).toBeVisible({ timeout: 15000 });
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });
});
