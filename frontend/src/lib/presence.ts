/**
 * Presence identity (Live.dc.html "R1 STATE"): real names and a fixed avatar palette.
 * Pure helpers, no DOM. Colours are dark enough for white initials (4.5:1).
 */
export const PRESENCE_COLORS = ['#059669', '#DB2777', '#2563EB', '#7C3AED', '#B45309', '#0E7490'] as const;

/** Name shown to collaborators: the account name (local part of the sign-in email), never a placeholder. */
export function presenceName(session: { mode?: string; email?: string } | null): string {
  const local = session?.email?.split('@')[0]?.trim();
  return local ? local.slice(0, 40) : 'Collaborator';
}

/** Stable palette colour for an awareness client id. */
export function presenceColor(clientId: number | string): string {
  const n = Number(clientId);
  const idx = Number.isFinite(n) ? Math.abs(Math.trunc(n)) % PRESENCE_COLORS.length : 0;
  return PRESENCE_COLORS[idx];
}

/** One or two uppercase initials; `?` for an empty name. */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const a = Array.from(parts[0])[0] ?? '';
  const b = parts.length > 1 ? Array.from(parts[1])[0] ?? '' : '';
  return (a + b).toUpperCase();
}
