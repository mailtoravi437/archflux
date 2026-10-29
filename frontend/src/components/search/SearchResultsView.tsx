import type { SearchFilter, SearchHit, SearchResults } from './searchEngine';
import { hitKey, searchOptionId as idFor } from './searchEngine';

const GROUPS: Array<{ filter: Exclude<SearchFilter, 'all'>; label: 'Elements' | 'Diagrams' | 'Templates'; key: keyof SearchResults }> = [
  { filter: 'elements', label: 'Elements', key: 'elements' },
  { filter: 'diagrams', label: 'Diagrams', key: 'diagrams' },
  { filter: 'templates', label: 'Templates', key: 'templates' },
];

interface Props {
  query: string;
  results: SearchResults;
  filter: SearchFilter;
  onFilter: (f: SearchFilter) => void;
  activeKey: string | null;
  onHover: (key: string) => void;
  onOpen: (hit: SearchHit) => void;
  pending: boolean;
  serverError: string | null;
  signedIn: boolean;
}

/**
 * Search results (SC-07, Search.dc.html left column): type chips with counts, grouped rows
 * (dot, title, sub, meta), and the key hint footer. There is no Comments group: comments are
 * not searchable yet, so the chip is not shown.
 */
export default function SearchResultsView({ query, results, filter, onFilter, activeKey, onHover, onOpen, pending, serverError, signedIn }: Props) {
  const total = results.elements.length + results.diagrams.length + results.templates.length;
  const chips: Array<{ f: SearchFilter; label: string }> = [
    { f: 'all', label: 'All' },
    ...GROUPS.map((g) => ({ f: g.filter as SearchFilter, label: `${g.label} ${results[g.key].length}` })),
  ];
  const q = query.trim();
  return (
    <div className="gsearch">
      <div className="gsearch__chips" role="group" aria-label="Result type">
        {chips.map((c) => (
          <button
            key={c.f}
            type="button"
            className="gsearch__chip"
            aria-pressed={filter === c.f}
            onClick={() => onFilter(c.f)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div id="cmd-listbox" role="listbox" aria-label="Search results" className="cmd-palette__list">
        {!q && (
          <div role="status" className="cmd-palette__empty">
            Type to search diagrams, elements and templates.
          </div>
        )}
        {q && total === 0 && !pending && (
          <div role="status" className="cmd-palette__empty">
            No results for “{q}”.
          </div>
        )}
        {q && pending && total === 0 && (
          <div role="status" className="cmd-palette__empty">Searching…</div>
        )}
        {GROUPS.map((g) => {
          if (filter !== 'all' && filter !== g.filter) return null;
          const rows = results[g.key] as SearchHit[];
          if (rows.length === 0) return null;
          const headingId = `gs-group-${g.filter}`;
          return (
            <div key={g.filter} role="group" aria-labelledby={headingId}>
              <div id={headingId} className="gsearch__heading" role="presentation">{g.label}</div>
              {rows.map((h) => {
                const key = hitKey(h);
                const on = key === activeKey;
                return (
                  <div
                    key={key}
                    id={idFor(h)}
                    role="option"
                    aria-selected={on}
                    className={`gsearch__row${on ? ' is-active' : ''}`}
                    onMouseEnter={() => onHover(key)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onOpen(h)}
                  >
                    <span className="gsearch__dot" style={h.kind === 'element' && h.dot ? { background: h.dot } : undefined} aria-hidden="true" />
                    <span className="gsearch__text">
                      <span className="gsearch__title">{h.title}</span>
                      {h.sub && <span className="gsearch__sub">{h.sub}</span>}
                    </span>
                    {h.kind !== 'template' && h.meta && <span className="gsearch__meta">{h.meta}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {q && (
        <p className="gsearch__note">
          {signedIn ? 'Diagram titles come from your workspace. ' : ''}
          Searching elements in open diagrams. Workspace-wide element search is coming.
        </p>
      )}
      {serverError && (
        <p role="alert" className="gsearch__note gsearch__note--error">
          Workspace search failed ({serverError}). Showing results from this browser only.
        </p>
      )}
      <p className="gsearch__hint">↑↓ navigate · ↵ open · Tab next group · Esc close</p>
    </div>
  );
}
