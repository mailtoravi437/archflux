import { describe, expect, it } from 'vitest';
import { PRESENCE_COLORS, initialsOf, presenceColor, presenceName } from '../lib/presence';

// Live.dc.html "R1 STATE": real names (never "Current User"), fixed palette so white initials read.
describe('presence identity', () => {
  it('uses the account name from the session email, not a placeholder', () => {
    expect(presenceName({ mode: 'email', email: 'maya.lopez@acme.io' })).toBe('maya.lopez');
    expect(presenceName({ mode: 'email', email: 'Ravi@x.co' })).toBe('Ravi');
  });

  it('falls back to a neutral label when there is no email', () => {
    expect(presenceName({ mode: 'github' })).toBe('Collaborator');
    expect(presenceName(null)).toBe('Collaborator');
  });

  it('never returns "Current User"', () => {
    expect(presenceName({ mode: 'email', email: 'a@b.co' })).not.toMatch(/current user/i);
  });

  it('picks avatar colours from the fixed palette, deterministically', () => {
    expect(PRESENCE_COLORS).toEqual(['#059669', '#DB2777', '#2563EB', '#7C3AED', '#B45309', '#0E7490']);
    for (const id of [0, 1, 7, 123456789, '42']) {
      expect(PRESENCE_COLORS).toContain(presenceColor(id));
      expect(presenceColor(id)).toBe(presenceColor(id));
    }
  });

  it('derives one or two uppercase initials', () => {
    expect(initialsOf('ravi')).toBe('R');
    expect(initialsOf('maya.lopez')).toBe('ML');
    expect(initialsOf('Ana Maria Ruiz')).toBe('AM');
    expect(initialsOf('')).toBe('?');
  });
});
