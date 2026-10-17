/**
 * Save-conflict decision helpers (§6.2, PROD-004).
 *
 * Pure, dependency-free logic behind the VERSION_CONFLICT dialog:
 * error detection, action set, and human-readable copy. The dialog
 * component and store consume these; unit tests assert them with mocked api.
 */
import { ApiError } from './api';

/** The three explicit save-conflict resolutions. Never silent. */
export type ConflictAction = 'reload' | 'force' | 'duplicate';

export interface ConflictInfo {
  /** Version the failed PUT attempted (null when unknown). */
  attemptedVersion: number | null;
  /** Last server-acknowledged version (null when unknown). */
  serverVersion: number | null;
  /** Server-provided message, if any. */
  message: string;
}

/** True for stale-write conflicts: VERSION_CONFLICT code or HTTP 409. */
export function isSaveConflict(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.code === 'VERSION_CONFLICT' || err.status === 409;
  }
  return false;
}

/** Build dialog copy inputs from a caught update error. */
export function conflictFromError(err: unknown, attemptedVersion: number | null): ConflictInfo | null {
  if (!isSaveConflict(err)) return null;
  const message = err instanceof Error ? err.message : 'Version conflict';
  return { attemptedVersion, serverVersion: null, message };
}

export const CONFLICT_ACTIONS: ReadonlyArray<{
  id: ConflictAction;
  title: string;
  detail: string;
}> = [
  {
    id: 'reload',
    title: 'Reload remote',
    detail: 'Discard local unsaved changes and load the server version.',
  },
  {
    id: 'force',
    title: 'Save mine anyway',
    detail: 'Overwrite the server version. The remote state is preserved as a revision in history first — nothing is silently discarded.',
  },
  {
    id: 'duplicate',
    title: 'Duplicate as new diagram',
    detail: 'Keep both: your local graph becomes a separate local diagram, and the server version stays untouched.',
  },
];

/** "v3 → v5" style version contrast, with graceful unknown handling. */
export function formatVersionContrast(info: ConflictInfo): string {
  const a = info.attemptedVersion === null ? 'unknown' : `v${info.attemptedVersion}`;
  const b = info.serverVersion === null ? 'newer remote' : `v${info.serverVersion}`;
  return `Your save was based on ${a}; the server is at ${b}.`;
}
