import type {
  ArchEdge,
  ArchNode,
  Blueprint,
  Checkpoint,
  Connector,
  DriftLine,
  LibraryShape,
  PRPreview,
  ReviewComment,
} from './types';

export const mockNodes: ArchNode[] = [
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

export const mockEdges: ArchEdge[] = [
  { id: 'e1', from: 'client', to: 'envoy', label: 'gRPC / TLS', color: '#2563EB' },
  { id: 'e2', from: 'envoy', to: 'auth', label: 'Token Verify', color: '#D97706' },
  { id: 'e3', from: 'envoy', to: 'order', label: 'POST /orders', color: '#2563EB' },
  { id: 'e4', from: 'order', to: 'kafka', label: 'pub: order-created', color: '#7C3AED' },
  { id: 'e5', from: 'kafka', to: 'payment', label: 'consume events', color: '#7C3AED' },
  { id: 'e6', from: 'payment', to: 'redis', label: 'SETNX lock', color: '#D97706' },
  { id: 'e7', from: 'payment', to: 'postgres', label: 'Commit State', color: '#2563EB' },
  { id: 'dangle-wire', from: 'auth', to: null, targetCoords: { x: 375, y: 400 }, label: 'Unresolved route', color: '#DC2626', isDangling: true },
];

export const mockStrokes = [
  {
    id: 'sk-1',
    color: '#DC2626',
    width: 3,
    pts: [
      { x: 60, y: 120 }, { x: 85, y: 118 }, { x: 110, y: 122 }, { x: 135, y: 119 }, { x: 160, y: 121 },
      { x: 185, y: 118 }, { x: 210, y: 123 }, { x: 235, y: 120 }, { x: 260, y: 122 }, { x: 280, y: 119 },
    ],
  },
  {
    id: 'sk-2',
    color: '#D97706',
    width: 2,
    pts: [
      { x: 300, y: 60 }, { x: 305, y: 80 }, { x: 298, y: 100 }, { x: 302, y: 120 }, { x: 299, y: 140 },
    ],
  },
  {
    id: 'sk-3',
    color: '#2563EB',
    width: 2,
    pts: [
      { x: 500, y: 30 }, { x: 530, y: 28 }, { x: 560, y: 32 }, { x: 590, y: 29 }, { x: 620, y: 31 },
      { x: 650, y: 28 }, { x: 680, y: 30 }, { x: 710, y: 28 }, { x: 740, y: 32 },
    ],
  },
];

export const fraudWorkerNode: ArchNode = {
  id: 'fraud-worker',
  type: 'service',
  label: 'Fraud Detection Worker',
  tag: 'Python / ML-Inference',
  health: 'Healthy (3 reps)',
  x: 750,
  y: 40,
  w: 180,
  h: 70,
  stroke: '#2563EB',
};

export const fraudEdge: ArchEdge = {
  id: 'e-fraud-k',
  from: 'kafka',
  to: 'fraud-worker',
  label: 'audit events',
  color: '#7C3AED',
};

export const billingHealEdge: ArchEdge = {
  id: 'e-fix-b',
  from: 'kafka',
  to: 'legacy-billing',
  label: 'order-events',
  color: '#7C3AED',
};

export const mockConnectors: Connector[] = [
  {
    id: 'k8s',
    name: 'Kubernetes Service Mesh',
    detail: 'cluster: us-east-1-prod | ns: payments',
    icon: '☸️',
    iconSrc: '/icons/aws/ecs.svg',
    status: 'polling',
    statusLabel: '● Polling 3m',
  },
  {
    id: 'openapi',
    name: 'OpenAPI 3.1 Contract',
    detail: 'checkout-service/openapi.yaml (v2.4.1)',
    icon: '📄',
    iconSrc: '/icons/data/kafka.svg',
    status: 'drift',
    statusLabel: 'Drift Detected',
  },
  {
    id: 'terraform',
    name: 'Terraform Cloud State',
    detail: 'workspace: aws-prod-aurora-cluster',
    icon: '🏗️',
    iconSrc: '/icons/aws/ec2.svg',
    status: 'verified',
    statusLabel: '● Verified',
  },
];

export const mockDriftLines: DriftLine[] = [
  { kind: 'del', text: '- path: /api/v1/checkout -> direct DB lock' },
  { kind: 'add', text: '+ path: /api/v1/checkout -> async Kafka topic [order-created]' },
  { kind: 'add', text: '+ service: FraudDetectionWorker (replicas: 3, consumes: order-created)' },
  { kind: 'mod', text: '~ postgres: AuroraPool (max_conns: 120 -> 240)' },
];

export const mockCheckpoints: Checkpoint[] = [
  {
    id: 'v2.2',
    title: 'v2.2 - Added Payment Saga & Redis Invalidation',
    meta: 'Head (main) • Ravi Kumar • 8m ago',
    active: true,
    badge: '+2 nodes, +3 routes',
  },
  {
    id: 'v2.1',
    title: 'v2.1 - Decoupled Monolith to Event-Driven Mesh',
    meta: 'Release 2.1.0 • Elena R. • Yesterday',
  },
  {
    id: 'v1.0',
    title: 'v1.0 - Initial Production Architecture',
    meta: 'Commit 92f8a1 • 2 weeks ago',
  },
];

export const mockComment: ReviewComment = {
  author: 'Elena R.',
  role: 'Tech Lead',
  time: '45m ago',
  pinnedTo: 'Kafka Event Mesh',
  text: '@ravi are we enabling transactional outbox pattern for the Order Service to avoid dual-write anomalies with Postgres?',
};

export const mockBlueprints: Blueprint[] = [
  {
    id: 'event-kafka-cqrs',
    title: 'Event-Driven Microservices with Kafka & CQRS',
    category: 'Microservices',
    icon: '⚡',
    iconSrc: '/icons/data/kafka.svg',
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
    iconSrc: '/icons/data/redis.svg',
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
    iconSrc: '/icons/data/postgres.svg',
    desc: 'Append-only event log, projector workers, balance read models and audit trail.',
    nodeCount: 6,
    edgeCount: 5,
  },
  {
    id: 'iot-ingestion',
    title: 'Global IoT Telemetry Ingestion Engine with MQTT & TimeSeries DB',
    category: 'Data & Streaming',
    icon: '📡',
    iconSrc: '/icons/data/kafka.svg',
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

export interface PRItem extends PRPreview {
  branch: string;
  checks: { name: string; pass: boolean }[];
  diff: { kind: 'add' | 'del' | 'mod'; text: string }[];
}

export const mockPRs: PRItem[] = [
  {
    id: '142',
    title: 'PR #142: feat(arch): add fraud detection worker',
    status: '✓ Checks Passed',
    file: 'docs/architecture/checkout-event-driven-mesh.arch',
    summary: '+1 Microservice (FraudDetectionWorker) • +1 Kafka Event Route',
    note: '[Interactive SVG Visual PR Diff Rendered]',
    branch: 'feat/fraud-worker → main',
    checks: [
      { name: 'arch-lint (0 orphans)', pass: true },
      { name: 'drift-check (fresh)', pass: true },
      { name: 'schema-validate (.arch JSON)', pass: true },
    ],
    diff: [
      { kind: 'add', text: '+ service: FraudDetectionWorker (replicas: 3, consumes: order-created)' },
      { kind: 'add', text: '+ route: kafka → fraud-worker [audit events]' },
      { kind: 'mod', text: '~ postgres: AuroraPool (max_conns: 120 -> 240)' },
    ],
  },
  {
    id: '141',
    title: 'PR #141: fix(arch): bind legacy billing to Kafka',
    status: '⚠ 1 Check Failing',
    file: 'docs/architecture/checkout-event-driven-mesh.arch',
    summary: '+1 Kafka Route • -1 Isolated Service',
    note: 'Needs linter pass before merge',
    branch: 'fix/billing-binding → main',
    checks: [
      { name: 'arch-lint (0 orphans)', pass: false },
      { name: 'drift-check (fresh)', pass: true },
      { name: 'schema-validate (.arch JSON)', pass: true },
    ],
    diff: [
      { kind: 'add', text: '+ route: kafka → legacy-billing [order-events]' },
      { kind: 'mod', text: '~ legacy-billing: Isolated → Subscribed' },
    ],
  },
  {
    id: '140',
    title: 'PR #140: chore(arch): prune auth dangling wire',
    status: '✓ Checks Passed',
    file: 'docs/architecture/checkout-event-driven-mesh.arch',
    summary: '-1 Dangling Route • Auth Gateway cleaned',
    note: 'Auto-generated by linter bot',
    branch: 'bot/prune-dangling → main',
    checks: [
      { name: 'arch-lint (0 dangling)', pass: true },
      { name: 'drift-check (fresh)', pass: true },
      { name: 'schema-validate (.arch JSON)', pass: true },
    ],
    diff: [{ kind: 'del', text: '- route: auth → ∅ [Unresolved route]' }],
  },
];

/** Shape library organized by functional category (Excalidraw-style). */
export const libraryShapes: LibraryShape[] = [
  // General / Abstract
  { id: 'gen-service', provider: 'General', kind: 'service', label: 'Microservice', tag: 'Node.js / REST', icon: '📦', iconSrc: '/icons/general/service.svg', stroke: '#2563EB', category: 'general' },
  { id: 'gen-gateway', provider: 'General', kind: 'gateway', label: 'API Gateway', tag: 'Ingress', icon: '🚪', iconSrc: '/icons/general/gateway.svg', stroke: '#7C3AED', category: 'general' },
  { id: 'gen-db', provider: 'General', kind: 'db', label: 'Database', tag: 'SQL / NoSQL', icon: '🗄️', iconSrc: '/icons/general/database.svg', stroke: '#2563EB', category: 'general' },
  { id: 'gen-stream', provider: 'General', kind: 'stream', label: 'Event Stream', tag: 'Pub / Sub', icon: '🌊', iconSrc: '/icons/general/stream.svg', stroke: '#7C3AED', category: 'general' },
  // Compute
  { id: 'aws-ec2', provider: 'AWS', kind: 'service', label: 'EC2 Instance', tag: 'EC2 · t3.medium', icon: '🖥️', iconSrc: '/icons/aws/ec2.svg', stroke: '#FF9900', category: 'compute' },
  { id: 'aws-lambda', provider: 'AWS', kind: 'service', label: 'Lambda', tag: 'Lambda · Node.js 20', icon: 'λ', iconSrc: '/icons/aws/lambda.svg', stroke: '#FF9900', category: 'compute' },
  { id: 'aws-ecs', provider: 'AWS', kind: 'service', label: 'ECS Service', tag: 'ECS · Fargate', icon: '🐳', iconSrc: '/icons/aws/ecs.svg', stroke: '#FF9900', category: 'compute' },
  { id: 'gcp-gce', provider: 'GCP', kind: 'service', label: 'Compute Engine', tag: 'GCE · e2-medium', icon: '🖥️', iconSrc: '/icons/gcp/compute.svg', stroke: '#4285F4', category: 'compute' },
  { id: 'gcp-run', provider: 'GCP', kind: 'service', label: 'Cloud Run', tag: 'Cloud Run · gen2', icon: '🏃', iconSrc: '/icons/gcp/cloudrun.svg', stroke: '#4285F4', category: 'compute' },
  { id: 'gcp-gke', provider: 'GCP', kind: 'service', label: 'GKE Cluster', tag: 'GKE · Autopilot', icon: '☸️', iconSrc: '/icons/gcp/gke.svg', stroke: '#4285F4', category: 'compute' },
  { id: 'az-vm', provider: 'Azure', kind: 'service', label: 'Virtual Machine', tag: 'VM · D2s v5', icon: '🖥️', iconSrc: '/icons/azure/vm.svg', stroke: '#0078D4', category: 'compute' },
  { id: 'az-func', provider: 'Azure', kind: 'service', label: 'Functions', tag: 'Functions · Flex', icon: 'λ', iconSrc: '/icons/azure/func.svg', stroke: '#0078D4', category: 'compute' },
  { id: 'az-aks', provider: 'Azure', kind: 'service', label: 'AKS Cluster', tag: 'AKS · managed', icon: '☸️', iconSrc: '/icons/azure/aks.svg', stroke: '#0078D4', category: 'compute' },
  // Storage
  { id: 'aws-s3', provider: 'AWS', kind: 'db', label: 'S3 Bucket', tag: 'S3 · Standard', icon: '🪣', iconSrc: '/icons/aws/s3.svg', stroke: '#FF9900', category: 'storage' },
  { id: 'gcp-gcs', provider: 'GCP', kind: 'db', label: 'Cloud Storage', tag: 'GCS · multi-region', icon: '🪣', iconSrc: '/icons/gcp/storage.svg', stroke: '#4285F4', category: 'storage' },
  { id: 'az-blob', provider: 'Azure', kind: 'db', label: 'Blob Storage', tag: 'Blob · Hot tier', icon: '🪣', iconSrc: '/icons/azure/sql.svg', stroke: '#0078D4', category: 'storage' },
  // Database
  { id: 'aws-rds', provider: 'AWS', kind: 'db', label: 'RDS Database', tag: 'RDS · Postgres 15', icon: '🐘', iconSrc: '/icons/aws/rds.svg', stroke: '#FF9900', category: 'database' },
  { id: 'aws-dynamo', provider: 'AWS', kind: 'db', label: 'DynamoDB', tag: 'DynamoDB · on-demand', icon: '🗃️', iconSrc: '/icons/aws/dynamo.svg', stroke: '#FF9900', category: 'database' },
  { id: 'gcp-sql', provider: 'GCP', kind: 'db', label: 'Cloud SQL', tag: 'Cloud SQL · Postgres', icon: '🐘', iconSrc: '/icons/gcp/sql.svg', stroke: '#4285F4', category: 'database' },
  { id: 'gcp-bq', provider: 'GCP', kind: 'db', label: 'BigQuery', tag: 'BigQuery · slots', icon: '📊', iconSrc: '/icons/gcp/bigquery.svg', stroke: '#4285F4', category: 'database' },
  { id: 'az-sql', provider: 'Azure', kind: 'db', label: 'SQL Database', tag: 'SQL DB · Hyperscale', icon: '🗄️', iconSrc: '/icons/azure/sql.svg', stroke: '#0078D4', category: 'database' },
  { id: 'az-cosmos', provider: 'Azure', kind: 'db', label: 'Cosmos DB', tag: 'Cosmos · SQL API', icon: '🌍', iconSrc: '/icons/azure/cosmos.svg', stroke: '#0078D4', category: 'database' },
  { id: 'data-redis', provider: 'Data', kind: 'db', label: 'Redis', tag: 'Redis 7 · Cluster', icon: '🔴', iconSrc: '/icons/data/redis.svg', stroke: '#DC2626', category: 'database' },
  { id: 'data-pg', provider: 'Data', kind: 'db', label: 'PostgreSQL', tag: 'Postgres 15', icon: '🐘', iconSrc: '/icons/data/postgres.svg', stroke: '#336791', category: 'database' },
  { id: 'data-mongo', provider: 'Data', kind: 'db', label: 'MongoDB', tag: 'Mongo 7 · Atlas', icon: '🍃', iconSrc: '/icons/data/mongo.svg', stroke: '#47A248', category: 'database' },
  { id: 'data-es', provider: 'Data', kind: 'db', label: 'Elasticsearch', tag: 'Elastic 8', icon: '🔍', iconSrc: '/icons/data/elastic.svg', stroke: '#D97706', category: 'database' },
  // Network
  { id: 'aws-apigw', provider: 'AWS', kind: 'gateway', label: 'API Gateway', tag: 'API GW · REST', icon: '🚪', iconSrc: '/icons/aws/apigw.svg', stroke: '#FF9900', category: 'network' },
  { id: 'aws-alb', provider: 'AWS', kind: 'gateway', label: 'Load Balancer', tag: 'ALB · L7', icon: '⚖️', iconSrc: '/icons/aws/alb.svg', stroke: '#FF9900', category: 'network' },
  { id: 'aws-cfront', provider: 'AWS', kind: 'gateway', label: 'CloudFront', tag: 'CloudFront · CDN', icon: '🌐', iconSrc: '/icons/aws/cfront.svg', stroke: '#FF9900', category: 'network' },
  { id: 'gcp-lb', provider: 'GCP', kind: 'gateway', label: 'Load Balancing', tag: 'GLB · anycast', icon: '⚖️', iconSrc: '/icons/gcp/lb.svg', stroke: '#4285F4', category: 'network' },
  { id: 'az-fd', provider: 'Azure', kind: 'gateway', label: 'Front Door', tag: 'Front Door · WAF', icon: '🌐', iconSrc: '/icons/azure/fd.svg', stroke: '#0078D4', category: 'network' },
  // Messaging
  { id: 'aws-sqs', provider: 'AWS', kind: 'stream', label: 'SQS Queue', tag: 'SQS · FIFO', icon: '📨', iconSrc: '/icons/aws/sqs.svg', stroke: '#FF9900', category: 'messaging' },
  { id: 'aws-sns', provider: 'AWS', kind: 'stream', label: 'SNS Topic', tag: 'SNS · fan-out', icon: '📢', iconSrc: '/icons/aws/sns.svg', stroke: '#FF9900', category: 'messaging' },
  { id: 'gcp-pubsub', provider: 'GCP', kind: 'stream', label: 'Pub/Sub', tag: 'Pub/Sub · ordered', icon: '📬', iconSrc: '/icons/gcp/pubsub.svg', stroke: '#4285F4', category: 'messaging' },
  { id: 'az-sb', provider: 'Azure', kind: 'stream', label: 'Service Bus', tag: 'Service Bus · sessions', icon: '📨', iconSrc: '/icons/azure/fd.svg', stroke: '#0078D4', category: 'messaging' },
  { id: 'data-kafka', provider: 'Data', kind: 'stream', label: 'Kafka', tag: 'Kafka 3.6', icon: '🌊', iconSrc: '/icons/data/kafka.svg', stroke: '#7C3AED', category: 'messaging' },
  { id: 'data-rabbit', provider: 'Data', kind: 'stream', label: 'RabbitMQ', tag: 'RabbitMQ · quorum', icon: '🐇', iconSrc: '/icons/data/rabbit.svg', stroke: '#FF6600', category: 'messaging' },
  // Observability
  { id: 'aws-cw', provider: 'AWS', kind: 'service', label: 'CloudWatch', tag: 'CloudWatch · alarms', icon: '📈', iconSrc: '/icons/aws/cw.svg', stroke: '#FF9900', category: 'observability' },
];

/** Deterministic blueprint graph payloads — used by Load-to-Canvas. */
export function blueprintGraph(id: string): { nodes: ArchNode[]; edges: ArchEdge[] } {
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
    case 'checkout-mesh':
      return { nodes: cloneDefaultNodes(), edges: cloneDefaultEdges() };
    default: {
      const bp = mockBlueprints.find((b) => b.id === id);
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

function cloneDefaultNodes(): ArchNode[] {
  return mockNodes.map((n) => ({ ...n }));
}
function cloneDefaultEdges(): ArchEdge[] {
  return mockEdges.map((e) => ({ ...e }));
}
