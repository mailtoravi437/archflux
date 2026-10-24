/**
 * ArchFlux Shape Registry — plugin architecture for extensible shapes
 * (LucidChart-parity: vendor packs, property schemas, connection anchors).
 *
 * The registry is the single source of truth for the shape library. The
 * statically-typed UI catalog (mocks.ts → libraryShapes) derives from it via
 * toLibraryShape(), so every future `registerPack` / importShapePack appears
 * in the drawer and command palette with zero UI changes.
 *
 * Deliberately import-free except domain types — usable from any package.
 */
import type { ArchNode, LibraryProvider, LibraryShape } from '../types';

// ==================== CORE TYPES ====================

export interface ShapeDefinition {
  /** Unique identifier (stable across export/import). */
  id: string;
  /** Human-readable name (defaults to label). */
  name: string;
  /** Vendor / family (AWS, GCP, Azure, Data, General, custom packs). */
  provider: string;
  /** Functional kind for counting/undo labels. */
  kind: 'service' | 'gateway' | 'db' | 'stream' | 'custom';
  /** Default visual shape when placed. */
  shape: 'rectangle' | 'logo' | 'cylinder' | 'rounded';
  /** Palette label. */
  label: string;
  /** Palette subtitle. */
  tag: string;
  /** Emoji glyph fallback. */
  icon: string;
  /** Vendor SVG served from /icons — rendered instead of the glyph. */
  iconSrc?: string;
  /** Border color. */
  stroke: string;
  /** Default fill (per-shape tint). */
  fill?: string;
  /** Default placement size in world units. */
  defaultWidth: number;
  defaultHeight: number;
  /** Functional category used by the drawer folders. */
  category: string;
  /** Inspector property schema (render-safe subset, no zod here yet). */
  properties: ShapeProperty[];
  /** Connection anchors relative to the node box (0..1). */
  connectionPoints: ConnectionPoint[];
  /** Escape hatch for bespoke renderers (optional; falls back to standard pass). */
  customRender?: (ctx: CanvasRenderingContext2D, node: ArchNode, isSelected: boolean, isDark: boolean) => void;
  metadata?: Record<string, unknown>;
}

export type ShapeCategoryKey =
  | 'compute'
  | 'storage'
  | 'database'
  | 'network'
  | 'messaging'
  | 'security'
  | 'observability'
  | 'analytics'
  | 'ai-ml'
  | 'devops'
  | 'general';

export interface ConnectionPoint {
  id: string;
  /** Relative position (0..1) within the node box. */
  x: number;
  y: number;
  type: 'input' | 'output' | 'bidirectional';
  label?: string;
}

export interface ShapeProperty {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'color' | 'multiline' | 'port' | 'url';
  default?: unknown;
  options?: { value: string; label: string }[];
  validation?: { required?: boolean; min?: number; max?: number; pattern?: string };
  description?: string;
  group?: 'basic' | 'advanced' | 'styling' | 'data';
}

export interface ShapePack {
  id: string;
  name: string;
  provider: string;
  description: string;
  icon: string;
  shapes: ShapeDefinition[];
  version: string;
}

// ==================== HELPERS ====================

const PORT: ShapeProperty = { key: 'port', label: 'Service port', type: 'port', default: '443', group: 'basic' }
;

/** Standard four-side anchors (relative to node box). */
function fourAnchors(): ConnectionPoint[] {
  return [
    { id: 'in', x: 0, y: 0.5, type: 'input', label: 'In' },
    { id: 'out', x: 1, y: 0.5, type: 'output', label: 'Out' },
    { id: 'top', x: 0.5, y: 0, type: 'bidirectional', label: 'Top' },
    { id: 'bottom', x: 0.5, y: 1, type: 'bidirectional', label: 'Bottom' },
  ];
}

function def(spec: Omit<ShapeDefinition, 'name' | 'shape' | 'properties' | 'connectionPoints' | 'defaultWidth' | 'defaultHeight'> & {
  name?: string;
  shape?: ShapeDefinition['shape'];
  properties?: ShapeProperty[];
  defaultWidth?: number;
  defaultHeight?: number;
}): ShapeDefinition {
  return {
    ...spec,
    name: spec.name ?? spec.label,
    shape: spec.shape ?? 'rectangle',
    properties: [PORT, ...(spec.properties ?? [])],
    connectionPoints: fourAnchors(),
    defaultWidth: spec.defaultWidth ?? 170,
    defaultHeight: spec.defaultHeight ?? 70,
  };
}

// ==================== BUILT-IN PACKS (the proven UI catalog) ====================

export const GENERAL_PACK: ShapePack = {
  id: 'general',
  name: 'General Purpose',
  provider: 'General',
  description: 'Abstract building blocks: service, gateway, database, stream.',
  icon: '⚙️',
  version: '1.0.0',
  shapes: [
    def({ id: 'gen-service', provider: 'General', kind: 'service', label: 'Microservice', tag: 'Node.js / REST', icon: '📦', iconSrc: '/icons/general/service.svg', stroke: '#2563EB', category: 'general', defaultWidth: 170, defaultHeight: 70, properties: [{ key: 'repo', label: 'Repository URL', type: 'url', default: '', group: 'advanced' }] }),
    def({ id: 'gen-gateway', provider: 'General', kind: 'gateway', label: 'API Gateway', tag: 'Ingress', icon: '🚪', iconSrc: '/icons/general/gateway.svg', stroke: '#7C3AED', category: 'general', defaultWidth: 170, defaultHeight: 70, properties: [{ key: 'rateLimit', label: 'Rate limit', type: 'text', default: '1000 req/min', group: 'advanced' }] }),
    def({ id: 'gen-db', provider: 'General', kind: 'db', label: 'Database', tag: 'SQL / NoSQL', icon: '🗄️', iconSrc: '/icons/general/database.svg', stroke: '#2563EB', category: 'general', defaultWidth: 170, defaultHeight: 70, properties: [{ key: 'engine', label: 'Engine', type: 'select', default: 'PostgreSQL', options: [
      { value: 'PostgreSQL', label: 'PostgreSQL' }, { value: 'MySQL', label: 'MySQL' }, { value: 'MongoDB', label: 'MongoDB' }, { value: 'Cassandra', label: 'Cassandra' }, { value: 'DynamoDB', label: 'DynamoDB' },
    ] }] }),
    def({ id: 'gen-stream', provider: 'General', kind: 'stream', label: 'Event Stream', tag: 'Pub / Sub', icon: '🌊', iconSrc: '/icons/general/stream.svg', stroke: '#7C3AED', category: 'general', defaultWidth: 170, defaultHeight: 70, properties: [{ key: 'topic', label: 'Topic', type: 'text', default: 'events' }] }),
  ],
};

export const AWS_PACK: ShapePack = {
  id: 'aws',
  name: 'Amazon Web Services',
  provider: 'AWS',
  description: 'Compute, storage, database, and messaging primitives for AWS.',
  icon: '☁️',
  version: '1.0.0',
  shapes: [
    def({ id: 'aws-ec2', provider: 'AWS', kind: 'service', label: 'EC2 Instance', tag: 'EC2 · t3.medium', icon: '🖥️', iconSrc: '/icons/aws/ec2.svg', stroke: '#FF9900', category: 'compute', defaultWidth: 170, defaultHeight: 70, properties: [
      { key: 'instanceType', label: 'Instance type', type: 'select', default: 't3.medium', options: [
        { value: 't3.micro', label: 't3.micro' }, { value: 't3.medium', label: 't3.medium' }, { value: 'm5.large', label: 'm5.large' }, { value: 'c5.large', label: 'c5.large' }, { value: 'r5.large', label: 'r5.large' },
      ], group: 'basic' },
    ] }),
    def({ id: 'aws-lambda', provider: 'AWS', kind: 'service', label: 'Lambda', tag: 'Lambda · Node.js 20', icon: 'λ', iconSrc: '/icons/aws/lambda.svg', stroke: '#FF9900', category: 'compute', defaultWidth: 170, defaultHeight: 70, properties: [
      { key: 'runtime', label: 'Runtime', type: 'select', default: 'nodejs20.x', options: [
        { value: 'nodejs20.x', label: 'Node.js 20' }, { value: 'python3.11', label: 'Python 3.11' }, { value: 'java17', label: 'Java 17' }, { value: 'go1.x', label: 'Go 1.x' },
      ], group: 'basic' },
      { key: 'memory', label: 'Memory (MB)', type: 'number', default: 128, validation: { min: 128, max: 10240 }, group: 'advanced' },
    ] }),
    def({ id: 'aws-ecs', provider: 'AWS', kind: 'service', label: 'ECS Service', tag: 'ECS · Fargate', icon: '🐳', iconSrc: '/icons/aws/ecs.svg', stroke: '#FF9900', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-s3', provider: 'AWS', kind: 'db', label: 'S3 Bucket', tag: 'S3 · Standard', icon: '🪣', iconSrc: '/icons/aws/s3.svg', stroke: '#FF9900', category: 'storage', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-rds', provider: 'AWS', kind: 'db', label: 'RDS Database', tag: 'RDS · Postgres 15', icon: '🐘', iconSrc: '/icons/aws/rds.svg', stroke: '#FF9900', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-dynamo', provider: 'AWS', kind: 'db', label: 'DynamoDB', tag: 'DynamoDB · on-demand', icon: '🗃️', iconSrc: '/icons/aws/dynamo.svg', stroke: '#FF9900', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-apigw', provider: 'AWS', kind: 'gateway', label: 'API Gateway', tag: 'API GW · REST', icon: '🚪', iconSrc: '/icons/aws/apigw.svg', stroke: '#FF9900', category: 'network', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-alb', provider: 'AWS', kind: 'gateway', label: 'Load Balancer', tag: 'ALB · L7', icon: '⚖️', iconSrc: '/icons/aws/alb.svg', stroke: '#FF9900', category: 'network', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-cfront', provider: 'AWS', kind: 'gateway', label: 'CloudFront', tag: 'CloudFront · CDN', icon: '🌐', iconSrc: '/icons/aws/cfront.svg', stroke: '#FF9900', category: 'network', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-sqs', provider: 'AWS', kind: 'stream', label: 'SQS Queue', tag: 'SQS · FIFO', icon: '📨', iconSrc: '/icons/aws/sqs.svg', stroke: '#FF9900', category: 'messaging', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-sns', provider: 'AWS', kind: 'stream', label: 'SNS Topic', tag: 'SNS · fan-out', icon: '📢', iconSrc: '/icons/aws/sns.svg', stroke: '#FF9900', category: 'messaging', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'aws-cw', provider: 'AWS', kind: 'service', label: 'CloudWatch', tag: 'CloudWatch · alarms', icon: '📈', iconSrc: '/icons/aws/cw.svg', stroke: '#FF9900', category: 'observability', defaultWidth: 170, defaultHeight: 70 }),
  ],
};

export const GCP_PACK: ShapePack = {
  id: 'gcp',
  name: 'Google Cloud Platform',
  provider: 'GCP',
  description: 'Compute, storage, analytics, and messaging for GCP.',
  icon: '☁️',
  version: '1.0.0',
  shapes: [
    def({ id: 'gcp-gce', provider: 'GCP', kind: 'service', label: 'Compute Engine', tag: 'GCE · e2-medium', icon: '🖥️', iconSrc: '/icons/gcp/compute.svg', stroke: '#4285F4', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-run', provider: 'GCP', kind: 'service', label: 'Cloud Run', tag: 'Cloud Run · gen2', icon: '🏃', iconSrc: '/icons/gcp/cloudrun.svg', stroke: '#4285F4', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-gke', provider: 'GCP', kind: 'service', label: 'GKE Cluster', tag: 'GKE · Autopilot', icon: '☸️', iconSrc: '/icons/gcp/gke.svg', stroke: '#4285F4', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-gcs', provider: 'GCP', kind: 'db', label: 'Cloud Storage', tag: 'GCS · multi-region', icon: '🪣', iconSrc: '/icons/gcp/storage.svg', stroke: '#4285F4', category: 'storage', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-sql', provider: 'GCP', kind: 'db', label: 'Cloud SQL', tag: 'Cloud SQL · Postgres', icon: '🐘', iconSrc: '/icons/gcp/sql.svg', stroke: '#4285F4', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-bq', provider: 'GCP', kind: 'db', label: 'BigQuery', tag: 'BigQuery · slots', icon: '📊', iconSrc: '/icons/gcp/bigquery.svg', stroke: '#4285F4', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-lb', provider: 'GCP', kind: 'gateway', label: 'Load Balancing', tag: 'GLB · anycast', icon: '⚖️', iconSrc: '/icons/gcp/lb.svg', stroke: '#4285F4', category: 'network', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'gcp-pubsub', provider: 'GCP', kind: 'stream', label: 'Pub/Sub', tag: 'Pub/Sub · ordered', icon: '📬', iconSrc: '/icons/gcp/pubsub.svg', stroke: '#4285F4', category: 'messaging', defaultWidth: 170, defaultHeight: 70 }),
  ],
};

export const AZURE_PACK: ShapePack = {
  id: 'azure',
  name: 'Microsoft Azure',
  provider: 'Azure',
  description: 'Compute, storage, database, and messaging for Azure.',
  icon: '☁️',
  version: '1.0.0',
  shapes: [
    def({ id: 'az-vm', provider: 'Azure', kind: 'service', label: 'Virtual Machine', tag: 'VM · D2s v5', icon: '🖥️', iconSrc: '/icons/azure/vm.svg', stroke: '#0078D4', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-func', provider: 'Azure', kind: 'service', label: 'Functions', tag: 'Functions · Flex', icon: 'λ', iconSrc: '/icons/azure/func.svg', stroke: '#0078D4', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-aks', provider: 'Azure', kind: 'service', label: 'AKS Cluster', tag: 'AKS · managed', icon: '☸️', iconSrc: '/icons/azure/aks.svg', stroke: '#0078D4', category: 'compute', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-blob', provider: 'Azure', kind: 'db', label: 'Blob Storage', tag: 'Blob · Hot tier', icon: '🪣', iconSrc: '/icons/azure/sql.svg', stroke: '#0078D4', category: 'storage', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-sql', provider: 'Azure', kind: 'db', label: 'SQL Database', tag: 'SQL DB · Hyperscale', icon: '🗄️', iconSrc: '/icons/azure/sql.svg', stroke: '#0078D4', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-cosmos', provider: 'Azure', kind: 'db', label: 'Cosmos DB', tag: 'Cosmos · SQL API', icon: '🌍', iconSrc: '/icons/azure/cosmos.svg', stroke: '#0078D4', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-fd', provider: 'Azure', kind: 'gateway', label: 'Front Door', tag: 'Front Door · WAF', icon: '🌐', iconSrc: '/icons/azure/fd.svg', stroke: '#0078D4', category: 'network', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'az-sb', provider: 'Azure', kind: 'stream', label: 'Service Bus', tag: 'Service Bus · sessions', icon: '📨', iconSrc: '/icons/azure/fd.svg', stroke: '#0078D4', category: 'messaging', defaultWidth: 170, defaultHeight: 70 }),
  ],
};

export const DATA_PACK: ShapePack = {
  id: 'data',
  name: 'Data & Infrastructure',
  provider: 'Data',
  description: 'Self-hosted stores and brokers: Redis, Postgres, Mongo, Kafka…',
  icon: '🗄️',
  version: '1.0.0',
  shapes: [
    def({ id: 'data-redis', provider: 'Data', kind: 'db', label: 'Redis', tag: 'Redis 7 · Cluster', icon: '🔴', iconSrc: '/icons/data/redis.svg', stroke: '#DC2626', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'data-pg', provider: 'Data', kind: 'db', label: 'PostgreSQL', tag: 'Postgres 15', icon: '🐘', iconSrc: '/icons/data/postgres.svg', stroke: '#336791', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'data-mongo', provider: 'Data', kind: 'db', label: 'MongoDB', tag: 'Mongo 7 · Atlas', icon: '🍃', iconSrc: '/icons/data/mongo.svg', stroke: '#47A248', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'data-es', provider: 'Data', kind: 'db', label: 'Elasticsearch', tag: 'Elastic 8', icon: '🔍', iconSrc: '/icons/data/elastic.svg', stroke: '#D97706', category: 'database', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'data-kafka', provider: 'Data', kind: 'stream', label: 'Kafka', tag: 'Kafka 3.6', icon: '🌊', iconSrc: '/icons/data/kafka.svg', stroke: '#7C3AED', category: 'messaging', defaultWidth: 170, defaultHeight: 70 }),
    def({ id: 'data-rabbit', provider: 'Data', kind: 'stream', label: 'RabbitMQ', tag: 'RabbitMQ · quorum', icon: '🐇', iconSrc: '/icons/data/rabbit.svg', stroke: '#FF6600', category: 'messaging', defaultWidth: 170, defaultHeight: 70 }),
  ],
};

// ==================== REGISTRY ====================

export class ShapeRegistry {
  private shapes = new Map<string, ShapeDefinition>();
  private packs = new Map<string, ShapePack>();
  private categoryIndex = new Map<string, Set<string>>();
  private providerIndex = new Map<string, Set<string>>();

  constructor() {
    this.registerPack(GENERAL_PACK);
    this.registerPack(AWS_PACK);
    this.registerPack(GCP_PACK);
    this.registerPack(AZURE_PACK);
    this.registerPack(DATA_PACK);
  }

  registerPack(pack: ShapePack): void {
    this.packs.set(pack.id, pack);
    for (const shape of pack.shapes) this.registerShape(shape);
  }

  registerShape(shape: ShapeDefinition): void {
    this.shapes.set(shape.id, shape);
    if (!this.categoryIndex.has(shape.category)) this.categoryIndex.set(shape.category, new Set());
    if (!this.providerIndex.has(shape.provider)) this.providerIndex.set(shape.provider, new Set());
    this.categoryIndex.get(shape.category)!.add(shape.id);
    this.providerIndex.get(shape.provider)!.add(shape.id);
  }

  unregisterShape(id: string): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    this.shapes.delete(id);
    this.categoryIndex.get(shape.category)?.delete(id);
    this.providerIndex.get(shape.provider)?.delete(id);
  }

  getShape(id: string): ShapeDefinition | undefined {
    return this.shapes.get(id);
  }

  /** Shapes in a functional category folder. */
  getShapesByCategory(category: string): ShapeDefinition[] {
    return [...(this.categoryIndex.get(category) ?? [])].map((id) => this.shapes.get(id)!).filter(Boolean);
  }

  getShapesByProvider(provider: string): ShapeDefinition[] {
    return [...(this.providerIndex.get(provider) ?? [])].map((id) => this.shapes.get(id)!).filter(Boolean);
  }

  getAllShapes(): ShapeDefinition[] {
    return [...this.shapes.values()];
  }

  getCategories(): string[] {
    return [...this.categoryIndex.keys()].sort();
  }

  getProviders(): string[] {
    return [...this.providerIndex.keys()].sort();
  }

  getPacks(): ShapePack[] {
    return [...this.packs.values()];
  }

  getPack(id: string): ShapePack | undefined {
    return this.packs.get(id);
  }

  /** Name/label/tag/provider/category full-text search. */
  search(query: string): ShapeDefinition[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.getAllShapes();
    return this.getAllShapes().filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.tag.toLowerCase().includes(q) ||
      s.provider.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q),
    );
  }

  // Recent shapes (localStorage-backed; the CanvasScreen keeps its own copy of
  // the same keys — this is the registry-side generic helper).

  getRecentShapes(limit = 8, storage?: Pick<Storage, 'getItem'>): ShapeDefinition[] {
    try {
      const raw = (storage ?? globalThis.localStorage)?.getItem('archflux:recent-shapes:v1');
      const ids: unknown = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
      const out: ShapeDefinition[] = [];
      for (const id of list.slice(0, limit)) {
        const shape = this.getShape(id);
        if (shape) out.push(shape);
      }
      return out;
    } catch {
      return [];
    }
  }

  recordShapeUse(id: string, storage?: Pick<Storage, 'getItem' | 'setItem'>): string[] {
    try {
      const st = storage ?? globalThis.localStorage;
      const raw = st.getItem('archflux:recent-shapes:v1');
      const ids: unknown = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
      const updated = [id, ...list.filter((x) => x !== id)].slice(0, 8);
      st.setItem('archflux:recent-shapes:v1', JSON.stringify(updated));
      return updated;
    } catch {
      return [id];
    }
  }
}

// ==================== SINGLETON ====================

let registryInstance: ShapeRegistry | null = null;

export function getShapeRegistry(): ShapeRegistry {
  if (!registryInstance) registryInstance = new ShapeRegistry();
  return registryInstance;
}

export function resetShapeRegistry(): void {
  registryInstance = null;
}

// ==================== ADAPTER TO THE UI CATALOG ====================

/**
 * Map a registry definition onto the statically-typed LibraryShape consumed
 * by the drawer / palette / node placement. Unknown categories degrade to
 * 'general' so third-party packs can never break the strict UI type.
 */
export function toLibraryShape(def: ShapeDefinition): LibraryShape {
  const STRICT_CATEGORIES: readonly string[] = [
    'compute', 'storage', 'database', 'network', 'messaging', 'security', 'observability', 'general',
  ];
  const kindMap: Record<ShapeDefinition['kind'], LibraryShape['kind']> = {
    service: 'service',
    gateway: 'gateway',
    db: 'db',
    stream: 'stream',
    custom: 'service',
  };
  const isolatedCategory: LibraryShape['category'] = (STRICT_CATEGORIES as readonly string[]).includes(def.category)
    ? (def.category as LibraryShape['category'])
    : 'general';
  return {
    id: def.id,
    provider: (['General', 'AWS', 'GCP', 'Azure', 'Data'].includes(def.provider) ? def.provider : 'General') as LibraryProvider,
    kind: kindMap[def.kind],
    label: def.label,
    tag: def.tag,
    icon: def.icon,
    iconSrc: def.iconSrc,
    stroke: def.stroke,
    category: isolatedCategory,
  };
}
