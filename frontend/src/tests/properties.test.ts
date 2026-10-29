import { describe, it, expect } from 'vitest';
import { STANDARD_PROPERTIES, formatPropertyValue, validatePropertyKey, validatePropertyValue } from '../lib/properties';

describe('properties lib', () => {
  it('lists the seven standard keys', () => {
    expect(STANDARD_PROPERTIES.map((p) => p.key)).toEqual(['owner', 'repo', 'slo', 'cost', 'dataClass', 'tier', 'runtime']);
  });
  it('validates custom keys', () => {
    expect(validatePropertyKey('team')).toBeNull();
    expect(validatePropertyKey('Team')).not.toBeNull();
    expect(validatePropertyKey('a'.repeat(33))).not.toBeNull();
    expect(validatePropertyKey('team', ['team'])).not.toBeNull();
    expect(validatePropertyKey('extra', Array.from({ length: 30 }, (_, i) => `k${i}`))).not.toBeNull();
  });
  it('validates values by type', () => {
    expect(validatePropertyValue('cost', '12.5')).toBeNull();
    expect(validatePropertyValue('cost', 'abc')).not.toBeNull();
    expect(validatePropertyValue('repo', 'https://github.com/o/r')).toBeNull();
    expect(validatePropertyValue('repo', 'nope')).not.toBeNull();
    expect(validatePropertyValue('tier', '4')).not.toBeNull();
    expect(validatePropertyValue('team', 'x'.repeat(501))).not.toBeNull();
    expect(validatePropertyValue('owner', '')).toBeNull();
  });
  it('formats values', () => {
    expect(formatPropertyValue('cost', 1200)).toBe('$1,200/mo');
    expect(formatPropertyValue('owner', 'Platform')).toBe('Platform');
    expect(formatPropertyValue('owner', undefined)).toBe('');
  });
});
