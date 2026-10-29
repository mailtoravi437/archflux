import { describe, expect, it } from 'vitest';
import {
  formatServerDiff,
  shortRef,
  snapshotGraph,
  validateRevisionPair,
} from '../state/revisions';

describe('revision compare guards + formatting', () => {
  it('requires two distinct revisions', () => {
    expect(validateRevisionPair(null, 'b')).toContain('Select two');
    expect(validateRevisionPair('a', 'a')).toContain('same revision');
    expect(validateRevisionPair('a', 'b')).toBeNull();
  });

  it('shortens ids and hashes', () => {
    expect(shortRef('abcdef123456')).toBe('abcdef12');
    expect(shortRef('abc')).toBe('abc');
    expect(shortRef(null)).toBe('—');
  });

  it('formats added/removed/changed with the compare palette', () => {
    const lines = formatServerDiff({
      added: [{ id: 'n1', label: 'API', type: 'service' }],
      removed: [{ id: 'n2', label: 'Old DB', type: 'db' }],
      changed: [{ id: 'n3', fields: ['label', 'color'] }],
    });
    expect(lines[0].startsWith('+')).toBe(true);
    expect(lines[1].startsWith('-')).toBe(true);
    expect(lines[2].startsWith('~')).toBe(true);
    expect(lines[2]).toContain('label');
  });

  it('says so when the entity set is identical', () => {
    expect(formatServerDiff({ added: [], removed: [], changed: [] })).toEqual([
      '~ same entity set — no recorded changes',
    ]);
  });

  it('extracts graphs from enveloped or bare snapshots', () => {
    const nodes = [{ id: 'a' }];
    const edges = [{ id: 'e' }];
    expect(snapshotGraph({ graph: { nodes, edges } })).toEqual({ nodes, edges });
    expect(snapshotGraph({ nodes, edges })).toEqual({ nodes, edges });
    expect(snapshotGraph(null)).toEqual({ nodes: [], edges: [] });
  });
});
