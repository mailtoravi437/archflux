/** R1-E04-T04: line-jump crossings. */
import { describe, it, expect } from 'vitest';
import { crossings, MAX_CROSSING_EDGES } from '../lib/edgeCrossings';

describe('crossings', () => {
  it('detects a crossing of two segments', () => {
    const out = crossings([
      { edgeId: 'a', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
      { edgeId: 'b', points: [{ x: 40, y: 0 }, { x: 40, y: 100 }] },
    ]);
    expect(out).toEqual([{ edgeId: 'b', x: 40, y: 50 }]);
  });

  it('ignores shared endpoints', () => {
    const out = crossings([
      { edgeId: 'a', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { edgeId: 'b', points: [{ x: 100, y: 0 }, { x: 100, y: 100 }] },
    ]);
    expect(out).toEqual([]);
  });

  it('ignores parallel segments', () => {
    expect(crossings([
      { edgeId: 'a', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { edgeId: 'b', points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] },
    ])).toEqual([]);
  });

  it('is skipped above 400 edges', () => {
    const many = Array.from({ length: MAX_CROSSING_EDGES + 1 }, (_, i) => ({
      edgeId: `e${i}`,
      points: i % 2 ? [{ x: 0, y: 50 }, { x: 100, y: 50 }] : [{ x: 40, y: 0 }, { x: 40, y: 100 }],
    }));
    expect(crossings(many)).toEqual([]);
  });
});
