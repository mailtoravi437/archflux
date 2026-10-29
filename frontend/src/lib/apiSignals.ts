/**
 * Real API-level conditions for the status banners (R1-E12-T02). lib/api.ts raises them;
 * AppStatusBanner reads them with useApiSignals(). Nothing here is ever set speculatively.
 */
import { useSyncExternalStore } from 'react';

export interface ApiSignals {
  /** A 401 hit a request that had a real (non-guest) session. */
  sessionExpired: boolean;
  /** Epoch ms until which the server asked us to back off (HTTP 429 + Retry-After), or null. */
  rateLimitedUntil: number | null;
}

const DEFAULT_RETRY_S = 30;
const MAX_RETRY_S = 600;

let state: ApiSignals = { sessionExpired: false, rateLimitedUntil: null };
const listeners = new Set<() => void>();

function set(next: ApiSignals) {
  if (next.sessionExpired === state.sessionExpired && next.rateLimitedUntil === state.rateLimitedUntil) return;
  state = next;
  listeners.forEach((l) => l());
}

/** Parse Retry-After (delta-seconds or HTTP date) into seconds; falls back to 30 s when absent or invalid. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number {
  if (value) {
    const trimmed = value.trim();
    const secs = /^\d+$/.test(trimmed) ? Number(trimmed) : Math.ceil((Date.parse(trimmed) - now) / 1000);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs, MAX_RETRY_S);
  }
  return DEFAULT_RETRY_S;
}

export function raiseRateLimited(retryAfterHeader: string | null | undefined, now: number = Date.now()) {
  set({ ...state, rateLimitedUntil: now + parseRetryAfter(retryAfterHeader, now) * 1000 });
}
export function clearRateLimited() {
  set({ ...state, rateLimitedUntil: null });
}
export function raiseSessionExpired() {
  set({ ...state, sessionExpired: true });
}
export function clearSessionExpired() {
  set({ ...state, sessionExpired: false });
}
export function getApiSignals(): ApiSignals {
  return state;
}
/** Test helper: back to the quiet state. */
export function resetApiSignals() {
  set({ sessionExpired: false, rateLimitedUntil: null });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useApiSignals(): ApiSignals {
  return useSyncExternalStore(subscribe, getApiSignals, getApiSignals);
}
