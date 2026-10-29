import { test, expect, type Page } from '@playwright/test';
import { seedSampleWorkspace } from './fixtures';

// seedSampleWorkspace() loads the 9-node sample graph, so all canvas assertions are
// relative: read the live counts from [data-testid=canvas-status], act,
// then assert the delta.
async function canvasCounts(page: Page): Promise<{ nodes: number; edges: number }> {
  const status = page.getByTestId('canvas-status');
  const nodes = Number(await status.getAttribute('data-nodes'));
  const edges = Number(await status.getAttribute('data-edges'));
  return { nodes, edges };
}

// Sample graph occupies y≈90–400; placements use the empty band below it.
const emptySpots: Array<[number, number]> = [[150, 540], [450, 540], [750, 540]];

test.describe('ArchFlux E2E Critical User Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Set up guest session
    await seedSampleWorkspace(page);
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });

    // Use hash routing; canvas-status proves React rendered with live counts
    await page.goto('/#/canvas');
    const status = page.getByTestId('canvas-status');
    await expect(status).toBeAttached({ timeout: 30000 });
    await expect(page.locator('#architectureCanvas')).toBeVisible();
  });

  test('complete onboarding flow', async ({ page }) => {
    await page.goto('/#/onboarding');

    await page.getByRole('button', { name: 'Platform / Backend Engineer' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'AWS' }).click();
    await page.getByRole('button', { name: 'Kubernetes' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Event-Driven Microservices with Kafka & CQRS' }).click();
    await page.getByRole('button', { name: 'Open workspace' }).click();

    await expect(page).toHaveURL(/.*canvas/);
    await expect(page.locator('#architectureCanvas')).toBeVisible();
  });

  test('create diagram from blank canvas', async ({ page }) => {
    const status = page.getByTestId('canvas-status');
    const before = await canvasCounts(page);

    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[0]);
    await expect(status).toHaveAttribute('data-nodes', String(before.nodes + 1), { timeout: 10000 });

    await page.locator('[data-tool="db"]').click();
    await page.mouse.click(...emptySpots[1]);
    await expect(status).toHaveAttribute('data-nodes', String(before.nodes + 2), { timeout: 10000 });

    await page.locator('[data-tool="connector"]').click();
    await page.mouse.click(...emptySpots[0]);
    await page.mouse.click(...emptySpots[1]);
    await expect(status).toHaveAttribute('data-edges', String(before.edges + 1), { timeout: 10000 });
  });

  test('export and import .arch file', async ({ page }) => {
    const status = page.getByTestId('canvas-status');
    const before = await canvasCounts(page);
    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[0]);
    await expect(status).toHaveAttribute('data-nodes', String(before.nodes + 1), { timeout: 10000 });

    const downloadPromise = page.waitForEvent('download');
    // R1-E14-T01: the ⋯ overflow left the app bar; Export runs from the palette.
    await page.getByRole('button', { name: 'Search ⌘K' }).click();
    await page.locator('[role="combobox"][aria-label="Command palette"]').fill('Export .arch');
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.arch$/);

    // Import lives on the Living (file transfer) screen, then returns to canvas
    await page.goto('/#/living');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.arch',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        nodes: [{ id: 'test', type: 'service', label: 'Test', tag: 'Test', health: 'Healthy', x: 100, y: 100, w: 170, h: 70, stroke: '#2563EB' }],
        edges: []
      }))
    });

    // Import replaces the canvas graph with the 1-node file
    await expect(page).toHaveURL(/.*canvas/);
    await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-nodes', '1', { timeout: 10000 });
  });

  test('run auto-layout', async ({ page }) => {
    const status = page.getByTestId('canvas-status');
    const before = await canvasCounts(page);
    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[0]);
    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[1]);
    await page.locator('[data-tool="db"]').click();
    await page.mouse.click(...emptySpots[2]);
    await expect(status).toHaveAttribute('data-nodes', String(before.nodes + 3), { timeout: 10000 });

    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('[role="combobox"][aria-label="Command palette"]').fill('layout');
    await page.keyboard.press('Enter');

    // Layout keeps all nodes; poll the live count instead of sleeping
    await expect(status).toHaveAttribute('data-nodes', String(before.nodes + 3), { timeout: 10000 });
    await expect(page.locator('#architectureCanvas')).toBeVisible();
  });

  test('open blueprints and load one', async ({ page }) => {
    await page.goto('/#/blueprints');
    await expect(page.getByRole('heading', { name: /Blueprints/ })).toBeVisible();

    await page.getByRole('button', { name: 'Load to Canvas' }).first().click();

    await expect(page).toHaveURL(/.*canvas/);
    await expect(page.locator('#architectureCanvas')).toBeVisible();
  });

  test('blueprint preview lists routes and saves canvas as blueprint', async ({ page }) => {
    await page.goto('/#/blueprints');
    await expect(page.getByRole('heading', { name: /Blueprints/ })).toBeVisible();

    // Preview shows node + route lists.
    await page.getByRole('button', { name: 'Preview' }).first().click();
    await expect(page.getByText('Routes')).toBeVisible();
    await page.keyboard.press('Escape');

    // Save current canvas (sample graph) as a custom blueprint.
    await page.fill('[aria-label="Custom blueprint name"]', 'E2E Custom');
    await page.getByRole('button', { name: /Save current canvas as blueprint/ }).click();
    await expect(page.getByText('E2E Custom').first()).toBeVisible();

    // Custom blueprint loads back onto the canvas.
    await page.getByRole('button', { name: 'Load to Canvas' }).first().click();
    await expect(page).toHaveURL(/.*canvas/);
    await expect(page.locator('#architectureCanvas')).toBeVisible();
  });

  test('create review thread on node', async ({ page }) => {
    const status = page.getByTestId('canvas-status');
    const before = await canvasCounts(page);
    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(...emptySpots[0]);
    await expect(status).toHaveAttribute('data-nodes', String(before.nodes + 1), { timeout: 10000 });

    await page.goto('/#/reviews');
    await expect(page.getByText('Architecture Review Comments')).toBeVisible();

    await page.fill('[aria-label="New thread text"]', 'This service needs better error handling');
    await page.getByRole('button', { name: 'Post' }).click();

    await expect(page.getByText('This service needs better error handling')).toBeVisible();
  });

  test('settings persistence across reload', async ({ page }) => {
    await page.goto('/#/settings/general');
    await expect(page.locator('select[aria-label="Default rendering style"]')).toBeVisible();

    await page.selectOption('select[aria-label="Default rendering style"]', 'sketchy');
    await page.selectOption('select[aria-label="Grid style"]', 'lines');

    await page.reload();
    await expect(page.locator('select[aria-label="Default rendering style"]')).toBeVisible();
    await expect(page.locator('select[aria-label="Default rendering style"]')).toHaveValue('sketchy');
    await expect(page.locator('select[aria-label="Grid style"]')).toHaveValue('lines');
  });

  test('theme switching works', async ({ page }) => {
    // §4: theme moved out of the app bar into Settings → General (and the
    // account menu); it applies app-wide.
    await page.goto('/#/settings/general');
    await page.selectOption('select[aria-label="Theme"]', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.selectOption('select[aria-label="Theme"]', 'blueprint');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');

    await page.selectOption('select[aria-label="Theme"]', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('living resync is honest without a connected source', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByRole('heading', { level: 2, name: 'Drift' })).toBeVisible();

    await page.getByRole('button', { name: 'Re-sync' }).click();

    // No connector exists (FE-M2): nothing is injected, status says so.
    await expect(page.getByTestId('sync-stats')).toContainText('Not connected', { timeout: 5000 });
    await expect(page.getByTestId('sync-stats')).not.toContainText('In sync');
    await expect(page.getByTestId('sync-stats')).toContainText('Mapped services9');
  });

  test('keyboard shortcuts work globally', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('[role="dialog"][aria-label="Command palette"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"][aria-label="Command palette"]')).not.toBeVisible();

    await page.keyboard.press('ControlOrMeta+o');
    await expect(page).toHaveURL(/.*dashboard/);

    await page.keyboard.press('ControlOrMeta+b');
    await expect(page).toHaveURL(/.*blueprints/);
  });

  test('focus mode hides UI chrome', async ({ page }) => {
    // R1-E14-T01: the ⋯ overflow left the app bar; Focus runs from the palette
    // (and the canvas view toolbar once R1-E14-T02 lands).
    await page.getByRole('button', { name: 'Search ⌘K' }).click();
    await page.locator('[role="combobox"][aria-label="Command palette"]').fill('Focus mode');
    await page.keyboard.press('Enter');

    await expect(page.locator('.vertical-tool-rail')).toBeHidden();
    await expect(page.getByText('FOCUS MODE — Esc to exit', { exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.vertical-tool-rail')).toBeVisible();
  });

  test('account menu offers sign-in for guests', async ({ page }) => {
    await page.getByRole('button', { name: /Account/ }).click();
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();
    // Drop the guest session so LoginScreen doesn't bounce back to dashboard.
    await page.evaluate(() => localStorage.removeItem('archflux:session'));
    await page.getByRole('menuitem', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/.*login/);
  });

  test('connector modal configures and adds a connector', async ({ page }) => {
    await page.goto('/#/living');
    await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();

    await page.getByRole('button', { name: 'Add source' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add source' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Connector name').fill('E2E Kafka');
    await dialog.getByLabel('Connector type').selectOption('OpenAPI');
    await dialog.getByLabel('Connector target').fill('e2e/openapi.yaml');
    await dialog.getByRole('button', { name: 'Save connector' }).click();

    const row = page.locator('.connector-row', { hasText: 'E2E Kafka' });
    await expect(row).toBeVisible();
    await expect(row.getByText('e2e/openapi.yaml (unversioned)', { exact: true })).toBeVisible();
  });

  test('minimap toggles', async ({ page }) => {
    // Sample graph has 9 nodes, so the minimap opens by default on desktop.
    await expect(page.locator('#minimapCanvas')).toBeVisible();
    await page.getByTestId('minimap-toggle').click();
    await expect(page.locator('#minimapCanvas')).toBeHidden();
    await page.getByTestId('minimap-toggle').click();
    await expect(page.locator('#minimapCanvas')).toBeVisible();
  });

  test('minimap never overlaps inspector', async ({ page }) => {
    // R1-E01-T05 / R1-E14-T02: minimap bottom-left above the View toolbar, inspector docked right.
    const map = await page.getByRole('img', { name: 'Minimap overview' }).boundingBox();
    const dock = await page.getByRole('complementary', { name: 'Inspector' }).boundingBox();
    const bar = await page.getByRole('toolbar', { name: 'View' }).boundingBox();
    expect(map && dock && bar).toBeTruthy();
    expect(map!.x + map!.width).toBeLessThanOrEqual(dock!.x);
    expect(map!.y + map!.height).toBeLessThanOrEqual(bar!.y);
    expect(Math.round(map!.x)).toBe(Math.round(bar!.x));
  });

  test('multi-document management', async ({ page }) => {
    await page.goto('/#/dashboard');
    await page.getByRole('button', { name: /Table/ }).click();
    await expect(page.getByRole('table', { name: 'Diagrams table' })).toBeVisible();

    await page.getByRole('button', { name: /New diagram/i }).click();
    await page.getByRole('dialog', { name: 'New diagram' }).getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/.*canvas/);

    // New docs persist on a 300ms debounce — wait for the write before
    // reloading (goto performs a full page load).
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const raw = localStorage.getItem('archflux:v2-light');
        return raw != null && raw.includes('untitled');
      });
    }, { timeout: 10000 }).toBe(true);

    await page.goto('/#/dashboard');
    // The Table toggle (R1-E14-T04) is persisted, so the revisit opens in table view.
    await expect(page.getByRole('button', { name: 'Table view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table', { name: 'Diagrams table' })).toBeVisible();

    await expect(page.getByText(/untitled.*\.arch/).first()).toBeVisible();

    await page.getByRole('row', { name: /untitled/ })
      .getByRole('button').first().click();
    await expect(page).toHaveURL(/.*canvas/);
  });
});

test.describe('Error handling and recovery', () => {
  test('canvas renders without error UI', async ({ page }) => {
    await seedSampleWorkspace(page);
    await page.addInitScript(() => {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
      localStorage.setItem('archflux:onboarded', 'true');
    });
    await page.goto('/#/canvas');
    await expect(page.locator('#architectureCanvas')).toBeVisible({ timeout: 30000 });

    // Neither the React error boundary nor the no-2d-context fallback shows
    await expect(page.getByTestId('error-boundary-title')).toBeHidden();
    await expect(page.getByRole('alert')).toBeHidden();
  });
});
