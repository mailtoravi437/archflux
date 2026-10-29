export type SaveRunState = 'idle' | 'saving' | 'error';

export interface StatusInput {
  /** True when the active doc lives on the server (its id is a server UUID). */
  isServerDoc: boolean;
  isOnline: boolean;
  lintCount: number;
  dirty: boolean;
  serverVersion: number | null;
  /** A save started from the app bar or palette is in flight, or its last attempt failed. */
  saveState: SaveRunState;
  hasConflict: boolean;
  /** A local doc over the free-plan cloud limit: it stays local (R1-E11-T06). */
  limited?: boolean;
}

export type StatusTone = 'neutral' | 'ok' | 'warn' | 'error' | 'busy';

/**
 * The single app-bar status (R1-E01-T03). One of:
 * `Local · N issues` | `Saved vN` | `Unsaved changes` | `Saving…` | `Offline` | `Couldn't save`.
 */
export function statusLabel(s: StatusInput): { label: string; tone: StatusTone } {
  if (!s.isOnline) return { label: 'Offline', tone: 'warn' };
  if (s.saveState === 'saving') return { label: 'Saving…', tone: 'busy' };
  if (s.isServerDoc && (s.saveState === 'error' || s.hasConflict)) return { label: "Couldn't save", tone: 'error' };
  // Local docs autosave to this browser, so they are never "unsaved"; the lint count is the news.
  if (!s.isServerDoc) {
    if (s.limited) return { label: 'Local · Free plan limit', tone: 'warn' };
    const n = s.lintCount;
    return { label: `Local · ${n} issue${n === 1 ? '' : 's'}`, tone: n > 0 ? 'warn' : 'neutral' };
  }
  if (s.dirty || s.serverVersion === null) return { label: 'Unsaved changes', tone: 'warn' };
  return { label: `Saved v${s.serverVersion}`, tone: 'ok' };
}
