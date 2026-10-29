/**
 * Team templates state (R1-E10-T07). A module store read with `useSyncExternalStore`.
 * Signed in only: nothing is listed or created for guests, and a failed request shows an error,
 * never an empty "no templates" claim.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '../lib/api';
import type { DiagramListItem } from '../lib/contracts';
import { graphOfDoc, isTemplateTagged, templateTitle } from '../lib/teamTemplates';
import type { DiagramDoc } from '../types';
import { isSignedIn } from './session';
import { serverDiagramToDoc } from './store';

export interface TeamTemplate {
  id: string;
  title: string;
  updatedAt: string | null;
}

export interface TeamTemplatesState {
  items: TeamTemplate[];
  ids: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();
let state: TeamTemplatesState = { items: [], ids: EMPTY_IDS, loading: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<TeamTemplatesState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const snapshot = () => state;

/** Test helper. */
export function resetTeamTemplates(): void {
  state = { items: [], ids: EMPTY_IDS, loading: false, error: null };
  listeners.forEach((l) => l());
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function refreshTeamTemplates(): Promise<void> {
  if (!isSignedIn()) {
    set({ items: [], ids: EMPTY_IDS, loading: false, error: null });
    return;
  }
  set({ loading: true });
  try {
    const resp = await api.templates.list();
    const rows = (Array.isArray(resp?.data) ? resp.data : []).filter(
      (r: DiagramListItem) => !r.deletedAt && isTemplateTagged(r.tags),
    );
    set({
      items: rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt })),
      ids: new Set(rows.map((r) => r.id)),
      loading: false,
      error: null,
    });
  } catch (e) {
    set({ loading: false, error: message(e) });
  }
}

/** Saves a copy of `doc` as a team template (tag `template`, title "<title> (template)"). Returns the new id. */
export async function saveAsTemplate(doc: DiagramDoc): Promise<string> {
  const resp = await api.templates.create(templateTitle(doc.title), graphOfDoc(doc));
  const id = resp?.data?.id;
  if (typeof id !== 'string') throw new Error('The server did not return a template id');
  await refreshTeamTemplates();
  return id;
}

/** Loads a template's graph as a doc, ready to be imported as a new untagged copy. */
export async function fetchTemplateDoc(id: string): Promise<DiagramDoc> {
  const resp = await api.templates.get(id);
  const doc = serverDiagramToDoc(resp?.data);
  if (!doc) throw new Error('The template could not be read');
  return doc;
}

/** Team templates for the signed-in user; refreshes once on mount when `refresh` is set. */
export function useTeamTemplates(refresh = true): TeamTemplatesState & { refresh: () => Promise<void> } {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const reload = useCallback(() => refreshTeamTemplates(), []);
  useEffect(() => {
    if (refresh) void refreshTeamTemplates();
  }, [refresh]);
  return { ...s, refresh: reload };
}
