/**
 * draw.io `mxgraph.aws4.<svc>` names → icon manifest ids (DATA_MODEL_R1 §6).
 *
 * Importers never fetch. Callers that hold the manifest pass
 * `createManifestLookup(manifest)`; otherwise `DEFAULT_ICON_LOOKUP` covers the AWS
 * icons that have kinds in `scripts/icon-kinds.json`. `import-drawio.test.ts`
 * checks this table against `public/icons/manifest.json`, so drift fails a test.
 */
import type { ElementKind } from '../../types';

/** Returns the icon's kinds when `manifestId` is in the manifest, else undefined. */
export type IconLookup = (manifestId: string) => readonly string[] | undefined;

/** Manifest ids and kinds (mirrors manifest.json for icons with kinds in icon-kinds.json). */
export const DEFAULT_ICON_KINDS: Readonly<Record<string, ElementKind>> = {
  'aws/amazon-api-gateway': 'gateway',
  'aws/amazon-aurora': 'database',
  'aws/amazon-cloudfront': 'cdn',
  'aws/amazon-cloudsearch': 'search',
  'aws/amazon-cloudwatch': 'observability',
  'aws/amazon-cognito': 'service',
  'aws/amazon-data-firehose': 'stream',
  'aws/amazon-documentdb': 'document-db',
  'aws/amazon-dynamodb': 'document-db',
  'aws/amazon-ec2': 'service',
  'aws/amazon-efs': 'object-storage',
  'aws/amazon-elastic-container-service': 'service',
  'aws/amazon-elastic-kubernetes-service': 'service',
  'aws/amazon-elasticache': 'cache',
  'aws/amazon-eventbridge': 'scheduler',
  'aws/amazon-kendra': 'search',
  'aws/amazon-keyspaces': 'document-db',
  'aws/amazon-kinesis': 'stream',
  'aws/amazon-kinesis-data-streams': 'stream',
  'aws/amazon-managed-grafana': 'observability',
  'aws/amazon-managed-service-for-prometheus': 'observability',
  'aws/amazon-managed-streaming-for-apache-kafka': 'stream',
  'aws/amazon-memorydb': 'cache',
  'aws/amazon-mq': 'queue',
  'aws/amazon-neptune': 'database',
  'aws/amazon-opensearch-service': 'search',
  'aws/amazon-rds': 'database',
  'aws/amazon-redshift': 'database',
  'aws/amazon-route53': 'gateway',
  'aws/amazon-simple-notification-service': 'queue',
  'aws/amazon-simple-queue-service': 'queue',
  'aws/amazon-simple-storage-service': 'object-storage',
  'aws/amazon-simple-storage-service-glacier': 'object-storage',
  'aws/amazon-timestream': 'database',
  'aws/aws-app-runner': 'service',
  'aws/aws-appsync': 'gateway',
  'aws/aws-elastic-beanstalk': 'service',
  'aws/aws-fargate': 'service',
  'aws/aws-global-accelerator': 'cdn',
  'aws/aws-lambda': 'function',
  'aws/aws-step-functions': 'scheduler',
  'aws/aws-xray': 'observability',
  'aws/elastic-load-balancing': 'gateway',
};

/** draw.io aws4 names whose manifest id is not `aws/<name>`, `aws/amazon-<name>` or `aws/aws-<name>`. */
export const DRAWIO_AWS_ALIASES: Readonly<Record<string, string>> = {
  s3: 'aws/amazon-simple-storage-service',
  glacier: 'aws/amazon-simple-storage-service-glacier',
  s3_glacier: 'aws/amazon-simple-storage-service-glacier',
  sqs: 'aws/amazon-simple-queue-service',
  sns: 'aws/amazon-simple-notification-service',
  ecs: 'aws/amazon-elastic-container-service',
  eks: 'aws/amazon-elastic-kubernetes-service',
  lambda_function: 'aws/aws-lambda',
  application_load_balancer: 'aws/elastic-load-balancing',
  network_load_balancer: 'aws/elastic-load-balancing',
  elastic_load_balancing: 'aws/elastic-load-balancing',
  route_53: 'aws/amazon-route53',
  cloudwatch_2: 'aws/amazon-cloudwatch',
  x_ray: 'aws/aws-xray',
  elastic_file_system: 'aws/amazon-efs',
  kinesis_data_firehose: 'aws/amazon-data-firehose',
  managed_streaming_for_kafka: 'aws/amazon-managed-streaming-for-apache-kafka',
  msk: 'aws/amazon-managed-streaming-for-apache-kafka',
  elasticsearch_service: 'aws/amazon-opensearch-service',
  documentdb_with_mongodb_compatibility: 'aws/amazon-documentdb',
  memorydb_for_redis: 'aws/amazon-memorydb',
  managed_service_for_grafana: 'aws/amazon-managed-grafana',
  api_gateway: 'aws/amazon-api-gateway',
};

export const DEFAULT_ICON_LOOKUP: IconLookup = (id) => {
  const kind = DEFAULT_ICON_KINDS[id];
  return kind ? [kind] : undefined;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Builds a lookup from a parsed `/icons/manifest.json`. Malformed entries are ignored. */
export function createManifestLookup(manifest: unknown): IconLookup {
  const map = new Map<string, readonly string[]>();
  const icons = isRecord(manifest) && Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const icon of icons) {
    if (!isRecord(icon) || typeof icon.id !== 'string') continue;
    const kinds = Array.isArray(icon.kinds) ? icon.kinds.filter((k): k is string => typeof k === 'string') : [];
    map.set(icon.id, kinds);
  }
  return (id) => map.get(id);
}

/** Candidate manifest ids for a draw.io aws4 name, most specific first. */
export function drawioAwsCandidates(svc: string): string[] {
  const name = svc.toLowerCase();
  const kebab = name.replace(/_/g, '-');
  const out: string[] = [];
  const alias = DRAWIO_AWS_ALIASES[name];
  if (alias) out.push(alias);
  out.push(`aws/amazon-${kebab}`, `aws/aws-${kebab}`, `aws/${kebab}`);
  return out;
}

/** Resolves a draw.io aws4 name to `{ id, kinds }`, or undefined when no candidate is in the manifest. */
export function resolveDrawioAwsIcon(svc: string, lookup: IconLookup): { id: string; kinds: readonly string[] } | undefined {
  for (const id of drawioAwsCandidates(svc)) {
    const kinds = lookup(id);
    if (kinds) return { id, kinds };
  }
  return undefined;
}
