/** Helpers for workspace setup and join (R1-E11-T03). No network here. */
import { formatLimitValue, type WorkspaceDto, type WorkspaceRole } from './api';

export const SLUG_RE = /^[a-z0-9-]{3,40}$/;

/** "Acme Payments Team!" -> "acme-payments-team". Empty when nothing usable remains. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** Null when valid, otherwise the message to show under the field. */
export function slugError(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return 'Use 3 to 40 lowercase letters, numbers or hyphens';
  return null;
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Splits "a@x.com, b@y.com" into unique valid emails and the entries that were not valid. */
export function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean)) {
    if (!EMAIL_RE.test(part)) {
      invalid.push(part);
      continue;
    }
    const k = part.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    valid.push(part);
  }
  return { valid, invalid };
}

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};
export const ROLES: WorkspaceRole[] = ['admin', 'editor', 'reviewer', 'viewer'];

// --- Pending invite token: survives the sign-in round trip (magic link may open a new tab). ---
const PENDING_INVITE_KEY = 'archflux:pending-invite:v1';

export function setPendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    /* ignore */
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY) || null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore */
  }
}

// --- Workspaces this browser has joined (the API has no "list my workspaces" yet). ---
const KNOWN_WS_KEY = 'archflux:workspaces-known:v1';

export interface KnownWorkspace {
  id: string;
  name: string;
}

export function getKnownWorkspaces(): KnownWorkspace[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KNOWN_WS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is KnownWorkspace => !!w && typeof w.id === 'string' && typeof w.name === 'string',
    );
  } catch {
    return [];
  }
}

export function rememberWorkspace(w: KnownWorkspace): void {
  const next = [w, ...getKnownWorkspaces().filter((x) => x.id !== w.id)];
  try {
    localStorage.setItem(KNOWN_WS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function forgetWorkspace(id: string): void {
  try {
    localStorage.setItem(KNOWN_WS_KEY, JSON.stringify(getKnownWorkspaces().filter((x) => x.id !== id)));
  } catch {
    /* ignore */
  }
}

function planName(plan: string): string {
  const p = plan === 'member' ? 'free' : plan;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Seat meter text: "Editors 3 / 3 on Free" (usage and limits come from the server). Null when unknown. */
export function seatMeterText(ws: Pick<WorkspaceDto, 'plan' | 'limits' | 'usage'>): string | null {
  const max = ws.limits.editors;
  const cur = ws.usage.editors;
  if (typeof max !== 'number' || typeof cur !== 'number') return null;
  return `Editors ${cur} / ${formatLimitValue(max)} on ${planName(ws.plan)}`;
}

// --- First-run setup shown once per browser (R1-E11-T03). ---
const WS_SETUP_DONE_KEY = 'archflux:ws-setup:v1';

export function markWorkspaceSetupDone(): void {
  try {
    localStorage.setItem(WS_SETUP_DONE_KEY, 'true');
  } catch {
    /* ignore */
  }
}

export function isWorkspaceSetupDone(): boolean {
  try {
    return localStorage.getItem(WS_SETUP_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}
