import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCoreDiagram, useDiagramActions, useDiagramUI, useDiagramDocs } from '../state/useDiagram';
import { isSignedIn } from '../state/session';
import { useGlobalSearch } from './search/useGlobalSearch';
import SearchResultsView from './search/SearchResultsView';
import { FILTER_ORDER, flattenResults, hitKey, searchOptionId, type SearchFilter, type SearchHit } from './search/searchEngine';
import { openSearchHit } from './search/openHit';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  COMMAND_GROUPS,
  listCommands,
  recentCommands,
  recordCommandUse,
  searchCommands,
  subscribeCommands,
  suggestedForSelection,
} from '../lib/commands';
import type { Command, CommandContext } from '../lib/commands';

let registryVersion = 0;
function subscribe(cb: () => void) {
  return subscribeCommands(() => {
    registryVersion++;
    cb();
  });
}
function getVersion() {
  return registryVersion;
}

interface Row {
  key: string;
  cmd: Command;
}
interface Section {
  label: string | null;
  rows: Row[];
}

/**
 * Command palette (SC-19). Backed by the command registry in lib/commands.
 * Mounted only while open; Esc closes and focus returns to where it was.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const actions = useDiagramActions();
  const ui = useDiagramUI();
  const { selectedId, selectedEdgeId, multiSel } = useCoreDiagram();
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  // Second mode (E10-T04): the Search tab, or a leading `/`, searches diagrams, elements and templates.
  const [tab, setTab] = useState<'commands' | 'search'>('commands');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const { openDoc } = useDiagramDocs();
  const searchMode = tab === 'search' || query.startsWith('/');
  const searchText = query.startsWith('/') ? query.slice(1) : query;
  const search = useGlobalSearch(searchText, searchMode);
  const searchFlat = useMemo(() => flattenResults(search.results, filter), [search.results, filter]);
  const searchActive: SearchHit | undefined = searchFlat[Math.min(activeIdx, Math.max(0, searchFlat.length - 1))];
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  // Where focus was before the palette opened. Captured lazily on the first
  // render — before `autoFocus` moves focus into the palette at commit — so
  // unmount can return focus to the opener (SC-19).
  const [prevFocus] = useState<HTMLElement | null>(
    () => (document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );

  // Restore focus to the element that had it before the palette opened.
  useEffect(() => {
    return () => {
      if (prevFocus && prevFocus.isConnected) prevFocus.focus();
    };
  }, [prevFocus]);

  const selectionIds = useMemo(() => {
    const ids = new Set<string>(multiSel);
    if (selectedId) ids.add(selectedId);
    if (selectedEdgeId) ids.add(selectedEdgeId);
    return Array.from(ids);
  }, [multiSel, selectedId, selectedEdgeId]);

  const ctx: CommandContext = useMemo(
    () => ({
      route: location.pathname,
      selectionIds,
      // No workspace role reaches the client yet; the local user owns local docs.
      role: 'owner',
      actions,
      ui,
      navigate: (to: string) => navigate(to),
    }),
    [location.pathname, selectionIds, actions, ui, navigate],
  );

  const sections: Section[] = useMemo(() => {
    void version;
    const q = query.trim();
    if (q) {
      return [{ label: null, rows: searchCommands(ctx, q).map((cmd) => ({ key: `r-${cmd.id}`, cmd })) }];
    }
    const out: Section[] = [];
    const recent = recentCommands(ctx);
    if (recent.length) out.push({ label: 'Recent', rows: recent.map((cmd) => ({ key: `recent-${cmd.id}`, cmd })) });
    const suggested = suggestedForSelection(ctx);
    if (suggested.length) out.push({ label: 'Suggested for selection', rows: suggested.map((cmd) => ({ key: `sug-${cmd.id}`, cmd })) });
    const all = listCommands(ctx);
    for (const g of COMMAND_GROUPS) {
      const rows = all.filter((c) => c.group === g).map((cmd) => ({ key: `all-${cmd.id}`, cmd }));
      if (rows.length) out.push({ label: g, rows });
    }
    return out;
  }, [ctx, query, version]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const clampedIdx = Math.min(activeIdx, Math.max(0, flat.length - 1));
  const active = flat[clampedIdx];

  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(`cmd-${active.key}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const runRow = (row: Row | undefined) => {
    if (!row) return;
    recordCommandUse(row.cmd.id);
    onClose();
    row.cmd.run(ctx);
  };

  const runHit = (hit: SearchHit | undefined) => {
    if (!hit) return;
    onClose();
    openSearchHit(hit, { openDoc, navigate: (to) => navigate(to), pushToast: ui.pushToast });
  };

  const listLen = searchMode ? searchFlat.length : flat.length;
  const activeOptionId = searchMode ? (searchActive ? searchOptionId(searchActive) : undefined) : active ? `cmd-${active.key}` : undefined;

  let rowIndex = -1;
  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="content-card cmd-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="cmd-palette__tabs" role="tablist" aria-label="Palette mode">
          {(['commands', 'search'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={searchMode === (t === 'search')}
              className="cmd-palette__tab"
              onClick={() => {
                setTab(t);
                if (t === 'commands' && query.startsWith('/')) setQuery(query.slice(1));
                setActiveIdx(0);
              }}
            >
              {t === 'commands' ? 'Commands' : 'Search'}
            </button>
          ))}
        </div>
        <input
          autoFocus
          className="cmd-palette__input"
          placeholder={searchMode ? 'Search diagrams, elements, templates…' : 'Type a command… (or / to search)'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, Math.max(0, listLen - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (searchMode) runHit(searchActive);
              else runRow(active);
            } else if (e.key === 'Tab' && !e.shiftKey && searchMode) {
              // Tab walks the result groups: All, Elements, Diagrams, Templates.
              e.preventDefault();
              setFilter((f) => FILTER_ORDER[(FILTER_ORDER.indexOf(f) + 1) % FILTER_ORDER.length]);
              setActiveIdx(0);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-listbox"
          aria-label="Command palette"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
        />
        {searchMode && (
          <SearchResultsView
            query={searchText}
            results={search.results}
            filter={filter}
            onFilter={(f) => { setFilter(f); setActiveIdx(0); }}
            activeKey={searchActive ? hitKey(searchActive) : null}
            onHover={(k) => setActiveIdx(Math.max(0, searchFlat.findIndex((h) => hitKey(h) === k)))}
            onOpen={runHit}
            pending={search.pending}
            serverError={search.serverError}
            signedIn={isSignedIn()}
          />
        )}
        {!searchMode && <div id="cmd-listbox" role="listbox" aria-label="Commands" className="cmd-palette__list">
          {sections.map((s, si) => {
            const headingId = `cmd-group-${si}`;
            const rows = s.rows.map((row) => {
              rowIndex++;
              const i = rowIndex;
              return (
                <div
                  key={row.key}
                  id={`cmd-${row.key}`}
                  role="option"
                  aria-selected={i === clampedIdx}
                  className={`cmd-palette__row${i === clampedIdx ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runRow(row)}
                >
                  <span className="cmd-palette__title">{row.cmd.title}</span>
                  {row.cmd.shortcut && <kbd className="cmd-palette__kbd">{row.cmd.shortcut}</kbd>}
                </div>
              );
            });
            if (!s.label) return rows;
            return (
              <div key={s.label} role="group" aria-labelledby={headingId}>
                <div id={headingId} className="cmd-palette__heading" role="presentation">{s.label}</div>
                {rows}
              </div>
            );
          })}
          {flat.length === 0 && (
            <div role="status" className="cmd-palette__empty">No commands match “{query}”.</div>
          )}
        </div>}
      </div>
    </div>
  );
}
