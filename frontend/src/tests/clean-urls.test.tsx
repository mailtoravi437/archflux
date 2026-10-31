// Clean URLs (decision 2026-10-31): BrowserRouter paths, no '#'; legacy '#/path' links redirect.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DiagramProvider } from '../state/store';
import { routes } from '../App';
import { legacyHashToPath, migrateLegacyHash } from '../lib/legacyHash';
import { elementLink } from '../screens/canvas/useCanvasCommands';

afterEach(() => cleanup());

describe('legacyHashToPath', () => {
  it('maps #/path to /path and keeps the query', () => {
    expect(legacyHashToPath('#/dashboard')).toBe('/dashboard');
    expect(legacyHashToPath('#/canvas?doc=1&element=2')).toBe('/canvas?doc=1&element=2');
    expect(legacyHashToPath('#/d/abc?token=t')).toBe('/d/abc?token=t');
  });
  it('ignores empty hashes, plain anchors and protocol-relative targets', () => {
    expect(legacyHashToPath('')).toBeNull();
    expect(legacyHashToPath('#')).toBeNull();
    expect(legacyHashToPath('#section')).toBeNull();
    expect(legacyHashToPath('#//evil.example')).toBeNull();
    expect(legacyHashToPath('#/\\evil')).toBeNull();
  });
});

describe('migrateLegacyHash', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  it('rewrites /#/dashboard to /dashboard in place', () => {
    window.history.replaceState(null, '', '/#/dashboard');
    migrateLegacyHash();
    expect(window.location.pathname).toBe('/dashboard');
    expect(window.location.hash).toBe('');
  });
  it('keeps the query of a legacy deep link', () => {
    window.history.replaceState(null, '', '/#/canvas?doc=9&element=3');
    migrateLegacyHash();
    expect(window.location.pathname + window.location.search).toBe('/canvas?doc=9&element=3');
    expect(window.location.hash).toBe('');
  });
  it('leaves a clean URL alone', () => {
    window.history.replaceState(null, '', '/home?x=1');
    migrateLegacyHash();
    expect(window.location.pathname + window.location.search).toBe('/home?x=1');
  });
});

describe('clean URL routing', () => {
  it('navigating to /dashboard renders the Library', async () => {
    localStorage.clear();
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    const router = createMemoryRouter(routes, { initialEntries: ['/dashboard'] });
    render(
      <DiagramProvider>
        <RouterProvider router={router} />
      </DiagramProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/dashboard');
  });
});

describe('app-built links carry no hash', () => {
  it('elementLink is a clean path', () => {
    window.history.replaceState(null, '', '/canvas');
    const url = elementLink('d1', 'e1');
    expect(url).not.toContain('#');
    expect(url).toBe(`${window.location.origin}/canvas?doc=d1&element=e1`);
  });

  it('no product source hard-codes a "#/" route or writes location.hash', () => {
    const root = resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === 'tests') continue;
          walk(p);
        } else if (p.endsWith('legacyHash.ts')) {
          continue; // the redirect itself necessarily names '#/'
        } else if (/\.(ts|tsx)$/.test(name)) {
          const src = readFileSync(p, 'utf8');
          if (/["'`]#\/|\}#\/|location\.hash\s*=/.test(src)) offenders.push(p.slice(root.length + 1));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('web server SPA fallback', () => {
  const repo = resolve(__dirname, '../../..');
  it('nginx serves index.html for any path that is not a static file', () => {
    const conf = readFileSync(join(repo, 'frontend/nginx/default.conf'), 'utf8');
    expect(conf).toMatch(/location \/ \{[^}]*try_files \$uri \$uri\/ \/index\.html;/s);
  });
  it('the cross-origin nginx config has the same fallback', () => {
    const conf = readFileSync(join(repo, 'frontend/deploy/nginx-cross-origin.conf'), 'utf8');
    expect(conf).toMatch(/try_files \$uri \$uri\/ \/index\.html;/);
  });
  it('Caddy forwards every path (SPA routes included) to the web container, and /api is proxied there', () => {
    const caddy = readFileSync(join(repo, 'deploy/aws/Caddyfile'), 'utf8');
    expect(caddy).toMatch(/reverse_proxy web:80/);
    expect(caddy).not.toMatch(/#\//);
    const runtime = readFileSync(join(repo, 'frontend/docker/40-archflux-runtime.sh'), 'utf8');
    expect(runtime).toContain('location /api/ {');
    // The API owns only /oauth2 and /login/oauth2 style prefixes, never bare /login (an SPA route).
    expect(runtime).toContain('^/(oauth2|login/oauth2|saml2|login/saml2)/');
  });
});
