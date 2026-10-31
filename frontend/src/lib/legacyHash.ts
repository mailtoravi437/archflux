/**
 * Legacy hash URLs (`/#/dashboard`, from the hash-router era) keep working: they are rewritten to
 * the clean path (`/dashboard`) before the router starts (decision 2026-10-31).
 */

/** `#/canvas?doc=1` → `/canvas?doc=1`; null when the hash is not a legacy route. */
export function legacyHashToPath(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const path = hash.slice(1);
  // Never produce a protocol-relative or backslash target (open-redirect guard).
  if (path.startsWith('//') || path.includes('\\')) return null;
  return path;
}

/** Rewrites a legacy `#/…` location in place (no reload, no extra history entry). */
export function migrateLegacyHash(): void {
  try {
    const target = legacyHashToPath(window.location.hash);
    if (target) window.history.replaceState(window.history.state, '', target);
  } catch {
    /* non-DOM env */
  }
}
