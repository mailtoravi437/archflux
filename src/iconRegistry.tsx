
// Map of icon names to their public URL paths
const iconPaths: Record<string, string> = {
  // AWS
  'aws-ec2': '/icons/aws/ec2.svg',
  'aws-lambda': '/icons/aws/lambda.svg',
  'aws-ecs': '/icons/aws/ecs.svg',
  'aws-rds': '/icons/aws/rds.svg',
  'aws-s3': '/icons/aws/s3.svg',
  'aws-sqs': '/icons/aws/sqs.svg',
  'aws-sns': '/icons/aws/sns.svg',
  'aws-alb': '/icons/aws/alb.svg',
  'aws-apigateway': '/icons/aws/apigw.svg',
  'aws-cloudfront': '/icons/aws/cfront.svg',
  'aws-cloudwatch': '/icons/aws/cw.svg',
  'aws-dynamodb': '/icons/aws/dynamo.svg',
  
  // GCP
  'gcp-compute': '/icons/gcp/compute.svg',
  'gcp-gke': '/icons/gcp/gke.svg',
  'gcp-sql': '/icons/gcp/sql.svg',
  'gcp-storage': '/icons/gcp/storage.svg',
  'gcp-bigquery': '/icons/gcp/bigquery.svg',
  'gcp-pubsub': '/icons/gcp/pubsub.svg',
  'gcp-run': '/icons/gcp/run.svg',
  'gcp-vertexai': '/icons/gcp/vertexai.svg',
  
  // Azure
  'azure-vm': '/icons/azure/vm.svg',
  'azure-aks': '/icons/azure/aks.svg',
  'azure-functions': '/icons/azure/func.svg',
  'azure-sql': '/icons/azure/sql.svg',
  'azure-cosmosdb': '/icons/azure/cosmos.svg',
  'azure-blob': '/icons/azure/blob.svg',
  'azure-frontdoor': '/icons/azure/fd.svg',
  
  // Data
  'kafka': '/icons/data/kafka.svg',
  'redis': '/icons/data/redis.svg',
  'postgresql': '/icons/data/postgres.svg',
  'mongodb': '/icons/data/mongo.svg',
  'elastic': '/icons/data/elastic.svg',
  'rabbitmq': '/icons/data/rabbit.svg',
  
  // Tools
  'select': '/icons/tools/select.svg',
  'pan': '/icons/tools/pan.svg',
  'draw': '/icons/tools/draw.svg',
  'text': '/icons/tools/text.svg',
  'service-tool': '/icons/tools/service.svg',
  'gateway-tool': '/icons/tools/gateway.svg',
  'database-tool': '/icons/tools/database.svg',
  'stream-tool': '/icons/tools/stream.svg',
  'connector': '/icons/tools/connector.svg',
  'comment': '/icons/tools/comment.svg',
  
  // Node icons
  'box': '/icons/node-icons/box.svg',
  'gateway-node': '/icons/node-icons/gateway.svg',
  'database-node': '/icons/node-icons/database.svg',
  'stream-node': '/icons/node-icons/stream.svg',
  'lightning': '/icons/node-icons/lightning.svg',
  'lock': '/icons/node-icons/lock.svg',
  'elephant': '/icons/node-icons/elephant.svg',
  'mail': '/icons/node-icons/mail.svg',
  'red': '/icons/node-icons/red.svg',
  'k8s': '/icons/node-icons/k8s.svg',
  'lambda': '/icons/node-icons/lambda.svg',
  'globe': '/icons/node-icons/globe.svg',
};

// Create SVG components for each icon
const iconCache = new Map<string, React.FC<{ className?: string; style?: React.CSSProperties }>>();

function createIconComponent(iconPath: string): React.FC<{ className?: string; style?: React.CSSProperties }> {
  const Component: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
    <img 
      src={iconPath} 
      alt="" 
      className={className} 
      style={{ width: 24, height: 24, ...style }} 
    />
  );
  return Component;
}

// Get or create icon component
export function getIcon(name: string): React.FC<{ className?: string; style?: React.CSSProperties }> | undefined {
  const path = iconPaths[name];
  if (!path) return undefined;
  
  if (!iconCache.has(name)) {
    iconCache.set(name, createIconComponent(iconPaths[name]));
  }
  return iconCache.get(name);
}

export function hasIcon(name: string): boolean {
  return name in iconPaths;
}

// For the canvas - return a pre-loaded icon component
export function getIconComponent(name: string): React.FC<{ className?: string; style?: React.CSSProperties }> {
  const icon = getIcon(name);
  if (!icon) {
    // Fallback
    return ({ className, style }) => (
      <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    );
  }
  return iconCache.get(name)!;
}

// Preload all icons at startup
export function preloadIcons(): void {
  Object.values(iconPaths).forEach(path => {
    const img = new Image();
    img.src = path;
  });
}

// Type exports
export type IconComponent = React.FC<{ className?: string; style?: React.CSSProperties }>;
export type IconRegistry = Record<string, string>;

// Export icon paths for direct use
export const iconPathsList = Object.keys(iconPaths);

// For backward compatibility with existing code
export const DefaultIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

// Export icon paths for direct use
export const iconPathsExport = iconPaths;
export const iconPathsListExport = Object.keys(iconPaths);
