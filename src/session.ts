export const SESSION_KEY = 'archflux:session';
export const AUTH_MODE_KEY = 'archflux:auth_mode';
/** Legacy pre-cookie bearer key. Never written anymore; removed on clear. */
export const LEGACY_TOKEN_KEY = 'archflux:auth_token';

export type SessionMode = 'guest' | 'email' | 'github' | 'google' | 'saml' | 'oidc' | 'sso';

export interface AuthSession {
  mode: SessionMode;
  email?: string;
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode?: unknown; email?: unknown };
    if (!parsed || typeof parsed.mode !== 'string') return null;
    const out: AuthSession = { mode: parsed.mode as SessionMode };
    if (typeof parsed.email === 'string') out.email = parsed.email;
    return out;
  } catch {
    return null;
  }
}

export function setSession(s: { mode: string; email?: string }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, at: Date.now() }));
    localStorage.setItem(AUTH_MODE_KEY, s.mode);
  } catch {
    /* ignore */
  }
}

/** Clear to a clean logged-out state: getSession() === null. Expiry path. */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(AUTH_MODE_KEY);
  } catch {
    /* ignore */
  }
  // Hygiene: drop any legacy pre-cookie bearer left over from older builds.
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Guest-first: guest sessions must never trigger network auth. */
export function isGuestSession(): boolean {
  const s = getSession();
  return !!s && s.mode === 'guest';
}

/** True when a non-guest session exists (cookie validity still needs a /me probe). */
export function hasUsableSession(): boolean {
  const s = getSession();
  return !!s && s.mode !== 'guest';
}
