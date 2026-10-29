import { describe, expect, it } from 'vitest';
import { buildTimeline, groupTimeline, type RevisionLike } from '../state/timeline';

const T = Date.parse('2026-10-20T10:00:00Z');
const rev = (id: string, minutes: number, extra: Partial<RevisionLike> = {}): RevisionLike => ({
  id,
  source: 'manual',
  createdAt: new Date(T + minutes * 60_000).toISOString(),
  authorName: 'Dana',
  name: null,
  message: null,
  ...extra,
});

describe('buildTimeline (R1-E08-T03)', () => {
  it('merges revisions and checkpoints newest first', () => {
    const entries = buildTimeline(
      [rev('r1', 0), rev('r2', 120)],
      [{ id: 'c1', title: 'Before launch', createdAt: new Date(T + 60 * 60_000).toISOString() }],
      [{ id: `v${(T + 30 * 60_000).toString(36)}`, title: 'Local snapshot' }],
    );
    expect(entries.map((e) => e.id)).toEqual(['r2', 'c1', expect.stringMatching(/^v/), 'r1']);
    expect(entries.map((e) => e.kind)).toEqual(['revision', 'checkpoint', 'local', 'revision']);
    expect(entries[0].isCurrent).toBe(true);
    expect(entries.filter((e) => e.isCurrent)).toHaveLength(1);
    expect(entries[1].name).toBe('Before launch');
  });

  it('coalesces same-author edits within 10 min', () => {
    const entries = buildTimeline(
      [rev('a', 0), rev('b', 5), rev('c', 12), rev('d', 40), rev('e', 44, { authorName: 'Sam' })],
      [],
      [],
    );
    const by = Object.fromEntries(entries.map((e) => [e.id, e.session]));
    expect(by.a).toBe(by.b);
    expect(by.b).toBe(by.c); // each gap is under 10 minutes
    expect(by.d).not.toBe(by.c); // 28 min gap
    expect(by.e).not.toBe(by.d); // different author
    const days = groupTimeline(entries);
    const sessions = days.flatMap((d) => d.items).filter((i) => i.type === 'session');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].type === 'session' && sessions[0].count).toBe(3);
  });

  it('keeps named versions and non-edit sources out of sessions', () => {
    const entries = buildTimeline([rev('a', 0), rev('b', 2, { name: 'v2' }), rev('c', 3, { source: 'import' })], [], []);
    expect(entries.find((e) => e.id === 'b')?.session).toBeNull();
    expect(entries.find((e) => e.id === 'c')?.session).toBeNull();
  });
});
