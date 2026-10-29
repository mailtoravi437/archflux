export type NodeShape = 'rectangle' | 'logo' | 'cylinder' | 'rounded';

/** R1 element kinds (DATA_MODEL_R1 §2.1, UI_REVAMP_SPEC §5A.2). */
export type ElementKind =
  | 'person' | 'client' | 'external' | 'gateway' | 'service' | 'function'
  | 'database' | 'document-db' | 'cache' | 'queue' | 'stream' | 'object-storage'
  | 'search' | 'cdn' | 'scheduler' | 'observability'
  | 'boundary'      // containers (§2.3)
  | 'note';         // free annotation, not part of the model

export type DisplayStyle = 'icon' | 'card' | 'shape';
export type ElementSize = 'S' | 'M' | 'L';

export type BoundaryKind =
  | 'cloud' | 'region' | 'vpc' | 'az' | 'subnet-public' | 'subnet-private'
  | 'security-group' | 'k8s-cluster' | 'k8s-namespace' | 'c4-system' | 'trust'
  | 'frame'          // CAP-C3 named area, used by Present mode (R2) as a slide
  | 'swimlane';      // CAP-C3 lane; horizontal lanes stack, label on the left

export interface IconRef {
  set: 'aws' | 'gcp' | 'azure' | 'k8s' | 'tech' | 'generic' | 'uploaded';
  id: string;            // key in the icon manifest (§5), e.g. 'aws/amazon-rds'
}

export type PropertyValue = string | number | boolean | null;

export type RelationshipKind = 'sync' | 'async' | 'replication' | 'bidirectional';

export interface Page  { id: string; name: string; order: number; }
export interface Layer { id: string; name: string; order: number; visible: boolean; locked: boolean; }

export interface ArchNode {
  id: string;
  type: string;
  label: string;
  tag: string;
  health: string;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  fill?: string;
  /** Library glyph (emoji) rendered on the node, e.g. '🐘' for Postgres. */
  icon?: string;
  /** Real vendor SVG (e.g. '/icons/aws/ec2.svg') — rendered instead of the glyph. */
  iconSrc?: string;
  /** Visual shape of the node. 'logo' = icon only, no box. */
  shape?: NodeShape;
  isOrphan?: boolean;
  /** Inspector-tunable border width. */
  strokeWidth?: number;
  /** Inspector Border → Dashed (R1-E14-T03, DATA_MODEL_R1 §2.2). */
  borderDashed?: boolean;
  /** Metadata table: port, repo link, source spec. */
  port?: string;
  repo?: string;
  source?: string;
  /** Inline details rendered inside the node box. */
  details?: string;
  // R1 additions (DATA_MODEL_R1 §2.2): all optional.
  kind?: ElementKind;
  displayStyle?: DisplayStyle;      // default from doc.defaults.displayStyle, else 'card'
  size?: ElementSize;               // 'M' default; S=64×64 tile, M=200×80, L=240×120
  technology?: string;              // second line; legacy `tag` is migrated here when `kind` was missing
  iconRef?: IconRef | null;         // null = "No icon"; undefined = kind's generic glyph
  properties?: Record<string, PropertyValue>; // owner, repo, slo, cost, dataClass, tier, … (§2.6)
  parentId?: string | null;         // containing boundary node id
  pageId?: string;                  // missing → first page
  layerId?: string;                 // missing → 'ly-default'
  locked?: boolean;
  z?: number;                       // stacking order within a page; higher = front
  boundaryKind?: BoundaryKind;      // only when kind === 'boundary'
  collapsed?: boolean;              // boundary collapsed to a chip
  customSize?: boolean;             // user resized freely; style switches keep w/h
  linkPageId?: string;              // CAP-C4 link to another page of the same doc
}

export interface ArchEdge {
  id: string;
  from: string;
  to: string | null;
  targetCoords?: { x: number; y: number };
  label: string;
  color: string;
  isDangling?: boolean;
  dashed?: boolean;
  /** Line style (dotted is new; dashed mirrors legacy boolean). */
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  /** Protocol tag: REST, gRPC, WebSocket, Async. Unset = ambiguous. */
  protocol?: string;
  /** Arrow head configuration. */
  arrow?: 'end' | 'both' | 'none';
  // R1 additions (DATA_MODEL_R1 §2.3): all optional.
  relKind?: RelationshipKind;       // default 'sync'; maps to line style per UI_REVAMP_SPEC §5A.4
  waypoints?: { x: number; y: number }[]; // world coords, user-placed bends
  labelPos?: number;                // 0..1 along the path, default 0.5
  step?: number | null;             // sequence badge number
  fromPort?: 'n' | 'e' | 's' | 'w' | null;
  toPort?: 'n' | 'e' | 's' | 'w' | null;
}

export interface Connector {
  id: string;
  name: string;
  detail: string;
  icon: string;
  iconSrc?: string;
  status: 'saved' | 'polling' | 'drift' | 'verified';
  statusLabel: string;
}

export interface DriftLine {
  kind: 'add' | 'del' | 'mod';
  text: string;
}

export interface Checkpoint {
  id: string;
  title: string;
  meta: string;
  active?: boolean;
  badge?: string;
}

export interface ReviewComment {
  author: string;
  role: string;
  time: string;
  pinnedTo: string;
  text: string;
}

export interface PRPreview {
  id: string;
  title: string;
  status: string;
  file: string;
  summary: string;
  note: string;
}

/** PR row on the Git screen, derived from checkpoint history. */
export interface PRItem extends PRPreview {
  branch: string;
  checks: { name: string; pass: boolean }[];
  diff: { kind: 'add' | 'del' | 'mod'; text: string }[];
}

export interface Blueprint {
  id: string;
  title: string;
  category: string;
  icon: string;
  iconSrc?: string;
  desc: string;
  nodeCount: number;
  edgeCount: number;
}

export type LibraryProvider = 'General' | 'AWS' | 'GCP' | 'Azure' | 'Data';

export interface LibraryShape {
  id: string;
  provider: LibraryProvider;
  /** Maps onto node families for counting/undo labels. */
  kind: 'service' | 'gateway' | 'db' | 'stream';
  label: string;
  tag: string;
  icon: string;
  /** Real vendor SVG path served from public/icons — shown instead of the glyph. */
  iconSrc?: string;
  stroke: string;
  /** Functional category for folder-based organization. */
  category: ShapeCategory;
}

export type ShapeCategory =
  | 'compute'
  | 'storage'
  | 'database'
  | 'network'
  | 'messaging'
  | 'security'
  | 'observability'
  | 'general';

/** Freehand ink stroke (Excalidraw-style pencil). Points are world coords. */
export interface FreeStroke {
  id: string;
  pts: { x: number; y: number }[];
  color: string;
  width: number;
  pageId?: string;
  layerId?: string;
}

/** Free-standing text label (Excalidraw-style text tool). */
export interface FreeText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: TextFont;
  bold?: boolean;
  italic?: boolean;
  /** Background pill fill; 'transparent' (default) renders none. */
  fill?: string;
  /** Outline around the background pill (only when fill is set). */
  border?: boolean;
  pageId?: string;
  layerId?: string;
}

export type TextFont = 'Caveat' | 'Patrick Hand' | 'Plus Jakarta Sans' | 'Fira Code';

export interface DiagramDoc {
  id: string;
  title: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  createdAt: number;
  updatedAt: number;
  /** Library tag chips used by dashboard tag filters. */
  tags?: string[];
  /** Freehand ink strokes on this document. */
  strokes?: FreeStroke[];
  /** Free-standing text labels on this document. */
  texts?: FreeText[];
  /**
   * Last server-acknowledged optimistic-concurrency version for server-backed
   * docs (UUID ids). Absent for local-only docs and tolerated as missing by
   * the loader — no persistence format bump required.
   */
  serverVersion?: number;
  // R1 additions (DATA_MODEL_R1 §2.4): all optional.
  pages?: Page[];                   // missing → [{ id: 'pg-1', name: 'Page 1', order: 0 }]
  layers?: Layer[];                 // missing → [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }]
  defaults?: { displayStyle?: DisplayStyle; size?: ElementSize; propertyLine?: string }; // propertyLine = property key shown on cards
  folderId?: string | null;         // server folders (§4.2)
  starred?: boolean;                // per user; from server list, not persisted in graph
  schemaVersion?: 2;                // set by normalizeDoc
}

export type ThemeName = 'dark' | 'blueprint' | 'light';

export type FreshnessState = 'drift' | 'syncing' | 'fresh' | 'local';
