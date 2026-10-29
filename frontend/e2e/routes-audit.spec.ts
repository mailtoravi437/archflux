import { test, expect, type Locator, type Page } from '@playwright/test';
import { blueprintGraph, blueprints } from '../src/data/blueprints';
import { activeDoc, guestSession, readWorkspace, signInAs } from './fixtures';

// R1-E13-T05: routes and templates audit. Every route is loaded as a signed-out visitor, a local
// guest and a signed-in user. Each load must settle, raise no uncaught page error and no console
// error (except the listed noise), show a non-blank main region and the expected heading or
// landmark. Signed-in cases need the archflux-qa backend:
//   E2E_PORT=5191 VITE_DEV_API_PROXY=http://localhost:23001 E2E_QA_REDIS_CONTAINER=<redis> \
//   npx playwright test e2e/routes-audit.spec.ts --project=chromium
// Guest and signed-out cases need no backend (set E2E_AUDIT_GUEST_ONLY=1 to skip signed-in ones).

const SIGNED_IN_ENABLED = !process.env.E2E_AUDIT_GUEST_ONLY;
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Known noise, matched on the URL of the failing request (never on message text alone):
 * - /config.json: optional runtime config; absent on the dev server, handled silently (SERVICES_SPEC 3.1).
 * - /api/v1/auth/me 401: the cookie probe for a visitor with no server session (api.ts `probe`).
 * - the accept call of the deliberately invalid invite token (the screen must show the honest error).
 */
const KNOWN_NOISE: RegExp[] = [
  /\/config\.json(\?|$)/,
  /\/api\/v1\/auth\/me(\?|$)/,
  // The invite route is opened with a token that does not exist, so the accept call is meant to 404.
  /\/api\/v1\/invites\/not-a-real-token\/accept$/,
];

interface Watch { problems: string[] }
function watch(page: Page): Watch {
  const w: Watch = { problems: [] };
  page.on('pageerror', (e) => w.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location().url;
    if (url && KNOWN_NOISE.some((re) => re.test(url))) return;
    w.problems.push(`console.error: ${m.text().slice(0, 300)} @ ${url}`);
  });
  return w;
}

async function go(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await page.waitForLoadState('domcontentloaded');
}
/** In-app navigation: changes the hash without reloading, so store state survives. */
async function navigateInApp(page: Page, path: string) {
  await page.evaluate((p) => { window.location.hash = p; }, path);
}
const hashOf = (page: Page) => new URL(page.url()).hash.slice(1);

type Mode = 'signed-out' | 'guest' | 'signed-in';

interface RouteCase {
  name: string;
  path: string;
  /** Expected final hash path (with query) per mode. */
  lands: Record<Mode, string | RegExp>;
  /** Locator that proves the right screen rendered, per mode. */
  ready: Record<Mode, (p: Page) => Locator>;
}

const h1 = (name: string | RegExp) => (p: Page) => p.getByRole('heading', { level: 1, name });
const region = (name: string | RegExp) => (p: Page) => p.getByRole('region', { name });
const loginPage = (p: Page) => p.getByRole('region', { name: 'Sign in' }).or(p.getByText('Sign in to ArchFlux').first());
const canvasReady = (p: Page) => p.locator('#architectureCanvas');
const GREETING = /^Good (morning|afternoon|evening)/;

const same = <T,>(v: T): Record<Mode, T> => ({ 'signed-out': v, guest: v, 'signed-in': v });

const ROUTES: RouteCase[] = [
  { name: 'index', path: '/', lands: { 'signed-out': '/login', guest: '/dashboard', 'signed-in': '/home' }, ready: { 'signed-out': loginPage, guest: h1('Library'), 'signed-in': h1(GREETING) } },
  { name: 'dashboard', path: '/dashboard', lands: { 'signed-out': '/login', guest: '/dashboard', 'signed-in': '/dashboard' }, ready: { 'signed-out': loginPage, guest: h1('Library'), 'signed-in': h1('Library') } },
  { name: 'home', path: '/home', lands: { 'signed-out': '/login', guest: '/home', 'signed-in': '/home' }, ready: { 'signed-out': loginPage, guest: h1(GREETING), 'signed-in': h1(GREETING) } },
  { name: 'trash', path: '/trash', lands: { 'signed-out': '/login', guest: '/trash', 'signed-in': '/trash' }, ready: { 'signed-out': loginPage, guest: h1('Trash'), 'signed-in': h1('Trash') } },
  { name: 'canvas', path: '/canvas', lands: { 'signed-out': '/login', guest: '/canvas', 'signed-in': '/canvas' }, ready: { 'signed-out': loginPage, guest: canvasReady, 'signed-in': canvasReady } },
  { name: 'history', path: '/history', lands: { 'signed-out': '/login', guest: '/history', 'signed-in': '/history' }, ready: { 'signed-out': loginPage, guest: (p) => p.getByRole('main').getByText(/checkpoint|version|history/i).first(), 'signed-in': (p) => p.getByRole('main').getByText(/checkpoint|version|history/i).first() } },
  { name: 'living', path: '/living', lands: { 'signed-out': '/login', guest: '/living', 'signed-in': '/living' }, ready: { 'signed-out': loginPage, guest: h1('Sync'), 'signed-in': h1('Sync') } },
  { name: 'reviews', path: '/reviews', lands: { 'signed-out': '/login', guest: '/reviews', 'signed-in': '/reviews' }, ready: { 'signed-out': loginPage, guest: h1('Review'), 'signed-in': h1('Review') } },
  { name: 'git redirect', path: '/git', lands: { 'signed-out': '/login', guest: '/reviews', 'signed-in': '/reviews' }, ready: { 'signed-out': loginPage, guest: h1('Review'), 'signed-in': h1('Review') } },
  { name: 'blueprints', path: '/blueprints', lands: { 'signed-out': '/login', guest: '/blueprints', 'signed-in': '/blueprints' }, ready: { 'signed-out': loginPage, guest: h1('Blueprints'), 'signed-in': h1('Blueprints') } },
  { name: 'settings redirect', path: '/settings', lands: { 'signed-out': '/login', guest: '/settings/general', 'signed-in': '/settings/general' }, ready: { 'signed-out': loginPage, guest: h1('Settings'), 'signed-in': h1('Settings') } },
  { name: 'settings general', path: '/settings/general', lands: { 'signed-out': '/login', guest: '/settings/general', 'signed-in': '/settings/general' }, ready: { 'signed-out': loginPage, guest: h1('Settings'), 'signed-in': h1('Settings') } },
  { name: 'settings connectors', path: '/settings/connectors', lands: { 'signed-out': '/login', guest: '/settings/connectors', 'signed-in': '/settings/connectors' }, ready: { 'signed-out': loginPage, guest: h1('Settings'), 'signed-in': h1('Settings') } },
  { name: 'settings team', path: '/settings/team', lands: { 'signed-out': '/login', guest: '/settings/team', 'signed-in': '/settings/team' }, ready: { 'signed-out': loginPage, guest: h1('Settings'), 'signed-in': h1('Settings') } },
  { name: 'settings storage', path: '/settings/storage', lands: { 'signed-out': '/login', guest: '/settings/storage', 'signed-in': '/settings/storage' }, ready: { 'signed-out': loginPage, guest: h1('Settings'), 'signed-in': h1('Settings') } },
  { name: 'proposal redirect', path: '/proposal', lands: { 'signed-out': '/login', guest: '/canvas', 'signed-in': '/canvas' }, ready: { 'signed-out': loginPage, guest: canvasReady, 'signed-in': canvasReady } },
  { name: 'shared link /d/:id', path: '/d/00000000-0000-0000-0000-000000000000', lands: { 'signed-out': /^\/login\?next=%2Fd%2F0{8}-/, guest: /^\/login\?next=%2Fd%2F0{8}-/, 'signed-in': /^\/d\/0{8}-/ }, ready: { 'signed-out': loginPage, guest: loginPage, 'signed-in': (p) => p.getByText(/can.t open this diagram/i).first() } },
  // A signed-out visitor keeps the invite and is sent to sign in (R1-E11-T03); the others see the invite screen.
  { name: 'invite', path: '/invite/not-a-real-token', lands: { 'signed-out': '/login', guest: '/invite/not-a-real-token', 'signed-in': '/invite/not-a-real-token' }, ready: { 'signed-out': loginPage, guest: h1('Workspace invite'), 'signed-in': h1('Workspace invite') } },
  { name: 'login', path: '/login', lands: { 'signed-out': '/login', guest: '/dashboard', 'signed-in': '/dashboard' }, ready: { 'signed-out': loginPage, guest: h1('Library'), 'signed-in': h1('Library') } },
  { name: 'onboarding', path: '/onboarding', lands: same('/onboarding'), ready: { 'signed-out': (p) => p.getByText('ArchFlux setup'), guest: (p) => p.getByText('ArchFlux setup'), 'signed-in': (p) => p.getByRole('heading', { name: /Welcome|Create a new workspace|ArchFlux setup/ }).or(p.getByText('ArchFlux setup')).first() } },
  { name: 'auth callback', path: '/auth/callback', lands: { 'signed-out': '/login?error=unauthorized', guest: '/dashboard', 'signed-in': '/canvas' }, ready: { 'signed-out': (p) => p.getByText('Sign-in failed: unauthorized'), guest: h1('Library'), 'signed-in': canvasReady } },
  { name: 'unknown path', path: '/definitely/not/a/page', lands: { 'signed-out': '/login', guest: '/definitely/not/a/page', 'signed-in': '/definitely/not/a/page' }, ready: { 'signed-out': loginPage, guest: region('Not found'), 'signed-in': region('Not found') } },
];

/** Routes where no shell `<main>` exists (standalone screens): the body must carry the content. */
const STANDALONE = new Set(['/login', '/onboarding', '/invite/not-a-real-token']);

async function assertNotBlank(page: Page, c: RouteCase, mode: Mode) {
  const landed = hashOf(page);
  const standalone = mode === 'signed-out' || STANDALONE.has(c.path) || landed.startsWith('/login') || landed.startsWith('/invite') || landed.startsWith('/onboarding');
  const scope = standalone ? page.locator('body') : page.getByRole('main').first();
  const text = (await scope.innerText()).trim();
  const hasCanvas = (await page.locator('#architectureCanvas').count()) > 0;
  expect(text.length > 0 || hasCanvas, `main region is blank on ${c.path} (${mode})`).toBe(true);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

function runRoutes(mode: Mode, prepare: (page: Page) => Promise<void>) {
  for (const c of ROUTES) {
    test(`${mode}: ${c.name} (${c.path})`, async ({ page }) => {
      test.skip(mode === 'signed-in' && !SIGNED_IN_ENABLED, 'guest-only run');
      await prepare(page);
      const w = watch(page);
      await go(page, c.path);
      await expect(c.ready[mode](page).first(), `${c.path} did not render its expected screen as ${mode}`).toBeVisible({ timeout: 20000 });
      await settle(page);
      const want = c.lands[mode];
      if (typeof want === 'string') expect(hashOf(page)).toBe(want);
      else expect(hashOf(page)).toMatch(want);
      await assertNotBlank(page, c, mode);
      expect(w.problems, `console/page errors on ${c.path} as ${mode}`).toEqual([]);
    });
  }
}

test.describe('routes audit: signed out', () => {
  runRoutes('signed-out', async (page) => {
    await page.addInitScript(() => localStorage.setItem('archflux:onboarded', 'true'));
  });
});

test.describe('routes audit: local guest', () => {
  runRoutes('guest', guestSession);
});

test.describe('routes audit: signed in', () => {
  test.describe.configure({ mode: 'parallel' });
  test('signed-in: an invalid invite says so', async ({ page }) => {
    test.skip(!SIGNED_IN_ENABLED, 'guest-only run');
    await signInAs(page, `audit-invite-${stamp()}@example.com`);
    await go(page, '/invite/not-a-real-token');
    await expect(page.getByRole('alert')).toContainText('no longer valid');
  });
  runRoutes('signed-in', async (page) => {
    await signInAs(page, `audit-routes-${stamp()}@example.com`);
  });
});

// ---------------------------------------------------------------------------
// Templates end to end
// ---------------------------------------------------------------------------

const BUILT_IN = blueprints[0];
const BUILT_IN_GRAPH = blueprintGraph(BUILT_IN.id);

async function newBlankDiagram(page: Page, name: string) {
  await go(page, '/home');
  await page.getByRole('button', { name: 'New diagram' }).first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/#\/canvas/);
  await expect(page.locator('#architectureCanvas')).toBeVisible();
}

async function placeElements(page: Page, n: number) {
  // Alternate tools: the active tool stays armed after a placement, so a second click on the
  // same tool button would only disarm it.
  const tools = ['service', 'db', 'queue'];
  for (let i = 0; i < n; i++) {
    await page.locator(`[data-tool="${tools[i % tools.length]}"]`).click();
    await page.mouse.click(260 + i * 260, 300);
  }
  await expect.poll(async () => (await activeDoc(page)).nodes.length).toBe(n);
}

test.describe('templates: built-in (guest)', () => {
  test.beforeEach(async ({ page }) => { await guestSession(page); });

  test('the Blueprints card counts match the real graph, and every card is present', async ({ page }) => {
    const w = watch(page);
    await go(page, '/blueprints');
    await expect(page.getByRole('heading', { level: 1, name: 'Blueprints' })).toBeVisible();
    for (const b of blueprints) {
      const g = blueprintGraph(b.id);
      const card = page.locator('.blueprint-card', { hasText: b.title }).first();
      await expect(card, `card for ${b.title}`).toBeVisible();
      await expect(card.getByText(`${g.nodes.length}n • ${g.edges.length}e`)).toBeVisible();
      expect(g.nodes.length, `${b.title} has nodes`).toBeGreaterThan(0);
    }
    expect(w.problems).toEqual([]);
  });

  test('Insert puts the blueprint nodes next to the existing canvas content', async ({ page }) => {
    const w = watch(page);
    await newBlankDiagram(page, 'Insert target');
    await placeElements(page, 1);
    await navigateInApp(page, '/blueprints');
    const card = page.locator('.blueprint-card', { hasText: BUILT_IN.title }).first();
    await card.getByRole('button', { name: 'Insert', exact: true }).click();
    // Unsaved changes ask first; the confirm keeps them.
    const confirm = page.getByRole('alertdialog', { name: 'Replace canvas' });
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Insert', exact: true }).click();
    await expect(page).toHaveURL(/#\/canvas/);
    await expect.poll(async () => (await activeDoc(page)).nodes.length).toBe(1 + BUILT_IN_GRAPH.nodes.length);
    const doc = await activeDoc(page);
    expect(doc.title).toBe('Insert target');
    const labels = doc.nodes.map((n) => n.label);
    for (const n of BUILT_IN_GRAPH.nodes) expect(labels, `node ${n.label} inserted`).toContain(n.label);
    expect(doc.edges.length).toBe(BUILT_IN_GRAPH.edges.length);
    expect(w.problems).toEqual([]);
  });

  test('Load to Canvas replaces the canvas with exactly the blueprint', async ({ page }) => {
    await newBlankDiagram(page, 'Load target');
    await placeElements(page, 2);
    await navigateInApp(page, '/blueprints');
    const card = page.locator('.blueprint-card', { hasText: BUILT_IN.title }).first();
    await card.getByRole('button', { name: 'Load to Canvas' }).click();
    await page.getByRole('alertdialog', { name: 'Replace canvas' }).getByRole('button', { name: 'Replace', exact: true }).click();
    await expect(page).toHaveURL(/#\/canvas/);
    await expect.poll(async () => (await activeDoc(page)).nodes.length).toBe(BUILT_IN_GRAPH.nodes.length);
    expect((await activeDoc(page)).nodes.map((n) => n.label).sort()).toEqual(BUILT_IN_GRAPH.nodes.map((n) => n.label).sort());
  });

  test('New diagram, Templates tab: creates a titled diagram that opens with the template nodes', async ({ page }) => {
    const w = watch(page);
    await go(page, '/home');
    const before = (await readWorkspace(page)).docs.length;
    await page.getByRole('button', { name: 'New diagram' }).first().click();
    await page.getByRole('tab', { name: 'Templates' }).click();
    // Scope to the dialog: the Home page behind it has template cards with the same names.
    await page.getByRole('dialog', { name: 'New diagram' }).getByRole('button', { name: new RegExp(`^${BUILT_IN.title}`) }).click();
    await expect(page).toHaveURL(/#\/canvas/);
    await expect(page.locator('#architectureCanvas')).toBeVisible();
    await expect.poll(async () => (await activeDoc(page)).nodes.length).toBe(BUILT_IN_GRAPH.nodes.length);
    const doc = await activeDoc(page);
    expect(doc.title).toBe(`${BUILT_IN.title}.arch`);
    expect(doc.edges.length).toBe(BUILT_IN_GRAPH.edges.length);
    expect((await readWorkspace(page)).docs.length).toBe(before + 1);
    expect(w.problems).toEqual([]);
  });

  test('Library sidebar Templates opens Blueprints', async ({ page }) => {
    await go(page, '/dashboard');
    await page.getByRole('navigation').getByRole('link', { name: 'Templates' }).click();
    await expect(page).toHaveURL(/#\/blueprints/);
    await expect(page.getByRole('heading', { level: 1, name: 'Blueprints' })).toBeVisible();
  });

  test('guests are not offered team templates', async ({ page }) => {
    await go(page, '/blueprints');
    await expect(page.getByRole('heading', { level: 1, name: 'Blueprints' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Team templates' })).toHaveCount(0);
  });
});

test.describe('templates: team (signed in)', () => {
  test.skip(!SIGNED_IN_ENABLED, 'guest-only run');

  test('Save as template then Use template creates an untagged copy with the same nodes', async ({ page }) => {
    await signInAs(page, `audit-templates-${stamp()}@example.com`);
    const w = watch(page);
    const title = `Audit plan ${stamp()}`;
    await newBlankDiagram(page, title);
    await placeElements(page, 2);
    const original = await activeDoc(page);

    await navigateInApp(page, '/dashboard');
    await page.getByRole('button', { name: `Options for ${title}` }).click();
    await page.getByRole('menuitem', { name: 'Save as template' }).click();
    await expect(page.getByText(`Saved ${title} as a team template`)).toBeVisible();

    // The template is listed on Blueprints, and is not a Library diagram.
    await navigateInApp(page, '/blueprints');
    const use = page.getByRole('button', { name: `Use team template ${title} (template)` });
    await expect(use).toBeVisible();
    await use.click();
    await expect(page).toHaveURL(/#\/canvas/);

    await expect.poll(async () => (await activeDoc(page)).id).not.toBe(original.id);
    const copy = await activeDoc(page);
    expect(copy.title).toBe(title);
    expect(copy.nodes).toHaveLength(2);
    expect(copy.nodes.map((n) => n.label).sort()).toEqual(original.nodes.map((n) => n.label).sort());
    // The original is untouched and the library now holds both, but not the template itself.
    const ws = await readWorkspace(page);
    expect(ws.docs.filter((d) => d.title === title)).toHaveLength(2);
    expect(ws.docs.some((d) => d.title === `${title} (template)`)).toBe(false);
    expect(w.problems).toEqual([]);
  });
});
