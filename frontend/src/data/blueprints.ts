/**
 * Blueprint template catalog — authored product content (FRONTEND_SPEC
 * "No mock data": templates are kept, sample data is not). Each entry loads a
 * deterministic starter graph via blueprintGraph().
 */
import type { ArchEdge, ArchNode, Blueprint } from '../types';
import { normalizeDoc } from '../lib/docModel';

export const blueprints: Blueprint[] = [
  {
    id: 'event-kafka-cqrs',
    title: 'Event-Driven Microservices with Kafka & CQRS',
    category: 'Microservices',
    icon: '⚡',
    desc: 'Kafka topics splitting command write-paths from materialized read-paths with outbox safety.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'multi-region-vpc',
    title: 'Multi-Region AWS VPC with Global Accelerator & Route 53 Failover',
    category: 'Cloud Native',
    icon: '🌍',
    iconSrc: '/icons/node-icons/globe.svg',
    desc: 'Dual-region VPCs, Global Accelerator anycast, regional failover with health-checked endpoints.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'rag-pipeline',
    title: 'Modern Enterprise RAG Pipeline (Vector DB + Semantic LLM Cache + Redis)',
    category: 'AI / RAG',
    icon: '🧠',
    desc: 'Ingest → chunk → embed → vector DB retrieval with LLM cache and eval stream.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'k8s-service-mesh',
    title: 'Kubernetes Production Service Mesh (Istio Envoy + Ingress Gateway)',
    category: 'Cloud Native',
    icon: '☸️',
    iconSrc: '/icons/node-icons/k8s.svg',
    desc: 'Istio sidecars, ingress gateway, mTLS policy engine and telemetry pipeline.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'zero-trust-gateway',
    title: 'Zero-Trust API Gateway & OIDC Authentication Flow',
    category: 'Security & Auth',
    icon: '🔐',
    iconSrc: '/icons/node-icons/lock.svg',
    desc: 'OAuth2 gateway, JWT verifier, policy engine, audit log stream and session cache.',
    nodeCount: 5,
    edgeCount: 4,
  },
  {
    id: 'ledger-sourcing',
    title: 'Real-Time Financial Ledger with Immutable Event Sourcing',
    category: 'Data & Streaming',
    icon: '💳',
    desc: 'Append-only event log, projector workers, balance read models and audit trail.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'iot-ingestion',
    title: 'Global IoT Telemetry Ingestion Engine with MQTT & TimeSeries DB',
    category: 'Data & Streaming',
    icon: '📡',
    desc: 'MQTT brokers at edge, stream processing, hot/warm TimeSeries tiers and alerting.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'graphql-federation',
    title: 'GraphQL Federation with Distributed Subgraphs & Apollo Router',
    category: 'Microservices',
    icon: '🕸️',
    iconSrc: '/icons/node-icons/globe.svg',
    desc: 'Federated gateway composing ownership-scoped subgraphs with schema checks.',
    nodeCount: 5,
    edgeCount: 4,
  },
  {
    id: 'edge-cdn',
    title: 'Serverless Edge Compute & Dynamic CDN Routing',
    category: 'Cloud Native',
    icon: '🌐',
    iconSrc: '/icons/node-icons/globe.svg',
    desc: 'Edge workers, dynamic CDN routing, origin shield and cache-invalidation stream.',
    nodeCount: 5,
    edgeCount: 4,
  },
];

/** Deterministic blueprint graph payloads — used by Load-to-Canvas. */
/** Starter graph for a blueprint, normalised like every other load path (DATA_MODEL_R1 §1.2). */
export function blueprintGraph(id: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const raw = rawBlueprintGraph(id);
  const doc = normalizeDoc({ nodes: raw.nodes, edges: raw.edges });
  return doc ? { nodes: doc.nodes, edges: doc.edges } : raw;
}

function rawBlueprintGraph(id: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const N = (n: Partial<ArchNode> & { id: string }): ArchNode => ({
    type: 'service',
    label: n.id,
    tag: 'v1',
    health: 'Healthy',
    x: 80,
    y: 120,
    w: 170,
    h: 70,
    stroke: '#2563EB',
    ...n,
  });
  const E = (from: string, to: string, label: string, color = '#2563EB'): ArchEdge => ({
    id: `e-${from}-${to}`,
    from,
    to,
    label,
    color,
  });
  switch (id) {
    case 'rate-limiter':
      return {
        nodes: [
          N({ id: 'edge', type: 'gateway', label: 'Edge Gateway', tag: 'Envoy filter', x: 80, y: 140, w: 160, h: 70, stroke: '#7C3AED' }),
          N({ id: 'limiter', type: 'service', label: 'Rate Limiter', tag: 'Sliding window', x: 300, y: 140, w: 160, h: 70, stroke: '#D97706' }),
          N({ id: 'redis-rl', type: 'db', label: 'Redis Counters', tag: 'Redis 7 Cluster', x: 520, y: 90, w: 170, h: 70, stroke: '#D97706' }),
          N({ id: 'queue', type: 'stream', label: 'Fallback Queue', tag: 'Kafka retry', x: 520, y: 220, w: 170, h: 70, stroke: '#7C3AED' }),
          N({ id: 'api', type: 'service', label: 'Core API', tag: 'Go / gRPC', x: 740, y: 140, w: 160, h: 70, stroke: '#2563EB' }),
        ],
        edges: [E('edge', 'limiter', 'check quota'), E('limiter', 'redis-rl', 'INCR window'), E('limiter', 'queue', 'overflow'), E('limiter', 'api', 'allow')],
      };
    case 'payment-saga':
      return {
        nodes: [
          N({ id: 'order', type: 'service', label: 'Order Service', tag: 'Spring Boot 3', x: 80, y: 140, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'saga', type: 'service', label: 'Saga Orchestrator', tag: 'Temporal', x: 300, y: 140, w: 170, h: 70, stroke: '#7C3AED' }),
          N({ id: 'pay', type: 'service', label: 'Payment Service', tag: 'Stripe / PSP', x: 520, y: 90, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'inv', type: 'service', label: 'Inventory Service', tag: 'Reserve stock', x: 520, y: 220, w: 170, h: 70, stroke: '#D97706' }),
          N({ id: 'bus', type: 'stream', label: 'Saga Event Bus', tag: 'Kafka', x: 740, y: 140, w: 160, h: 70, stroke: '#7C3AED' }),
          N({ id: 'ledger', type: 'db', label: 'Saga Ledger', tag: 'Postgres', x: 950, y: 140, w: 170, h: 70, stroke: '#2563EB' }),
        ],
        edges: [E('order', 'saga', 'begin saga'), E('saga', 'pay', 'charge'), E('saga', 'inv', 'reserve'), E('saga', 'bus', 'publish'), E('bus', 'ledger', 'append')],
      };
    case 'event-kafka-cqrs':
    case 'kafka-cqrs':
      return {
        nodes: [
          N({ id: 'cmd', type: 'service', label: 'Command API', tag: 'Write path', x: 80, y: 140, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'kafka', type: 'stream', label: 'Kafka Log', tag: 'v3.6', x: 300, y: 140, w: 160, h: 70, stroke: '#7C3AED' }),
          N({ id: 'proj', type: 'service', label: 'Projector', tag: 'Materialize', x: 520, y: 140, w: 160, h: 70, stroke: '#7C3AED' }),
          N({ id: 'read', type: 'db', label: 'Read Store', tag: 'Elasticsearch', x: 740, y: 90, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'write', type: 'db', label: 'Write Store', tag: 'Postgres', x: 740, y: 220, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'query', type: 'gateway', label: 'Query Gateway', tag: 'GraphQL', x: 950, y: 140, w: 170, h: 70, stroke: '#7C3AED' }),
        ],
        edges: [E('cmd', 'kafka', 'append'), E('cmd', 'write', 'commit'), E('kafka', 'proj', 'consume'), E('proj', 'read', 'upsert'), E('read', 'query', 'serve')],
      };
    default: {
      const bp = blueprints.find((b) => b.id === id);
      const title = bp?.title ?? id;
      return {
        nodes: [
          N({ id: 'gw', type: 'gateway', label: `${title} Gateway`, tag: 'Ingress', x: 80, y: 140, w: 170, h: 70, stroke: '#7C3AED' }),
          N({ id: 'svc', type: 'service', label: `${title} Core`, tag: 'Service', x: 300, y: 140, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'bus2', type: 'stream', label: 'Event Bus', tag: 'Kafka', x: 520, y: 140, w: 160, h: 70, stroke: '#7C3AED' }),
          N({ id: 'store', type: 'db', label: 'Primary Store', tag: 'Postgres', x: 740, y: 140, w: 170, h: 70, stroke: '#2563EB' }),
          N({ id: 'cache', type: 'db', label: 'Cache', tag: 'Redis', x: 520, y: 260, w: 160, h: 70, stroke: '#D97706' }),
        ],
        edges: [E('gw', 'svc', 'route'), E('svc', 'bus2', 'publish'), E('bus2', 'store', 'project'), E('svc', 'cache', 'cache')],
      };
    }
  }
}
