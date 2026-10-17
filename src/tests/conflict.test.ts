import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import {
  CONFLICT_ACTIONS,
  conflictFromError,
  formatVersionContrast,
  isSaveConflict,
} from '../conflict';

describe('isSaveConflict (decision logic)', () => {
  it('detects VERSION_CONFLICT code errors', () => {
    expect(isSaveConflict(new ApiError('stale', { code: 'VERSION_CONFLICT', status: 409 }))).toBe(true);
  });

  it('detects bare 409s without a code', () => {
    expect(isSaveConflict(new ApiError('conflict', { status: 409 }))).toBe(true);
  });

  it('rejects non-conflict errors', () => {
    expect(isSaveConflict(new Error('boom'))).toBe(false);
    expect(isSaveConflict(new ApiError('forbidden', { code: 'FORBIDDEN', status: 403 }))).toBe(false);
    expect(isSaveConflict(new ApiError('server', { status: 500 }))).toBe(false);
    expect(isSaveConflict(null)).toBe(false);
    expect(isSaveConflict(undefined)).toBe(false);
  });
});

describe('conflictFromError', () => {
  it('builds ConflictInfo from a conflict, preserving the attempted version', () => {
    const info = conflictFromError(new ApiError('stale write', { code: 'VERSION_CONFLICT', status: 409 }), 3);
    expect(info).toMatchObject({ attemptedVersion: 3, serverVersion: null });
    expect(info?.message).toContain('stale write');
  });

  it('returns null for non-conflict errors', () => {
    expect(conflictFromError(new Error('nope'), 3)).toBeNull();
  });
});

describe('conflict dialog copy', () => {
  it('offers exactly the three explicit actions — never silent', () => {
    expect(CONFLICT_ACTIONS.map((a) => a.id)).toEqual(['reload', 'force', 'duplicate']);
    for (const a of CONFLICT_ACTIONS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.detail.length).toBeGreaterThan(0);
    }
  });

  it('contrasts attempted vs current versions, tolerating unknowns', () => {
    expect(
      formatVersionContrast({ attemptedVersion: 3, serverVersion: 5, message: '' }),
    ).toContain('v3');
    expect(
      formatVersionContrast({ attemptedVersion: 3, serverVersion: 5, message: '' }),
    ).toContain('v5');
    expect(
      formatVersionContrast({ attemptedVersion: null, serverVersion: null, message: '' }),
    ).toMatch(/unknown|newer remote/);
  });
});
