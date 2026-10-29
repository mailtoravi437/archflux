import { join } from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { activeDoc, dragNodeTo, guestSession, nodeCentre, seedSampleWorkspace, signInAs } from './fixtures';

// R1-E13-T01: the eight R1 journeys. Real UI, real persisted state, and (J4, J5, J8) the real
// archflux-qa backend on 23001. Dev server: E2E_PORT=5191 VITE_DEV_API_PROXY=http://localhost:23001.

async function newDiagram(page: Page, name: string, style: 'Icon' | 'Card' | 'Shape') {
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'New diagram' }).first().click();
  await page.getByRole('radio', { name: style }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByTestId('canvas-status')).toBeAttached();
  await expect(page).toHaveURL(/#\/canvas/);
}

async function nodeByLabel(page: Page, label: string) {
  await expect.poll(async () => (await activeDoc(page)).nodes.find((n) => n.label === label)?.id).toBeTruthy();
  return (await activeDoc(page)).nodes.find((n) => n.label === label)!;
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

test.describe('R1 journeys', () => {
  test.beforeEach(async ({ page }) => { await guestSession(page); });

  test('J1 create and model', async ({ page }) => {
    await newDiagram(page, 'J1 model', 'Card');
    await expect.poll(async () => (await activeDoc(page)).title).toBe('J1 model');

    // Place a VPC boundary and three AWS-family elements from the Shapes library.
    await page.getByRole('button', { name: /Shapes library/ }).click();
    await page.getByRole('button', { name: 'VPC boundary' }).click();
    for (const el of ['Service element', 'Database element', 'Queue element']) {
      await page.getByRole('button', { name: el }).click();
    }
    await page.getByRole('button', { name: /Shapes library/ }).click(); // close the panel
    await expect.poll(async () => (await activeDoc(page)).nodes.length).toBe(4);

    const vpc = (await activeDoc(page)).nodes.find((n) => n.kind === 'boundary')!;
    expect(vpc.boundaryKind).toBe('vpc');
    const els = ['Service', 'Database', 'Queue'];
    // Library placement staggers elements 16 px apart, so each starts overlapped. Drag each into its
    // own slot inside the VPC (drop-in containment). Order and grab points keep every grab on the
    // element that is meant to move: Service by its exposed corner (12 px in, clear of the 8 px port zone), Queue (top) anywhere, then Database.
    const centre = await nodeCentre(page, vpc.id);
    const slot = (i: number) => ({ x: centre.x, y: centre.y - 80 + i * 80 });
    // A selected element's floating toolbar can cover the next grab point, so deselect first.
    const deselect = () => page.mouse.click(880, 140);
    await deselect();
    await dragNodeTo(page, (await nodeByLabel(page, 'Service')).id, slot(0), { x: -88, y: -28 });
    await deselect();
    await dragNodeTo(page, (await nodeByLabel(page, 'Queue')).id, slot(2));
    await deselect();
    await dragNodeTo(page, (await nodeByLabel(page, 'Database')).id, slot(1));
    await expect.poll(async () => {
      const d = await activeDoc(page);
      return els.map((l) => d.nodes.find((n) => n.label === l)?.parentId);
    }).toEqual([vpc.id, vpc.id, vpc.id]);

    // Connect them: Connect tool, click the source, click the target.
    const a = await nodeByLabel(page, 'Service');
    const b = await nodeByLabel(page, 'Database');
    const c = await nodeByLabel(page, 'Queue');
    for (const [from, to] of [[a, b], [b, c]] as const) {
      await page.getByRole('button', { name: /^Connect/ }).click();
      const p1 = await nodeCentre(page, from.id);
      await page.mouse.click(p1.x - 40, p1.y);
      const p2 = await nodeCentre(page, to.id);
      await page.mouse.click(p2.x - 40, p2.y);
    }
    await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-edges', '2');

    // Switch one element to Icon style.
    await deselect();
    const p = await nodeCentre(page, a.id);
    await page.mouse.click(p.x - 40, p.y);
    await page.getByRole('tab', { name: 'Inspector' }).click();
    await page.getByRole('radio', { name: 'Icon' }).last().click();
    await expect.poll(async () => (await activeDoc(page)).nodes.find((n) => n.id === a.id)?.displayStyle).toBe('icon');
    expect((await activeDoc(page)).nodes.find((n) => n.id === a.id)?.label).toBe('Service');

    // Rename inline (double-click, type, Enter), then one undo reverts only the rename.
    // Icon style draws the 64 px tile (a click on it opens the icon picker) with the name under it,
    // so double-click the name line below the tile.
    const ai = (await activeDoc(page)).nodes.find((n) => n.id === a.id)!;
    const pi = await nodeCentre(page, a.id);
    await page.mouse.dblclick(pi.x, pi.y + ai.h / 2 + 12);
    const editor = page.getByTestId('inline-editor');
    const nameInput = editor.locator('input').first(); // the wrapper itself has no box; its inputs do
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Orders API');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await activeDoc(page)).nodes.find((n) => n.id === a.id)?.label).toBe('Orders API');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await activeDoc(page)).nodes.find((n) => n.id === a.id)?.label).toBe('Service');
    // The style switch and containment from earlier steps survive the single undo.
    const after = await activeDoc(page);
    expect(after.nodes.find((n) => n.id === a.id)?.displayStyle).toBe('icon');
    expect(after.nodes.find((n) => n.id === a.id)?.parentId).toBe(vpc.id);
  });

  test('J2 pages and layers', async ({ page }) => {
    await seedSampleWorkspace(page);
    await page.goto('/#/canvas');
    await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-nodes', '9');
    const deselect = () => page.mouse.click(930, 600);

    // Add page 2, then return to page 1.
    await page.getByRole('button', { name: 'Add page' }).click();
    await expect.poll(async () => (await activeDoc(page)).pages?.length).toBe(2);
    await page.getByRole('tab', { name: /Page 1/ }).click();
    await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-nodes', '9');

    // Move two elements to page 2: select both, context menu, Move to page.
    await deselect();
    const c1 = await nodeCentre(page, 'order');
    // Shift+click both. A plain click then Shift+click drops the first element from the selection
    // (R1-BUG-05), so the journey starts the multi-selection with Shift.
    const c2 = await nodeCentre(page, 'payment');
    await page.keyboard.down('Shift');
    await page.mouse.click(c1.x, c1.y);
    await page.mouse.click(c2.x, c2.y);
    await page.keyboard.up('Shift');
    await page.mouse.click(c2.x, c2.y, { button: 'right' });
    // Drive the submenu by keyboard (Right arrow, Enter). A pointer click on "Page 2" timed out as "not
    // stable" in Firefox and WebKit (cause not investigated), while Chromium was fine.
    await page.getByRole('menuitem', { name: 'Move to page' }).focus();
    await page.keyboard.press('ArrowRight');
    const toPage2 = page.getByRole('menuitem', { name: /Page 2/ });
    await expect(toPage2).toBeVisible();
    await toPage2.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-nodes', '7');
    const doc = await activeDoc(page);
    const page2 = doc.pages![1].id;
    const onPage = (id: string) => doc.nodes.find((n) => n.id === id)?.pageId;
    expect(onPage('order')).toBe(page2);
    expect(onPage('payment')).toBe(page2);
    // Page 1 no longer holds either moved element; the other seven stay on page 1.
    const page1 = doc.pages![0].id;
    const onPage1 = doc.nodes.filter((n) => (n.pageId ?? page1) === page1).map((n) => n.id);
    expect(onPage1).not.toContain('order');
    expect(onPage1).not.toContain('payment');
    expect(onPage1).toHaveLength(7);

    // Layers: add a layer, name it "network", put Kafka on it, hide it.
    await page.getByRole('button', { name: /^Layers/ }).click();
    const layers = page.getByRole('region', { name: 'Layers' });
    await layers.getByRole('button', { name: 'Add layer' }).click();
    await expect.poll(async () => (await activeDoc(page)).layers?.length).toBe(2);
    const added = (await activeDoc(page)).layers![1];
    await layers.getByRole('listitem').filter({ hasNotText: 'Default' }).first().getByText(added.name).dblclick();
    await layers.getByRole('textbox', { name: 'Rename layer' }).fill('network');
    await page.keyboard.press('Enter');
    await expect(layers.getByLabel('network layer')).toBeVisible();
    await deselect();
    const ck = await nodeCentre(page, 'kafka');
    await page.mouse.click(ck.x, ck.y);
    if (!(await layers.isVisible())) await page.getByRole('button', { name: /^Layers/ }).click();
    await page.getByRole('button', { name: 'Move selection to network' }).click();
    await page.getByRole('button', { name: 'Hide network' }).click();
    await expect.poll(async () => (await activeDoc(page)).layers?.find((l) => l.name === 'network')?.visible).toBe(false);
    expect((await activeDoc(page)).nodes.find((n) => n.id === 'kafka')?.layerId).toBe(added.id);

    // Export the current page as PNG: the preview and the downloaded file leave out the hidden layer.
    await page.getByRole('button', { name: /^Account/ }).click();
    await page.getByRole('menuitem', { name: /Export/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'PNG Up to 3×' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('radio', { name: 'This page' }).click();
    const previewText = async () => {
      const src = await dialog.getByRole('img', { name: /Preview of/ }).getAttribute('src');
      return decodeURIComponent(src ?? '');
    };
    const hiddenOff = await previewText();
    expect(hiddenOff).toContain('Client Gateway');
    expect(hiddenOff).not.toContain('Kafka Event Mesh');
    expect(hiddenOff).not.toContain('Order Service'); // moved to page 2
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: /Export PNG/ }).click(),
    ]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const png = readFileSync(path!);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // Opting in to hidden layers brings Kafka back into the preview, so the exclusion is real.
    await dialog.getByLabel('Hidden layers').check();
    expect(await previewText()).toContain('Kafka Event Mesh');
  });

  test('J3 library: folder, move, star, trash, restore', async ({ page }) => {
    await signInAs(page, `j3-${Date.now()}@example.com`);
    // A first diagram, so trashing the second never empties the library.
    await newDiagram(page, 'Quarterly plan', 'Card');
    await page.goto('/#/dashboard');
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByLabel('Folder name').fill('Clients');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('treeitem', { name: 'Clients' })).toBeVisible();

    const doc = page.getByRole('link', { name: /^Quarterly plan/ });
    await page.getByRole('button', { name: 'Options for Quarterly plan' }).click();
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Clients' }).click();
    await page.getByRole('button', { name: 'Star Quarterly plan' }).click();

    // The doc is now in the folder and starred.
    await page.getByRole('treeitem', { name: 'Clients' }).click();
    await expect(doc).toBeVisible();
    await page.getByRole('link', { name: 'Starred' }).click();
    await expect(doc).toBeVisible();

    // Trash it: it leaves the library views and shows up in Trash.
    await page.getByRole('link', { name: 'All diagrams' }).click();
    await page.getByRole('button', { name: 'Options for Quarterly plan' }).click();
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect(doc).toHaveCount(0);
    await page.getByRole('link', { name: 'Trash' }).click();
    const row = page.getByRole('row', { name: 'Quarterly plan' });
    await expect(row).toBeVisible();

    // Restore: it returns to its folder (and stays starred).
    await page.getByRole('button', { name: 'Restore Quarterly plan' }).click();
    await expect(row).toHaveCount(0);
    await page.goto('/#/dashboard');
    await page.reload(); // the placement must survive a reload, not only live in memory
    await page.getByRole('treeitem', { name: 'Clients' }).click();
    await expect(doc).toBeVisible();
    await page.getByRole('link', { name: 'Starred' }).click();
    await expect(doc).toBeVisible();
  });

  test('J4 share: commenter reads, comments, cannot edit', async ({ browser, baseURL }) => {
    // R1-BUG-06 (fixed by V18): the invitee can accept under the production DB role (archflux_app, RLS on).
    const id = stamp();
    const emailA = `j4-a-${id}@example.com`;
    const emailB = `j4-b-${id}@example.com`;
    const b = await userPage(browser, baseURL, emailB);
    await b.goto('/#/home');
    const { a, diagramId, token } = await ownerWithSharedDiagram(browser, baseURL, emailA, emailB);

    // Opening the invite accepts it; wait for the server to confirm before A shares with B.
    const accepted = b.waitForResponse((r) => r.url().includes('/invites/') && r.url().endsWith('/accept') && r.request().method() === 'POST' && r.ok());
    await b.goto(`/#/invite/${token}`);
    await accepted; // resolves only on a 2xx accept (the first try can 401 before the session refresh)
    await expect(b).toHaveURL(/#\/dashboard/); // accepted: the invite screen hands over to the workspace dashboard

    // A shares the diagram with B as a commenter.
    await a.goto('/#/canvas');
    await a.getByRole('button', { name: 'Share', exact: true }).click();
    await a.getByLabel('Add people, teams or emails').fill(emailB);
    await a.keyboard.press('Enter');
    await a.getByLabel('Role for new people').selectOption({ label: 'Can comment' });
    await a.getByRole('button', { name: 'Invite' }).click();
    await expect(a.getByRole('combobox', { name: new RegExp(`^Role for ${emailB.split('@')[0]}`) })).toHaveValue('commenter');

    // B opens the deep link.
    await b.goto(`/#/d/${diagramId}`);
    await expect(b.getByTestId('canvas-status')).toBeAttached({ timeout: 20000 });
    await expect(b.getByRole('status', { name: 'Access level' })).toContainText('Can comment');
    // No edit tools: the creation tools are gone or disabled, and Delete does nothing.
    for (const tool of ['Service (S)', 'Gateway (G)', 'Database (D)', 'Queue (Q)', 'Connect (C)']) {
      const btn = b.getByRole('button', { name: tool });
      if (await btn.count()) await expect(btn).toBeDisabled();
    }
    const before = Number(await b.getByTestId('canvas-status').getAttribute('data-nodes'));
    expect(before).toBe(2);
    const doc = await activeDoc(b);
    const first = await nodeCentre(b, doc.nodes[0].id);
    await b.mouse.click(first.x, first.y);
    await b.keyboard.press('Delete');
    await expect(b.getByTestId('canvas-status')).toHaveAttribute('data-nodes', '2');

    // B can comment: the rail is hidden for commenters, so use the context menu.
    await b.mouse.click(first.x, first.y, { button: 'right' });
    await b.getByRole('menuitem', { name: 'Comment' }).click();
    const note = `Looks good ${id}`;
    await b.getByLabel('Review comment text').fill(note);
    await b.getByRole('button', { name: /^(Post|Add|Send|Submit)/ }).click();
    // The pin shows on the element and the thread is listed in Review.
    await expect(b.getByRole('link', { name: /^Review 1/ })).toBeVisible();
    await b.getByRole('link', { name: /^Review/ }).click();
    await expect(b.getByText(note).first()).toBeVisible();
  });

  // Part of J5 that can run today: a signed-in user with no relation to the diagram learns nothing.
  test('J5a access: an outsider gets the not-found state and no title', async ({ browser, baseURL }) => {
    const id = stamp();
    const emailA = `j5-a-${id}@example.com`;
    const emailC = `j5-c-${id}@example.com`;
    const c = await userPage(browser, baseURL, emailC);
    await c.goto('/#/home');
    const { diagramId } = await ownerWithSharedDiagram(browser, baseURL, emailA, `j5-x-${id}@example.com`);
    await c.goto(`/#/d/${diagramId}`);
    await expect(c.getByText("We can't open this diagram")).toBeVisible();
    await expect(c.getByText('Shared plan')).toHaveCount(0);
    await expect(c.getByTestId('canvas-status')).toHaveCount(0);
  });

  test('J5 access: request, approve, then view', async ({ browser, baseURL }) => {
    const id = stamp();
    const emailA = `j5-a-${id}@example.com`;
    const emailC = `j5-c-${id}@example.com`;
    const c = await userPage(browser, baseURL, emailC);
    await c.goto('/#/home');
    const { a, diagramId } = await ownerWithSharedDiagram(browser, baseURL, emailA, `j5-x-${id}@example.com`);

    // A creates a share link (the one-time token is only returned at creation).
    const link = await a.request.post(`/api/v1/diagrams/${diagramId}/links`, { data: { role: 'viewer', audience: 'workspace' } }); // a workspace link gives a non-member the request state, not access
    expect(link.ok()).toBeTruthy();
    const shareToken = ((await link.json()) as { data: { token: string } }).data.token;

    // State `request`: C is signed in, holds the link, has no access to this diagram.
    await c.goto(`/#/d/${diagramId}?token=${encodeURIComponent(shareToken)}`);
    const card = c.getByRole('region', { name: 'Request access' });
    await expect(card).toBeVisible();
    await expect(c.getByTestId('canvas-status')).toHaveCount(0);
    await card.getByLabel('Access level').selectOption({ label: 'Request to view' });
    await card.getByRole('button', { name: /^Request/ }).click();
    await expect(c.getByRole('status').filter({ hasText: 'Request sent' })).toBeVisible();

    // A approves through the API.
    const pending = await a.request.get('/api/v1/access-requests?status=pending');
    const rows = ((await pending.json()) as { data: Array<{ id: string }> }).data;
    expect(rows.length).toBeGreaterThan(0);
    expect((await a.request.post(`/api/v1/access-requests/${rows[0].id}/approve`, { data: {} })).ok()).toBeTruthy();

    // State `ok`: the diagram opens, view only.
    await c.goto(`/#/d/${diagramId}`);
    await c.reload();
    await expect(c.getByTestId('canvas-status')).toBeAttached({ timeout: 20000 });
    await expect(c.getByRole('status', { name: 'Access level' })).toContainText('View only');
  });

  test('J6 import: draw.io preview, warnings, import as new', async ({ page }) => {
    await page.goto('/#/home');
    await page.getByRole('button', { name: 'Import', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    // The draw.io fixture: 2 pages, 6 elements, 5 connections, 1 boundary, and 2 skipped (the image and the edge that pointed at it).
    await dialog.getByLabel('Choose a file to import').setInputFiles(join(process.cwd(), 'src/tests/fixtures/drawio/two-page.drawio'));
    await expect(dialog.getByText('2 pages · 6 elements · 5 connections · 1 boundary · 2 skipped')).toBeVisible();
    // Warnings are shown, not hidden: the skipped image and its dangling edge.
    await expect(dialog.getByText('2 warnings')).toBeVisible();
    await dialog.getByRole('button', { name: 'Show warnings' }).click();
    const warnings = dialog.getByRole('list', { name: 'Import warnings' });
    await expect(warnings.getByRole('listitem')).toHaveCount(2);
    await expect(warnings).toContainText('e5');
    await expect(dialog.getByRole('img', { name: 'Import preview' })).toBeVisible();
    // Import as a new diagram: the doc has what the preview promised.
    await dialog.getByRole('button', { name: 'Import as new diagram' }).click();
    await expect(page.getByTestId('canvas-status')).toBeAttached();
    await expect.poll(async () => (await activeDoc(page)).title).toBe('two-page');
    const doc = await activeDoc(page);
    expect(doc.pages?.map((p) => p.name)).toEqual(['Overview', 'Details']);
    // "6 elements · 1 boundary" in the preview means 6 elements plus the boundary in the doc.
    expect(doc.nodes.filter((n) => n.kind !== 'boundary')).toHaveLength(6);
    expect(doc.nodes.filter((n) => n.kind === 'boundary')).toHaveLength(1);
    expect(doc.edges).toHaveLength(5);
  });

  test('J7 history: name a version, compare, revert one change', async ({ page }) => {
    await signInAs(page, `j7-${stamp()}@example.com`);
    await newDiagram(page, 'History plan', 'Card');
    await page.locator('[data-tool="service"]').click();
    await page.mouse.click(300, 300);
    await page.locator('[data-tool="db"]').click();
    await page.mouse.click(600, 300);
    // First save: a local diagram goes to the server through Share, then saves are versioned.
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Save to cloud' }).click();
    await expect(page.getByLabel('Add people, teams or emails')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Status: Saved/ })).toBeVisible();
    const save = async () => {
      await page.getByRole('button', { name: /^Status/ }).click();
      await page.getByRole('menuitem', { name: /^Save/ }).click();
      await expect(page.getByRole('button', { name: /^Status: Saved v\d+/ })).toBeVisible();
    };

    // Name the baseline version.
    await page.getByRole('tab', { name: 'History' }).click();
    await page.getByRole('button', { name: /^Name this version/ }).first().click();
    await page.getByLabel('Version name').fill('Baseline');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('listitem', { name: /Baseline/ })).toBeVisible();

    // Two edits after the baseline: rename each element in the Inspector.
    const rename = async (from: string, to: string) => {
      const n = (await activeDoc(page)).nodes.find((m) => m.label === from)!;
      const c = await nodeCentre(page, n.id);
      await page.mouse.click(c.x - 40, c.y);
      await page.getByRole('tab', { name: 'Inspector' }).click();
      const label = page.getByRole('textbox').first();
      await label.fill(to);
      await label.blur();
      await expect.poll(async () => (await activeDoc(page)).nodes.some((m) => m.label === to)).toBe(true);
    };
    await rename('Microservice 1', 'Orders API');
    await rename('Database 1', 'Orders DB');
    await save();

    // Compare Baseline with the current version, then revert only the first change.
    await page.getByRole('tab', { name: 'History' }).click();
    await page.getByRole('button', { name: /^Compare Baseline with current/ }).click();
    // The panel opens the full History screen; pick the version there again (E08-T04 note).
    await expect(page).toHaveURL(/#\/history/);
    await page.getByRole('button', { name: /^Compare Baseline with current/ }).click();
    const compare = page.getByRole('region', { name: 'Compare versions' });
    await expect(compare).toBeVisible();
    await expect(compare.getByRole('button', { name: /^Revert this change/ })).toHaveCount(2);
    await compare.getByRole('button', { name: /^Revert this change.*Orders API/ }).click();
    await page.keyboard.press('Escape');

    await expect.poll(async () => (await activeDoc(page)).nodes.map((n) => n.label).sort()).toEqual(['Microservice 1', 'Orders DB']);
  });

  test('J8 limits: the 4th cloud diagram stays local and the limit dialog shows', async ({ page }) => {
    await signInAs(page, `j8-${stamp()}@example.com`);
    // A fresh workspace is on the free plan: 3 cloud diagrams.
    const saveToCloud = async () => {
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByRole('button', { name: 'Save to cloud' }).click();
    };
    for (let i = 1; i <= 3; i++) {
      await newDiagram(page, `Cloud ${i}`, 'Card');
      await saveToCloud();
      await expect(page.getByLabel('Add people, teams or emails')).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Status: Saved/ })).toBeVisible();
    }
    await newDiagram(page, 'Cloud 4', 'Card');
    await saveToCloud();
    const limit = page.getByRole('dialog', { name: 'Limit reached' });
    await expect(limit).toBeVisible();
    await limit.getByRole('button', { name: 'Keep on this device' }).click();
    // The 4th diagram is still local: no server id, and the status says so.
    await expect(page.getByRole('button', { name: /^Status: Local/ })).toBeVisible();
    const doc = await activeDoc(page);
    expect(doc.title).toBe('Cloud 4');
    expect(doc.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); // server ids are UUIDs; local ids are not
  });
});
