/**
 * TEST-ONLY sample graph (never imported by app code — FRONTEND_SPEC
 * "No mock data"). Unit tests seed it via seedSampleDiagram(api); e2e suites
 * via sampleWorkspaceStorage() (e2e/fixtures.ts). Geometry is relied on by
 * canvas pointer tests and matches the pre-v1.5.0 first-run canvas, so the
 * visual-regression baselines still apply.
 */
import type { ArchEdge, ArchNode } from '../../types';

export const sampleNodes: ArchNode[] = [
  { id: 'client', type: 'service', label: 'Client Gateway', tag: 'Web / Mobile', health: '99.98%', x: 80, y: 160, w: 160, h: 70, stroke: '#2563EB', iconSrc: '/icons/aws/apigw.svg' },
  { id: 'envoy', type: 'gateway', label: 'Envoy Ingress Mesh', tag: 'Envoy v1.28', health: 'Healthy', x: 300, y: 150, w: 150, h: 80, stroke: '#7C3AED', iconSrc: '/icons/aws/alb.svg' },
  { id: 'auth', type: 'service', label: 'Auth Gateway', tag: 'Go 1.22 / OAuth2', health: 'Active', x: 300, y: 280, w: 150, h: 70, stroke: '#D97706', iconSrc: '/icons/aws/lambda.svg' },
  { id: 'order', type: 'service', label: 'Order Service', tag: 'Spring Boot 3.3', health: '99.95%', x: 520, y: 90, w: 170, h: 70, stroke: '#2563EB', iconSrc: '/icons/aws/ecs.svg' },
  { id: 'payment', type: 'service', label: 'Payment Orchestrator', tag: 'Temporal / Saga', health: 'Healthy', x: 520, y: 220, w: 170, h: 70, stroke: '#2563EB', iconSrc: '/icons/aws/ecs.svg' },
  { id: 'kafka', type: 'stream', label: 'Kafka Event Mesh', tag: 'Kafka Cluster v3.6', health: 'Active Bus', x: 750, y: 150, w: 160, h: 75, stroke: '#7C3AED', iconSrc: '/icons/aws/sqs.svg' },
  { id: 'redis', type: 'db', label: 'Redis Idempotency Cache', tag: 'Redis 7.2 Cluster', health: '0.4ms lat', x: 750, y: 280, w: 160, h: 70, stroke: '#D97706', iconSrc: '/icons/aws/dynamo.svg' },
  { id: 'postgres', type: 'db', label: 'Aurora PostgreSQL Primary', tag: 'RDS Multi-AZ', health: 'Primary db', x: 970, y: 150, w: 180, h: 75, stroke: '#2563EB', iconSrc: '/icons/aws/rds.svg' },
  { id: 'legacy-billing', type: 'service', label: 'Legacy Billing Worker', tag: 'Python 3.9', health: 'Isolated', x: 80, y: 310, w: 160, h: 65, stroke: '#6B7280', isOrphan: true, iconSrc: '/icons/aws/ec2.svg' },
];

export const sampleEdges: ArchEdge[] = [
  { id: 'e1', from: 'client', to: 'envoy', label: 'gRPC / TLS', color: '#2563EB' },
  { id: 'e2', from: 'envoy', to: 'auth', label: 'Token Verify', color: '#D97706' },
  { id: 'e3', from: 'envoy', to: 'order', label: 'POST /orders', color: '#2563EB' },
  { id: 'e4', from: 'order', to: 'kafka', label: 'pub: order-created', color: '#7C3AED' },
  { id: 'e5', from: 'kafka', to: 'payment', label: 'consume events', color: '#7C3AED' },
  { id: 'e6', from: 'payment', to: 'redis', label: 'SETNX lock', color: '#D97706' },
  { id: 'e7', from: 'payment', to: 'postgres', label: 'Commit State', color: '#2563EB' },
  { id: 'dangle-wire', from: 'auth', to: null, targetCoords: { x: 375, y: 400 }, label: 'Unresolved route', color: '#DC2626', isDangling: true },
];

/** localStorage entry (key + JSON) that opens the app on the sample workspace. */
export function sampleWorkspaceStorage(): { key: string; value: string } {
  const now = Date.now();
  const doc = { id: 'doc-sample', title: 'sample.arch', nodes: sampleNodes, edges: sampleEdges, strokes: [], createdAt: now, updatedAt: now };
  return {
    key: 'archflux:v2-light',
    value: JSON.stringify({ docs: [doc], activeDocId: doc.id, nodes: doc.nodes, edges: doc.edges, docTitle: doc.title }),
  };
}

/** Load the sample graph into a mounted store (call inside act()). */
export function seedSampleDiagram(api: { loadGraph: (n: ArchNode[], e: ArchEdge[], label?: string) => void }): void {
  api.loadGraph(
    sampleNodes.map((n) => ({ ...n })),
    sampleEdges.map((e) => ({ ...e, targetCoords: e.targetCoords ? { ...e.targetCoords } : undefined })),
    'test fixture',
  );
}
