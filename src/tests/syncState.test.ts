import { describe, expect, it } from 'vitest';
import { offlineSyncFailure, syncRunFailure } from '../syncState';

describe('sync failure state derivation (PROD-008)', () => {
  it('offline attempts leave a visible Sync-failed state with retry copy', () => {
    const s = offlineSyncFailure();
    expect(s.freshness).toBe('drift');
    expect(s.freshnessLabel).toContain('Sync failed');
    expect(s.syncError).toContain('Sync failed');
    expect(s.syncError).toMatch(/retry/i);
  });

  it('failed runs name the reason and preserve last-known-good', () => {
    const s = syncRunFailure('connector timeout');
    expect(s.freshnessLabel).toContain('Sync failed');
    expect(s.syncError).toContain('connector timeout');
    expect(s.syncError).toMatch(/untouched|last known-good/i);
  });

  it('tolerates empty reasons', () => {
    expect(syncRunFailure('').syncError).toContain('Sync failed');
  });
});
