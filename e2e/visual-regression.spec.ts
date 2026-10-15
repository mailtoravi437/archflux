import { test, expect, type Page } from '@playwright/test';

// Visual baselines. All navigation uses hash routing (static-host compatible).
// Screenshots disable animations for determinism; state is asserted via
// live testids before capturing — no arbitrary sleeps.

// Seed mesh occupies y≈90–400; placements use the empty band below it.
const emptySpots: Array<[number, number]> = [[150, 540], [450, 540], [750, 540]];

const shot = { animations: 'disabled' as const };

async function gotoCanvas(page: Page) {
  await page.goto('/#/canvas');
  const status = page.getByTestId('canvas-status');
  await expect(status).toBeAttached({ timeout: 30000 });
  await expect(page.locator('#architectureCanvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Vendor icons paint async — wait for preload, then for pixel quiescence
  // (two identical consecutive frames) so screenshots never catch half-painted icons.
  await expect(status).toHaveAttribute('data-icons-ready', 'true', { timeout: 15000 });
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const c = document.getElementById('architectureCanvas') as HTMLCanvasElement | null;
      if (!c) return 'missing';
      const prev = (window as unknown as { __lastShot?: string }).__lastShot;
      const now = c.toDataURL('image/png');
      (window as unknown as { __lastShot?: string }).__lastShot = now;
      return prev === now ? `stable:${now.length}` : 'changing';
    });
  }, { timeout: 15000 }).toMatch(/^stable:/);
}

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
    await gotoCanvas(page);
  });

  test('canvas initial state matches snapshot', async ({ page }) => {
    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-initial.png', shot);
  });

  test('canvas with nodes matches snapshot', async ({ page }) => {
    const status = page.getByTestId('canvas-status');
    const before = Number(await status.getAttribute('data-nodes'));
    const beforeEdges = Number(await status.getAttribute('data-edges'));

    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[0]);
    await expect(status).toHaveAttribute('data-nodes', String(before + 1), { timeout: 10000 });

    await page.locator('[data-tool="db"]').click();
    await page.mouse.click(...emptySpots[1]);
    await expect(status).toHaveAttribute('data-nodes', String(before + 2), { timeout: 10000 });

    await page.locator('[data-tool="connector"]').click();
    await page.mouse.click(...emptySpots[0]);
    await page.mouse.click(...emptySpots[1]);
    await expect(status).toHaveAttribute('data-edges', String(beforeEdges + 1), { timeout: 10000 });

    // Clear selection so the highlight ring doesn't add nondeterministic pixels.
    await page.keyboard.press('Escape');
    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-with-nodes-and-edge.png', shot);
  });

  test('dark theme matches snapshot', async ({ page }) => {
    await page.selectOption('select[aria-label="Theme"]', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-dark-theme.png', shot);
  });

  test('blueprint theme matches snapshot', async ({ page }) => {
    await page.selectOption('select[aria-label="Theme"]', 'blueprint');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');

    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-blueprint-theme.png', shot);
  });

  test('command palette matches snapshot', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.locator('[role="dialog"][aria-label="Command palette"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('command-palette.png', shot);
  });

  test('library drawer matches snapshot', async ({ page }) => {
    await page.getByRole('button', { name: 'Open shape library' }).click();
    const drawer = page.locator('[role="dialog"][aria-label="Shape library"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveScreenshot('library-drawer.png', shot);
  });

  test('reviews screen matches snapshot', async ({ page }) => {
    await page.goto('/#/reviews');
    await expect(page.getByText('Architecture Review Comments')).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('reviews-screen.png', shot);
  });

  test('living screen matches snapshot', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByText('Live Status Overview')).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('living-screen.png', shot);
  });

  test('blueprints screen matches snapshot', async ({ page }) => {
    await page.goto('/#/blueprints');
    await expect(page.getByRole('heading', { name: /Blueprints/ })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('blueprints-screen.png', shot);
  });

  test('dashboard grid view matches snapshot', async ({ page }) => {
    await page.goto('/#/dashboard');
    await expect(page.getByText(/Diagrams · .*KB used/).first()).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('dashboard-grid.png', shot);
  });

  test('dashboard table view matches snapshot', async ({ page }) => {
    await page.goto('/#/dashboard');
    await page.getByRole('button', { name: /Table/ }).click();
    await expect(page.getByRole('table', { name: 'Diagrams table' })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('dashboard-table.png', shot);
  });

  test('settings screen matches snapshot', async ({ page }) => {
    await page.goto('/#/settings/general');
    await expect(page.locator('select[aria-label="Default rendering style"]')).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('settings-general.png', shot);
  });

  test('focus mode matches snapshot', async ({ page }) => {
    await page.getByRole('button', { name: /Focus/ }).first().click();
    await expect(page.getByText('FOCUS MODE — Esc to exit', { exact: true })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('focus-mode.png', shot);
  });

  test('empty canvas state matches snapshot', async ({ page }) => {
    await page.goto('/#/dashboard');
    await page.getByRole('button', { name: /New Diagram/ }).click();
    await expect(page).toHaveURL(/.*canvas/);

    const status = page.getByTestId('canvas-status');
    await expect(status).toHaveAttribute('data-nodes', '0', { timeout: 10000 });
    await expect(page.getByText('Empty canvas')).toBeVisible();
    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('empty-canvas.png', shot);
  });

  test('canvas with freehand stroke matches snapshot', async ({ page }) => {
    await page.locator('[data-tool="draw"]').click();
    await page.mouse.move(...emptySpots[0]);
    await page.mouse.down();
    await page.mouse.move(250, 560, { steps: 8 });
    await page.mouse.move(350, 520, { steps: 8 });
    await page.mouse.up();

    // Ink commits to the store on pointer-up; wait for the persisted stroke.
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const raw = localStorage.getItem('archflux:v2-light') ?? '';
        return raw.includes('"pts"');
      });
    }, { timeout: 10000 }).toBe(true);
    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-freehand.png', shot);
  });

  test('canvas with text label matches snapshot', async ({ page }) => {
    await page.locator('[data-tool="text"]').click();
    await page.mouse.click(...emptySpots[2]);
    // Draft editor remounts on focus — fill + assert value so no keystroke is lost.
    const editor = page.locator('textarea');
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await editor.fill('Test Label');
    await expect(editor).toHaveValue('Test Label');
    await page.keyboard.press('Enter');

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const raw = localStorage.getItem('archflux:v2-light') ?? '';
        return raw.includes('Test Label');
      });
    }, { timeout: 10000 }).toBe(true);
    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-text-label.png', shot);
  });

  test('linter tab shows issues', async ({ page }) => {
    // Seed mesh ships an orphan + dangling wire, so the badge is non-zero.
    const badge = page.locator('#linterCountBadge');
    await expect(badge).toBeVisible();
    await expect(page.getByRole('tab', { name: /Linter \d+/ })).toHaveScreenshot('linter-chip-with-issues.png', shot);
  });

  test('linter panel lists issues', async ({ page }) => {
    await page.getByRole('tab', { name: /Linter \d+/ }).click();
    const panel = page.locator('[role="tabpanel"][aria-label="Architecture linter"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveScreenshot('linter-panel.png', shot);
  });
});

test.describe('Responsive Visual Tests', () => {
  const viewports = [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 },
  ];

  for (const viewport of viewports) {
    test(`canvas at ${viewport.name} viewport`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
        localStorage.setItem('archflux:onboarded', 'true');
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoCanvas(page);

      await expect(page.locator('#architectureCanvas')).toHaveScreenshot(`canvas-${viewport.name}.png`, shot);
    });

    test(`dashboard at ${viewport.name} viewport`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
        localStorage.setItem('archflux:onboarded', 'true');
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/#/dashboard');
      await expect(page.getByText(/Diagrams · .*KB used/).first()).toBeVisible();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('main')).toHaveScreenshot(`dashboard-${viewport.name}.png`, shot);
    });
  }
});

test.describe('Theme Visual Tests', () => {
  const themes = ['light', 'dark', 'blueprint'] as const;

  for (const theme of themes) {
    test(`all screens in ${theme} theme`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
        localStorage.setItem('archflux:onboarded', 'true');
      });
      await gotoCanvas(page);
      await page.selectOption('select[aria-label="Theme"]', theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await expect(page.locator('#architectureCanvas')).toHaveScreenshot(`canvas-${theme}.png`, shot);

      await page.goto('/#/dashboard');
      await expect(page.getByText(/Diagrams · .*KB used/).first()).toBeVisible();
      await expect(page.locator('main')).toHaveScreenshot(`dashboard-${theme}.png`, shot);

      await page.goto('/#/reviews');
      await expect(page.getByText('Architecture Review Comments')).toBeVisible();
      await expect(page.locator('main')).toHaveScreenshot(`reviews-${theme}.png`, shot);

      await page.goto('/#/living');
      await expect(page.getByText('Live Status Overview')).toBeVisible();
      await expect(page.locator('main')).toHaveScreenshot(`living-${theme}.png`, shot);
    });
  }
});
