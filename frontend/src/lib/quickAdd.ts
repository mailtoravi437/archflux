/**
 * Quick-add (R1-E10-T06): pure logic for "type to create and connect". No React, no store, no DOM.
 * The UI lives in components/quickadd; it calls `planQuickAdd` and the store's insertNode/connectNodes.
 */
import { KIND_NOTATION } from '../canvas/notation';
import { searchIcons } from './icons';
import type { IconEntry } from './icons';
import { buildNodeFromTile, elementTile, iconTile } from './shapeTiles';
import type { ArchNode, DiagramDoc, ElementKind } from '../types';

export type FlowDirection = 'LR' | 'TD';
/** Space between the source and the new element, and between stacked candidates. */
export const QUICK_ADD_GAP = 80;

export interface QuickAddSuggestion {
  id: string;
  /** Row title, e.g. "Cache" or "Amazon ElastiCache". */
  title: string;
  /** Row detail, e.g. "Cache · icon" . */
  detail: string;
  kind: Exclude<ElementKind, 'boundary'>;
  icon?: IconEntry;
  /** Set for the free-text fallback: the element is a Service named exactly this. */
  customLabel?: string;
}

type PlainKind = Exclude<ElementKind, 'boundary'>;
const KINDS = Object.keys(KIND_NOTATION) as PlainKind[];

function kindMatches(q: string): PlainKind[] {
  const s = q.toLowerCase();
  const rank = (k: PlainKind): number | null => {
    const label = KIND_NOTATION[k].label.toLowerCase();
    if (label.startsWith(s) || k.startsWith(s)) return 0;
    if (label.split(/[\s/]+/).some((w) => w.startsWith(s))) return 1;
    if (label.includes(s) || k.includes(s)) return 2;
    return null;
  };
  return KINDS.map((k) => ({ k, r: rank(k) }))
    .filter((x): x is { k: PlainKind; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.k);
}

/** Icon match tier: name starts with the query, exact keyword, anything else. Ties keep manifest order. */
function iconTier(e: IconEntry, q: string): number {
  const s = q.toLowerCase();
  if (e.name.toLowerCase().replace(/^(amazon|aws) /, '').startsWith(s)) return 0;
  if (e.keywords.some((k) => k.toLowerCase() === s)) return 1;
  return 2;
}

/**
 * Suggestions for the typed text: element kinds by label, then icons by name and keyword
 * (so "redis" gives a Cache with the ElastiCache icon first), then "Service named <text>".
 */
export function quickAddSuggestions(entries: IconEntry[], text: string, limit = 7): QuickAddSuggestion[] {
  const q = text.trim();
  if (!q) return [];
  const out: QuickAddSuggestion[] = [];
  for (const k of kindMatches(q)) {
    out.push({ id: `el:${k}`, title: KIND_NOTATION[k].label, detail: 'Element', kind: k });
  }
  const order = new Map(entries.map((e, i) => [e.id, i]));
  const icons = searchIcons(entries, q, { limit: 40 })
    .filter((e) => !e.kinds.includes('boundary') || e.kinds.length > 1)
    .map((e) => ({ e, t: iconTier(e, q) }))
    .sort((a, b) => a.t - b.t || (order.get(a.e.id) ?? 0) - (order.get(b.e.id) ?? 0));
  for (const { e } of icons) {
    const kind = (e.kinds.find((k): k is PlainKind => k !== 'boundary') ?? 'service');
    out.push({ id: `ic:${e.id}`, title: e.name, detail: `${KIND_NOTATION[kind].label} · icon`, kind, icon: e });
  }
  const trimmed = out.slice(0, Math.max(0, limit - 1));
  trimmed.push({ id: 'custom', title: `Service named “${q.slice(0, 40)}”`, detail: 'Element', kind: 'service', customLabel: q.slice(0, 80) });
  return trimmed;
}

interface Box { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The next free top-left slot for a new element next to `source`: right of it in LR, below it in TD,
 * with an 80 px gap. When that spot is taken the candidate steps along the other axis in 80 px gaps
 * until it overlaps nothing. `others` are the elements on the same page.
 */
export function nextFreeSlot(
  source: Box,
  others: Box[],
  size: { w: number; h: number },
  dir: FlowDirection = 'LR',
): { x: number; y: number } {
  const baseX = dir === 'LR' ? source.x + source.w + QUICK_ADD_GAP : source.x;
  const baseY = dir === 'LR' ? source.y : source.y + source.h + QUICK_ADD_GAP;
  for (let k = 0; k < 200; k++) {
    const cand: Box = dir === 'LR'
      ? { x: baseX, y: baseY + k * (size.h + QUICK_ADD_GAP), ...size }
      : { x: baseX + k * (size.w + QUICK_ADD_GAP), y: baseY, ...size };
    if (!others.some((o) => overlaps(cand, o))) return { x: cand.x, y: cand.y };
  }
  return { x: baseX, y: baseY };
}

type DocDefaultsLike = NonNullable<DiagramDoc['defaults']>;

/** Builds the element for a suggestion, placed in the next free slot beside `source`. */
export function planQuickAdd(args: {
  source: ArchNode;
  nodes: ArchNode[];
  suggestion: QuickAddSuggestion;
  direction?: FlowDirection;
  docDefaults?: DocDefaultsLike;
  pageId?: string;
}): ArchNode {
  const { source, nodes, suggestion, direction = 'LR', docDefaults, pageId } = args;
  const tile = suggestion.icon ? iconTile(suggestion.icon) : elementTile(suggestion.kind);
  const probe = buildNodeFromTile(tile, { x: 0, y: 0 }, { pageId, docDefaults });
  const samePage = (n: ArchNode) => (n.pageId ?? pageId ?? '') === (source.pageId ?? pageId ?? '');
  const slot = nextFreeSlot(source, nodes.filter((n) => n.id !== source.id && samePage(n)).map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })), { w: probe.w, h: probe.h }, direction);
  const node: ArchNode = { ...probe, x: slot.x, y: slot.y, pageId: source.pageId ?? pageId };
  if (suggestion.customLabel) node.label = suggestion.customLabel;
  return node;
}
