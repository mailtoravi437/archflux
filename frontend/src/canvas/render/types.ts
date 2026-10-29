/**
 * Shared render-pass types: icon adapter, palette flags and per-pass flag bags.
 * Pure: no React, no store access.
 */
import type { ConnectorCurve } from '../../lib/canvasGeometry';
import type { IconEntry } from '../../lib/icons';

/**
 * Vendor icon bridge. `get` returns a possibly-still-loading image (the pass
 * only draws when `complete`); `ensure` starts a load if not yet started.
 */
export interface NodeIconSource {
  get(src: string): HTMLImageElement | null;
  ensure(src: string): void;
}

export interface CanvasPaletteFlags {
  isDark: boolean;
}

export interface EdgePaintFlags extends CanvasPaletteFlags {
  selected: boolean;
  /** Routing settings forwarded to the shared edgePoints helper. */
  orthogonal: boolean;
  curve: ConnectorCurve;
  /**
   * R1-E14-T02: draw the label pill in this pass (default true). The canvas passes `false` and
   * paints pills afterwards with `drawEdgeLabelPass`, so a pill is never hidden under a node.
   */
  pill?: boolean;
  /** R1-E04-T04: crossings (world coords) where this edge hops over an earlier one; see `edgeHops`. */
  hops?: { x: number; y: number }[];
  /** R1-E04-T03: current zoom, so waypoint handles stay a constant screen size. Default 1. */
  zoom?: number;
}

/**
 * R1-E02-T08 (UI_REVAMP_SPEC §5A.5): everything a node can show besides its content. Built by the
 * caller from lint results, review threads, `locked` and the diff overlay; the pass only draws it.
 */
export interface NodeStatus {
  drift?: boolean;
  lint?: 'error' | 'warn' | null;
  /** Open review threads pinned to the node; the pin shows the count. */
  comments?: number;
  diff?: 'added' | 'removed' | 'changed' | null;
  /** AI / review proposal: green dashed border plus a "Proposed" chip. */
  proposed?: boolean;
  locked?: boolean;
  hovered?: boolean;
  /** Keyboard focus-visible ring. */
  focused?: boolean;
  /** One of several selected nodes: the ring without resize handles. */
  multiSelected?: boolean;
}

export interface NodePaintFlags extends CanvasPaletteFlags {
  selected: boolean;
  /** Connector source node (amber ring + glow). */
  pending: boolean;
  /** Show blue connector ports (active when the connector tool is armed). */
  showPorts: boolean;
  /**
   * R1-E02-T02: loaded icon manifest, used to resolve `node.iconRef` to an image src. The caller
   * loads it (`loadIconManifest`); the pass never fetches. Missing → `iconRef` falls back to `iconSrc`.
   */
  iconEntries?: IconEntry[];
  /** R1-E02-T02: property shown on the card's property line (`doc.defaults.propertyLine`); default 'owner'. */
  propertyLineKey?: string;
  /** R1-E14-T02 (§5A.5): pointer is over the node: subtle shadow plus N/E/S/W ports. */
  hovered?: boolean;
  /** R1-E14-T02: current zoom, so selection handles stay 8 screen px. Default 1. */
  zoom?: number;
  /** R1-E02-T08: state marks (see NodeStatus). */
  status?: NodeStatus;
  /** R1-E03-T01: descendants of a collapsed boundary, shown on its chip. Omitted → the chip shows no count. */
  childCount?: number;
  /** R1-E03-T01: loaded provider logo for a `cloud` boundary that has an `iconRef` (drawn at 20 px). */
  boundaryLogo?: CanvasImageSource | null;
}
