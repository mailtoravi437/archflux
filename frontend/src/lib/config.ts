/**
 * Runtime endpoint configuration (SERVICES_SPEC §3.1) — the single place the
 * SPA learns where archflux-api lives. Precedence, first non-empty wins:
 *   /config.json (written at container start) → build-time VITE_* → defaults.
 * Getters are safe before loadRuntimeConfig() resolves: they then return the
 * build-time/default values. config.json never carries secrets.
 */

export interface RuntimeConfig {
  /** API root, without trailing slash (`/api` or `https://api.example.com/api`). Callers append `/v1/...`. */
  apiUrl: string;
  /** WebSocket origin, without trailing slash (`wss://api.example.com`). Callers append `/ws`. */
  wsUrl: string;
  /** Optional contact address for "Contact us to upgrade"; the button is hidden when unset. */
  supportEmail?: string;
}

export interface ConfigSources {
  runtime?: { apiUrl?: unknown; wsUrl?: unknown; supportEmail?: unknown } | null;
  env?: { VITE_API_URL?: string; VITE_WS_URL?: string };
  /** Page origin, e.g. `https://app.example.com`. */
  origin: string;
}

const DEFAULT_API_URL = '/api';

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function stripTrailingSlash(url: string): string {
  return url.length > 1 ? url.replace(/\/+$/, '') : url;
}

/** Pure: WebSocket origin for an API root — absolute API → its origin, relative → the page origin. */
export function deriveWsUrl(apiUrl: string, origin: string): string {
  let base: URL;
  try {
    base = new URL(apiUrl, origin);
  } catch {
    base = new URL(origin);
  }
  const proto = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${base.host}`;
}

/** Pure: resolve the effective config from all sources. */
export function resolveConfig({ runtime, env = {}, origin }: ConfigSources): RuntimeConfig {
  const apiUrl = stripTrailingSlash(
    nonEmpty(runtime?.apiUrl) ?? nonEmpty(env.VITE_API_URL) ?? DEFAULT_API_URL,
  );
  const wsUrl = stripTrailingSlash(
    nonEmpty(runtime?.wsUrl) ?? nonEmpty(env.VITE_WS_URL) ?? deriveWsUrl(apiUrl, origin),
  );
  const supportEmail = nonEmpty(runtime?.supportEmail);
  return supportEmail ? { apiUrl, wsUrl, supportEmail } : { apiUrl, wsUrl };
}

function pageOrigin(): string {
  try {
    return window.location.origin;
  } catch {
    return 'http://localhost';
  }
}

function buildEnv(): ConfigSources['env'] {
  try {
    return { VITE_API_URL: import.meta.env.VITE_API_URL, VITE_WS_URL: import.meta.env.VITE_WS_URL };
  } catch {
    return {};
  }
}

let current: RuntimeConfig = resolveConfig({ env: buildEnv(), origin: pageOrigin() });

export function getConfig(): RuntimeConfig {
  return current;
}

export function getApiUrl(): string {
  return current.apiUrl;
}

export function getWsUrl(): string {
  return current.wsUrl;
}

/** Test seam: override the active config. */
export function setConfigForTests(next: RuntimeConfig): void {
  current = next;
}

/**
 * Fetch `config.json` (absolute, so deep links resolve it) and
 * apply it. Missing/invalid/slow files fall back silently to build-time values.
 */
export async function loadRuntimeConfig(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<RuntimeConfig> {
  let runtime: ConfigSources['runtime'] = null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl('/config.json', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (res.ok) {
      const body = await res.json();
      if (body && typeof body === 'object') runtime = body;
    }
  } catch {
    /* absent in Vite dev / static hosting — use build-time values */
  } finally {
    if (timer) clearTimeout(timer);
  }
  current = resolveConfig({ runtime, env: buildEnv(), origin: pageOrigin() });
  return current;
}

export type LoginProvider = 'github' | 'google' | 'saml' | 'oidc';

/** Full-page login initiation URL on archflux-api (SERVICES_SPEC §4.1). */
export function loginUrl(provider: LoginProvider): string {
  return `${getApiUrl()}/v1/auth/login/${provider}`;
}
