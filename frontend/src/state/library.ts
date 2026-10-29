/**
 * Library state (R1-E06-T03): folders, current folder, trash and stars.
 *
 * A small module-level store read with `useSyncExternalStore`, separate from
 * `DiagramProvider`. Signed in: server state through `api.folders` and
 * `api.diagrams`. Signed out (or for docs that only exist locally): the same
 * shapes persisted in `archflux:library:v1` and `archflux:trash:v1`. Nothing is
 * ever shown as synced when it is not.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import type { DiagramListItem, FolderDto } from '../lib/contracts';
import type { DiagramDoc } from '../types';
import { isSignedIn } from './session';
import {
  isServerDocId,
  LIBRARY_EVENT,
  purgeAtOf,
  readLocalLibrary,
  readLocalTrash,
  writeLocalLibrary,
  writeLocalTrash,
  type LocalFolder,
} from './libraryLocal';
import { useDiagram } from './useDiagram';

export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  deletedAt: number | null;
}

export interface TrashDoc {
  id: string;
  title: string;
  deletedAt: number | null;
  purgeAt: number | null;
  folderId: string | null;
  source: 'server' | 'local';
  /** The caller's role on the diagram (`owner` for local docs); gates "Delete forever". */
  role: string | null;
  /** Saved versions, when the server reported it. */
  versions?: number;
}

export interface LibraryState {
  /** Where folders live right now. Signed out: this browser only. */
  mode: 'server' | 'local';
  folders: LibraryFolder[];
  currentFolderId: string | null;
  trash: { docs: TrashDoc[]; folders: LibraryFolder[] };
  starredIds: string[];
  /** docId → folderId for docs known to be in a folder. */
  docFolders: Record<string, string>;
  loading: boolean;
  error: string | null;
}

const initial = (): LibraryState => ({
  mode: 'local',
  folders: [],
  currentFolderId: null,
  trash: { docs: [], folders: [] },
  starredIds: [],
  docFolders: {},
  loading: false,
  error: null,
});

let state: LibraryState = initial();
const listeners = new Set<() => void>();

function setState(patch: Partial<LibraryState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onLocal = () => void refresh();
  if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener(LIBRARY_EVENT, onLocal);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener(LIBRARY_EVENT, onLocal);
  };
}

/** Test helper: back to the empty signed-out state. */
export function resetLibraryState(): void {
  state = initial();
  listeners.forEach((l) => l());
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};
const fromDto = (f: FolderDto): LibraryFolder => ({ id: f.id, name: f.name, parentId: f.parentId, deletedAt: ms(f.deletedAt) });
const fromLocal = (f: LocalFolder): LibraryFolder => ({ id: f.id, name: f.name, parentId: f.parentId, deletedAt: f.deletedAt });
const trashDocFromItem = (d: DiagramListItem): TrashDoc => ({
  id: d.id,
  title: d.title,
  deletedAt: ms(d.deletedAt),
  purgeAt: ms(d.purgeAt),
  folderId: d.folderId,
  source: 'server',
  role: d.role,
  versions: d.version,
});
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function readLocalState(): Pick<LibraryState, 'folders' | 'trash' | 'starredIds' | 'docFolders'> & { localTrash: TrashDoc[] } {
  const lib = readLocalLibrary();
  const localTrash: TrashDoc[] = readLocalTrash().map((e) => ({
    id: e.doc.id,
    title: e.doc.title,
    deletedAt: e.deletedAt,
    purgeAt: purgeAtOf(e.deletedAt),
    folderId: lib.docFolder[e.doc.id] ?? null,
    source: 'local',
    role: 'owner',
  }));
  return {
    folders: lib.folders.filter((f) => f.deletedAt === null).map(fromLocal),
    trash: { docs: localTrash, folders: lib.folders.filter((f) => f.deletedAt !== null).map(fromLocal) },
    starredIds: lib.starred,
    docFolders: lib.docFolder,
    localTrash,
  };
}

/** Reloads folders, trash and stars. Signed out it reads this browser only. */
export async function refresh(): Promise<void> {
  const local = readLocalState();
  if (!isSignedIn()) {
    setState({ mode: 'local', folders: local.folders, trash: local.trash, starredIds: local.starredIds, docFolders: local.docFolders, loading: false, error: null });
    return;
  }
  setState({ mode: 'server', loading: true });
  try {
    const [live, trashedFolders, trashedDocs, starred, all] = await Promise.all([
      api.folders.list(false),
      api.folders.list(true),
      api.diagrams.list({ trashed: true }),
      api.diagrams.list({ starred: true }),
      api.diagrams.list({}),
    ]);
    const docFolders: Record<string, string> = {};
    for (const d of all.data) if (d.folderId) docFolders[d.id] = d.folderId;
    setState({
      mode: 'server',
      folders: live.data.map(fromDto),
      trash: { docs: [...trashedDocs.data.map(trashDocFromItem), ...local.localTrash], folders: trashedFolders.data.map(fromDto) },
      starredIds: [...new Set([...starred.data.map((d) => d.id), ...local.starredIds])],
      docFolders: { ...local.docFolders, ...docFolders },
      loading: false,
      error: null,
    });
  } catch (e) {
    setState({ loading: false, error: message(e) });
  }
}

const newLocalId = (): string => `fld-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Runs a server call, refreshes on success, records the message on failure. */
async function viaServer(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    await refresh();
    return true;
  } catch (e) {
    setState({ error: message(e) });
    return false;
  }
}

/** Mutates the local library file and reloads. */
async function viaLocal(change: (lib: ReturnType<typeof readLocalLibrary>) => void): Promise<boolean> {
  const lib = readLocalLibrary();
  change(lib);
  writeLocalLibrary(lib);
  await refresh();
  return true;
}

const onServer = (): boolean => isSignedIn();

export function setCurrentFolder(id: string | null): void {
  setState({ currentFolderId: id });
}

export async function createFolder(name: string, parentId: string | null = null): Promise<boolean> {
  const clean = name.trim();
  if (!clean) return false;
  if (onServer()) return viaServer(() => api.folders.create(clean, parentId));
  const lib = readLocalLibrary();
  if (lib.folders.some((f) => f.deletedAt === null && f.parentId === parentId && f.name.toLowerCase() === clean.toLowerCase())) {
    setState({ error: 'A folder with that name already exists here' });
    return false;
  }
  return viaLocal((l) => l.folders.push({ id: newLocalId(), name: clean, parentId, createdAt: Date.now(), deletedAt: null }));
}

export async function renameFolder(id: string, name: string): Promise<boolean> {
  const clean = name.trim();
  if (!clean) return false;
  if (onServer() && !id.startsWith('fld-')) return viaServer(() => api.folders.rename(id, clean));
  return viaLocal((l) => {
    const f = l.folders.find((x) => x.id === id);
    if (f) f.name = clean;
  });
}

export async function moveFolder(id: string, parentId: string | null): Promise<boolean> {
  if (id === parentId) return false;
  if (onServer() && !id.startsWith('fld-')) return viaServer(() => api.folders.move(id, parentId));
  return viaLocal((l) => {
    const f = l.folders.find((x) => x.id === id);
    if (!f) return;
    // Refuse a move into its own subtree.
    for (let p = parentId; p; p = l.folders.find((x) => x.id === p)?.parentId ?? null) if (p === id) return;
    f.parentId = parentId;
  });
}

/** Local trash of a folder: it and its subfolders are hidden; docs in them go back to the root (never deleted). */
export async function trashFolder(id: string): Promise<boolean> {
  if (onServer() && !id.startsWith('fld-')) return viaServer(() => api.folders.trash(id));
  return viaLocal((l) => {
    const doomed = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const f of l.folders) {
        if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
          doomed.add(f.id);
          grew = true;
        }
      }
    }
    const now = Date.now();
    l.folders.forEach((f) => {
      if (doomed.has(f.id)) f.deletedAt = now;
    });
    for (const [docId, folderId] of Object.entries(l.docFolder)) if (doomed.has(folderId)) delete l.docFolder[docId];
  });
}

export async function restoreFolder(id: string): Promise<boolean> {
  if (onServer() && !id.startsWith('fld-')) return viaServer(() => api.folders.restore(id));
  return viaLocal((l) => {
    const f = l.folders.find((x) => x.id === id);
    if (!f) return;
    f.deletedAt = null;
    // A trashed parent cannot hold it: it comes back at the root.
    if (f.parentId && !l.folders.some((x) => x.id === f.parentId && x.deletedAt === null)) f.parentId = null;
  });
}

export async function moveDoc(docId: string, folderId: string | null): Promise<boolean> {
  if (onServer() && isServerDocId(docId) && !(folderId ?? '').startsWith('fld-')) return viaServer(() => api.diagrams.move(docId, folderId));
  return viaLocal((l) => {
    if (folderId) l.docFolder[docId] = folderId;
    else delete l.docFolder[docId];
  });
}

/** Optimistic: the star flips at once and rolls back, with an error, when the server refuses. */
export async function toggleStar(docId: string): Promise<boolean> {
  const was = state.starredIds.includes(docId);
  const flip = (on: boolean) => (ids: string[]) => (on ? [...new Set([...ids, docId])] : ids.filter((x) => x !== docId));
  setState({ starredIds: flip(!was)(state.starredIds), error: null });
  if (onServer() && isServerDocId(docId)) {
    try {
      await (was ? api.diagrams.unstar(docId) : api.diagrams.star(docId));
      return true;
    } catch (e) {
      setState({ starredIds: flip(was)(state.starredIds), error: message(e) });
      return false;
    }
  }
  const lib = readLocalLibrary();
  lib.starred = flip(!was)(lib.starred);
  writeLocalLibrary(lib);
  return true;
}

export async function purgeDoc(docId: string, confirmTitle: string): Promise<boolean> {
  const item = state.trash.docs.find((d) => d.id === docId);
  if (item?.source === 'local' || (!item && !isServerDocId(docId))) {
    const entry = readLocalTrash().find((e) => e.doc.id === docId);
    if (!entry || entry.doc.title !== confirmTitle) {
      setState({ error: 'The title you typed does not match' });
      return false;
    }
    writeLocalTrash(readLocalTrash().filter((e) => e.doc.id !== docId));
    return true;
  }
  return viaServer(() => api.diagrams.purge(docId, confirmTitle));
}

export interface Library extends LibraryState {
  refresh: () => Promise<void>;
  setCurrentFolder: (id: string | null) => void;
  createFolder: typeof createFolder;
  renameFolder: typeof renameFolder;
  moveFolder: typeof moveFolder;
  trashFolder: typeof trashFolder;
  restoreFolder: typeof restoreFolder;
  moveDoc: typeof moveDoc;
  toggleStar: typeof toggleStar;
  restoreDoc: (docId: string) => Promise<boolean>;
  purgeDoc: typeof purgeDoc;
}

/** Hook over the shared library store. Must be rendered inside `DiagramProvider` (restore re-adds local docs). */
export function useLibrary(): Library {
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  const { restoreLocalDoc } = useDiagram();
  const restoreDoc = useCallback(
    async (docId: string): Promise<boolean> => {
      const item = state.trash.docs.find((d) => d.id === docId);
      if (item?.source === 'local' || (!item && !isServerDocId(docId))) {
        const entries = readLocalTrash();
        const entry = entries.find((e) => e.doc.id === docId);
        if (!entry) return false;
        const doc: DiagramDoc = entry.doc;
        if (!restoreLocalDoc(doc)) {
          setState({ error: 'A diagram with that id is already in your library' });
          return false;
        }
        writeLocalTrash(entries.filter((e) => e.doc.id !== docId));
        return true;
      }
      return viaServer(() => api.diagrams.restore(docId));
    },
    [restoreLocalDoc],
  );
  return { ...snap, refresh, setCurrentFolder, createFolder, renameFolder, moveFolder, trashFolder, restoreFolder, moveDoc, toggleStar, restoreDoc, purgeDoc };
}
