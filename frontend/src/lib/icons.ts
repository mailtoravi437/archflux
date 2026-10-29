/**
 * R1-E05-T02: icon manifest loading, resolution, search and suggestions (DATA_MODEL_R1 §6).
 * Pure helpers apart from `loadIconManifest`, which fetches `/icons/manifest.json` once per session.
 */
import type { ElementKind, IconRef } from '../types';

export interface IconEntry { id: string; set: IconRef['set']; name: string; keywords: string[]; kinds: ElementKind[]; src: string; }

const ICON_SETS: readonly IconRef['set'][] = ['aws', 'gcp', 'azure', 'k8s', 'tech', 'generic', 'uploaded'];
const ELEMENT_KINDS: readonly ElementKind[] = [
  'person', 'client', 'external', 'gateway', 'service', 'function',
  'database', 'document-db', 'cache', 'queue', 'stream', 'object-storage',
  'search', 'cdn', 'scheduler', 'observability', 'boundary', 'note',
];

function isIconSet(v: unknown): v is IconRef['set'] {
  return typeof v === 'string' && (ICON_SETS as readonly string[]).includes(v);
}
function isElementKind(v: unknown): v is ElementKind {
  return typeof v === 'string' && (ELEMENT_KINDS as readonly string[]).includes(v);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Turns one raw manifest icon into an entry, or null when it is malformed. */
function toEntry(raw: unknown): IconEntry | null {
  if (!isRecord(raw)) return null;
  const { id, set, name, keywords, kinds, src } = raw;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof src !== 'string' || !isIconSet(set)) return null;
  return {
    id, set, name, src,
    keywords: Array.isArray(keywords) ? keywords.filter((k): k is string => typeof k === 'string') : [],
    kinds: Array.isArray(kinds) ? kinds.filter(isElementKind) : [],
  };
}

/** Parses the manifest JSON (`{ version, sets, icons }`). Malformed icons are dropped. */
export function parseIconManifest(json: unknown): IconEntry[] {
  if (!isRecord(json) || !Array.isArray(json.icons)) throw new Error('Icon manifest is malformed');
  const out: IconEntry[] = [];
  for (const raw of json.icons) {
    const e = toEntry(raw);
    if (e) out.push(e);
  }
  return out;
}

let manifestPromise: Promise<IconEntry[]> | null = null;

/** Fetches `/icons/manifest.json` once and caches it in the module. A failed load is not cached. */
export async function loadIconManifest(): Promise<IconEntry[]> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const res = await fetch('/icons/manifest.json');
      if (!res.ok) throw new Error(`Icon manifest request failed (${res.status})`);
      return parseIconManifest(await res.json());
    })();
    manifestPromise.catch(() => { manifestPromise = null; });
  }
  return manifestPromise;
}

const indexCache = new WeakMap<IconEntry[], Map<string, IconEntry>>();

function indexOf(entries: IconEntry[]): Map<string, IconEntry> {
  let idx = indexCache.get(entries);
  if (!idx) {
    idx = new Map(entries.map((e) => [e.id, e]));
    indexCache.set(entries, idx);
  }
  return idx;
}

/** The manifest entry for an icon ref; null for null/undefined refs, unknown ids or a set mismatch. */
export function resolveIcon(ref: IconRef | null | undefined, entries: IconEntry[]): IconEntry | null {
  if (!ref) return null;
  const e = indexOf(entries).get(ref.id);
  return e && e.set === ref.set ? e : null;
}

/** Official provider sets rank before the generic fallback when relevance ties. */
const SET_RANK: Record<IconRef['set'], number> = { aws: 0, gcp: 0, azure: 0, k8s: 0, tech: 1, uploaded: 2, generic: 3 };

type Field = 'name' | 'keyword' | 'id';
const FIELD_RANK: Record<Field, number> = { name: 0, keyword: 1, id: 2 };

/** How well `text` matches `q`: 0 exact, 1 prefix or word start, 2 substring, null no match. */
function matchQuality(text: string, q: string): number | null {
  const t = text.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  const at = t.indexOf(q);
  if (at < 0) return null;
  return /[\s/\-_().]/.test(t[at - 1] ?? '') ? 1 : 2;
}

/**
 * Score of an entry for a lowercase query; lower is better, null when nothing matches.
 * Match quality (exact > prefix/word start > substring) comes first; within one quality the field
 * order is name > keyword > id.
 */
function scoreEntry(e: IconEntry, q: string): number | null {
  let best: number | null = null;
  const consider = (text: string, field: Field) => {
    const m = matchQuality(text, q);
    if (m === null) return;
    const s = m * 3 + FIELD_RANK[field];
    if (best === null || s < best) best = s;
  };
  consider(e.name, 'name');
  for (const k of e.keywords) consider(k, 'keyword');
  consider(e.id.slice(e.id.indexOf('/') + 1), 'id');
  return best;
}

function tieBreak(a: IconEntry, b: IconEntry): number {
  return SET_RANK[a.set] - SET_RANK[b.set] || a.name.length - b.name.length || a.name.localeCompare(b.name);
}

/**
 * Case-insensitive search across name, keywords and id. An empty query returns the filtered
 * entries in manifest order.
 */
export function searchIcons(
  entries: IconEntry[],
  q: string,
  opts?: { set?: IconRef['set']; kind?: ElementKind; limit?: number },
): IconEntry[] {
  const pool = entries.filter((e) =>
    (!opts?.set || e.set === opts.set) && (!opts?.kind || e.kinds.includes(opts.kind)));
  const query = q.trim().toLowerCase();
  let out: IconEntry[];
  if (!query) {
    out = pool;
  } else {
    const scored: { e: IconEntry; s: number }[] = [];
    for (const e of pool) {
      const s = scoreEntry(e, query);
      if (s !== null) scored.push({ e, s });
    }
    scored.sort((a, b) => a.s - b.s || tieBreak(a.e, b.e));
    out = scored.map((x) => x.e);
  }
  return opts?.limit !== undefined ? out.slice(0, Math.max(0, opts.limit)) : out;
}

const SUGGEST_LIMIT = 8;

/**
 * Up to 8 icons for an element: icons matching the technology first (any kind except boundary
 * groups, unless the element is a boundary), then icons tagged with the element's kind.
 */
export function suggestIcons(entries: IconEntry[], kind: ElementKind, technology?: string): IconEntry[] {
  const out: IconEntry[] = [];
  const seen = new Set<string>();
  const push = (e: IconEntry) => {
    if (out.length < SUGGEST_LIMIT && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
  };
  const tech = technology?.trim();
  if (tech) {
    for (const e of searchIcons(entries, tech)) {
      if (kind !== 'boundary' && e.kinds.includes('boundary')) continue;
      push(e);
    }
  }
  const byKind = entries.filter((e) => e.kinds.includes(kind)).sort(tieBreak);
  for (const e of byKind) push(e);
  return out;
}
