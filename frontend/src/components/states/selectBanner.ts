import type { BannerKind } from './copy';

/** Priority from R1-E12-T02: first match wins, only one banner shows at a time. */
export const BANNER_PRIORITY: BannerKind[] = ['access_changed', 'session_expired', 'save_failed', 'newer_version', 'offline', 'rate_limited'];

export function selectBanner(active: Partial<Record<BannerKind, boolean>>): BannerKind | null {
  return BANNER_PRIORITY.find((k) => active[k]) ?? null;
}
