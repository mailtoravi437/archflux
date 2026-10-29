#!/usr/bin/env node
// R1-E05-T01: builds public/icons/manifest.json (DATA_MODEL_R1 §6).
//
// - Copies the official AWS Architecture Icons (architecture-service + architecture-group only,
//   byte-for-byte: official icons are never modified) to public/icons/aws/<kebab>.svg.
// - Copies the project-owned generic set (src/assets/icons/archflux-system-design-200) to
//   public/icons/generic/.
// - Writes a sorted, deterministic manifest. Exits non-zero on a duplicate id or a duplicate
//   SVG content hash.
//
// Node 20, no dependencies. Run: npm run icons:build
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AWS_PKG = join(ROOT, 'node_modules', 'aws-icons');
const AWS_SOURCES = ['architecture-service', 'architecture-group'];
const GENERIC_SRC = join(ROOT, 'src', 'assets', 'icons', 'archflux-system-design-200');
const K8S_SRC = join(ROOT, 'vendor', 'k8s-icons');
const K8S_ICONS = {
  // [vendor sub-folder, file stem]: [display name, keywords]
  'resources/c-role': ['ClusterRole', ['rbac']], 'resources/cm': ['ConfigMap', ['config']],
  'resources/crb': ['ClusterRoleBinding', ['rbac']], 'resources/crd': ['CustomResourceDefinition', ['crd', 'operator']],
  'resources/cronjob': ['CronJob', ['schedule', 'batch']], 'resources/deploy': ['Deployment', ['workload']],
  'resources/ds': ['DaemonSet', ['workload']], 'resources/ep': ['Endpoints', ['network']],
  'resources/group': ['Group', ['rbac']], 'resources/hpa': ['HorizontalPodAutoscaler', ['hpa', 'autoscaling']],
  'resources/ing': ['Ingress', ['network', 'ingress']], 'resources/job': ['Job', ['batch']],
  'resources/limits': ['LimitRange', ['quota']], 'resources/netpol': ['NetworkPolicy', ['network', 'security']],
  'resources/ns': ['Namespace', ['namespace']], 'resources/pod': ['Pod', ['workload']],
  'resources/psp': ['PodSecurityPolicy', ['security']], 'resources/pv': ['PersistentVolume', ['storage']],
  'resources/pvc': ['PersistentVolumeClaim', ['storage']], 'resources/quota': ['ResourceQuota', ['quota']],
  'resources/rb': ['RoleBinding', ['rbac']], 'resources/role': ['Role', ['rbac']],
  'resources/rs': ['ReplicaSet', ['workload']], 'resources/sa': ['ServiceAccount', ['rbac']],
  'resources/sc': ['StorageClass', ['storage']], 'resources/secret': ['Secret', ['security']],
  'resources/sts': ['StatefulSet', ['workload']], 'resources/svc': ['Service', ['network']],
  'resources/user': ['User', ['rbac']], 'resources/vol': ['Volume', ['storage']],
  'infrastructure/control-plane': ['Control Plane', ['master']], 'infrastructure/etcd': ['etcd', ['store']],
  'infrastructure/node': ['Node', ['worker']],
  'control-plane/api': ['API Server', ['kube-apiserver']], 'control-plane/c-c-m': ['Cloud Controller Manager', ['ccm']],
  'control-plane/c-m': ['Controller Manager', ['kube-controller-manager']], 'control-plane/k-proxy': ['Kube Proxy', ['kube-proxy']],
  'control-plane/kubelet': ['Kubelet', ['node agent']], 'control-plane/sched': ['Scheduler', ['kube-scheduler']],
};
const PUBLIC_ICONS = join(ROOT, 'public', 'icons');
const MANIFEST = join(PUBLIC_ICONS, 'manifest.json');

/** Pre-existing hand-copied AWS icons still referenced by name; kept on disk, not in the manifest. */
const LEGACY_AWS = new Set([
  'alb.svg', 'apigw.svg', 'cfront.svg', 'cw.svg', 'dynamo.svg', 'ec2.svg',
  'ecs.svg', 'lambda.svg', 'rds.svg', 's3.svg', 'sns.svg', 'sqs.svg',
]);

/** Words AWS writes as one camel-cased token; kept whole when splitting on case boundaries. */
const JOINED_WORDS = ['IoT', 'DevOps', 'OpenSearch', 'OpenShift', 'OpenTelemetry', 'NetApp', 'OpenZFS',
  'PyTorch', 'TensorFlow', 'CloudFront', 'CloudWatch', 'CloudFormation', 'CloudTrail', 'CloudShell',
  'CloudHSM', 'CloudSearch', 'DynamoDB', 'DocumentDB', 'MemoryDB', 'ElastiCache',
  'EventBridge', 'GuardDuty', 'SageMaker', 'WorkDocs', 'WorkMail', 'WorkSpaces',
  'AppSync', 'AppFlow', 'AppConfig', 'AppFabric', 'AppMesh', 'AppStudio', 'DataBrew', 'DataSync',
  'DataZone', 'FinSpace', 'FleetWise', 'SiteWise', 'TwinMaker', 'ExpressLink', 'GameLift', 'HealthLake',
  'HealthOmics', 'HealthScribe', 'CodeArtifact', 'CodeBuild', 'CodeCommit', 'CodeDeploy', 'CodePipeline',
  'CodeCatalyst', 'CodeGuru', 'CodeWhisperer', 'AgentCore', 'DeepRacer', 'SimSpace', 'MXNet', 'FreeRTOS',
  'VMware', 'FSx', 'A2I', 'rePost', 'B2B', 'IAM', 'IQ', 'RTB', 'WAF', 'SDKs', '3D', 'XRay'];

/** Lowercase connectors AWS glues onto a neighbour ("CostandUsage", "S3onOutposts", "DistroforOpen…"). */
const CONNECTORS = [
  /(?<=[A-Za-z0-9]|^)(for)(?=[A-Z])/g,
  /(?<=[a-z])(?<!Comm)(and)(?=[A-Z])/g,
  /(?<=[0-9]|^|Service)(on)(?=[A-Z])/g,
  /(?<=Site)(to)(?=[A-Z])/g,
  /(?<=Database)(at)(?=[A-Z])/g,
];

const fail = (msg) => {
  console.error(`icons:build: ${msg}`);
  process.exit(1);
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (xs) => [...new Set(xs)].sort(byString);

/** Splits a PascalCase file stem on case boundaries, keeping acronyms and JOINED_WORDS whole. */
export function splitWords(stem) {
  const placeholders = [];
  let s = stem;
  for (const w of [...JOINED_WORDS].sort((a, b) => b.length - a.length)) {
    s = s.split(w).join(` \u0000${placeholders.push(w) - 1}\u0000 `);
  }
  const words = s
    .split(' ')
    .filter(Boolean)
    .flatMap((part) =>
      part.startsWith('\u0000')
        ? [placeholders[Number(part.slice(1, -1))]]
        : part
            .replace(CONNECTORS[0], ' $1 ')
            .replace(CONNECTORS[1], ' $1 ')
            .replace(CONNECTORS[2], ' $1 ')
            .replace(CONNECTORS[3], ' $1 ')
            .replace(CONNECTORS[4], ' $1 ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(' ')
            .filter(Boolean),
    );
  return words;
}

const kebab = (stem) => splitWords(stem).join('-').toLowerCase();

function listSvgs(dir) {
  if (!existsSync(dir)) fail(`missing source directory ${dir}`);
  return readdirSync(dir).filter((f) => f.endsWith('.svg')).sort(byString);
}

function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path).equals(content)) return;
  writeFileSync(path, content);
}

function syncFile(from, to) {
  const content = readFileSync(from);
  if (existsSync(to) && readFileSync(to).equals(content)) return content;
  copyFileSync(from, to);
  return content;
}

/** Removes .svg files in `dir` that this run didn't produce (except `keep`). */
function prune(dir, produced, keep = new Set()) {
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.svg') && !produced.has(f) && !keep.has(f)) unlinkSync(join(dir, f));
  }
}

const names = readJson(join(ROOT, 'scripts', 'icon-names.json'));
const kindsMap = readJson(join(ROOT, 'scripts', 'icon-kinds.json'));
const awsVersion = readJson(join(AWS_PKG, 'package.json')).version;

const icons = [];
const usedKindKeys = new Set();
const meta = (key) => {
  const m = kindsMap[key];
  if (!m) return { kinds: [], keywords: [] };
  usedKindKeys.add(key);
  return { kinds: sortedUnique(m.kinds ?? []), keywords: m.keywords ?? [] };
};

// 1. AWS (service + group).
const awsOut = join(PUBLIC_ICONS, 'aws');
mkdirSync(awsOut, { recursive: true });
const awsProduced = new Set();
for (const sub of AWS_SOURCES) {
  for (const file of listSvgs(join(AWS_PKG, 'icons', sub))) {
    const stem = file.slice(0, -4);
    const outName = `${kebab(stem)}.svg`;
    if (awsProduced.has(outName)) fail(`duplicate id aws/${outName.slice(0, -4)} (from ${sub}/${file})`);
    if (LEGACY_AWS.has(outName)) fail(`aws/${outName} collides with a legacy icon file`);
    awsProduced.add(outName);
    const content = syncFile(join(AWS_PKG, 'icons', sub, file), join(awsOut, outName));
    const { kinds, keywords } = meta(stem);
    icons.push({
      id: `aws/${outName.slice(0, -4)}`,
      set: 'aws',
      name: names[stem] ?? splitWords(stem).join(' '),
      keywords: sortedUnique(sub === 'architecture-group' ? ['group', ...keywords] : keywords),
      kinds,
      src: `/icons/aws/${outName}`,
      hash: sha256(content),
    });
  }
}
prune(awsOut, awsProduced, LEGACY_AWS);

// 2. Generic (project-owned), driven by its catalog.
const catalog = readJson(join(GENERIC_SRC, 'icon-catalog.json'));
if (!Array.isArray(catalog)) fail('icon-catalog.json must be an array');
const genericOut = join(PUBLIC_ICONS, 'generic');
mkdirSync(genericOut, { recursive: true });
const genericProduced = new Set();
for (const entry of [...catalog].sort((a, b) => byString(a.file, b.file))) {
  const file = entry.file;
  if (typeof file !== 'string' || !file.endsWith('.svg')) fail(`bad catalog entry ${JSON.stringify(entry)}`);
  if (genericProduced.has(file)) fail(`duplicate id generic/${file.slice(0, -4)}`);
  genericProduced.add(file);
  const content = syncFile(join(GENERIC_SRC, file), join(genericOut, file));
  const stem = file.slice(0, -4);
  const { kinds, keywords } = meta(`generic/${stem}`);
  const tags = (entry.tags ?? []).filter((t) => t !== 'system design' && t !== 'architecture');
  icons.push({
    id: `generic/${stem}`,
    set: 'generic',
    name: entry.name,
    keywords: sortedUnique([entry.category, ...tags, ...keywords].map((k) => String(k).toLowerCase())),
    kinds,
    src: `/icons/generic/${file}`,
    hash: sha256(content),
  });
}
prune(genericOut, genericProduced);

// 2b. Kubernetes (official community icons, Apache-2.0, vendored byte-for-byte; R1-E05-T05).
const k8sOut = join(PUBLIC_ICONS, 'k8s');
mkdirSync(k8sOut, { recursive: true });
const k8sProduced = new Set();
for (const [key, [name, words]] of Object.entries(K8S_ICONS).sort(([a], [b]) => byString(a, b))) {
  const stem = key.split('/')[1];
  const file = `${stem}.svg`;
  if (k8sProduced.has(file)) fail(`duplicate id k8s/${stem}`);
  k8sProduced.add(file);
  const content = syncFile(join(K8S_SRC, `${key}.svg`), join(k8sOut, file));
  const { kinds, keywords } = meta(`k8s/${stem}`);
  icons.push({
    id: `k8s/${stem}`,
    set: 'k8s',
    name: `Kubernetes ${name}`,
    keywords: sortedUnique(['kubernetes', 'k8s', ...words, ...keywords].map((k) => k.toLowerCase())),
    kinds,
    src: `/icons/k8s/${file}`,
    hash: sha256(content),
  });
}
prune(k8sOut, k8sProduced);

// 3. Validate.
const unknownKindKeys = Object.keys(kindsMap).filter((k) => !usedKindKeys.has(k));
if (unknownKindKeys.length) fail(`icon-kinds.json keys match no icon: ${unknownKindKeys.join(', ')}`);
const unknownNames = Object.keys(names).filter((k) => !icons.some((i) => i.set === 'aws' && i.src.endsWith(`/${kebab(k)}.svg`)));
if (unknownNames.length) fail(`icon-names.json keys match no icon: ${unknownNames.join(', ')}`);

const seenIds = new Map();
const seenHashes = new Map();
for (const icon of icons) {
  if (seenIds.has(icon.id)) fail(`duplicate id ${icon.id}`);
  seenIds.set(icon.id, icon);
  const prev = seenHashes.get(icon.hash);
  if (prev) fail(`duplicate SVG content: ${prev.src} and ${icon.src}`);
  seenHashes.set(icon.hash, icon);
}

// 4. Write.
icons.sort((a, b) => byString(a.id, b.id));
const manifest = {
  version: 1,
  sets: {
    aws: { label: 'AWS', license: 'AWS Architecture Icons terms', source: `npm:aws-icons@${awsVersion}` },
    generic: { label: 'Generic', license: 'project', source: 'repo' },
    k8s: { label: 'Kubernetes', license: 'Apache-2.0', source: 'github:kubernetes/community@a434040a/icons/svg (vendor/k8s-icons)' },
  },
  icons: icons.map(({ id, set, name, keywords, kinds, src }) => ({ id, set, name, keywords, kinds, src })),
};
writeIfChanged(MANIFEST, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));

const count = (set) => icons.filter((i) => i.set === set).length;
console.log(`icons:build: ${icons.length} icons (aws ${count('aws')}, generic ${count('generic')}, k8s ${count('k8s')}) → public/icons/manifest.json`);
