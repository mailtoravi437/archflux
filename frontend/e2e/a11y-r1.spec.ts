import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { guestSession, seedSampleWorkspace, signInAs, activeDoc } from './fixtures';

// R1-E13-T03: axe (wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice off) on every R1 route and dialog
// at 1440x900 and 390x844, plus a keyboard-only editing script. Chromium.

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = r.violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  console.log(`AXE ${label}: ${r.violations.length} violation(s), ${r.violations.reduce((a, v) => a + v.nodes.length, 0)} node(s)${summary.length ? '\n  ' + summary.join('\n  ') : ''}`);
  return r.violations;
}

for (const size of SIZES) {
  test.describe(`axe @ ${size.name} ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test.beforeEach(async ({ page }) => { await guestSession(page); await seedSampleWorkspace(page); });

    const routes = ['/home', '/dashboard', '/trash', '/canvas', '/reviews', '/living', '/blueprints', '/history',
      '/settings/general', '/settings/connectors', '/settings/team', '/settings/storage'];
    for (const route of routes) {
      test(`route ${route}`, async ({ page }) => {
        await page.goto(`/#${route}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        expect(await scan(page, `${size.name} ${route}`)).toEqual([]);
      });
    }

    test('route /login and /onboarding (no session)', async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ baseURL, viewport: size });
      const page = await ctx.newPage();
      await page.goto('/login'); await page.waitForTimeout(500);
      const a = await scan(page, `${size.name} /login`);
      await page.goto('/onboarding'); await page.waitForTimeout(500);
      const b = await scan(page, `${size.name} /onboarding`);
      expect([...a, ...b]).toEqual([]);
    });

    test('canvas with a selection and the inspector open', async ({ page }) => {
      await page.goto('/canvas');
      await expect(page.getByTestId('canvas-status')).toBeAttached();
      await page.getByRole('button', { name: /^Microservice|^Client Gateway|Client Gateway/ }).first().click().catch(() => undefined);
      await page.waitForTimeout(400);
      expect(await scan(page, `${size.name} canvas+selection`)).toEqual([]);
    });

    test('canvas dialogs: shapes panel, export, import, share, icon picker', async ({ page }) => {
      await page.goto('/canvas');
      await expect(page.getByTestId('canvas-status')).toBeAttached();
      const found: unknown[] = [];
      // Shapes panel (non-modal).
      const rail = page.getByRole('button', { name: /Shapes library/ });
      if (await rail.isVisible()) { await rail.click(); found.push(...await scan(page, `${size.name} shapes panel`)); await rail.click(); }
      // Export dialog.
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByRole('menuitem', { name: /Export/ }).click();
      await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
      found.push(...await scan(page, `${size.name} export dialog`));
      await page.keyboard.press('Escape');
      // Share dialog (guest: "Save to cloud" state).
      const share = page.getByRole('button', { name: 'Share', exact: true });
      if (await share.isVisible()) {
        await share.click();
        await expect(page.getByRole('dialog', { name: /^Share/ })).toBeVisible();
        found.push(...await scan(page, `${size.name} share dialog (local doc)`));
        await page.keyboard.press('Escape');
      } else {
        console.log(`AXE ${size.name} share dialog: not scanned, the Share button is not visible at this width`);
      }
      // Import dialog from Home.
      await page.goto('/home');
      await page.getByRole('button', { name: 'Import', exact: true }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      found.push(...await scan(page, `${size.name} import dialog`));
      expect(found).toEqual([]);
    });
  });
}

test.describe('axe on server-backed states (signed in)', () => {
  test('access states, share dialog with people, library with folder', async ({ page }) => {
    await signInAs(page, `a11y-${Date.now().toString(36)}@example.com`);
    await page.goto('/home');
    await page.getByRole('button', { name: 'New diagram' }).first().click();
    await page.getByLabel('Name').fill('A11y plan');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Save to cloud' }).click();
    await expect(page.getByLabel('Add people, teams or emails')).toBeVisible();
    const found = [...await scan(page, 'signed-in share dialog')];
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const id = (await activeDoc(page)).id;
    await page.goto(`/d/${id}`); await page.waitForTimeout(1500);
    found.push(...await scan(page, '/d/:id state ok'));
    await page.goto('/d/00000000-0000-0000-0000-000000000000'); await page.waitForTimeout(1500);
    found.push(...await scan(page, '/d/:id state not_found'));
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'New folder' }).click();
    found.push(...await scan(page, 'new folder dialog'));
    expect(found).toEqual([]);
  });
});

test('keyboard only: create, move, rename, context menu style', async ({ page }) => {
  await guestSession(page);
  await page.goto('/home');
  await page.getByRole('button', { name: 'New diagram' }).first().click();
  await page.keyboard.type('Keys only');
  await page.keyboard.press('Enter');                 // form submit: Create
  await expect(page.getByTestId('canvas-status')).toBeAttached();
  const count = async () => Number(await page.getByTestId('canvas-status').getAttribute('data-nodes'));
  await page.locator('body').focus();
  // Create two elements from the Shapes panel: focus the rail button, Enter, then Enter on each shape.
  await page.getByRole('button', { name: /Shapes library/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Service element' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Database element' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(count, { message: 'elements created by keyboard' }).toBe(2);
  await page.getByRole('button', { name: /Shapes library/ }).focus();
  await page.keyboard.press('Enter'); // close the panel
  // Select the first node from the node list (the keyboard route into the canvas), nudge it with arrows.
  const nodeBtns = page.getByRole('navigation', { name: 'Diagram nodes and routes' }).getByRole('button');
  await nodeBtns.first().focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  // Rename via Enter on the selected node (inline editor).
  await page.locator('#architectureCanvas').focus(); // canvas-level keys (Enter renames the selection)
  await page.keyboard.press('Enter');
  const input = page.getByTestId('inline-editor').locator('input').first();
  await expect(input).toBeVisible();
  await page.keyboard.type('Orders');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await activeDoc(page)).nodes.some((n) => n.label === 'Orders')).toBe(true);
  // Context menu by keyboard (Shift+F10): change style to Icon.
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Icon', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await activeDoc(page)).nodes.find((n) => n.label === 'Orders')?.displayStyle).toBe('icon');
  // Align: select all with Ctrl+A, open the context menu, Align > Left. Both elements end on one x.
  await page.locator('#architectureCanvas').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Align' }).focus();
  await page.keyboard.press('ArrowRight');
  const left = page.getByRole('menuitem', { name: 'Align left' });
  await expect(left).toBeVisible();
  await left.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => new Set((await activeDoc(page)).nodes.map((n) => n.x)).size).toBe(1);
});

// The connect step of the keyboard script (R1-BUG-08): C arms the selected node, then activating
// another node in the screen-reader list completes the connection.
test('keyboard only: connect two elements', async ({ page }) => {
  await guestSession(page);
  await seedSampleWorkspace(page);
  await page.goto('/canvas');
  const nodeBtns = page.getByRole('navigation', { name: 'Diagram nodes and routes' }).getByRole('button');
  const edges = Number(await page.getByTestId('canvas-status').getAttribute('data-edges'));
  await nodeBtns.last().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('c');
  await nodeBtns.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-edges', String(edges + 1));
});
