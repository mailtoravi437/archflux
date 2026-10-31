// BUG-LIVE-009: template counts come from the graph a template creates.
import { describe, expect, it } from 'vitest';
import { blueprintGraph, blueprints } from '../data/blueprints';

describe('blueprint counts', () => {
  it('every catalog entry reports the counts of its own graph', () => {
    for (const b of blueprints) {
      const g = blueprintGraph(b.id);
      expect(b.nodeCount, b.id).toBe(g.nodes.length);
      expect(b.edgeCount, b.id).toBe(g.edges.length);
    }
  });
  it('the catalog source does not hard-code counts', async () => {
    const src = (await import('../data/blueprints?raw')).default as string;
    expect(src).not.toMatch(/nodeCount:\s*\d/);
    expect(src).not.toMatch(/edgeCount:\s*\d/);
  });
});
