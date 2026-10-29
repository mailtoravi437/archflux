/**
 * Role helpers for read-only mode and the shareable deep link (R1-E07-T06).
 * Pure: no store, no DOM except `safeNext`'s string checks.
 */
import type { DiagramRoleWire } from './api';

const RANK: Record<DiagramRoleWire, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

/** Editing tools, inspector inputs, delete and edit shortcuts need editor or above. */
export function canEdit(role: DiagramRoleWire | null | undefined): boolean {
  return role == null ? true : RANK[role] >= RANK.editor;
}

/** Adding comments needs commenter or above. */
export function canComment(role: DiagramRoleWire | null | undefined): boolean {
  return role == null ? true : RANK[role] >= RANK.commenter;
}

/** Banner copy for roles below editor; null when no banner applies. */
export function readOnlyBannerText(role: DiagramRoleWire | null | undefined): string | null {
  if (role == null || canEdit(role)) return null;
  return role === 'commenter' ? 'Can comment' : 'View only · Request edit access';
}

/** `#/d/:id` path for a diagram. */
export function deepLinkPath(id: string): string {
  return `/d/${id}`;
}

/** Login URL that returns to `path` afterwards. */
export function loginUrlFor(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

/** Accept only in-app absolute paths for a `next` target (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}

/** `#/d/:id` path carrying a share-link token in the hash query. */
export function deepLinkWithToken(id: string, token: string | null | undefined): string {
  return token ? `${deepLinkPath(id)}?token=${encodeURIComponent(token)}` : deepLinkPath(id);
}

/**
 * The URL to hand out for a new link: the server's URL with its `?link=1` marker replaced by the
 * one-time token (`#/d/:id?token=<token>`). The token is only known at creation.
 */
export function shareLinkUrl(serverUrl: string, token: string): string {
  const q = serverUrl.indexOf('?');
  const base = q === -1 ? serverUrl : serverUrl.slice(0, q);
  return `${base}?token=${encodeURIComponent(token)}`;
}
