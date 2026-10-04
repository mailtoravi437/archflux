/**
 * API client with offline fallback to localStorage.
 * Base URL configurable via VITE_API_URL (build) or /config.json (runtime).
 */
const API_BASE = (() => {
  try {
    return (window as any).__ARCHFLUX_API_URL__ || '/api';
  } catch {
    return '/api';
  }
})();

let currentCorrelationId: string | null = null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('archflux:auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (currentCorrelationId) {
    headers['X-Correlation-ID'] = currentCorrelationId;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  // Capture correlation ID from response
  const respCorrelationId = res.headers.get('X-Correlation-ID');
  if (respCorrelationId) {
    currentCorrelationId = respCorrelationId;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message || msg;
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
  // Auth
  getToken: () => localStorage.getItem('archflux:auth_token'),
  setToken: (t: string) => localStorage.setItem('archflux:auth_token', t),
  clearToken: () => localStorage.removeItem('archflux:auth_token'),

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
  listCheckpoints: (diagramId: string) =>
    request<{ data: any[] }>(`/v1/diagrams/${diagramId}/checkpoints`),

  createCheckpoint: (diagramId: string, title: string, meta?: string) =>
    request<{ data: any }>(`/v1/diagrams/${diagramId}/checkpoints`, {
      method: 'POST',
      body: JSON.stringify({ title, meta }),
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
interface QueuedMutation {
  path: string;
  options: RequestInit;
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  retries: number;
}

const mutationQueue: QueuedMutation[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || mutationQueue.length === 0) return;
  isProcessingQueue = true;
  while (mutationQueue.length > 0) {
    const item = mutationQueue.shift()!;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(item.options.headers as Record<string, string> || {}),
      };
      if (currentCorrelationId) {
        headers['X-Correlation-ID'] = currentCorrelationId;
      }
      const res = await fetch(`${API_BASE}${item.path}`, { ...item.options, headers, credentials: 'include' });
      const respCorrelationId = res.headers.get('X-Correlation-ID');
      if (respCorrelationId) {
        currentCorrelationId = respCorrelationId;
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
  }
  isProcessingQueue = false;
}

window.addEventListener('online', processQueue);

export function queueMutation(path: string, options: RequestInit): Promise<any> {
  return new Promise((resolve, reject) => {
    mutationQueue.push({ path, options, resolve, reject, retries: 3 });
    processQueue();
  });
}