/**
 * One timeline of server revisions, server checkpoints and local checkpoints (R1-E08-T03).
 * Pure: no React, no store. `RevisionsSection` and the History panel both read from here.
 */
import type { NamedRevision } from '../lib/api';

export interface TimelineEntry {
  id: string;
  kind: 'revision' | 'checkpoint' | 'local';
  createdAt: number;
  authorName: string | null;
  source: string;
  name: string | null;
  message: string | null;
  isCurrent: boolean;
  /** Entries in the same coalesced editing session share this key (revisions only). */
  session: string | null;
}

/** Minimal shape of a checkpoint; `SnapshotCheckpoint` satisfies it. */
export interface CheckpointLike {
  id: string;
  title: string;
  meta?: string;
  createdAt?: string | number;
}

/** Revision fields the timeline reads; `ServerRevision` and `NamedRevision` both satisfy it. */
export type RevisionLike = Pick<NamedRevision, 'id' | 'source' | 'createdAt'> & {
  authorName?: string | null;
  authorId?: string | null;
  name?: string | null;
  message?: string | null;
};

export const SESSION_GAP_MS = 10 * 60 * 1000;

/** Sources that are one editing session when they follow each other; everything else stands alone. */
const EDIT_SOURCES: ReadonlySet<string> = new Set(['manual', 'edit', 'autosave']);

function toMs(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** Local checkpoints are keyed `v<base36 ms>`; anything else has no honest timestamp (0). */
function checkpointTime(cp: CheckpointLike): number {
  const explicit = toMs(cp.createdAt);
  if (explicit > 0) return explicit;
  const m = /^v([0-9a-z]{6,})$/.exec(cp.id);
  if (m) {
    const t = parseInt(m[1], 36);
    if (Number.isFinite(t) && t > 1e12 && t < 4e12) return t;
  }
  return 0;
}

export function buildTimeline(revs: RevisionLike[], checkpoints: CheckpointLike[], localCps: CheckpointLike[]): TimelineEntry[] {
  const fromRevs: TimelineEntry[] = revs.map((r) => ({
    id: r.id,
    kind: 'revision',
    createdAt: toMs(r.createdAt),
    authorName: r.authorName ?? null,
    source: r.source || 'manual',
    name: r.name?.trim() ? r.name : null,
    message: r.message ?? null,
    isCurrent: false,
    session: null,
  }));
  const cp = (kind: 'checkpoint' | 'local') => (c: CheckpointLike): TimelineEntry => ({
    id: c.id,
    kind,
    createdAt: checkpointTime(c),
    authorName: null,
    source: 'checkpoint',
    name: c.title,
    message: c.meta ?? null,
    isCurrent: false,
    session: null,
  });
  const all = [...fromRevs, ...checkpoints.map(cp('checkpoint')), ...localCps.map(cp('local'))];
  all.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  const firstRev = all.find((e) => e.kind === 'revision');
  if (firstRev) firstRev.isCurrent = true;
  // Coalesce: newest-first walk; an unnamed edit revision joins the session of the previous
  // (newer) one when the author matches and the gap is under 10 minutes.
  let sessionSeq = 0;
  let prev: TimelineEntry | null = null;
  for (const e of all) {
    const editing = e.kind === 'revision' && EDIT_SOURCES.has(e.source) && !e.name;
    if (editing && prev && prev.session && prev.authorName === e.authorName && prev.createdAt - e.createdAt < SESSION_GAP_MS) {
      e.session = prev.session;
    } else if (editing) {
      sessionSeq += 1;
      e.session = `s${sessionSeq}`;
    }
    prev = editing ? e : null;
  }
  return all;
}

export interface TimelineSession { type: 'session'; session: string; authorName: string | null; count: number; from: number; to: number; entries: TimelineEntry[] }
export interface TimelineSingle { type: 'entry'; entry: TimelineEntry }
export interface TimelineDay { day: string; items: Array<TimelineSession | TimelineSingle> }

function dayKey(ms: number): string {
  if (ms <= 0) return 'Unknown date';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Day header, then session groups (2 or more coalesced edits) and standalone entries. */
export function groupTimeline(entries: TimelineEntry[]): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const e of entries) {
    const key = dayKey(e.createdAt);
    let day = days[days.length - 1];
    if (!day || day.day !== key) {
      day = { day: key, items: [] };
      days.push(day);
    }
    const last = day.items[day.items.length - 1];
    if (e.session && last && last.type === 'session' && last.session === e.session) {
      last.entries.push(e);
      last.count += 1;
      last.from = e.createdAt;
    } else if (e.session) {
      day.items.push({ type: 'session', session: e.session, authorName: e.authorName, count: 1, from: e.createdAt, to: e.createdAt, entries: [e] });
    } else {
      day.items.push({ type: 'entry', entry: e });
    }
  }
  // A session of one edit is just an entry.
  for (const day of days) {
    day.items = day.items.map((it) => (it.type === 'session' && it.count === 1 ? { type: 'entry', entry: it.entries[0] } : it));
  }
  return days;
}

/** Human label for a revision source. */
export function sourceLabel(source: string): string {
  switch (source) {
    case 'import': return 'Import';
    case 'restore': return 'Restore';
    case 'revert': return 'Revert';
    case 'sync': return 'Sync';
    case 'checkpoint': return 'Checkpoint';
    default: return 'Edit';
  }
}
