/**
 * R1-E02-T01: element notation table (UI_REVAMP_SPEC §5A.2–§5A.4, DATA_MODEL_R1 §2.1).
 * Pure constants: no React, no store, no DOM. Renderers read these; they never hard-code colours.
 */
import type { ElementKind, BoundaryKind, RelationshipKind, ElementSize } from '../types';

export type BaseShape = 'card' | 'card-dashed' | 'person' | 'browser' | 'cylinder' | 'cylinder-braces'
  | 'cylinder-bolt' | 'cylinder-search' | 'pipe' | 'pipe-log' | 'bucket' | 'globe' | 'card-clock' | 'card-pulse'
  | 'card-chevron' | 'card-lambda' | 'note';

export interface KindNotation { label: string; color: string; glyph: string; baseShape: BaseShape; }

/** §5A.2 element catalogue. `color` is the border and icon tint; fill stays the surface colour. */
export const KIND_NOTATION: Record<Exclude<ElementKind, 'boundary'>, KindNotation> = {
  person:           { label: 'Person',          color: '#1E3A8A', glyph: 'person',    baseShape: 'person' },
  client:           { label: 'Client app',      color: '#334155', glyph: 'window',    baseShape: 'browser' },
  external:         { label: 'External system', color: '#6B7280', glyph: 'globe',     baseShape: 'card-dashed' },
  gateway:          { label: 'API gateway',     color: '#7C3AED', glyph: 'chevron',   baseShape: 'card-chevron' },
  service:          { label: 'Service',         color: '#2563EB', glyph: 'hexagon',   baseShape: 'card' },
  function:         { label: 'Function',        color: '#C2410C', glyph: 'lambda',    baseShape: 'card-lambda' },
  database:         { label: 'Database',        color: '#B45309', glyph: 'cylinder',  baseShape: 'cylinder' },
  'document-db':    { label: 'Document DB',     color: '#B45309', glyph: 'cylinder-braces', baseShape: 'cylinder-braces' },
  cache:            { label: 'Cache',           color: '#B91C1C', glyph: 'bolt',      baseShape: 'cylinder-bolt' },
  queue:            { label: 'Queue',           color: '#BE185D', glyph: 'pipe',      baseShape: 'pipe' },
  stream:           { label: 'Event stream',    color: '#6D28D9', glyph: 'log',       baseShape: 'pipe-log' },
  'object-storage': { label: 'Object storage',  color: '#15803D', glyph: 'bucket',    baseShape: 'bucket' },
  search:           { label: 'Search index',    color: '#0F766E', glyph: 'magnifier', baseShape: 'cylinder-search' },
  cdn:              { label: 'CDN / DNS',       color: '#0E7490', glyph: 'globe',     baseShape: 'globe' },
  scheduler:        { label: 'Scheduler',       color: '#475569', glyph: 'clock',     baseShape: 'card-clock' },
  observability:    { label: 'Observability',   color: '#475569', glyph: 'pulse',     baseShape: 'card-pulse' },
  note:             { label: 'Note',            color: '#B45309', glyph: 'note',      baseShape: 'note' },
};

/** Fill drawn behind a note (EPIC-02 T01 values). */
export const NOTE_FILL = '#FEF3C7';

export interface BoundaryNotation { label: string; stroke: string; dash: number[]; fill: string | null; radius: number; width: number; }

/** Dash used for every "dashed" boundary in §5A.3, which names no pattern; matches the async line (§5A.4). */
const BOUNDARY_DASH = [6, 4];

/** §5A.3 boundaries plus the CAP-C3 frame and swimlane (EPIC-02 T01 values). */
export const BOUNDARY_NOTATION: Record<BoundaryKind, BoundaryNotation> = {
  cloud:            { label: 'AWS Cloud',         stroke: '#232F3E', dash: [],           fill: null,      radius: 0,  width: 1.5 },
  region:           { label: 'Region',            stroke: '#00A4A6', dash: BOUNDARY_DASH, fill: null,     radius: 0,  width: 1.5 },
  vpc:              { label: 'VPC',               stroke: '#8C4FFF', dash: [],           fill: null,      radius: 0,  width: 1.5 },
  az:               { label: 'AZ',                stroke: '#00A4A6', dash: BOUNDARY_DASH, fill: null,     radius: 0,  width: 1.5 },
  'subnet-public':  { label: 'Public subnet',     stroke: '#7AA116', dash: [],           fill: '#F2F8E6', radius: 0,  width: 1.5 },
  'subnet-private': { label: 'Private subnet',    stroke: '#00A4A6', dash: [],           fill: '#E6F6F7', radius: 0,  width: 1.5 },
  'security-group': { label: 'SG',                stroke: '#DD344C', dash: [],           fill: null,      radius: 0,  width: 1.5 },
  'k8s-cluster':    { label: 'Cluster',           stroke: '#326CE5', dash: [],           fill: null,      radius: 0,  width: 1.5 },
  'k8s-namespace':  { label: 'ns',                stroke: '#326CE5', dash: BOUNDARY_DASH, fill: null,     radius: 0,  width: 1.5 },
  'c4-system':      { label: 'System',            stroke: '#6B7280', dash: BOUNDARY_DASH, fill: null,     radius: 12, width: 1.5 },
  trust:            { label: 'Trust boundary',    stroke: '#DC2626', dash: BOUNDARY_DASH, fill: null,     radius: 0,  width: 2 },
  frame:            { label: 'Frame',             stroke: '#6B7280', dash: [4, 4],       fill: null,      radius: 12, width: 1.5 },
  swimlane:         { label: 'Lane',              stroke: '#C3C8D1', dash: [],           fill: '#F6F7F9', radius: 0,  width: 1.5 },
};

export interface RelNotation { dash: number[]; head: 'filled' | 'open'; both: boolean; verb: string; }

/** §5A.4 relationships. Sync vs async is carried by line style, never by colour alone. */
export const REL_NOTATION: Record<RelationshipKind, RelNotation> = {
  sync:          { dash: [],     head: 'filled', both: false, verb: 'Calls' },
  async:         { dash: [6, 4], head: 'open',   both: false, verb: 'Publishes' },
  replication:   { dash: [2, 4], head: 'filled', both: false, verb: 'Replicates' },
  bidirectional: { dash: [],     head: 'filled', both: true,  verb: 'Syncs' },
};

/** §5A.1 sizes: S icon tile, M default card, L card with a description line. */
export const SIZE_BOX: Record<ElementSize, { w: number; h: number }> = {
  S: { w: 64, h: 64 },
  M: { w: 200, h: 80 },
  L: { w: 240, h: 120 },
};

function isNotatedKind(kind: string): kind is Exclude<ElementKind, 'boundary'> {
  return Object.prototype.hasOwnProperty.call(KIND_NOTATION, kind);
}

/**
 * Notation for an element kind. `undefined`, `'boundary'` (drawn from BOUNDARY_NOTATION) and any
 * unknown runtime value fall back to `service`.
 */
export function notationFor(kind: ElementKind | undefined): KindNotation {
  return kind !== undefined && isNotatedKind(kind) ? KIND_NOTATION[kind] : KIND_NOTATION.service;
}
