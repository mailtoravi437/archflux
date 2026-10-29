// R1-E05-T02: icon resolution and suggestions against the real generated manifest (DATA_MODEL_R1 §6).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseIconManifest, resolveIcon, searchIcons, suggestIcons } from '../lib/icons';

const MANIFEST_PATH = join(__dirname, '..', '..', 'public', 'icons', 'manifest.json');
const rawManifest: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const entries = parseIconManifest(rawManifest);

describe('icons', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('parses every manifest icon', () => {
    expect(entries.length).toBe(554);
    expect(new Set(entries.map((e) => e.set))).toEqual(new Set(['aws', 'generic', 'k8s']));
  });

  it('search "postgres" ranks Amazon RDS first', () => {
    const hits = searchIcons(entries, 'postgres');
    expect(hits[0].id).toBe('aws/amazon-rds');
    expect(hits[0].name).toBe('Amazon RDS');
    expect(hits.map((h) => h.id)).toContain('aws/amazon-aurora');
    // Case-insensitive.
    expect(searchIcons(entries, 'POSTGRES')[0].id).toBe('aws/amazon-rds');
  });

  it('search ranks name matches above keyword matches and honours filters', () => {
    // "lambda" is in AWS Lambda's name and keywords; name wins over keyword-only hits.
    expect(searchIcons(entries, 'lambda')[0].id).toBe('aws/aws-lambda');
    const generic = searchIcons(entries, 'database', { set: 'generic' });
    expect(generic.length).toBeGreaterThan(0);
    expect(generic.every((e) => e.set === 'generic')).toBe(true);
    const caches = searchIcons(entries, 'redis', { kind: 'cache' });
    expect(caches.every((e) => e.kinds.includes('cache'))).toBe(true);
    expect(caches.map((e) => e.id)).toContain('aws/amazon-elasticache');
    expect(searchIcons(entries, 'database', { limit: 3 })).toHaveLength(3);
    expect(searchIcons(entries, 'zzzz-no-such-icon')).toEqual([]);
  });

  it('resolveIcon returns null for unknown id', () => {
    expect(resolveIcon({ set: 'aws', id: 'aws/does-not-exist' }, entries)).toBeNull();
    expect(resolveIcon(null, entries)).toBeNull();
    expect(resolveIcon(undefined, entries)).toBeNull();
    // Set mismatch is not a match.
    expect(resolveIcon({ set: 'generic', id: 'aws/amazon-rds' }, entries)).toBeNull();
    const rds = resolveIcon({ set: 'aws', id: 'aws/amazon-rds' }, entries);
    expect(rds?.src).toBe('/icons/aws/amazon-rds.svg');
  });

  it('suggestIcons for database returns RDS/Aurora', () => {
    const ids = suggestIcons(entries, 'database').map((e) => e.id);
    expect(ids.length).toBeLessThanOrEqual(8);
    expect(ids).toContain('aws/amazon-rds');
    expect(ids).toContain('aws/amazon-aurora');
    // A technology hint ranks its matches first, across kinds.
    const kafka = suggestIcons(entries, 'queue', 'Kafka');
    expect(kafka.length).toBeLessThanOrEqual(8);
    expect(kafka[0].id).toBe('generic/kafka');
    expect(kafka.map((e) => e.id)).toContain('aws/amazon-managed-streaming-for-apache-kafka');
  });

  it('loadIconManifest fetches once and caches the result', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(rawManifest), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadIconManifest } = await import('../lib/icons');
    const a = await loadIconManifest();
    const b = await loadIconManifest();
    expect(a).toBe(b);
    expect(a).toHaveLength(554);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/icons/manifest.json');
  });

  it('loadIconManifest does not cache a failed load', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawManifest), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadIconManifest } = await import('../lib/icons');
    await expect(loadIconManifest()).rejects.toThrow(/500/);
    await expect(loadIconManifest()).resolves.toHaveLength(554);
  });
});
