/**
 * R1-E05-T04: tile model and node construction for the Shapes panel. Pure: no React, no store.
 */
import { BOUNDARY_NOTATION, KIND_NOTATION, SIZE_BOX } from '../canvas/notation';
import type { IconEntry } from './icons';
import { newId } from './docModel';
import type { ArchNode, BoundaryKind, DiagramDoc, ElementKind } from '../types';

type DocDefaultsLike = NonNullable<DiagramDoc['defaults']>;

export const TILE_DRAG_MIME = 'text/archflux-tile';

type TileKind = 'element' | 'boundary' | 'icon';
export interface ShapeTile {
  /** Stable id, also the key in the recents list: `el:<kind>`, `bd:<boundary>`, `ic:<icon id>`. */
  id: string;
  type: TileKind;
  name: string;
  short: string;
  provider: string;
  /** Accessible name (kept distinct between an element and a same-named icon). */
  label: string;
  element?: Exclude<ElementKind, 'boundary'>;
  boundary?: BoundaryKind;
  icon?: IconEntry;
}

export const ELEMENT_KINDS = Object.keys(KIND_NOTATION) as Array<Exclude<ElementKind, 'boundary'>>;
export const BOUNDARY_KINDS = Object.keys(BOUNDARY_NOTATION) as BoundaryKind[];
const BOUNDARY_BOX = { w: 360, h: 240 };

export const elementTile = (k: Exclude<ElementKind, 'boundary'>): ShapeTile => ({
  id: `el:${k}`, type: 'element', element: k, name: KIND_NOTATION[k].label, short: KIND_NOTATION[k].label,
  provider: 'Element', label: `${KIND_NOTATION[k].label} element`,
});
export const boundaryTile = (b: BoundaryKind): ShapeTile => ({
  id: `bd:${b}`, type: 'boundary', boundary: b, name: BOUNDARY_NOTATION[b].label, short: BOUNDARY_NOTATION[b].label,
  provider: 'Boundary', label: `${BOUNDARY_NOTATION[b].label} boundary`,
});
export const iconTile = (e: IconEntry): ShapeTile => ({
  id: `ic:${e.id}`, type: 'icon', icon: e, name: e.name, short: e.name.replace(/^(Amazon|AWS) /, ''),
  provider: e.set === 'aws' ? 'AWS' : e.set === 'k8s' ? 'Kubernetes' : 'Generic',
  label: e.set === 'aws' || e.set === 'k8s' ? e.name : `${e.name} (generic icon)`,
});

/** Legacy renderers still read `type`; this is the inverse of the DATA_MODEL_R1 §2.1 table. */
function legacyType(kind: ElementKind): string {
  if (kind === 'database' || kind === 'document-db') return 'db';
  if (kind === 'stream' || kind === 'gateway' || kind === 'note') return kind;
  return 'service';
}

/**
 * The element a tile creates, centred on `center`. AWS/generic icons take the icon's first `kinds`
 * entry (else `service`), set `iconRef` and use the icon name as `technology`; style and size come
 * from the document defaults.
 */
export function buildNodeFromTile(
  tile: ShapeTile,
  center: { x: number; y: number },
  opts: { pageId?: string; docDefaults?: DocDefaultsLike } = {},
): ArchNode {
  const style = opts.docDefaults?.displayStyle ?? 'card';
  const box = tile.type === 'boundary' ? BOUNDARY_BOX : SIZE_BOX[opts.docDefaults?.size ?? 'M'];
  const base = {
    id: newId('n'), health: 'Healthy', isOrphan: true,
    x: Math.round(center.x - box.w / 2), y: Math.round(center.y - box.h / 2), w: box.w, h: box.h,
    ...(opts.pageId ? { pageId: opts.pageId } : {}),
  };
  if (tile.type === 'boundary' && tile.boundary) {
    const n = BOUNDARY_NOTATION[tile.boundary];
    return { ...base, type: 'service', kind: 'boundary', boundaryKind: tile.boundary, label: n.label, tag: '', stroke: n.stroke, isOrphan: false };
  }
  if (tile.type === 'icon' && tile.icon) {
    const kind: ElementKind = tile.icon.kinds[0] ?? 'service';
    return {
      ...base, type: legacyType(kind), kind, displayStyle: style, label: tile.icon.name, tag: tile.icon.name,
      technology: tile.icon.name, iconRef: { set: tile.icon.set, id: tile.icon.id },
      stroke: kind === 'boundary' ? '#6B7280' : KIND_NOTATION[kind].color,
    };
  }
  const kind = tile.element ?? 'service';
  return { ...base, type: legacyType(kind), kind, displayStyle: style, label: KIND_NOTATION[kind].label, tag: '', stroke: KIND_NOTATION[kind].color };
}

