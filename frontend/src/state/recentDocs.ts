/**
 * Recently opened diagrams (R1-E10-T01): ids newest first, kept in this browser
 * only. Home's "Continue" reads it. Every storage access is wrapped in try/catch.
 */
export const RECENT_OPENED_KEY = 'archflux:recent-opened:v1';
const MAX = 20;

export function readRecentOpened(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_OPENED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function recordOpened(id: string): void {
  try {
    const next = [id, ...readRecentOpened().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(RECENT_OPENED_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: Continue just stays empty */
  }
}
