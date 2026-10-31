import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  parseAuthCallbackParams,
  resolvePostAuthTarget,
  resolveSessionMode,
} from '../screens/AuthCallbackScreen';
import {
  getSession,
  setSession,
  clearSession,
  isGuestSession,
  hasUsableSession,
  isSignedIn,
} from '../state/session';
import {
  api,
  isAuthProbe,
  setUnauthorizedHandler,
  resetAuthFailure,
  getCorrelationId,
} from '../lib/api';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  };
}

describe('session helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthFailure();
    setUnauthorizedHandler(null);
  });

  it('starts null, round-trips set/get, clears to null', () => {
    expect(getSession()).toBeNull();
    setSession({ mode: 'github', email: 'a@x.com' });
    expect(getSession()).toMatchObject({ mode: 'github', email: 'a@x.com' });
    expect(hasUsableSession()).toBe(true);
    expect(isGuestSession()).toBe(false);
    clearSession();
    expect(getSession()).toBeNull();
    expect(hasUsableSession()).toBe(false);
  });

  it('keeps guest-first semantics and wipes legacy token on clear', () => {
    setSession({ mode: 'guest' });
    expect(isGuestSession()).toBe(true);
    expect(hasUsableSession()).toBe(false);
    localStorage.setItem('archflux:auth_token', 'legacy');
    clearSession();
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('archflux:auth_token')).toBeNull();
  });

  it('deprecated token helpers never write a bearer', () => {
    api.setToken('abc');
    expect(localStorage.getItem('archflux:auth_token')).toBeNull();
    expect(api.getToken()).toBeNull();
    localStorage.setItem('archflux:auth_token', 'legacy');
    api.clearToken();
    expect(localStorage.getItem('archflux:auth_token')).toBeNull();
  });
});

describe('isAuthProbe', () => {
  it('marks /me probes and nothing else', () => {
    expect(isAuthProbe('/v1/auth/me')).toBe(true);
    expect(isAuthProbe('/api/v1/auth/me')).toBe(true);
    expect(isAuthProbe('/v1/diagrams')).toBe(false);
    expect(isAuthProbe('/v1/auth/logout')).toBe(false);
  });
});

describe('401 single-flight handling', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthFailure();
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
    resetAuthFailure();
  });

  it('non-probe 401 clears a non-guest session once and notifies once', async () => {
    setSession({ mode: 'github', email: 'a@x.com' });
    const seen: unknown[] = [];
    setUnauthorizedHandler((info) => {
      seen.push(info);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { message: 'unauthorized' } })),
    );
    await expect(api.listDiagrams()).rejects.toThrow('unauthorized');
    await expect(api.listDiagrams()).rejects.toThrow('unauthorized');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ hadSession: true });
    expect(getSession()).toBeNull();
  });

  it('probe 401 (GET /me) has no side effects', async () => {
    setSession({ mode: 'github', email: 'a@x.com' });
    const seen: unknown[] = [];
    setUnauthorizedHandler((info) => {
      seen.push(info);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { message: 'unauthorized' } })),
    );
    await expect(api.me()).rejects.toThrow('unauthorized');
    expect(seen).toHaveLength(0);
    expect(getSession()).not.toBeNull();
  });

  it('guest 401 notifies with hadSession=false and leaves guest intact', async () => {
    setSession({ mode: 'guest' });
    const seen: Array<{ hadSession: boolean }> = [];
    setUnauthorizedHandler((info) => {
      seen.push(info);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { message: 'x' } })),
    );
    await expect(api.listDiagrams()).rejects.toThrow();
    expect(seen).toHaveLength(1);
    expect(seen[0].hadSession).toBe(false);
    expect(getSession()?.mode).toBe('guest');
  });

  it('keeps correlation-ID propagation and message extraction', async () => {
    setSession({ mode: 'github' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(500, { error: { message: 'boom-id' } }, { 'X-Correlation-ID': 'corr-1' }),
      ),
    );
    await expect(api.listDiagrams()).rejects.toThrow('boom-id');
    expect(getCorrelationId()).toBe('corr-1');
  });

  it('sends cookies and no Authorization header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await api.listDiagrams();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});

describe('auth callback decision helpers', () => {
  it('parses provider/error params', () => {
    expect(parseAuthCallbackParams(new URLSearchParams('provider=github'))).toEqual({
      provider: 'github',
      error: null,
    });
    expect(parseAuthCallbackParams(new URLSearchParams('error=access_denied'))).toEqual({
      provider: null,
      error: 'access_denied',
    });
  });

  it('resolves post-auth target by onboarding state', () => {
    expect(resolvePostAuthTarget(true)).toBe('/canvas');
    expect(resolvePostAuthTarget(false)).toBe('/onboarding');
  });

  it('derives session mode from provider + /me email', () => {
    expect(resolveSessionMode('github', { data: { email: 'a@x.com' } })).toEqual({
      mode: 'github',
      email: 'a@x.com',
    });
    expect(resolveSessionMode(null, { email: 'b@x.com' })).toEqual({
      mode: 'email',
      email: 'b@x.com',
    });
    expect(resolveSessionMode('google', {})).toEqual({ mode: 'google' });
  });
});

describe('guest zero-network branches', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AppShell probe skips fetch for a null session only', async () => {
    const { probeAuthSession, resetMeProbeCache } = await import('../components/AppShell');
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: { email: 'a@x.com' } }));
    vi.stubGlobal('fetch', fetchMock);
    resetMeProbeCache();
    localStorage.clear();
    await expect(probeAuthSession()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a stale guest session adopts the server identity from /me', async () => {
    const { probeAuthSession, resetMeProbeCache } = await import('../components/AppShell');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: { provider: 'email', email: 'x@y.z' } })));
    resetMeProbeCache();
    setSession({ mode: 'guest' });
    await expect(probeAuthSession()).resolves.toBe(true);
    expect(getSession()).toMatchObject({ mode: 'email', email: 'x@y.z' });
    expect(isSignedIn()).toBe(true);
    resetMeProbeCache();
  });

  it('/me 401 clears a stored non-guest session', async () => {
    const { probeAuthSession, resetMeProbeCache } = await import('../components/AppShell');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED' } })));
    resetMeProbeCache();
    setSession({ mode: 'github', email: 'a@x.com' });
    await expect(probeAuthSession()).resolves.toBe(false);
    expect(getSession()).toBeNull();
    expect(isSignedIn()).toBe(false);
    resetMeProbeCache();
  });

  it('a guest session with no cookie (401) stays guest', async () => {
    const { probeAuthSession, resetMeProbeCache } = await import('../components/AppShell');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED' } })));
    resetMeProbeCache();
    setSession({ mode: 'guest' });
    await expect(probeAuthSession()).resolves.toBe(false);
    expect(getSession()).toMatchObject({ mode: 'guest' });
    expect(isSignedIn()).toBe(false);
    resetMeProbeCache();
  });

  it('AppShell probe caches one /me call for non-guests', async () => {
    const { probeAuthSession, resetMeProbeCache } = await import('../components/AppShell');
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: { email: 'a@x.com' } }));
    vi.stubGlobal('fetch', fetchMock);
    resetMeProbeCache();
    setSession({ mode: 'github' });
    await expect(probeAuthSession()).resolves.toBe(true);
    await expect(probeAuthSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetMeProbeCache();
  });
});
