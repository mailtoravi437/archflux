/**
 * Local-only library persistence (R1-E06-T03): folders, stars and the trash for
 * guests and for docs that never reached the server. Every access is wrapped in
 * try/catch: storage can be missing, full or corrupt.
 */
import type { DiagramDoc } from '../types';

export const LOCAL_TRASH_KEY = 'archflux:trash:v1';
export const LOCAL_LIBRARY_KEY = 'archflux:library:v1';
export const LOCAL_TRASH_DAYS = 30;
export const LIBRARY_EVENT = 'archflux:library-changed';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LocalFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  deletedAt: number | null;
}

export interface LocalLibrary {
  folders: LocalFolder[];
  /** docId → folderId (absent = root). */
  docFolder: Record<string, string>;
  starred: string[];
}

export interface LocalTrashEntry {
  doc: DiagramDoc;
  deletedAt: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** True for docs that exist on the server (UUID ids; local docs use `doc-*`). */
export const isServerDocId = (id: string): boolean => !id.startsWith('doc-') && UUID_RE.test(id);

function notify(): void {
  try {
    window.dispatchEvent(new Event(LIBRARY_EVENT));
  } catch {
    /* no window */
  }
}

export function readLocalLibrary(): LocalLibrary {
  const empty: LocalLibrary = { folders: [], docFolder: {}, starred: [] };
  try {
    const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<LocalLibrary> | null;
    if (!p || typeof p !== 'object') return empty;
    return {
      folders: Array.isArray(p.folders) ? p.folders.filter((f): f is LocalFolder => !!f && typeof f.id === 'string' && typeof f.name === 'string') : [],
      docFolder: p.docFolder && typeof p.docFolder === 'object' ? p.docFolder : {},
      starred: Array.isArray(p.starred) ? p.starred.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return empty;
  }
}

export function writeLocalLibrary(lib: LocalLibrary): void {
  try {
    localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    /* quota or disabled storage: the in-memory state still works for this session */
  }
  notify();
}

/** Reads the local trash and drops entries older than 30 days (persisting the result). */
export function readLocalTrash(now = Date.now()): LocalTrashEntry[] {
  let entries: LocalTrashEntry[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_TRASH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      entries = parsed.filter(
        (e): e is LocalTrashEntry => !!e && typeof e === 'object' && typeof (e as LocalTrashEntry).deletedAt === 'number' && typeof (e as LocalTrashEntry).doc?.id === 'string',
      );
    }
  } catch {
    return [];
  }
  const live = entries.filter((e) => now - e.deletedAt < LOCAL_TRASH_DAYS * DAY_MS);
  if (live.length !== entries.length) writeLocalTrash(live, false);
  return live;
}

export function writeLocalTrash(entries: LocalTrashEntry[], announce = true): void {
  try {
    localStorage.setItem(LOCAL_TRASH_KEY, JSON.stringify(entries));
  } catch {
    /* quota or disabled storage */
  }
  if (announce) notify();
}

/** Moves a doc into the local trash (replaces an older entry with the same id). */
export function trashLocalDoc(doc: DiagramDoc, now = Date.now()): void {
  const rest = readLocalTrash(now).filter((e) => e.doc.id !== doc.id);
  writeLocalTrash([{ doc, deletedAt: now }, ...rest]);
}

export const purgeAtOf = (deletedAt: number): number => deletedAt + LOCAL_TRASH_DAYS * DAY_MS;
