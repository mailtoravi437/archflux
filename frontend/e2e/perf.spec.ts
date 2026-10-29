import { test, expect, type Page } from '@playwright/test';

// R1-E13-T02: 5,000 elements and 6,000 edges on one page; p95 frame time of a scripted 3 s pan and
// zoom must be <= 17.0 ms (one 60 Hz frame plus timer resolution; see EPIC-13 changelog, 2026-10-25),
// and a 2,000 element doc must reach its first full paint within 1.5 s.
// Chromium only; excluded from the default run. Run: E2E_PERF=1 E2E_PORT=5191 npx playwright test e2e/perf.spec.ts --project=chromium

const KINDS = ['service', 'database', 'queue', 'gateway'] as const;
const TYPES: Record<(typeof KINDS)[number], string> = { service: 'service', database: 'db', queue: 'stream', gateway: 'gateway' };
const STYLES = ['card', 'shape', 'icon'] as const;

/** Deterministic synthetic doc: grid layout, mixed kinds/styles, ~30% inside boundaries. */
function buildWorkspace(nodeCount: number, edgeCount: number): string {
  const boundaries = Math.round(nodeCount / 40); // each holds ~12 children, so ~30% of nodes are inside
  const nodes: Array<Record<string, unknown>> = [];
  const cols = Math.ceil(Math.sqrt(nodeCount * 1.3));
  const cell = 260;
  for (let b = 0; b < boundaries; b++) {
    nodes.push({ id: `b${b}`, type: 'service', kind: 'boundary', boundaryKind: 'vpc', label: `VPC ${b}`, tag: '', health: 'Healthy', isOrphan: false, x: (b % 25) * 1800 - 200, y: -1200 - Math.floor(b / 25) * 900, w: 1600, h: 800, stroke: '#8C4FFF', pageId: 'pg-1' });
  }
  const inside = Math.round(nodeCount * 0.3);
  const plain = nodeCount - boundaries;
  for (let i = 0; i < plain; i++) {
    const kind = KINDS[i % KINDS.length];
    const n: Record<string, unknown> = { id: `n${i}`, type: TYPES[kind], kind, label: `Element ${i}`, tag: 'Tech', health: 'Healthy', isOrphan: false, w: 180, h: 70, stroke: '#2563EB', displayStyle: STYLES[i % STYLES.length], pageId: 'pg-1' };
    if (i < inside) {
      const b = i % boundaries;
      const slot = Math.floor(i / boundaries);
      n.parentId = `b${b}`;
      n.x = (b % 25) * 1800 - 200 + 40 + (slot % 6) * 250;
      n.y = -1200 - Math.floor(b / 25) * 900 + 60 + Math.floor(slot / 6) * 100;
    } else {
      const j = i - inside;
      n.x = (j % cols) * cell;
      n.y = Math.floor(j / cols) * 130;
    }
    nodes.push(n);
  }
  const edges: Array<Record<string, unknown>> = [];
  for (let e = 0; e < edgeCount; e++) {
    edges.push({ id: `e${e}`, from: `n${e % plain}`, to: `n${(e * 7 + 13) % plain}`, label: '', color: '#2563EB' });
  }
  const now = Date.now();
  const doc = { id: 'doc-perf', title: 'perf.arch', nodes, edges, strokes: [], texts: [], createdAt: now, updatedAt: now,
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }], layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }], defaults: {} };
  return JSON.stringify({ docs: [doc], activeDocId: doc.id, nodes, edges, docTitle: doc.title, zoom: 0.5, pan: { x: 300, y: 1000 }, v: 5 });
}

async function open(page: Page, nodes: number, edges: number): Promise<number> {
  const value = buildWorkspace(nodes, edges);
  await page.addInitScript(({ v }) => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    localStorage.setItem('archflux:onboarded', 'true');
    localStorage.setItem('archflux:v2-light', v);
  }, { v: value });
  const t0 = Date.now();
  await page.goto('/#/canvas');
  await expect(page.getByTestId('canvas-status')).toHaveAttribute('data-nodes', String(nodes), { timeout: 60000 });
  // First full paint: two animation frames after the canvas holds every element.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  return Date.now() - t0;
}

test.describe('@perf', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'perf is measured on chromium only');

  test('@perf open time: 2k elements first full paint <= 1.5 s', async ({ page }) => {
    const ms = await open(page, 2000, 2400);
    console.log(`PERF open-2k ms=${ms}`);
    expect(ms).toBeLessThanOrEqual(1500);
  });

  test('@perf 5k elements, 6k edges: p95 frame time of a 3 s pan and zoom <= 17.0 ms', async ({ page }) => {
    test.setTimeout(120000);
    const openMs = await open(page, 5000, 6000);
    console.log(`PERF open-5k ms=${openMs}`);
    const box = (await page.locator('#architectureCanvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__frames = [];
      w.__stop = false;
      let last = performance.now();
      const tick = (t: number) => {
        w.__frames.push(t - last);
        last = t;
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Scripted gesture for ~3 s: Pan tool drag back and forth with wheel zoom in between.
    await page.getByRole('button', { name: /^Pan/ }).click();
    const start = Date.now();
    let i = 0;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    while (Date.now() - start < 3000) {
      i++;
      const k = Math.sin(i / 6);
      await page.mouse.move(cx + 220 * k, cy + 120 * Math.cos(i / 6));
      if (i % 5 === 0) await page.mouse.wheel(0, i % 10 === 0 ? -120 : 120);
    }
    await page.mouse.up();
    const frames = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__stop = true;
      return w.__frames.slice(1);
    });
    const sorted = [...frames].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const p50 = q(0.5), p95 = q(0.95), p99 = q(0.99), max = sorted[sorted.length - 1];
    console.log(`PERF pan-zoom-5k frames=${frames.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms max=${max.toFixed(1)}ms fps~${(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1)}`);
    expect(frames.length).toBeGreaterThan(30);
    expect(p95).toBeLessThanOrEqual(17.0);
  });
});
