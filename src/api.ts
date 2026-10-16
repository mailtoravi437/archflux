/**
 * API client for the cookie-session backend (PROD-001/003/011).
 * Auth relies on the HttpOnly `ARCHFLUX_TOKEN` cookie set by the server on
 * OAuth/magic-link success — never on a bearer in localStorage. Every
 * request sends `credentials: 'include'` so the cookie flows automatically.
 */
import { getSession, clearSession } from './session';

const API_BASE = (() => {
  try {
    return (window as any).__ARCHFLUX_API_URL__ || '/api';
  } catch {
    return '/api';
  }
})();

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

async function request<T>(path: string, options: RequestInit = {}, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  delete headers['Authorization'];
  if (currentCorrelationId) {
    headers['X-Correlation-ID'] = currentCorrelationId;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  // Capture correlation ID from response
  const respCorrelationId = res.headers.get('X-Correlation-ID');
  if (respCorrelationId) {
    currentCorrelationId = respCorrelationId;
  }
  if (res.status === 401 && !opts.probe && !isAuthProbe(path)) {
    handleUnauthorized(path, res.status);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message || err.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function getCorrelationId(): string | null {
  return currentCorrelationId;
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

  updateDiagram: (id: string, patch: any) =>
    request<{ data: any }>(`/v1/diagrams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  deleteDiagram: (id: string) =>
    request<void>(`/v1/diagrams/${id}`, { method: 'DELETE' }),

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
    const serializable = queue.map(({ resolve, reject, ...rest }) => rest);
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
      const res = await fetch(`${API_BASE}${item.path}`, { ...item.options, headers, credentials: 'include' });
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
