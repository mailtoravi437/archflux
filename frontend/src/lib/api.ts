/**
 * API client for the cookie-session backend (PROD-001/003/011).
 * Auth relies on the HttpOnly `ARCHFLUX_TOKEN` cookie set by the server on
 * OAuth/magic-link success — never on a bearer in localStorage. Every
 * request sends `credentials: 'include'` so the cookie flows automatically.
 */
import { getSession, clearSession } from '../state/session';
import { getApiUrl } from './config';
import { raiseRateLimited, raiseSessionExpired, clearSessionExpired } from './apiSignals';
import type { DiagramListParams, DiagramListResponse, FolderDto, DiagramListItem, RestoreResult } from './contracts';

let currentCorrelationId: string | null = null;

export interface UnauthorizedInfo {
  hadSession: boolean;
  path: string;
  status: number;
}

export type UnauthorizedHandler = (info: UnauthorizedInfo) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedNotified = false;

export function setUnauthorizedHandler(h: UnauthorizedHandler | null) {
  unauthorizedHandler = h;
}

/** Reset the single-flight 401 latch (login success, sign-out, tests). */
export function resetAuthFailure() {
  unauthorizedNotified = false;
  clearSessionExpired();
}

const PROBE_MATCHERS = ['/auth/me', '/v1/auth/me'];

/**
 * True for auth-probing requests (e.g. GET /api/v1/auth/me) that must NOT
 * trigger the global 401 single-flight redirect. Screens mark probes either
 * by path convention or with the explicit `{ probe: true }` request option.
 */
export function isAuthProbe(path: string): boolean {
  return PROBE_MATCHERS.some((m) => path.includes(m));
}

interface RequestOpts {
  /** Mark this request as a probe: 401s reject locally with no side effects. */
  probe?: boolean;
}

function redirectToLogin() {
  try {
    window.location.hash = '#/login';
  } catch {
    /* ignore */
  }
}

function handleUnauthorized(path: string, status: number) {
  if (unauthorizedNotified) return;
  unauthorizedNotified = true;
  const s = getSession();
  const hadSession = !!s && s.mode !== 'guest';
  if (hadSession) {
    try {
      clearSession();
    } catch {
      /* ignore */
    }
  }
  // Signal first so the banner reflects the real condition even before the redirect lands.
  if (hadSession) raiseSessionExpired();
  const info: UnauthorizedInfo = { hadSession, path, status };
  if (unauthorizedHandler) {
    try {
      unauthorizedHandler(info);
    } catch {
      /* ignore */
    }
  } else {
    redirectToLogin();
  }
}

/**
 * Error thrown by {@link request} for non-2xx responses.
 * Carries the server's stable `code` (e.g. `VERSION_CONFLICT`) and HTTP
 * status so callers can branch on conflict vs. transient vs. permanent
 * failures instead of string-matching messages.
 */
export class ApiError extends Error {
  code?: string;
  status?: number;
  /** Parsed plan-limit details of a 402 LIMIT_REACHED response (R1-E11-T06). */
  limit?: LimitInfo;

  constructor(message: string, opts?: { code?: string; status?: number; limit?: LimitInfo }) {
    super(message);
    this.name = 'ApiError';
    this.code = opts?.code;
    this.status = opts?.status;
    this.limit = opts?.limit;
  }
}

/** Plan-limit details from `{"error":{"code":"LIMIT_REACHED","limit","current","max"}}` (HTTP 402). */
export interface LimitInfo {
  /** Which limit was hit, e.g. `cloudDiagrams` or `editors`. */
  limit: string;
  current: number;
  /** `2147483647` means unlimited; show it as "∞". */
  max: number;
}

/** The backend serialises "unlimited" as Integer.MAX_VALUE. */
export const UNLIMITED = 2147483647;

/** Display form of a limit value: unlimited shows as "∞". */
export function formatLimitValue(n: number): string {
  return n >= UNLIMITED ? '∞' : String(n);
}

/** `window` event raised on every 402 LIMIT_REACHED; `detail` is a {@link LimitInfo}. AppShell mounts `<LimitDialogHost />`. */
export const LIMIT_REACHED_EVENT = 'archflux:limit-reached';

/** Type guard: a 402 LIMIT_REACHED error that carries parsed limit details. */
export function isLimitReachedError(err: unknown): err is ApiError & { limit: LimitInfo } {
  return err instanceof ApiError && err.status === 402 && !!err.limit;
}

function parseLimitInfo(body: unknown): LimitInfo | undefined {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  if (!e || e.code !== 'LIMIT_REACHED') return undefined;
  if (typeof e.limit !== 'string' || typeof e.current !== 'number' || typeof e.max !== 'number') return undefined;
  return { limit: e.limit, current: e.current, max: e.max };
}

/** True when `err` is a stale-write version conflict (HTTP 409 + code). */
export function isVersionConflictError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'VERSION_CONFLICT' || err.status === 409)
  );
}

/** True when `err` is a permission denial (HTTP 403). */
export function isForbiddenError(err: unknown): boolean {
  return (
    (err instanceof ApiError && (err.code === 'FORBIDDEN' || err.status === 403)) ||
    (err instanceof Error && /HTTP 403/.test(err.message))
  );
}

async function request<T>(path: string, options: RequestInit = {}, opts: RequestOpts = {}): Promise<T> {  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  delete headers['Authorization'];
  if (currentCorrelationId) {
    headers['X-Correlation-ID'] = currentCorrelationId;
  }
  const shareTok = shareTokenForPath(path);
  if (shareTok && !headers['X-Share-Token']) headers['X-Share-Token'] = shareTok;
  const wsId = path.startsWith('/v1/workspaces') ? getActiveWorkspaceId() : null;
  if (wsId && !headers['X-Workspace-ID']) headers['X-Workspace-ID'] = wsId;
  const res = await fetch(`${getApiUrl()}${path}`, { ...options, headers, credentials: 'include' });
  // Capture correlation ID from response
  const respCorrelationId = res.headers.get('X-Correlation-ID');
  if (respCorrelationId) {
    currentCorrelationId = respCorrelationId;
  }
  if (res.status === 401 && !opts.probe && !isAuthProbe(path)) {
    handleUnauthorized(path, res.status);
  }
  if (res.status === 429) raiseRateLimited(res.headers.get('Retry-After'));
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let code: string | undefined;
    let limit: LimitInfo | undefined;
    try {
      const err = await res.json();
      if (res.status === 402) limit = parseLimitInfo(err);
      msg = err.error?.message || err.message || msg;
      if (typeof err.error?.code === 'string') code = err.error.code;
      else if (typeof err.code === 'string') code = err.code;
    } catch { /* ignore */ }
    if (limit) {
      try {
        window.dispatchEvent(new CustomEvent<LimitInfo>(LIMIT_REACHED_EVENT, { detail: limit }));
      } catch { /* non-DOM env */ }
    }
    throw new ApiError(msg, { code, status: res.status, limit });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Share-link tokens (R1-BUG-07, EPIC-07 T03). Memory only: never written to storage. ---
const shareTokens = new Map<string, string>();

/** Remember the share-link token for a diagram until the page is closed. */
export function setShareToken(diagramId: string, token: string): void {
  shareTokens.set(diagramId.toLowerCase(), token);
}

export function getShareToken(diagramId: string): string | null {
  return shareTokens.get(diagramId.toLowerCase()) ?? null;
}

/** Token for `/v1/diagrams/:id...` requests (access state, diagram load); null elsewhere. */
function shareTokenForPath(path: string): string | null {
  const m = /^\/v1\/diagrams\/([0-9a-fA-F-]{36})(?:[/?]|$)/.exec(path);
  return m ? getShareToken(m[1]) : null;
}

// --- Workspace selection (R1-E11-T03). Sent as X-Workspace-ID on /v1/workspaces/* only. ---
const ACTIVE_WS_KEY = 'archflux:workspace:v1';

export function getActiveWorkspaceId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WS_KEY) || null;
  } catch {
    return null;
  }
}

/** Persist the chosen workspace; `null` returns to the personal workspace. */
export function setActiveWorkspaceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_WS_KEY, id);
    else localStorage.removeItem(ACTIVE_WS_KEY);
  } catch {
    /* ignore */
  }
}

export type WorkspaceRole = 'admin' | 'editor' | 'reviewer' | 'viewer';

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  joinPolicy: string;
  role: WorkspaceRole;
  limits: Record<string, number | boolean>;
  usage: Record<string, number>;
}

export interface WorkspaceMemberDto {
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  status: string;
  joinedAt: string | null;
}

export interface WorkspaceInviteDto {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  expiresAt: string;
  createdAt: string;
  /** Returned once, on create only. */
  token?: string;
  emailSent?: boolean;
}

export interface InviteAcceptedDto {
  workspaceId: string;
  name: string;
  slug: string | null;
  role: WorkspaceRole;
}

export function getCorrelationId(): string | null {
  return currentCorrelationId;
}

export type DiagramRoleWire = 'owner' | 'editor' | 'commenter' | 'viewer';
export type ShareRole = DiagramRoleWire;

export interface DiagramMember {
  userId: string;
  email: string | null;
  name: string | null;
  role: DiagramRoleWire;
  addedBy: string | null;
  createdAt: string | null;
}

export interface ShareLinkInfo {
  id: string;
  diagramId: string;
  role: 'viewer' | 'commenter';
  audience: 'workspace' | 'anyone';
  expiresAt: string | null;
  revokedAt: string | null;
  state: string;
  createdBy: string | null;
  createdAt: string | null;
}

export interface AccessRequestInfo {
  id: string;
  diagramId: string;
  diagramTitle: string;
  requesterId: string;
  requesterName: string | null;
  requesterEmail: string | null;
  role: 'viewer' | 'commenter' | 'editor';
  note: string | null;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string | null;
}

export interface AccessState {
  state: 'ok' | 'trashed' | 'expired' | 'request' | 'not_found';
  role?: DiagramRoleWire;
  title?: string;
  ownerName?: string;
}

export interface NamedRevision {
  id: string;
  diagramId: string;
  parentRevisionId: string | null;
  contentHash: string;
  authorId: string | null;
  authorName: string | null;
  source: string;
  message: string | null;
  name: string | null;
  description: string | null;
  createdAt: string;
  snapshot?: unknown;
}

export const api = {
  // Auth — cookie sessions. Token helpers below are deprecated no-ops kept
  // only so old imports fail soft; they never touch localStorage writes.
  /** @deprecated Cookie sessions only — always returns null. */
  getToken: (): string | null => null,
  /** @deprecated Cookie sessions only — no-op. */
  setToken: (_t: string) => {},
  /** @deprecated Cookie sessions only — removes any legacy leftover, no-op otherwise. */
  clearToken: () => {
    try {
      localStorage.removeItem('archflux:auth_token');
    } catch {
      /* ignore */
    }
  },

  /** Cookie probe — must NOT trigger the global 401 redirect. */
  me: (probe = true) =>
    request<{ data?: { email?: string; id?: string }; email?: string; id?: string }>('/v1/auth/me', {}, { probe }),

  /** Server clears the ARCHFLUX_TOKEN cookie. Callers ignore failure. */
  logout: () =>
    request<void>('/v1/auth/logout', { method: 'POST' }, { probe: true }),

  sendMagicLink: (email: string) =>
    request<{ data?: unknown }>('/v1/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Diagrams
  // --- Workspace plan (R1-E11-T06) ---
  getCurrentWorkspace: () =>
    request<{ data: { id: string; name: string; plan: string; role: string; limits: Record<string, number | boolean>; usage: Record<string, number> } }>(
      '/v1/workspaces/current'),

  // Workspace setup, members and invites (R1-E11-T03/T04). Namespaced block: keep edits here.
  workspaces: {
    current: () => request<{ data: WorkspaceDto }>('/v1/workspaces/current'),
    /** Admin only. 409 SLUG_TAKEN when the slug is in use. */
    update: (patch: { name?: string; slug?: string; joinPolicy?: 'invite' | 'request' | 'auto' }) =>
      request<{ data: WorkspaceDto }>('/v1/workspaces/current', { method: 'PATCH', body: JSON.stringify(patch) }),
    members: () =>
      request<{ data: { members: WorkspaceMemberDto[]; invites: WorkspaceInviteDto[] } }>('/v1/workspaces/current/members'),
    changeRole: (userId: string, role: WorkspaceRole) =>
      request<{ data: WorkspaceMemberDto }>(`/v1/workspaces/current/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    removeMember: (userId: string) =>
      request<void>(`/v1/workspaces/current/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    invite: (email: string, role: WorkspaceRole) =>
      request<{ data: WorkspaceInviteDto }>('/v1/workspaces/current/invites', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      }),
    revokeInvite: (id: string) =>
      request<void>(`/v1/workspaces/current/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    acceptInvite: (token: string) =>
      request<{ data: InviteAcceptedDto }>(`/v1/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
  },

  listDiagrams: (page = 1, limit = 20, q?: string) =>
    request<{ data: any[]; total: number; page: number; limit: number }>(
      `/v1/diagrams?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`),

  createDiagram: (title: string, tags?: string[], graph?: any) =>
    request<{ data: any }>('/v1/diagrams', {
      method: 'POST',
      body: JSON.stringify({ title, tags, graph }),
    }),

  getDiagram: (id: string) =>
    request<{ data: any }>(`/v1/diagrams/${id}`),

  /**
   * Optimistic-concurrency update. Sends `version` when the caller knows the
   * last-acknowledged server version; stale versions get a 409 with
   * `code: VERSION_CONFLICT` (see {@link ApiError}). `force: true` bypasses
   * the check but still versions history server-side.
   */
  updateDiagram: (id: string, patch: any, opts?: { version?: number; force?: boolean }) =>
    request<{ data: any }>(`/v1/diagrams/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...patch,
        ...(opts?.version !== undefined ? { version: opts.version } : {}),
        ...(opts?.force ? { force: true } : {}),
      }),
    }),

  deleteDiagram: (id: string) =>
    request<void>(`/v1/diagrams/${id}`, { method: 'DELETE' }),

  // Library: folders, trash, stars (R1-E06-T03). Namespaced block: keep edits here.
  folders: {
    list: (trashed = false) =>
      request<{ data: FolderDto[] }>(`/v1/folders${trashed ? '?trashed=true' : ''}`),
    create: (name: string, parentId?: string | null) =>
      request<{ data: FolderDto }>('/v1/folders', {
        method: 'POST',
        body: JSON.stringify({ name, ...(parentId ? { parentId } : {}) }),
      }),
    rename: (id: string, name: string) =>
      request<{ data: FolderDto }>(`/v1/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    /** `parentId: null` moves to the root. */
    move: (id: string, parentId: string | null) =>
      request<{ data: FolderDto }>(`/v1/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ parentId }) }),
    trash: (id: string) => request<void>(`/v1/folders/${id}`, { method: 'DELETE' }),
    restore: (id: string) => request<{ data: RestoreResult }>(`/v1/folders/${id}/restore`, { method: 'POST' }),
  },
  diagrams: {
    list: (params: DiagramListParams = {}) => {
      const q = new URLSearchParams();
      q.set('page', String(params.page ?? 1));
      q.set('limit', String(params.limit ?? 100));
      if (params.q) q.set('q', params.q);
      if (params.folderId) q.set('folderId', params.folderId);
      if (params.starred) q.set('starred', 'true');
      if (params.trashed) q.set('trashed', 'true');
      if (params.sort) q.set('sort', params.sort);
      return request<DiagramListResponse>(`/v1/diagrams?${q.toString()}`);
    },
    restore: (id: string) => request<{ data: RestoreResult }>(`/v1/diagrams/${id}/restore`, { method: 'POST' }),
    /** Permanent. The backend requires the exact title (422 TITLE_MISMATCH otherwise). */
    purge: (id: string, confirmTitle: string) =>
      request<void>(`/v1/diagrams/${id}/purge`, { method: 'DELETE', body: JSON.stringify({ confirmTitle }) }),
    star: (id: string) => request<void>(`/v1/diagrams/${id}/star`, { method: 'PUT' }),
    unstar: (id: string) => request<void>(`/v1/diagrams/${id}/star`, { method: 'DELETE' }),
    /** `folderId: null` moves to the root. */
    move: (id: string, folderId: string | null) =>
      request<{ data: DiagramListItem }>(`/v1/diagrams/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId }) }),
  },

  // Sharing, access states and named versions (R1-E07-T05/T06, R1-E08-T03). Namespaced block: keep edits here.
  sharing: {
    members: (id: string) => request<{ data: DiagramMember[] }>(`/v1/diagrams/${id}/members`),
    addMember: (id: string, email: string, role: ShareRole) =>
      request<{ data: DiagramMember }>(`/v1/diagrams/${id}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
    setRole: (id: string, userId: string, role: DiagramRoleWire) =>
      request<{ data: DiagramMember }>(`/v1/diagrams/${id}/members/${userId}`, { method: 'PUT', body: JSON.stringify({ role }) }),
    removeMember: (id: string, userId: string) =>
      request<void>(`/v1/diagrams/${id}/members/${userId}`, { method: 'DELETE' }),
    links: (id: string) => request<{ data: ShareLinkInfo[] }>(`/v1/diagrams/${id}/links`),
    /** The returned `token` is shown once; it is never listed again. */
    createLink: (id: string, body: { role: 'viewer' | 'commenter'; audience: 'workspace' | 'anyone'; expiresAt?: string }) =>
      request<{ data: ShareLinkInfo & { url: string; token: string } }>(`/v1/diagrams/${id}/links`, { method: 'POST', body: JSON.stringify(body) }),
    revokeLink: (id: string, linkId: string) => request<void>(`/v1/diagrams/${id}/links/${linkId}`, { method: 'DELETE' }),
  },
  access: {
    /** Always 200: ok | trashed | expired | request | not_found. Never a 404. */
    state: (id: string, probe = true) =>
      request<{ data: AccessState }>(`/v1/diagrams/${id}/access`, {}, { probe }),
    requestAccess: (id: string, role: 'viewer' | 'commenter' | 'editor', note: string) =>
      request<{ data: { id: string } }>(`/v1/diagrams/${id}/access-requests`, { method: 'POST', body: JSON.stringify({ role, note }) }),
    /** Requests on diagrams the caller can share (owner/admin side). Filter by `diagramId` client-side. */
    listRequests: (status: 'pending' | 'approved' | 'denied' = 'pending') =>
      request<{ data: AccessRequestInfo[] }>(`/v1/access-requests?status=${status}`),
    /** `role` grants less than was asked for; omit to grant the requested role. */
    approveRequest: (requestId: string, role?: 'viewer' | 'commenter' | 'editor') =>
      request<{ data: AccessRequestInfo }>(`/v1/access-requests/${requestId}/approve`, { method: 'POST', body: JSON.stringify(role ? { role } : {}) }),
    denyRequest: (requestId: string) =>
      request<{ data: AccessRequestInfo }>(`/v1/access-requests/${requestId}/deny`, { method: 'POST' }),
  },
  revisions: {
    /** Revisions with `authorName`; `named` filters to named versions only. */
    list: (id: string, named = false) =>
      request<{ data: NamedRevision[] }>(`/v1/diagrams/${id}/revisions${named ? '?named=true' : ''}`),
    /** `name: null` (or blank) removes the name. */
    setName: (id: string, revId: string, name: string | null, description?: string | null) =>
      request<{ data: NamedRevision }>(`/v1/diagrams/${id}/revisions/${revId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, ...(description !== undefined ? { description } : {}) }),
      }),
    /** History is not rewound: the server records a new `restore` revision. */
    restore: (id: string, revId: string) =>
      request<{ data: unknown }>(`/v1/diagrams/${id}/revisions/${revId}/restore`, { method: 'POST' }),
  },

  // Global search (R1-E10-T04). Namespaced block: keep edits here.
  search: {
    /** Server diagrams whose title matches (`GET /v1/diagrams?q=`). Workspace-scoped by the server. */
    diagrams: (q: string, limit = 20) =>
      request<DiagramListResponse>(`/v1/diagrams?${new URLSearchParams({ page: '1', limit: String(limit), q }).toString()}`),
  },

  // Team templates (R1-E10-T07): a template is a normal diagram tagged `template`. Namespaced block.
  templates: {
    /** The server has no tag filter, so callers filter the rows on `tags` client-side. */
    list: () => request<DiagramListResponse>('/v1/diagrams?page=1&limit=100'),
    create: (title: string, graph: unknown) =>
      request<{ data: { id?: string } }>('/v1/diagrams', {
        method: 'POST',
        body: JSON.stringify({ title, tags: ['template'], graph }),
      }),
    get: (id: string) => request<{ data: unknown }>(`/v1/diagrams/${id}`),
  },

  // Export/Import
  exportDiagram: (id: string) =>
    request<any>(`/v1/export?diagramId=${id}`),

  // Checkpoints
  listCheckpoints: (diagramId: string, branch?: string) =>
    request<{ data: any[] }>(`/v1/diagrams/${diagramId}/checkpoints${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`),

  createCheckpoint: (diagramId: string, title: string, meta?: string, branch?: string) =>
    request<{ data: any }>(`/v1/diagrams/${diagramId}/checkpoints`, {
      method: 'POST',
      body: JSON.stringify({ title, meta, branch }),
    }),

  restoreCheckpoint: (diagramId: string, checkpointId: string) =>
    request<{ data: any }>(`/v1/diagrams/${diagramId}/checkpoints/${checkpointId}/restore`, {
      method: 'POST',
    }),

  deleteCheckpoint: (diagramId: string, checkpointId: string) =>
    request<void>(`/v1/diagrams/${diagramId}/checkpoints/${checkpointId}`, {
      method: 'DELETE',
    }),

  createBranch: (diagramId: string, title: string, branchName?: string) =>
    request<{ data: any }>(`/v1/diagrams/${diagramId}/branches`, {
      method: 'POST',
      body: JSON.stringify({ title, branchName }),
    }),

  // Revisions (immutable snapshots with lineage) + entity diff.
  listRevisions: (diagramId: string) =>
    request<{ data: Array<{ id: string; diagramId: string; parentRevisionId: string | null; contentHash: string; authorId: string; source: string; message: string; createdAt: string }> }>(
      `/v1/diagrams/${diagramId}/revisions`),

  getRevision: (diagramId: string, revId: string) =>
    request<{ data: { id: string; diagramId: string; parentRevisionId: string | null; contentHash: string; authorId: string; source: string; message: string; createdAt: string; snapshot: any } }>(
      `/v1/diagrams/${diagramId}/revisions/${revId}`),

  diffRevisions: (diagramId: string, from: string, to: string) =>
    request<{ added: Array<{ id: string; label: string; type: string }>; removed: Array<{ id: string; label: string; type: string }>; changed: Array<{ id: string; fields: string[] }> }>(
      `/v1/diagrams/${diagramId}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // Admin-only server audit trail. 403 for non-admin workspace roles.
  listAudit: (workspaceId: string, limit = 50) =>
    request<{ data: Array<{ id: string; actorId: string; workspaceId: string; action: string; resourceType: string; resourceId: string; outcome: string; correlationId: string; createdAt: string }> }>(
      `/v1/audit?workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}`),

  // Threads/Replies
  listThreads: (diagramId: string) =>
    request<{ data: any[] }>(`/v1/diagrams/${diagramId}/threads`),

  createThread: (diagramId: string, author: string, pinnedTo: string, text: string, resolved?: boolean) =>
    request<{ data: any }>(`/v1/diagrams/${diagramId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ author, pinnedTo, text, resolved }),
    }),

  listReplies: (diagramId: string, threadId: string) =>
    request<{ data: any[] }>(`/v1/diagrams/${diagramId}/threads/${threadId}/replies`),

  createReply: (diagramId: string, threadId: string, author: string, text: string) =>
    request<{ data: any }>(`/v1/diagrams/${diagramId}/threads/${threadId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ author, text }),
    }),

  // Lint & Sync
  lint: (nodes: any[], edges: any[]) =>
    request<any>('/v1/lint', {
      method: 'POST',
      body: JSON.stringify({ nodes, edges }),
    }),

  sync: (diagram: any, upstream: any) =>
    request<any>('/v1/sync', {
      method: 'POST',
      body: JSON.stringify({ diagram, upstream }),
    }),

  // Health
  health: () => request<any>('/health'),
  ready: () => request<any>('/ready'),
};

// Offline queue for mutations
const QUEUE_STORAGE_KEY = 'archflux:mutation-queue:v1';

interface QueuedMutation {
  path: string;
  options: RequestInit;
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  retries: number;
  timestamp: number;
}

function loadQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => ({
      ...item,
      options: {
        ...item.options,
        headers: item.options.headers,
        body: item.options.body,
      },
      resolve: () => {},
      reject: () => {},
    }));
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedMutation[]) {
  try {
    const serializable = queue.map(({ resolve: _resolve, reject: _reject, ...rest }) => rest);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    /* quota ignore */
  }
}

let mutationQueue: QueuedMutation[] = loadQueue();
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || mutationQueue.length === 0) return;
  isProcessingQueue = true;
  while (mutationQueue.length > 0) {
    const item = mutationQueue.shift()!;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((item.options.headers as Record<string, string>) || {}),
      };
      delete headers['Authorization'];
      if (currentCorrelationId) {
        headers['X-Correlation-ID'] = currentCorrelationId;
      }
      const res = await fetch(`${getApiUrl()}${item.path}`, { ...item.options, headers, credentials: 'include' });
      const respCorrelationId = res.headers.get('X-Correlation-ID');
      if (respCorrelationId) {
        currentCorrelationId = respCorrelationId;
      }
      if (res.status === 401 && !isAuthProbe(item.path)) {
        handleUnauthorized(item.path, res.status);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      item.resolve(await res.json());
    } catch (e) {
      if (item.retries > 0) {
        mutationQueue.push({ ...item, retries: item.retries - 1 });
      } else {
        item.reject(e as Error);
      }
    }
    saveQueue(mutationQueue);
  }
  isProcessingQueue = false;
}

window.addEventListener('online', processQueue);

// Process any persisted mutations on load
if (mutationQueue.length > 0) {
  processQueue();
}

export function queueMutation(path: string, options: RequestInit): Promise<any> {
  return new Promise((resolve, reject) => {
    const item: QueuedMutation = { path, options, resolve, reject, retries: 3, timestamp: Date.now() };
    mutationQueue.push(item);
    saveQueue(mutationQueue);
    processQueue();
  });
}
