// R1-E09-T01: draw.io importer.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { importDrawio } from '../lib/import/drawio';
import { createManifestLookup, DEFAULT_ICON_KINDS, DRAWIO_AWS_ALIASES } from '../lib/import/drawioIcons';
import { IMPORT_LIMITS, type ImportResult } from '../lib/import/types';
import type { ArchNode } from '../types';

const FIX = join(__dirname, 'fixtures', 'drawio');
const read = (f: string) => readFileSync(join(FIX, f), 'utf8');
const manifest: unknown = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'icons', 'manifest.json'), 'utf8'));
const iconLookup = createManifestLookup(manifest);
const inflateRaw = (b: Uint8Array) => new Uint8Array(inflateRawSync(b));

function byLabel(r: ImportResult, label: string): ArchNode {
  const n = r.doc?.nodes.find((x) => x.label === label);
  if (!n) throw new Error(`no node "${label}"`);
  return n;
}

describe('importDrawio', () => {
  it('reads an uncompressed two-page file', async () => {
    const r = await importDrawio(read('two-page.drawio'), 'shop.drawio', { iconLookup });
    expect(r.ok).toBe(true);
    expect(r.format).toBe('drawio');
    expect(r.doc?.title).toBe('shop');
    expect(r.doc?.pages?.map((p) => p.name)).toEqual(['Overview', 'Details']);
    expect(r.stats.pages).toBe(2);
    expect(r.stats.boundaries).toBe(1);
    // Page 1: api, rds, cache, user; page 2: worker, queue.
    expect(r.stats.nodes).toBe(6);
    // e1..e4 on page 1 (e5 hits the skipped image), e1 on page 2.
    expect(r.stats.edges).toBe(5);
    const [pg1, pg2] = r.doc?.pages ?? [];
    expect(byLabel(r, 'Worker').pageId).toBe(pg2.id);
    expect(byLabel(r, 'Customer').pageId).toBe(pg1.id);
    expect(byLabel(r, 'Customer').kind).toBe('person');
    const jobs = byLabel(r, 'Jobs');
    expect(jobs.kind).toBe('queue');
    expect(jobs.iconRef).toEqual({ set: 'aws', id: 'aws/amazon-simple-queue-service' });
    // Ids from different pages never collide.
    const ids = r.doc?.nodes.map((n) => n.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);

    const edges = r.doc?.edges ?? [];
    const api = byLabel(r, 'Orders API');
    const rds = byLabel(r, 'Orders DB');
    const cache = byLabel(r, 'Session store');
    const dashed = edges.find((e) => e.from === api.id && e.to === rds.id);
    expect(dashed?.relKind).toBe('async');
    expect(dashed?.label).toBe('writes');
    expect(edges.find((e) => e.from === api.id && e.to === cache.id)?.arrow).toBe('none');
    const both = edges.find((e) => e.from === cache.id && e.to === rds.id);
    expect(both?.relKind).toBe('bidirectional');
    expect(both?.arrow).toBe('both');
    expect(edges.find((e) => e.label === 'HTTPS')?.waypoints).toEqual([{ x: 300, y: 150 }]);
    // `text;` cells become FreeText with entities decoded.
    expect(r.doc?.texts?.map((t) => [t.text, t.fontSize, t.pageId])).toEqual([['Draft — v2', 16, pg1.id]]);
  });

  it('reads a compressed diagram', async () => {
    const r = await importDrawio(read('compressed.drawio'), 'compressed.drawio', { iconLookup, inflateRaw });
    expect(r.ok).toBe(true);
    expect(r.doc?.pages?.map((p) => p.name)).toEqual(['Compressed page']);
    expect(r.doc?.nodes.map((n) => n.label).sort()).toEqual(['Edge Proxy', 'Payments']);
    expect(r.doc?.edges).toHaveLength(1);
    expect(r.doc?.edges[0].label).toBe('gRPC');
  });

  it.runIf(typeof DecompressionStream === 'function')('reads a compressed diagram with DecompressionStream by default', async () => {
    const r = await importDrawio(read('compressed.drawio'), 'compressed.drawio');
    expect(r.ok).toBe(true);
    expect(r.stats.nodes).toBe(2);
  });

  it('maps cylinder to database', async () => {
    const r = await importDrawio(read('two-page.drawio'), 'shop.drawio', { iconLookup });
    const db = byLabel(r, 'Session store');
    expect(db.kind).toBe('database');
    expect(db.displayStyle).toBe('shape');
  });

  it('maps aws4 rds to iconRef aws/amazon-rds', async () => {
    const r = await importDrawio(read('two-page.drawio'), 'shop.drawio', { iconLookup });
    const rds = byLabel(r, 'Orders DB');
    expect(rds.iconRef).toEqual({ set: 'aws', id: 'aws/amazon-rds' });
    expect(rds.kind).toBe('database');
    expect(rds.displayStyle).toBe('icon');
    // The default (no-fetch) lookup resolves it too.
    const d = await importDrawio(read('two-page.drawio'), 'shop.drawio');
    expect(byLabel(d, 'Orders DB').iconRef).toEqual({ set: 'aws', id: 'aws/amazon-rds' });
  });

  it('converts relative child coords and sets parentId', async () => {
    const r = await importDrawio(read('two-page.drawio'), 'shop.drawio', { iconLookup });
    const vpc = byLabel(r, 'Prod VPC');
    expect(vpc.kind).toBe('boundary');
    expect(vpc.boundaryKind).toBe('vpc');
    expect([vpc.x, vpc.y, vpc.w, vpc.h]).toEqual([400, 100, 400, 300]);
    const api = byLabel(r, 'Orders API');
    expect([api.x, api.y]).toEqual([440, 160]);
    expect(api.parentId).toBe(vpc.id);
    expect(byLabel(r, 'Orders DB').parentId).toBe(vpc.id);
    expect(byLabel(r, 'Session store').parentId).toBeUndefined();
  });

  it('strips HTML labels; <br> splits name/technology', async () => {
    const r = await importDrawio(read('two-page.drawio'), 'shop.drawio', { iconLookup });
    const api = byLabel(r, 'Orders API');
    expect(api.technology).toBe('Spring Boot & Java 21');
    expect(api.tag).toBe('Spring Boot & Java 21');
    expect(api.kind).toBe('service');
    expect(api.displayStyle).toBe('card');
    expect(api.fill).toBe('#dae8fc');
    expect(api.stroke).toBe('#6c8ebf');
  });

  it('warns on unsupported image cells', async () => {
    const r = await importDrawio(read('two-page.drawio'), 'shop.drawio', { iconLookup });
    const img = r.warnings.find((w) => w.code === 'unsupported_image');
    expect(img?.sourceRef).toBe('logo');
    // The edge to the skipped image is skipped too.
    expect(r.warnings.find((w) => w.code === 'edge_unconnected')?.sourceRef).toBe('e5');
    expect(r.stats.skipped).toBe(2);
  });

  it('rejects files over IMPORT_LIMITS.bytes', async () => {
    const huge = '<mxfile>' + ' '.repeat(IMPORT_LIMITS.bytes) + '</mxfile>';
    const r = await importDrawio(huge, 'huge.drawio');
    expect(r.ok).toBe(false);
    expect(r.doc).toBeUndefined();
    expect(r.error).toMatch(/limit/);
  });

  it('rejects non-draw.io input with an error', async () => {
    const r = await importDrawio('<svg xmlns="http://www.w3.org/2000/svg"/>', 'x.drawio');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect((await importDrawio('not xml <', 'x.drawio')).ok).toBe(false);
  });

  it('built-in aws4 icon table matches the manifest', () => {
    for (const [id, kind] of Object.entries(DEFAULT_ICON_KINDS)) {
      expect(iconLookup(id), id).toContain(kind);
    }
    for (const id of Object.values(DRAWIO_AWS_ALIASES)) expect(iconLookup(id), id).toBeDefined();
  });
});
