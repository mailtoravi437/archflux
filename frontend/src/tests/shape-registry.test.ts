/**
 * ShapeRegistry tests — catalog parity (behavior preservation with the
 * previous static list) + plugin behaviors (packs, search, recency).
 */
import { describe, expect, it } from 'vitest';
import {
  getShapeRegistry,
  resetShapeRegistry,
  toLibraryShape,
  GENERAL_PACK,
  AWS_PACK,
  type ShapeDefinition,
} from '../canvas/ShapeRegistry';
import { libraryShapes } from '../canvas/ShapeRegistry';

// The 36 catalog ids the UI has shipped forever (drawer/palette/placement).
const EXPECTED_IDS = [
  'gen-service', 'gen-gateway', 'gen-db', 'gen-stream',
  'aws-ec2', 'aws-lambda', 'aws-ecs', 'gcp-gce', 'gcp-run', 'gcp-gke',
  'az-vm', 'az-func', 'az-aks',
  'aws-s3', 'gcp-gcs', 'az-blob',
  'aws-rds', 'aws-dynamo', 'gcp-sql', 'gcp-bq', 'az-sql', 'az-cosmos',
  'data-redis', 'data-pg', 'data-mongo', 'data-es',
  'aws-apigw', 'aws-alb', 'aws-cfront', 'gcp-lb', 'az-fd',
  'aws-sqs', 'aws-sns', 'gcp-pubsub', 'az-sb', 'data-kafka', 'data-rabbit',
  'aws-cw',
];

describe('ShapeRegistry catalog parity', () => {
  it('derives exactly the historical catalog in pack order', () => {
    expect(libraryShapes.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it('keeps the provider/kind/icon data verbatim', () => {
    const ec2 = libraryShapes.find((s) => s.id === 'aws-ec2')!;
    expect(ec2).toMatchObject({
      provider: 'AWS', kind: 'service', label: 'EC2 Instance',
      tag: 'EC2 · t3.medium', icon: '🖥️', iconSrc: '/icons/aws/ec2.svg',
      stroke: '#FF9900', category: 'compute',
    });
  });
});

describe('ShapeRegistry plugin behaviors', () => {
  it(' categorizes and lists providers', () => {
    const reg = getShapeRegistry();
    const database = reg.getShapesByCategory('database').map((s) => s.id);
    expect(database).toContain('aws-rds');
    expect(database).toContain('data-pg');
    expect(reg.getCategories()).toEqual(
      expect.arrayContaining(['compute', 'network', 'observability']),
    );
    expect(reg.getProviders()).toEqual(expect.arrayContaining(['AWS', 'GCP', 'Azure', 'Data', 'General']));
  });

  it('full-text search hits label, tag, provider, and category', () => {
    const reg = getShapeRegistry();
    expect(reg.search('kafka').map((s) => s.id)).toContain('data-kafka');
    expect(reg.search('lambda').map((s) => s.id)).toContain('aws-lambda');
    expect(reg.search('messaging').map((s) => s.id)).toContain('gcp-pubsub');
    expect(reg.search('   ')).toHaveLength(reg.getAllShapes().length);
  });

  it('registers third-party packs and adapts unknown categories', () => {
    resetShapeRegistry();
    try {
      const reg = getShapeRegistry();
      const custom: ShapeDefinition = {
        id: 'acme-llm',
        name: 'LLM Gateway',
        provider: 'ACME',
        kind: 'custom',
        shape: 'rounded',
        label: 'LLM GW',
        tag: 'ai · router',
        icon: '🤖',
        iconSrc: undefined,
        stroke: '#111111',
        defaultWidth: 150,
        defaultHeight: 70,
        category: 'ai-ml',
        properties: [],
        connectionPoints: [],
      };
      reg.registerPack({
        id: 'acme', name: 'ACME', provider: 'ACME', description: 'third party', icon: '🤖', version: '0.1.0',
        shapes: [custom],
      });
      expect(reg.getShape('acme-llm')).toBeDefined();
      expect(reg.getPacks().map((p) => p.id)).toContain('acme');
      // ai-ml is outside the UI's strict union → degrades to 'general'
      const adapted = toLibraryShape(custom);
      expect(adapted.category).toBe('general');
      expect(adapted.kind).toBe('service'); // custom kind mapped for UI
      expect(adapted.provider).toBe('General'); // unknown provider → General
    } finally {
      resetShapeRegistry();
    }
  });

  it('recent-shape recency dedupes, caps at 8, and tolerates bad storage', () => {
    resetShapeRegistry();
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => { backing.set(k, v); },
    };
    expect(EXPECTED_IDS.length).toBe(38);
    const reg = getShapeRegistry();
    let ids: string[] = [];
    for (const id of ['gen-service', 'gen-db', 'gen-service', ...EXPECTED_IDS.slice(0, 9)]) {
      ids = reg.recordShapeUse(id, storage);
    }
    expect(ids).toHaveLength(8);
    // Most-recent-first with dedupe, capped
    ids = reg.recordShapeUse('gen-service', storage);
    expect(ids[0]).toBe('gen-service');
    expect(ids.filter((x) => x === 'gen-service')).toHaveLength(1);
    expect(reg.getRecentShapes(4, storage)).toHaveLength(4);
    // Corrupted storage → empty (no throw)
    backing.set('archflux:recent-shapes:v1', '{oops]');
    expect(reg.getRecentShapes(8, storage)).toEqual([]);
  });
});

describe('pack data sanity', () => {
  it('every built-in shape has four anchors and a port property', () => {
    for (const pack of [GENERAL_PACK, AWS_PACK, getShapeRegistry().getPack('gcp')!, getShapeRegistry().getPack('azure')!, getShapeRegistry().getPack('data')!]) {
      for (const shape of pack.shapes) {
        expect(shape.connectionPoints, shape.id).toHaveLength(4);
        expect(shape.properties.some((p) => p.key === 'port'), shape.id).toBe(true);
        expect(pack.shapes.filter((s) => s.id === shape.id)).toHaveLength(1);
      }
    }
  });
});
