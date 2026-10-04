export type NodeShape = 'rectangle' | 'logo' | 'cylinder' | 'rounded';

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
  /** Metadata table: port, repo link, source spec. */
  port?: string;
  repo?: string;
  source?: string;
  /** Inline details rendered inside the node box. */
  details?: string;
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
}

export interface Connector {
  id: string;
  name: string;
  detail: string;
  icon: string;
  iconSrc?: string;
  status: 'polling' | 'drift' | 'verified';
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
}

export type ThemeName = 'dark' | 'blueprint' | 'light';

export type FreshnessState = 'drift' | 'syncing' | 'fresh' | 'local';
