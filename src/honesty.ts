/**
 * Honest-labeling vocabulary + pure derivation helpers (Phase 0, P0-4).
 *
 * Contract: PRODUCTIZATION_SPEC.md §§3/6.1, FRONTEND_SPEC.md
 * "Productization (v3.0.0) — Frontend Deltas", UI_UX_SPEC.md §16 (HON-R1–R8).
 *
 * Dependency-free and unit-testable: no React, no DOM, no storage access.
 * UI components consume these helpers; tests assert the mapping.
 */

/** Authoritative status vocabulary (§6.1). Values are the literal UI labels. */
export const LOCAL_ONLY = 'Local only';
export const SAVED = 'Saved';
export const SAVING = 'Saving';
export const OFFLINE = 'Offline';
export const PENDING_SYNC = 'Pending sync';
export const STALE = 'Stale';
export const SYNC_FAILED = 'Sync failed';
/** Literal "Demo" — E2E asserts this exact string (not "Demo data"). */
export const DEMO = 'Demo';
export const DEMO_DATA = 'Demo data';
export const CONNECTED = 'Connected';
export const NEEDS_ATTENTION = 'Needs attention';
/** Literal "Not connected" — E2E asserts this exact string. */
export const NOT_CONNECTED = 'Not connected';
/** Literal "Simulated" — E2E asserts this exact string. */
export const SIMULATED = 'Simulated';
/** Literal "Sample" — E2E asserts this exact string. */
export const SAMPLE = 'Sample';
export const DERIVED_FROM_CANVAS = 'Derived from canvas';

export type HonestyStatus =
  | 'local-only'
  | 'saved'
  | 'saving'
  | 'offline'
  | 'pending-sync'
  | 'stale'
  | 'sync-failed'
  | 'demo'
  | 'connected'
  | 'needs-attention';

export const STATUS_LABELS: Record<HonestyStatus, string> = {
  'local-only': LOCAL_ONLY,
  saved: SAVED,
  saving: SAVING,
  offline: OFFLINE,
  'pending-sync': PENDING_SYNC,
  stale: STALE,
  'sync-failed': SYNC_FAILED,
  demo: DEMO,
  connected: CONNECTED,
  'needs-attention': NEEDS_ATTENTION,
};

/** Badge label mapping for a status key. Falls back to the raw key. */
export function badgeLabelForStatus(status: HonestyStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Source of truth per diagram (contract §5.2). Exactly one per diagram. */
export type SourceMode = 'local' | 'cloud-document' | 'git-managed' | 'connected-source';

export const SOURCE_MODES: readonly SourceMode[] = [
  'local',
  'cloud-document',
  'git-managed',
  'connected-source',
];

export const SOURCE_MODE_LABELS: Record<SourceMode, string> = {
  local: 'Local',
  'cloud-document': 'Cloud document',
  'git-managed': 'Git-managed',
  'connected-source': 'Connected source',
};

/** Server-backed document ids are UUIDs; local guest docs use `doc-*` ids. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isServerDocId(docId: string | null | undefined): boolean {
  return typeof docId === 'string' && UUID_RE.test(docId.trim());
}

/**
 * Derive the source mode for a diagram id.
 * Server-UUID ids → 'cloud-document', everything else → 'local'.
 * (git-managed / connected-source modes require real backing evidence and
 * are never inferred implicitly.)
 */
export function sourceModeForDoc(docId: string | null | undefined): SourceMode {
  return isServerDocId(docId) ? 'cloud-document' : 'local';
}

export function sourceModeLabel(mode: SourceMode): string {
  return SOURCE_MODE_LABELS[mode] ?? mode;
}

/** Field ownership + conflict behavior note for the source-mode tooltip. */
export function sourceModeTooltip(mode: SourceMode): string {
  switch (mode) {
    case 'local':
      return 'Source of truth: Local — this browser owns the diagram. Not backed up to the cloud.';
    case 'cloud-document':
      return 'Source of truth: Cloud document — the ArchFlux server owns the latest version. Stale writes surface a conflict; nothing is silently overwritten.';
    case 'git-managed':
      return 'Source of truth: Git-managed — a versioned .arch artifact in a repository. Conflicts resolve via review.';
    case 'connected-source':
      return 'Source of truth: Connected source — the provider owns selected fields; layout and annotations stay local.';
  }
}

export type ConnectorVerification = boolean;

/**
 * What a connector row may honestly display (HON-R2).
 * `Connected` requires credentials + permissions verified against the actual
 * provider — local form validation is never enough. Nothing in the current
 * client performs that verification, so the default is 'Not connected'.
 */
export function connectorDisplayStatus(
  status: string | null | undefined,
  verifiedAgainstProvider: ConnectorVerification = false,
): typeof CONNECTED | typeof NOT_CONNECTED {
  const s = (status ?? '').trim().toLowerCase();
  if (verifiedAgainstProvider && (s === 'verified' || s === 'connected')) return CONNECTED;
  return NOT_CONNECTED;
}

/** Provisional/simulated UI surfaces and their required literal badge. */
export type HonestSurface =
  | 'resync'
  | 'connector'
  | 'merge'
  | 'review-decision'
  | 'sandbox'
  | 'sample-pr'
  | 'sample-reviewers';

export function surfaceBadge(
  surface: HonestSurface,
): typeof DEMO | typeof NOT_CONNECTED | typeof SIMULATED | typeof SAMPLE {
  switch (surface) {
    case 'resync':
      return DEMO;
    case 'connector':
      return NOT_CONNECTED;
    case 'merge':
    case 'review-decision':
    case 'sandbox':
      return SIMULATED;
    case 'sample-pr':
    case 'sample-reviewers':
      return SAMPLE;
  }
}
