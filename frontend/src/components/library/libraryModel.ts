/**
 * Pure helpers for the Library page (R1-E14-T04, Library.dc.html).
 * Everything here is derived from real docs: no sample data.
 */
import type { DiagramDoc } from '../../types';
import { isServerDocId } from '../../lib/honesty';

/** Local diagram cap enforced by the store (newDoc / duplicateDoc). */
export const LOCAL_DOC_LIMIT = 25;

export type SourceFilter = 'all' | 'server' | 'device';

export function isServerDoc(doc: Pick<DiagramDoc, 'id'>): boolean {
  return isServerDocId(doc.id);
}

export function matchesSource(doc: Pick<DiagramDoc, 'id'>, source: SourceFilter): boolean {
  if (source === 'all') return true;
  return source === 'server' ? isServerDoc(doc) : !isServerDoc(doc);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Header subtitle. Signed in: "N diagrams · X saved to the server · Y on this device".
 * Signed out (guest or no session): "N diagrams on this device".
 */
export function librarySubtitle(docs: Pick<DiagramDoc, 'id'>[], signedIn: boolean): string {
  const total = docs.length;
  if (!signedIn) return `${plural(total, 'diagram')} on this device`;
  const server = docs.filter(isServerDoc).length;
  return `${plural(total, 'diagram')} · ${server} saved to the server · ${total - server} on this device`;
}

export interface SourceChip {
  label: string;
  kind: 'server' | 'device';
  title: string;
}

/** "Saved vN" for server docs (version from the last server ack), else "This device". */
export function sourceChip(doc: Pick<DiagramDoc, 'id' | 'serverVersion'>): SourceChip {
  if (isServerDoc(doc)) {
    const v = typeof doc.serverVersion === 'number' ? ` v${doc.serverVersion}` : '';
    return { label: `Saved${v}`, kind: 'server', title: 'Saved to the ArchFlux server' };
  }
  return { label: 'This device', kind: 'device', title: 'Stored only in this browser. Not backed up to the server.' };
}

/** Relative time in the artboard's wording: just now, 2 min ago, yesterday, 3 days ago, last week. */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return plural(h, 'hour') + ' ago';
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  if (d < 35) return `${Math.floor(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Card meta: "N nodes · <relative time>". */
export function cardMeta(doc: Pick<DiagramDoc, 'nodes' | 'updatedAt'>, now: number = Date.now()): string {
  return `${plural(doc.nodes.length, 'node')} · ${relativeTime(doc.updatedAt, now)}`;
}

/** Footer: "This device: X of 25 diagrams · N KB used". */
export function storageLine(docCount: number, usedKB: string): string {
  return `This device: ${docCount} of ${LOCAL_DOC_LIMIT} diagrams · ${usedKB} KB used`;
}

/** Storage pressure for the footer warning (DSH-R4 thresholds: 80% / 95%). */
export function storageLevel(docCount: number): 'ok' | 'warn' | 'full' {
  const pct = (docCount / LOCAL_DOC_LIMIT) * 100;
  if (pct >= 95) return 'full';
  if (pct >= 80) return 'warn';
  return 'ok';
}
