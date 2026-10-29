import { describe, it, expect } from 'vitest';
import { statusLabel } from '../components/appbar/status';

// R1-E11-T06: a local doc over the free-plan cloud limit says so in the app bar.
const base = {
  isServerDoc: false,
  isOnline: true,
  lintCount: 0,
  dirty: false,
  serverVersion: null,
  saveState: 'idle' as const,
  hasConflict: false,
};

describe('statusLabel', () => {
  it('shows the free-plan limit for a limited local doc', () => {
    expect(statusLabel({ ...base, limited: true })).toEqual({ label: 'Local · Free plan limit', tone: 'warn' });
  });

  it('keeps the lint count for a normal local doc', () => {
    expect(statusLabel({ ...base, lintCount: 2 })).toEqual({ label: 'Local · 2 issues', tone: 'warn' });
  });
});
