export const SESSION_KEY = 'archflux:session';

export function getSession(): { mode: 'guest' | 'email' | 'github' | 'sso'; email?: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as { mode: 'guest' }) : null;
  } catch {
    return null;
  }
}

export function setSession(s: { mode: string; email?: string }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, at: Date.now() }));
    localStorage.setItem('archflux:auth_mode', s.mode);
  } catch {
    /* ignore */
  }
}