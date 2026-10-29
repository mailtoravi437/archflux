import { describe, expect, it } from 'vitest';
import {
  ARCH_LIMITS,
  buildArchExport,
  validateArchImport,
} from '../lib/archFormat';

const node = (id: string, label: string) => ({
  id,
  type: 'service',
  label,
  tag: 'Node.js / REST',
  health: 'Healthy',
  x: 10,
  y: 20,
  w: 170,
  h: 70,
  stroke: '#2563EB',
});

const edge = (id: string, from: string, to: string | null) => ({
  id,
  from,
  to,
  label: 'route',
  color: '#2563EB',
});

describe('export → import round-trip (PROD-007 stable ids)', () => {
  it('preserves node/edge/stroke/text ids + labels', () => {
    const exported = buildArchExport({
      nodes: [node('svc-a', 'Checkout API'), node('db-b', 'Orders DB')],
      edges: [edge('e-1', 'svc-a', 'db-b')],
      strokes: [{ id: 's-1', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: '#000', width: 2 }],
      texts: [{ id: 't-1', x: 5, y: 6, text: 'note', fontSize: 14, color: '#000' }],
      docTitle: 'shop.arch',
    });
    const result = validateArchImport(JSON.parse(JSON.stringify(exported)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.map((n) => [n.id, n.label])).toEqual([
      ['svc-a', 'Checkout API'],
      ['db-b', 'Orders DB'],
    ]);
    expect(result.edges.map((e) => [e.id, e.from, e.to, e.label])).toEqual([
      ['e-1', 'svc-a', 'db-b', 'route'],
    ]);
    expect(result.strokes.map((s) => s.id)).toEqual(['s-1']);
    expect(result.texts.map((t) => [t.id, t.text])).toEqual([['t-1', 'note']]);
    expect(result.warnings).toEqual([]);
  });
});

describe('import warnings (PROD-007)', () => {
  it('reports unknown top-level keys', () => {
    const result = validateArchImport({ nodes: [node('a', 'A')], edges: [], futureField: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('futureField'))).toBe(true);
  });

  it('defaults missing optional node fields with a warning', () => {
    const result = validateArchImport({
      nodes: [{ id: 'a', x: 1, y: 2, w: 3, h: 4 }],
      edges: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[0].label).toBe('a');
    expect(result.warnings.some((w) => w.includes('missing label'))).toBe(true);
  });

  it('warns on newer-than-supported file versions but still imports', () => {
    const result = validateArchImport({
      version: 99,
      nodes: [node('a', 'A')],
      edges: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.includes('newer than supported'))).toBe(true);
  });

  it('drops duplicate ids and keeps the first occurrence', () => {
    const result = validateArchImport({
      nodes: [node('a', 'First'), node('a', 'Second')],
      edges: [edge('e-1', 'a', null), edge('e-1', 'a', null)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.map((n) => n.label)).toEqual(['First']);
    expect(result.edges).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('duplicate node'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('duplicate route'))).toBe(true);
  });
});

describe('hard import failures leave nothing partially imported (PROD-006)', () => {
  it('rejects payloads without nodes/edges', () => {
    expect(validateArchImport({})).toMatchObject({ ok: false });
    expect(validateArchImport(null)).toMatchObject({ ok: false });
    expect(validateArchImport({ nodes: 'x', edges: [] })).toMatchObject({ ok: false });
  });

  it('rejects payloads with no usable nodes', () => {
    const result = validateArchImport({ nodes: [{ nope: true }], edges: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects payloads over entity limits', () => {
    const nodes = Array.from({ length: ARCH_LIMITS.maxNodes + 1 }, (_, i) =>
      node(`n-${i}`, `N ${i}`),
    );
    const result = validateArchImport({ nodes, edges: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large/);
  });

  it('never throws on hostile input', () => {
    expect(() => validateArchImport('string')).not.toThrow();
    expect(() => validateArchImport(42)).not.toThrow();
    expect(() => validateArchImport([])).not.toThrow();
  });
});

describe('.arch format v2 (R1-E00-T05)', () => {
  const pages = [
    { id: 'pg-a', name: 'Overview', order: 0 },
    { id: 'pg-b', name: 'Detail', order: 1 },
  ];
  const layers = [
    { id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false },
    { id: 'ly-net', name: 'Network', order: 1, visible: false, locked: true },
  ];

  it('exports version 2 with pages and layers', () => {
    const payload = buildArchExport({
      nodes: [node('a', 'A')],
      edges: [],
      strokes: [],
      texts: [],
      pages,
      layers,
      defaults: { displayStyle: 'icon', size: 'L' },
      docTitle: 'v2.arch',
    });
    expect(payload.version).toBe(2);
    expect(payload.pages).toEqual(pages);
    expect(payload.layers).toEqual(layers);
    expect(payload.defaults).toEqual({ displayStyle: 'icon', size: 'L' });
  });

  it('imports a v1 file', () => {
    const result = validateArchImport({
      app: 'ArchFlux',
      version: 1,
      nodes: [{ ...node('a', 'A'), type: 'db' }],
      edges: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.pages).toEqual([{ id: 'pg-1', name: 'Page 1', order: 0 }]);
    expect(result.layers.map((l) => l.id)).toEqual(['ly-default']);
    expect(result.nodes[0]).toMatchObject({ kind: 'database', displayStyle: 'shape', pageId: 'pg-1', layerId: 'ly-default', technology: 'Node.js / REST' });
  });

  it('round-trips pages, layers, parentId, relKind', () => {
    const box = { ...node('box', 'VPC'), kind: 'boundary' as const, boundaryKind: 'vpc' as const, pageId: 'pg-b', layerId: 'ly-net' };
    const child = { ...node('svc', 'Svc'), pageId: 'pg-b', layerId: 'ly-net', parentId: 'box' };
    const other = { ...node('ext', 'Ext'), pageId: 'pg-b' };
    const route = { ...edge('e1', 'svc', 'ext'), relKind: 'replication' as const, labelPos: 0.25, waypoints: [{ x: 5, y: 6 }] };
    const payload = buildArchExport({
      nodes: [box, child, other],
      edges: [route],
      strokes: [],
      texts: [],
      pages,
      layers,
      defaults: { displayStyle: 'card' },
      docTitle: 'v2.arch',
    });
    const result = validateArchImport(JSON.parse(JSON.stringify(payload)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.pages).toEqual(pages);
    expect(result.layers).toEqual(layers);
    expect(result.defaults).toEqual({ displayStyle: 'card' });
    expect(result.nodes.find((n) => n.id === 'svc')).toMatchObject({ parentId: 'box', pageId: 'pg-b', layerId: 'ly-net' });
    expect(result.nodes.find((n) => n.id === 'box')).toMatchObject({ kind: 'boundary', boundaryKind: 'vpc' });
    expect(result.edges[0]).toMatchObject({ relKind: 'replication', labelPos: 0.25, waypoints: [{ x: 5, y: 6 }] });
  });

  it('rejects 51 pages', () => {
    const many = Array.from({ length: ARCH_LIMITS.maxPages + 1 }, (_, i) => ({ id: `pg-${i}`, name: `P${i}`, order: i }));
    expect(many).toHaveLength(51);
    const result = validateArchImport({ version: 2, nodes: [node('a', 'A')], edges: [], pages: many });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large/);
    const layersResult = validateArchImport({
      version: 2,
      nodes: [node('a', 'A')],
      edges: [],
      layers: Array.from({ length: ARCH_LIMITS.maxLayers + 1 }, (_, i) => ({ id: `ly-${i}`, name: `L${i}`, order: i, visible: true, locked: false })),
    });
    expect(layersResult.ok).toBe(false);
  });
});
