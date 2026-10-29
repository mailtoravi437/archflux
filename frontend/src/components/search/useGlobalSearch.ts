import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { track } from '../../lib/analytics';
import { blueprints } from '../../data/blueprints';
import { useCoreDiagram, useDiagramDocs } from '../../state/useDiagram';
import { isSignedIn } from '../../state/session';
import type { DiagramDoc } from '../../types';
import {
  EMPTY_RESULTS,
  SEARCH_DEBOUNCE_MS,
  mergeDiagramHits,
  searchLocalDiagrams,
  searchLocalElements,
  searchTemplates,
  type SearchResults,
} from './searchEngine';

export interface GlobalSearchState {
  results: SearchResults;
  /** True while the debounce or the server request is pending. */
  pending: boolean;
  /** Set when the server search failed; local results are still shown. */
  serverError: string | null;
  /** The (debounced) query the results belong to. */
  settledQuery: string;
}

/**
 * Debounced (150 ms) global search over the docs loaded in this browser, the templates and,
 * when signed in, server diagrams (`GET /diagrams?q=`). Server rows merge with local ones by
 * id, so a diagram never appears twice.
 */
export function useGlobalSearch(query: string, enabled: boolean): GlobalSearchState {
  const { docs, activeDocId } = useDiagramDocs();
  const { nodes, edges } = useCoreDiagram();
  const [settledQuery, setSettledQuery] = useState('');
  const [server, setServer] = useState<{ q: string; rows: Awaited<ReturnType<typeof api.search.diagrams>>['data'] } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // The active doc's live graph is newer than its saved copy in `docs`.
  const liveDocs: DiagramDoc[] = useMemo(
    () => docs.map((d) => (d.id === activeDocId ? { ...d, nodes, edges } : d)),
    [docs, activeDocId, nodes, edges],
  );

  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => setSettledQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, enabled]);

  const q = enabled ? settledQuery : '';

  useEffect(() => {
    if (!q || !isSignedIn()) return;
    let cancelled = false;
    api.search.diagrams(q).then(
      (resp) => {
        if (cancelled) return;
        setServer({ q, rows: Array.isArray(resp?.data) ? resp.data : [] });
        setServerError(null);
      },
      (e: unknown) => {
        if (cancelled) return;
        setServer(null);
        setServerError(e instanceof Error ? e.message : 'Server search failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [q]);

  const results: SearchResults = useMemo(() => {
    if (!q) return EMPTY_RESULTS;
    const localIds = new Set(liveDocs.map((d) => d.id));
    const serverRows = server && server.q === q ? server.rows : [];
    return {
      elements: searchLocalElements(liveDocs, q),
      diagrams: mergeDiagramHits(searchLocalDiagrams(liveDocs, q), serverRows, localIds),
      templates: searchTemplates(blueprints, q),
    };
  }, [q, liveDocs, server]);

  const serverPending = Boolean(q) && isSignedIn() && serverError === null && server?.q !== q;
  const pending = enabled && (query.trim() !== settledQuery || serverPending);

  // One event per settled query. Counts only: the query text never leaves the browser.
  useEffect(() => {
    if (!q) return;
    track('search_performed', {
      scope: 'palette',
      results: results.elements.length + results.diagrams.length + results.templates.length,
    });
    // Only when the settled query changes, not on every result refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return { results, pending, serverError, settledQuery: q };
}
