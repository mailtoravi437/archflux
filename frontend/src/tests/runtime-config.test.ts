import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveWsUrl,
  getApiUrl,
  getWsUrl,
  loadRuntimeConfig,
  loginUrl,
  resolveConfig,
  setConfigForTests,
} from '../lib/config';

// SERVICES_SPEC §3.1 (SVC-G4) + §4.1 (SVC-G5).
describe('runtime config resolution', () => {
  const origin = 'https://app.example.com';

  it('defaults to same-origin /api and a page-origin WebSocket', () => {
    expect(resolveConfig({ origin })).toEqual({ apiUrl: '/api', wsUrl: 'wss://app.example.com' });
  });

  it('prefers /config.json over build-time env', () => {
    const cfg = resolveConfig({
      runtime: { apiUrl: 'https://api.example.com/api/' },
      env: { VITE_API_URL: '/ignored' },
      origin,
    });
    expect(cfg.apiUrl).toBe('https://api.example.com/api');
    expect(cfg.wsUrl).toBe('wss://api.example.com');
  });

  it('falls back to build-time env when runtime values are blank or invalid', () => {
    const cfg = resolveConfig({
      runtime: { apiUrl: '  ', wsUrl: 42 },
      env: { VITE_API_URL: 'http://localhost:3001/api', VITE_WS_URL: 'ws://localhost:3001/' },
      origin,
    });
    expect(cfg).toEqual({ apiUrl: 'http://localhost:3001/api', wsUrl: 'ws://localhost:3001' });
  });

  it('derives ws: for http APIs and keeps the port', () => {
    expect(deriveWsUrl('http://localhost:3001/api', origin)).toBe('ws://localhost:3001');
    expect(deriveWsUrl('/api', 'http://localhost:8080')).toBe('ws://localhost:8080');
  });
});

describe('loadRuntimeConfig', () => {
  afterEach(() => setConfigForTests({ apiUrl: '/api', wsUrl: 'ws://localhost' }));

  it('applies a served config.json', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ apiUrl: 'https://api.example.com/api' }), { status: 200 }),
    );
    await loadRuntimeConfig(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith('/config.json', expect.objectContaining({ cache: 'no-store' }));
    expect(getApiUrl()).toBe('https://api.example.com/api');
    expect(getWsUrl()).toBe('wss://api.example.com');
  });

  it('falls back silently when config.json is missing or unreachable', async () => {
    await loadRuntimeConfig((async () => new Response('nope', { status: 404 })) as unknown as typeof fetch);
    expect(getApiUrl()).toBe('/api');
    await loadRuntimeConfig((async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch);
    expect(getApiUrl()).toBe('/api');
  });
});

describe('loginUrl', () => {
  afterEach(() => setConfigForTests({ apiUrl: '/api', wsUrl: 'ws://localhost' }));

  it('targets the versioned backend auth endpoint', () => {
    setConfigForTests({ apiUrl: '/api', wsUrl: 'ws://localhost' });
    expect(loginUrl('github')).toBe('/api/v1/auth/login/github');
    setConfigForTests({ apiUrl: 'https://api.example.com/api', wsUrl: 'wss://api.example.com' });
    expect(loginUrl('oidc')).toBe('https://api.example.com/api/v1/auth/login/oidc');
  });
});

describe('runtime firebase config (R1-SEC-02)', () => {
  const origin = 'https://app.example.com';
  const fb = { apiKey: 'k', authDomain: 'd.firebaseapp.com', projectId: 'p', appId: 'a', messagingSenderId: 'm' };

  it('reads the public firebase web config from /config.json', () => {
    expect(resolveConfig({ runtime: { firebase: fb }, origin }).firebase).toEqual(fb);
  });

  it('omits firebase when a required field is missing or blank', () => {
    expect(resolveConfig({ runtime: { firebase: { ...fb, apiKey: ' ' } }, origin }).firebase).toBeUndefined();
    expect(resolveConfig({ runtime: { firebase: 'nope' }, origin }).firebase).toBeUndefined();
  });
});
