import type { Page } from '@playwright/test';
import { sampleWorkspaceStorage } from '../src/tests/fixtures/sampleDiagram';

/**
 * The app ships with an empty first-run workspace (FRONTEND_SPEC "No mock
 * data"). Suites that exercise a populated canvas seed the test-only sample
 * graph once; later reloads keep whatever the test persisted.
 */
export async function seedSampleWorkspace(page: Page): Promise<void> {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, sampleWorkspaceStorage());
}

// ---------------------------------------------------------------------------
// R1 gate helpers (EPIC-13). Test-only; never imported by app code.
// ---------------------------------------------------------------------------

/** Opens the app as a local guest, onboarded, so no first-run redirect interferes. */
export async function guestSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('archflux:session')) {
      localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    }
    localStorage.setItem('archflux:onboarded', 'true');
  });
}

export interface PersistedNode {
  id: string; label: string; kind?: string; x: number; y: number; w: number; h: number;
  parentId?: string; displayStyle?: string; pageId?: string; layerId?: string; boundaryKind?: string;
}
export interface PersistedDoc {
  id: string; title: string; nodes: PersistedNode[]; edges: Array<{ id: string; from: string; to: string | null }>;
  pages?: Array<{ id: string; name: string }>; layers?: Array<{ id: string; name: string; visible: boolean }>;
}
export interface PersistedWorkspace { docs: PersistedDoc[]; activeDocId: string; pan: { x: number; y: number }; zoom: number }

/**
 * Reads the app's own persisted workspace (what a reload would restore). The store's debounced
 * write is only scheduled by add/remove, so moves and edits reach localStorage on `beforeunload`;
 * this dispatches that same event to make the app flush its live state first.
 */
export async function readWorkspace(page: Page): Promise<PersistedWorkspace> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('beforeunload'));
    return JSON.parse(localStorage.getItem('archflux:v2-light') ?? '{}');
  });
}

export async function activeDoc(page: Page): Promise<PersistedDoc> {
  const ws = await readWorkspace(page);
  const doc = ws.docs.find((d) => d.id === ws.activeDocId);
  if (!doc) throw new Error('no active doc persisted');
  return doc;
}

/** Screen centre of a node on the canvas (world to screen using the persisted pan and zoom). */
export async function nodeCentre(page: Page, nodeId: string): Promise<{ x: number; y: number }> {
  const ws = await readWorkspace(page);
  const doc = ws.docs.find((d) => d.id === ws.activeDocId)!;
  const n = doc.nodes.find((m) => m.id === nodeId);
  if (!n) throw new Error(`node ${nodeId} not found`);
  const box = (await page.locator('#architectureCanvas').boundingBox())!;
  return { x: box.x + ws.pan.x + (n.x + n.w / 2) * ws.zoom, y: box.y + ws.pan.y + (n.y + n.h / 2) * ws.zoom };
}

/** Moves a node by a real mouse drag from its centre to a screen point. */
export async function dragNodeTo(
  page: Page,
  nodeId: string,
  to: { x: number; y: number },
  grabOffset: { x: number; y: number } = { x: 0, y: 0 },
): Promise<void> {
  const c = await nodeCentre(page, nodeId);
  const from = { x: c.x + grabOffset.x, y: c.y + grabOffset.y };
  const end = { x: to.x + grabOffset.x, y: to.y + grabOffset.y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + end.x) / 2, (from.y + end.y) / 2, { steps: 6 });
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

const QA_API = process.env.E2E_API_URL ?? 'http://localhost:23001';
const QA_REDIS = process.env.E2E_QA_REDIS_CONTAINER ?? 'archflux-qa-redis-host';

/**
 * Real magic-link sign-in against the archflux-qa backend (port 23001). The token is read from
 * the qa Redis container (the mock mailer sends nothing), then exchanged through the SPA origin so
 * the HttpOnly session cookie lands on the app's origin. No server behaviour is stubbed.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  const res = await page.request.post('/api/v1/auth/magic-link', { data: { email } });
  if (!res.ok()) throw new Error(`magic-link request failed: ${res.status()}`);
  const keys = execFileSync('docker', ['exec', QA_REDIS, 'redis-cli', '--raw', 'keys', 'magiclink:*'], { encoding: 'utf8' })
    .split('\n').map((k) => k.trim()).filter((k) => k && !k.startsWith('magiclink:sends:'));
  let token = '';
  for (const k of keys) {
    const owner = execFileSync('docker', ['exec', QA_REDIS, 'redis-cli', '--raw', 'get', k], { encoding: 'utf8' }).trim();
    if (owner === email.toLowerCase()) token = k.slice('magiclink:'.length);
  }
  if (!token) throw new Error('no magic-link token found for ' + email);
  await page.request.get(`/api/v1/auth/verify?token=${token}`, { maxRedirects: 0 }).catch(() => undefined);
  const me = await page.request.get('/api/v1/auth/me');
  if (!me.ok()) throw new Error(`session cookie not accepted after verify: ${me.status()}`);
  await page.addInitScript((mail) => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: mail, at: Date.now() }));
    localStorage.setItem('archflux:auth_mode', 'email');
    localStorage.setItem('archflux:onboarded', 'true');
  }, email);
}

export { QA_API };
