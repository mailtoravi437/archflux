/** Text and background colours of the Living-screen change badges; every pair meets 4.5:1 (see living-badge-contrast.test.ts). */
export const CHANGE_BADGE_COLORS: Record<'ADDED' | 'DELETED' | 'MODIFIED', { bg: string; fg: string }> = {
  ADDED: { bg: '#DCFCE7', fg: '#166534' },
  DELETED: { bg: '#FEE2E2', fg: '#B91C1C' },
  MODIFIED: { bg: '#FEF3C7', fg: '#854D0E' },
};
