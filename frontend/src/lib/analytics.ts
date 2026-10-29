/**
 * Client product analytics (R1-E12-T03, PRODUCT_SPEC §7A).
 *
 * - track() queues an event; it never throws and never blocks the UI.
 * - Batches go to POST {apiUrl}/v1/events as { events: [...] }, at most 50 per request.
 * - Flushes every 10 s, when the queue reaches 50, and on visibilitychange → hidden (sendBeacon).
 * - Signed-out and guest sessions send nothing: the queue is dropped.
 * - Privacy: prop values are enum-like. A string longer than 40 chars becomes "[redacted]",
 *   so diagram content can't leak; non-primitive values are dropped; only the first 10 keys are kept.
 * - A failed flush drops the batch silently (no retry).
 *
 * Uses fetch directly (same base URL + cookie conventions as lib/api.ts) so an analytics 401
 * can never trip the global sign-out handler.
 */
import { getApiUrl } from './config';
import { isGuestSession, isSignedIn } from '../state/session';

export type EventName =
  | 'workspace_created' | 'diagram_created' | 'element_added' | 'relationship_added'
  | 'share_invited' | 'link_published' | 'access_requested' | 'access_granted'
  | 'search_performed' | 'search_result_opened'
  | 'limit_reached' | 'upgrade_viewed'
  | 'import_completed' | 'export_completed' | 'version_restored' | 'compare_opened';
export type EventProps = Record<string, string | number | boolean>; // enum-like strings ≤ 40 chars only

interface QueuedEvent {
  name: EventName;
  props: EventProps;
}

const MAX_BATCH = 50;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_STRING = 40;
const MAX_KEYS = 10;
const REDACTED = '[redacted]';

let enabled = true;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;

function canSend(): boolean {
  return isSignedIn() && !isGuestSession();
}

function eventsUrl(): string {
  return `${getApiUrl()}/v1/events`;
}

function warnDev(message: string): void {
  try {
    if (import.meta.env.DEV) console.warn(message);
  } catch {
    /* ignore */
  }
}

function sanitize(props: EventProps | undefined): EventProps {
  const out: EventProps = {};
  if (!props || typeof props !== 'object') return out;
  const entries = Object.entries(props);
  if (entries.length > MAX_KEYS) {
    warnDev(`[analytics] ${entries.length - MAX_KEYS} prop key(s) beyond the first ${MAX_KEYS} were dropped`);
  }
  for (const [key, value] of entries.slice(0, MAX_KEYS)) {
    if (typeof value === 'string') {
      if (value.length > MAX_STRING) {
        warnDev(`[analytics] prop "${key}" longer than ${MAX_STRING} chars was redacted`);
        out[key] = REDACTED;
      } else {
        out[key] = value;
      }
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      out[key] = value;
    } else {
      warnDev(`[analytics] prop "${key}" is not a primitive and was dropped`);
    }
  }
  return out;
}

function onVisibilityChange(): void {
  try {
    if (document.visibilityState !== 'hidden') return;
    if (!canSend()) {
      queue = [];
      return;
    }
    if (queue.length === 0 || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    while (queue.length > 0) {
      const batch = queue.splice(0, MAX_BATCH);
      const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
      navigator.sendBeacon(eventsUrl(), blob);
    }
  } catch {
    /* analytics never throws */
  }
}

function ensureScheduled(): void {
  if (timer === null && typeof setInterval === 'function') {
    timer = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
  }
  if (!visibilityBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = true;
  }
}

/** Queue one event. No-op when disabled, signed out or a guest. Never throws. */
export function track(name: EventName, props?: EventProps): void {
  try {
    if (!enabled) return;
    if (!canSend()) {
      queue = [];
      return;
    }
    queue.push({ name, props: sanitize(props) });
    ensureScheduled();
    if (queue.length >= MAX_BATCH) void flush();
  } catch {
    /* analytics never throws */
  }
}

/** Send up to 50 queued events. A failure drops that batch silently (no retry). */
export async function flush(): Promise<void> {
  try {
    if (!canSend()) {
      queue = [];
      return;
    }
    if (queue.length === 0) return;
    const batch = queue.splice(0, MAX_BATCH);
    await fetch(eventsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    /* dropped silently: no retry storm */
  }
}

/** Workspace analytics setting. Off → track() is a no-op and the queue is dropped. */
export function setAnalyticsEnabled(on: boolean): void {
  enabled = on;
  if (!on) queue = [];
}
