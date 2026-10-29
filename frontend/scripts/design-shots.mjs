#!/usr/bin/env node
/**
 * design:shots: fidelity screenshots for the reviewer (R1-E14-T06).
 *
 * Starts Vite on port 5191 (strict, never the owner's 5173/3001/8080/18080),
 * seeds a guest session plus the TEST-ONLY fixture doc from
 * src/tests/fixtures/sampleDiagram.ts into localStorage, captures the shots
 * listed in docs/design/FIDELITY.md at 1440x900 in the light theme, and always
 * shuts Vite down. Output: frontend/test-results/design-shots/*.png
 *
 * Run from frontend/: npm run design:shots
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { chromium } from 'playwright';

const PORT = 5191;
const FORBIDDEN_PORTS = new Set([5173, 3001, 8080, 18080]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'design-shots');
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1440, height: 900 };
const STORE_KEY = 'archflux:v2-light';

if (FORBIDDEN_PORTS.has(PORT)) throw new Error(`refusing to use reserved port ${PORT}`);

function log(msg) {
  process.stdout.write(`[design:shots] ${msg}\n`);
}

/** Resolve true when nothing is listening on the port (IPv4 and IPv6). */
function portFree(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const sock = net.connect({ port, host });
      sock.once('connect', () => { sock.destroy(); resolve(false); });
      sock.once('error', () => resolve(true));
      sock.setTimeout(1000, () => { sock.destroy(); resolve(true); });
    });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.every(Boolean));
}

/** Transpile the TS fixture with esbuild (already a devDependency) and import it. */
async function loadFixture() {
  const src = await readFile(path.join(ROOT, 'src/tests/fixtures/sampleDiagram.ts'), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function persistedState(doc) {
  // Shape read by store.tsx loadPersisted(): docs[] + activeDocId, plus a
  // fixed light theme and identity viewport so node coordinates are predictable.
  return JSON.stringify({
    docs: [doc],
    activeDocId: doc.id,
    nodes: doc.nodes,
    edges: doc.edges,
    docTitle: doc.title,
    theme: 'light',
    pan: { x: 0, y: 0 },
    zoom: 1,
  });
}

function startVite() {
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort', '--host', 'localhost'], {
    cwd: ROOT,
    // Point the dev proxy at a closed port so no request reaches the owner's
    // backend on 3001 (vite.config defaults to it). API calls simply fail.
    env: { ...process.env, VITE_DEV_API_PROXY: 'http://127.0.0.1:9', BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Vite did not start within 60s:\n${output}`)), 60000);
    const onData = () => {
      if (/Local:.*http/.test(output)) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Vite exited early (code ${code}):\n${output}`)); });
  });
  return { child, ready };
}

/** Signal Vite's whole process group (it was spawned detached). */
function killTree(child, signal) {
  if (process.platform === 'win32') child.kill(signal);
  else process.kill(-child.pid, signal);
}

function stopVite(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = setTimeout(() => {
      try { killTree(child, 'SIGKILL'); } catch { /* gone */ }
      resolve();
    }, 5000);
    child.once('exit', () => { clearTimeout(done); resolve(); });
    try { killTree(child, 'SIGTERM'); } catch { clearTimeout(done); resolve(); }
  });
}

async function newPage(browser, storeValue) {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'light', deviceScaleFactor: 1 });
  await context.addInitScript(({ key, value }) => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    localStorage.setItem('archflux:onboarded', 'true');
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: STORE_KEY, value: storeValue });
  const page = await context.newPage();
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(300);
}

async function gotoCanvas(page) {
  await page.goto(`${BASE}/#/canvas`);
  const status = page.getByTestId('canvas-status');
  await status.waitFor({ state: 'attached', timeout: 30000 });
  await page.locator('#architectureCanvas').waitFor({ state: 'visible', timeout: 30000 });
  await page
    .waitForFunction(() => document.querySelector('[data-testid="canvas-status"]')?.getAttribute('data-icons-ready') === 'true', null, { timeout: 15000 })
    .catch(() => log('warn: icons not reported ready, capturing anyway'));
  await settle(page);
}

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, animations: 'disabled', ...opts });
  log(`wrote ${path.relative(ROOT, file)}`);
}

async function run() {
  if (!(await portFree(PORT))) {
    throw new Error(`port ${PORT} is busy. Stop whatever is on it (lsof -i :${PORT}) and rerun; design:shots never falls back to another port.`);
  }
  const { sampleWorkspaceStorage } = await loadFixture();
  const sample = JSON.parse(sampleWorkspaceStorage().value).docs[0];
  const now = Date.now();
  const emptyDoc = { id: 'doc-empty', title: 'untitled.arch', nodes: [], edges: [], strokes: [], createdAt: now, updatedAt: now };

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const vite = startVite();
  liveVite = vite.child;
  let browser;
  try {
    await vite.ready;
    log(`Vite up on ${BASE}`);
    browser = await chromium.launch();

    // Populated workspace: app bars, library, selected node.
    {
      const { context, page } = await newPage(browser, persistedState(sample));
      await gotoCanvas(page);
      await shot(page, 'appbar-canvas.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 48 } });

      // Inspector, nothing selected: open the outline (States.dc.html outline rows).
      await page.getByText(/^Diagram outline \(/).click();
      await settle(page);
      await shot(page, 'canvas-nothing-selected.png');

      const canvas = page.locator('#architectureCanvas');
      const box = await canvas.boundingBox();
      const first = sample.nodes[0];
      if (!box) throw new Error('canvas has no bounding box');
      await page.mouse.click(box.x + first.x + first.w / 2, box.y + first.y + first.h / 2);
      await settle(page);
      await shot(page, 'canvas-selected.png');

      // Shapes drawer: above the canvas chrome, rows reachable (Palette.dc.html placement rule).
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /Shapes library/ }).click();
      await settle(page);
      await shot(page, 'shapes-panel.png');
      await page.getByRole('button', { name: 'VPC boundary' }).scrollIntoViewIfNeeded();
      await settle(page);
      await shot(page, 'shapes-panel-scrolled.png');

      await page.goto(`${BASE}/#/dashboard`);
      await settle(page);
      await shot(page, 'appbar-library.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 48 } });
      await shot(page, 'library.png');

      // Sync (Sync.dc.html SC-32): the fixture doc has an isolated element and a dangling route.
      await page.goto(`${BASE}/#/living`);
      await settle(page);
      await shot(page, 'sync.png');

      // Live dock tab (Live.dc.html "R1 STATE"): guest session, so the honest sign-in state.
      await gotoCanvas(page);
      await page.getByRole('tab', { name: /^Live/ }).click();
      await settle(page);
      await shot(page, 'live-tab.png');

      await page.goto(`${BASE}/#/home`);
      await settle(page);
      const hash = await page.evaluate(() => location.hash);
      if (hash.startsWith('#/home')) await shot(page, 'home.png');
      else log(`skip home.png: #/home redirects to ${hash} (route not built yet)`);
      await context.close();

      // App bar with a long document title (AppBar.dc.html title cap).
      {
        const longDoc = { ...sample, title: 'untitled-2 [branch-2026-10-13].arch with a very long descriptive suffix' };
        const { context: c2, page: p2 } = await newPage(browser, persistedState(longDoc));
        await gotoCanvas(p2);
        await shot(p2, 'appbar-long-title.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 48 } });
        await c2.close();
      }
    }

    // Empty workspace: honest empty canvas.
    {
      const { context, page } = await newPage(browser, persistedState(emptyDoc));
      await gotoCanvas(page);
      await shot(page, 'canvas-empty.png');
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopVite(vite.child);
    log('Vite stopped');
  }
}

let liveVite = null;
let exitCode = 0;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    if (liveVite && liveVite.exitCode === null) {
      try { killTree(liveVite, 'SIGKILL'); } catch { /* gone */ }
    }
    process.exit(130);
  });
}
try {
  await run();
  log(`done: ${OUT}`);
} catch (err) {
  process.stderr.write(`[design:shots] FAILED: ${err instanceof Error ? err.message : err}\n`);
  exitCode = 1;
}
process.exit(exitCode);
