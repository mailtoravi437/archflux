/**
 * Sync-failure state derivation (PROD-008 honest sync state).
 *
 * Pure, dependency-free: every resync failure must resolve to a visible
 * "Sync failed" state with retry affordance — never a silent toast.
 */
import type { FreshnessState } from '../types';

export interface SyncFailureState {
  freshness: FreshnessState;
  freshnessLabel: string;
  /** User-facing error shown in the Sync-failed alert with a Retry button. */
  syncError: string;
}

/** Offline resync attempt: no attempt is made; the failure stays visible. */
export function offlineSyncFailure(): SyncFailureState {
  return {
    freshness: 'drift',
    freshnessLabel: 'Sync failed — you are offline',
    syncError: 'Sync failed — you are offline. Nothing was lost; retry when back online.',
  };
}

/** Generic resync failure (e.g. connector run threw). */
export function syncRunFailure(reason: string): SyncFailureState {
  const clean = reason.trim() || 'unknown error';
  return {
    freshness: 'drift',
    freshnessLabel: `Sync failed — ${clean.slice(0, 80)}`,
    syncError: `Sync failed — ${clean}. Last known-good version is untouched; retry when ready.`,
  };
}

/** Resync with no live connector configured: nothing to pull, say so (FE-M2). */
export function notConnectedSync(): { freshness: FreshnessState; freshnessLabel: string } {
  return { freshness: 'local', freshnessLabel: 'Not connected — no live source to sync' };
}
