// R1-E02-T01: notation table (UI_REVAMP_SPEC §5A.2–§5A.4).
import { describe, expect, it } from 'vitest';
import type { BoundaryKind, ElementKind, RelationshipKind } from '../types';
import { BOUNDARY_NOTATION, KIND_NOTATION, REL_NOTATION, SIZE_BOX, notationFor } from '../canvas/notation';

const ALL_KINDS: ElementKind[] = [
  'person', 'client', 'external', 'gateway', 'service', 'function',
  'database', 'document-db', 'cache', 'queue', 'stream', 'object-storage',
  'search', 'cdn', 'scheduler', 'observability', 'boundary', 'note',
];

const ALL_BOUNDARIES: BoundaryKind[] = [
  'cloud', 'region', 'vpc', 'az', 'subnet-public', 'subnet-private', 'security-group',
  'k8s-cluster', 'k8s-namespace', 'c4-system', 'trust', 'frame', 'swimlane',
];

describe('notation table', () => {
  it('every ElementKind except boundary has a notation', () => {
    const kinds = ALL_KINDS.filter((k) => k !== 'boundary');
    expect(Object.keys(KIND_NOTATION).sort()).toEqual([...kinds].sort());
    for (const k of kinds) {
      const n = notationFor(k);
      expect(n.label.length).toBeGreaterThan(0);
      expect(n.glyph.length).toBeGreaterThan(0);
      expect(n.color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(notationFor(undefined)).toBe(KIND_NOTATION.service);
    expect(notationFor('boundary')).toBe(KIND_NOTATION.service);
  });

  it('database, queue and service have different base shapes', () => {
    const shapes = new Set([
      KIND_NOTATION.database.baseShape,
      KIND_NOTATION.queue.baseShape,
      KIND_NOTATION.service.baseShape,
    ]);
    expect(shapes.size).toBe(3);
    expect(KIND_NOTATION.database.baseShape).toBe('cylinder');
    expect(KIND_NOTATION.queue.baseShape).toBe('pipe');
    expect(KIND_NOTATION.service.baseShape).toBe('card');
    // Kinds sharing a colour must still differ by shape (grayscale rule, §5A.6).
    expect(KIND_NOTATION['document-db'].baseShape).not.toBe(KIND_NOTATION.database.baseShape);
    expect(KIND_NOTATION.scheduler.baseShape).not.toBe(KIND_NOTATION.observability.baseShape);
  });

  it('colours match UI_REVAMP_SPEC §5A.2', () => {
    const expected: Record<Exclude<ElementKind, 'boundary'>, string> = {
      person: '#1E3A8A', client: '#334155', external: '#6B7280', gateway: '#7C3AED',
      service: '#2563EB', function: '#C2410C', database: '#B45309', 'document-db': '#B45309',
      cache: '#B91C1C', queue: '#BE185D', stream: '#6D28D9', 'object-storage': '#15803D',
      search: '#0F766E', cdn: '#0E7490', scheduler: '#475569', observability: '#475569',
      note: '#B45309',
    };
    for (const [kind, color] of Object.entries(expected)) {
      expect(notationFor(kind as ElementKind).color, kind).toBe(color);
    }
    expect(KIND_NOTATION.note.baseShape).toBe('note');
  });

  it('boundaries match UI_REVAMP_SPEC §5A.3', () => {
    expect(Object.keys(BOUNDARY_NOTATION).sort()).toEqual([...ALL_BOUNDARIES].sort());
    expect(BOUNDARY_NOTATION.cloud).toMatchObject({ stroke: '#232F3E', dash: [], radius: 0, width: 1.5 });
    expect(BOUNDARY_NOTATION.region.stroke).toBe('#00A4A6');
    expect(BOUNDARY_NOTATION.region.dash.length).toBeGreaterThan(0);
    expect(BOUNDARY_NOTATION.vpc).toMatchObject({ stroke: '#8C4FFF', dash: [] });
    expect(BOUNDARY_NOTATION['subnet-public']).toMatchObject({ stroke: '#7AA116', fill: '#F2F8E6' });
    expect(BOUNDARY_NOTATION['subnet-private']).toMatchObject({ stroke: '#00A4A6', fill: '#E6F6F7' });
    expect(BOUNDARY_NOTATION['security-group'].stroke).toBe('#DD344C');
    expect(BOUNDARY_NOTATION['k8s-cluster']).toMatchObject({ stroke: '#326CE5', dash: [] });
    expect(BOUNDARY_NOTATION['k8s-namespace'].dash.length).toBeGreaterThan(0);
    expect(BOUNDARY_NOTATION['c4-system']).toMatchObject({ stroke: '#6B7280', radius: 12 });
    expect(BOUNDARY_NOTATION.trust).toMatchObject({ stroke: '#DC2626', width: 2 });
    expect(BOUNDARY_NOTATION.trust.dash.length).toBeGreaterThan(0);
    expect(BOUNDARY_NOTATION.frame).toMatchObject({ stroke: '#6B7280', dash: [4, 4], radius: 12, fill: null });
    expect(BOUNDARY_NOTATION.swimlane).toMatchObject({ stroke: '#C3C8D1', dash: [], fill: '#F6F7F9', radius: 0 });
  });

  it('relationships match UI_REVAMP_SPEC §5A.4 and sizes match §5A.1', () => {
    const rels: RelationshipKind[] = ['sync', 'async', 'replication', 'bidirectional'];
    expect(Object.keys(REL_NOTATION).sort()).toEqual([...rels].sort());
    expect(REL_NOTATION.sync).toEqual({ dash: [], head: 'filled', both: false, verb: 'Calls' });
    expect(REL_NOTATION.async).toEqual({ dash: [6, 4], head: 'open', both: false, verb: 'Publishes' });
    expect(REL_NOTATION.replication).toEqual({ dash: [2, 4], head: 'filled', both: false, verb: 'Replicates' });
    expect(REL_NOTATION.bidirectional).toEqual({ dash: [], head: 'filled', both: true, verb: 'Syncs' });
    expect(SIZE_BOX).toEqual({ S: { w: 64, h: 64 }, M: { w: 200, h: 80 }, L: { w: 240, h: 120 } });
  });
});
