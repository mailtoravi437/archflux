// BUG-LIVE-001 (2026-10-31): assets must load from the site root so deep links like
// /settings/team do not request /settings/assets/... (SERVICES_SPEC §3.2a).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveConfig } from 'vite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = resolve(__dirname, '../..');

describe('asset base', () => {
  it('vite base is the site root', async () => {
    const cfg = await resolveConfig({ root }, 'build');
    expect(cfg.base).toBe('/');
  });

  it('index.html references no relative asset paths', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/(?:href|src)="\.\//);
  });

  it('built index.html uses absolute /assets/ paths', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'asset-base-'));
    execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'silent'], { cwd: root });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(html).toMatch(/src="\/assets\/[^"]+\.js"/);
    expect(html).not.toContain('./assets/');
  }, 120_000);

  it('runtime config is fetched from an absolute path', () => {
    const src = readFileSync(resolve(root, 'src/lib/config.ts'), 'utf8');
    expect(src).toContain("fetchImpl('/config.json'");
  });
});
