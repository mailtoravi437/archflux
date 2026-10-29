/** Banner copy is verbatim from the SystemStates artboard (R1-E12-T01). */
export type BannerKind = 'offline' | 'save_failed' | 'newer_version' | 'access_changed' | 'session_expired' | 'rate_limited';

export const BANNER_COPY: Record<BannerKind, { title: string; body: string; safe: string; primary: string; secondary?: string }> = {
  offline: {
    title: 'Offline — editing locally',
    body: 'Changes are saved on this device and upload when you reconnect.',
    safe: 'N unsynced edits stored locally; closing the tab keeps them.',
    primary: 'Retry now',
    secondary: 'Download copy',
  },
  save_failed: {
    title: "Couldn't save to cloud",
    body: 'The server returned an error on save (attempt 3 of 5, next in 20 s).',
    safe: 'Your edits are kept locally; nothing was lost.',
    primary: 'Retry now',
    secondary: 'Save as file',
  },
  newer_version: {
    title: 'Someone saved a newer version',
    body: '[Architect] saved v15 while you were editing v14.',
    safe: 'Your changes are kept as a draft; nothing is overwritten.',
    primary: 'Review & merge',
    secondary: 'Save as proposal',
  },
  access_changed: {
    title: 'Your access changed',
    body: '[Owner] changed you to Viewer. Editing is off for this diagram.',
    safe: 'Unsaved edits are kept as a private copy you can export.',
    primary: 'Request edit access',
    secondary: 'Export my copy',
  },
  session_expired: {
    title: 'Session expired',
    body: "Sign in again to keep saving. We'll bring you back here.",
    safe: 'Edits stay in this tab and save after sign-in.',
    primary: 'Sign in',
    secondary: 'Keep working offline',
  },
  rate_limited: {
    title: 'Slow down — too many requests',
    body: 'You hit the request limit; ArchFlux will retry in 30 s.',
    safe: 'Queued actions run automatically; nothing was dropped.',
    primary: 'Got it',
    secondary: 'Status page',
  },
};
