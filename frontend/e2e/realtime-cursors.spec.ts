import { test, expect, type Browser, type Page } from '@playwright/test';
import { activeDoc, signInAs } from './fixtures';

// R1-BUG-17: two signed-in users on one cloud diagram. A moves the pointer over the canvas; B's
// canvas reports a remote cursor (data-remote-cursors, derived from the awareness store, not pixels).
// Needs the archflux-qa stack: E2E_PORT=5191 VITE_DEV_API_PROXY=http://localhost:23001.

async function newDiagram(page: Page, name: string, style: 'Icon' | 'Card' | 'Shape') {
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'New diagram' }).first().click();
  await page.getByRole('radio', { name: style }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByTestId('canvas-status')).toBeAttached();
  await expect(page).toHaveURL(/#\/canvas/);
}

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A fresh signed-in browser context (one real user session on the qa backend). */
async function userPage(browser: Browser, baseURL: string | undefined, email: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await signInAs(page, email);
  return page;
}

/** Owner side of a share: a cloud-saved two-element diagram, and `invitee` added to the workspace. */
async function ownerWithSharedDiagram(browser: Browser, baseURL: string | undefined, owner: string, invitee: string) {
  const a = await userPage(browser, baseURL, owner);
  await newDiagram(a, 'Shared plan', 'Card');
  await a.locator('[data-tool="service"]').click();
  await a.mouse.click(300, 300);
  await a.locator('[data-tool="db"]').click();
  await a.mouse.click(600, 300);
  await a.getByRole('button', { name: 'Share', exact: true }).click();
  await a.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(a.getByLabel('Add people, teams or emails')).toBeVisible();
  const diagramId = (await activeDoc(a)).id;
  // Workspace membership first (Share needs it): invite through Settings, then accept as the invitee.
  await a.getByRole('button', { name: 'Close', exact: true }).click();
  await a.goto('/#/settings/team');
  await a.getByRole('button', { name: 'Invite people' }).click();
  await a.getByLabel('Invite emails').fill(invitee);
  // The real invite response carries the one-time token (the email is mocked in QA).
  const created = a.waitForResponse((r) => r.url().includes('/workspaces/current/invites') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Send invites' }).click();
  const token = ((await (await created).json()) as { data: { token: string } }).data.token;
  await expect(a.getByText(invitee).first()).toBeVisible();
  return { a, diagramId, token };
}


test('R1-BUG-17 live cursor: B sees A move over a shared cloud diagram', async ({ browser, baseURL }) => {
  const id = stamp();
  const emailA = `rt-a-${id}@example.com`;
  const emailB = `rt-b-${id}@example.com`;
  const b = await userPage(browser, baseURL, emailB);
  await b.goto('/#/home');
  const { a, diagramId, token } = await ownerWithSharedDiagram(browser, baseURL, emailA, emailB);

  const accepted = b.waitForResponse((r) => r.url().includes('/invites/') && r.url().endsWith('/accept') && r.request().method() === 'POST' && r.ok());
  await b.goto(`/#/invite/${token}`);
  await accepted;
  await expect(b).toHaveURL(/#\/dashboard/);

  await a.goto('/#/canvas');
  await a.getByRole('button', { name: 'Share', exact: true }).click();
  await a.getByLabel('Add people, teams or emails').fill(emailB);
  await a.keyboard.press('Enter');
  await a.getByLabel('Role for new people').selectOption({ label: 'Can edit' });
  await a.getByRole('button', { name: 'Invite' }).click();
  await expect(a.getByRole('combobox', { name: new RegExp(`^Role for ${emailB.split('@')[0]}`) })).toHaveValue('editor');
  await a.getByRole('button', { name: 'Close', exact: true }).click();

  // Both sockets must really be open on the relay (no mocks): wait for the handshake on B.
  const bSocket = b.waitForEvent('websocket', (w) => w.url().includes(`/ws/diagram-${diagramId}`));
  await b.goto(`/#/d/${diagramId}`);
  await expect(b.getByTestId('canvas-status')).toBeAttached({ timeout: 20000 });
  await bSocket;

  const canvasA = (await a.locator('#architectureCanvas').boundingBox())!;
  const canvasB = b.getByTestId('canvas-status');
  await expect(canvasB).toHaveAttribute('data-remote-cursors', '0');
  // Presence first: each side lists the other ("Live 2").
  await expect(b.getByRole('tab', { name: /^Live 2/ })).toBeVisible({ timeout: 20000 });

  // A moves the pointer across the canvas until B reports the cursor.
  await expect.poll(async () => {
    await a.mouse.move(canvasA.x + 200, canvasA.y + 200);
    await a.mouse.move(canvasA.x + 260, canvasA.y + 240, { steps: 4 });
    return canvasB.getAttribute('data-remote-cursors');
  }, { timeout: 20000 }).toBe('1');

  // Leaving the canvas clears it again.
  await a.mouse.move(2, 2);
  await expect(canvasB).toHaveAttribute('data-remote-cursors', '0', { timeout: 10000 });
});
