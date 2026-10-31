import { test, expect, type Page } from '@playwright/test';
import { seedSampleWorkspace } from './fixtures';

// Visual baselines. All navigation uses clean path URLs.
// Screenshots disable animations for determinism; state is asserted via
// live testids before capturing — no arbitrary sleeps.

// Sample graph occupies y≈90–400; placements use the empty band below it.
const emptySpots: Array<[number, number]> = [[150, 540], [450, 540], [750, 540]];

const shot = { animations: 'disabled' as const };

async function gotoCanvas(page: Page) {
  await page.goto('/canvas');
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

// Theme lives in Settings → General (app bar no longer has it) and persists app-wide.
async function setThemeViaSettings(page: Page, theme: 'light' | 'dark' | 'blueprint') {
  await page.goto('/settings/general');
  await page.selectOption('select[aria-label="Theme"]', theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await gotoCanvas(page);
}

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await seedSampleWorkspace(page);
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
    await setThemeViaSettings(page, 'dark');

    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-dark-theme.png', shot);
  });

  test('light theme matches snapshot', async ({ page }) => {
    await setThemeViaSettings(page, 'light');

    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-light-theme.png', shot);
  });

  test('blueprint theme matches snapshot', async ({ page }) => {
    await setThemeViaSettings(page, 'blueprint');

    await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-blueprint-theme.png', shot);
  });

  test('command palette matches snapshot', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.locator('[role="dialog"][aria-label="Command palette"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('command-palette.png', shot);
  });

  test('library drawer matches snapshot', async ({ page }) => {
    await page.getByRole('button', { name: /Shapes library/ }).click();
    const drawer = page.locator('[role="dialog"][aria-label="Shape library"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveScreenshot('library-drawer.png', shot);
  });

  test('reviews screen matches snapshot', async ({ page }) => {
    await page.goto('/reviews');
    await expect(page.getByText('Architecture Review Comments')).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('reviews-screen.png', shot);
  });

  test('living screen matches snapshot', async ({ page }) => {
    await page.goto('/living');
    await expect(page.getByRole('heading', { level: 2, name: 'Drift' })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('living-screen.png', shot);
  });

  test('blueprints screen matches snapshot', async ({ page }) => {
    await page.goto('/blueprints');
    await expect(page.getByRole('heading', { name: /Blueprints/ })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('blueprints-screen.png', shot);
  });

  test('dashboard grid view matches snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/of 25 diagrams · .*KB used/).first()).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('dashboard-grid.png', shot);
  });

  test('dashboard table view matches snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Table/ }).click();
    await expect(page.getByRole('table', { name: 'Diagrams table' })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('dashboard-table.png', shot);
  });

  test('settings screen matches snapshot', async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page.locator('select[aria-label="Default rendering style"]')).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('settings-general.png', shot);
  });

  test('focus mode matches snapshot', async ({ page }) => {
    await page.getByRole('button', { name: /Focus/ }).first().click();
    await expect(page.getByText('FOCUS MODE — Esc to exit', { exact: true })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot('focus-mode.png', shot);
  });

  test('empty canvas state matches snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /New diagram/i }).click();
    await page.getByRole('dialog', { name: 'New diagram' }).getByRole('button', { name: 'Create', exact: true }).click();
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

  // R1-E14-T10: the dock Linter tab is gone; the lint list opens from the status menu.
  test('ai assistant dock tab is the R2 placeholder', async ({ page }) => {
    await page.getByRole('tab', { name: 'AI assistant' }).click();
    const panel = page.getByRole('tabpanel', { name: 'AI assistant' });
    await expect(panel.getByRole('heading', { name: 'Assistant arrives in R2' })).toBeVisible();
    await expect(panel).toHaveScreenshot('ai-assistant-r2-panel.png', shot);
  });

  test('linter dialog lists issues', async ({ page }) => {
    await page.getByTestId('status-button').click();
    await page.getByRole('menuitem', { name: /^Linter \(\d+ issues?\)/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Architecture linter' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('linter-dialog.png', shot);
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
      await seedSampleWorkspace(page);
      await page.addInitScript(() => {
        localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
        localStorage.setItem('archflux:onboarded', 'true');
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoCanvas(page);

      await expect(page.locator('#architectureCanvas')).toHaveScreenshot(`canvas-${viewport.name}.png`, shot);
    });

    test(`dashboard at ${viewport.name} viewport`, async ({ page }) => {
      await seedSampleWorkspace(page);
      await page.addInitScript(() => {
        localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
        localStorage.setItem('archflux:onboarded', 'true');
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/dashboard');
      await expect(page.getByText(/of 25 diagrams · .*KB used/).first()).toBeVisible();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('main')).toHaveScreenshot(`dashboard-${viewport.name}.png`, shot);
    });
  }
});

test.describe('Theme Visual Tests', () => {
  const themes = ['light', 'dark', 'blueprint'] as const;

  for (const theme of themes) {
    test(`all screens in ${theme} theme`, async ({ page }) => {
      await seedSampleWorkspace(page);
      await page.addInitScript(() => {
        localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
        localStorage.setItem('archflux:onboarded', 'true');
      });
      // Theme moved out of the app bar (§4): it lives in Settings → General
      // and the account menu. It persists app-wide.
      await page.goto('/settings/general');
      await page.selectOption('select[aria-label="Theme"]', theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await gotoCanvas(page);
      await expect(page.locator('#architectureCanvas')).toHaveScreenshot(`canvas-${theme}.png`, shot);

      await page.goto('/dashboard');
      await expect(page.getByText(/of 25 diagrams · .*KB used/).first()).toBeVisible();
      await expect(page.locator('main')).toHaveScreenshot(`dashboard-${theme}.png`, shot);

      await page.goto('/reviews');
      await expect(page.getByText('Architecture Review Comments')).toBeVisible();
      await expect(page.locator('main')).toHaveScreenshot(`reviews-${theme}.png`, shot);

      await page.goto('/living');
      await expect(page.getByRole('heading', { level: 2, name: 'Drift' })).toBeVisible();
      await expect(page.locator('main')).toHaveScreenshot(`living-${theme}.png`, shot);
    });
  }
});

// R1-E13-T04: R1 screens and dialogs. Baselines for these do NOT exist yet: they are created only
// after a human compares each shot with its artboard (EPIC-13 T04, EPIC-14 T07). Never run these
// with --update-snapshots on an agent's own judgement; a plain run reports "missing snapshot".
test.describe('Visual Regression: R1 screens (baselines pending human approval)', () => {
  test.beforeEach(async ({ page }) => {
    await seedSampleWorkspace(page);
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
  });

  test('home screen matches snapshot', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.addStyleTag({ content: '[aria-label="Getting started"], [role="complementary"] { visibility: hidden !important; }' });
    await expect(page).toHaveScreenshot('r1-home.png', shot);
  });

  test('trash screen matches snapshot', async ({ page }) => {
    await page.goto('/trash');
    await expect(page.getByTestId('page-header')).toBeVisible();
    await expect(page).toHaveScreenshot('r1-trash.png', shot);
  });

  test('new diagram dialog matches snapshot', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'New diagram' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New diagram' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('r1-new-diagram-dialog.png', shot);
  });

  test('import dialog matches snapshot', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Import', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('r1-import-dialog.png', shot);
  });

  test('export dialog matches snapshot', async ({ page }) => {
    await gotoCanvas(page);
    await page.getByRole('button', { name: /^Account/ }).click();
    await page.getByRole('menuitem', { name: /Export/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('r1-export-dialog.png', shot);
  });

  test('share dialog (local diagram) matches snapshot', async ({ page }) => {
    await gotoCanvas(page);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^Share/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('r1-share-dialog-local.png', shot);
  });

  test('shapes panel matches snapshot', async ({ page }) => {
    await gotoCanvas(page);
    await page.getByRole('button', { name: /Shapes library/ }).click();
    await expect(page.getByRole('button', { name: 'VPC boundary' })).toBeVisible();
    await expect(page).toHaveScreenshot('r1-shapes-panel.png', shot);
  });

  test('shapes drawer rows are reachable and not covered by canvas chrome', async ({ page }) => {
    await gotoCanvas(page);
    await page.getByRole('button', { name: /Shapes library/ }).click();
    const drawer = page.locator('[role="dialog"][aria-label="Shape library"]');
    await expect(drawer).toBeVisible();
    const tile = page.getByRole('button', { name: 'VPC boundary' });
    await tile.scrollIntoViewIfNeeded();
    const box = await tile.boundingBox();
    if (!box) throw new Error('VPC boundary tile has no box');
    const topmostIsTile = await tile.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(topmostIsTile).toBe(true);
    const drawerBox = await drawer.boundingBox();
    if (!drawerBox) throw new Error('drawer has no box');
    expect(box.y + box.height).toBeLessThanOrEqual(drawerBox.y + drawerBox.height);
  });

  test('canvas with pages bar and layers popover matches snapshot', async ({ page }) => {
    await gotoCanvas(page);
    await page.getByRole('button', { name: /^Layers/ }).click();
    await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
    await expect(page).toHaveScreenshot('r1-layers-popover.png', shot);
  });

  // R1-E08-T04: History with two local checkpoints ticked and the pair compare view open.
  // Guest path: local checkpoints are created through the Reviews screen "Tag Checkpoint" UI
  // (no cloud stack needed). A node is added between the two so the diff is not empty.
  test('history pair compare', async ({ page }) => {
    const tag = async (name: string) => {
      await page.goto('/reviews');
      await page.getByRole('textbox', { name: 'Checkpoint name' }).fill(name);
      await page.getByRole('button', { name: '+ Tag Checkpoint' }).click();
      await expect(page.getByText(`Named Version Checkpoints (${name === 'baseline-a' ? 1 : 2})`)).toBeVisible();
    };
    await tag('baseline-a');
    await gotoCanvas(page);
    const status = page.getByTestId('canvas-status');
    const before = Number(await status.getAttribute('data-nodes'));
    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[0]);
    await expect(status).toHaveAttribute('data-nodes', String(before + 1), { timeout: 10000 });
    await tag('baseline-b');

    await page.goto('/history');
    const panel = page.getByRole('complementary', { name: 'Version history' });
    await expect(panel).toBeVisible();
    await panel.getByRole('checkbox', { name: /^Select baseline-a for compare/ }).check();
    await panel.getByRole('checkbox', { name: /^Select baseline-b for compare/ }).check();
    await expect(panel.getByText('2 selected · older on the left')).toBeVisible();
    await panel.getByRole('button', { name: 'Compare selected versions' }).click();
    await expect(page.getByRole('main').getByText(/History of/)).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    // Toasts from the setup steps expire on their own; capture only once they are gone.
    await expect(page.locator('.toast-tray .toast-msg')).toHaveCount(0, { timeout: 20000 });
    // Timestamps and the day heading in the version list differ per run; mask them so only layout and content are compared.
    await expect(page).toHaveScreenshot('r1-history-pair-compare.png', {
      ...shot,
      mask: [panel.locator('li > span:nth-of-type(2)'), panel.locator('summary'), panel.getByRole('heading', { level: 2 })],
    });
  });
});
