import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useCoreDiagram, useDiagramActions, useDiagramUI } from '../../state/useDiagram';
import { loadIconManifest } from '../../lib/icons';
import type { IconEntry } from '../../lib/icons';
import { planQuickAdd, quickAddSuggestions } from '../../lib/quickAdd';
import type { FlowDirection } from '../../lib/quickAdd';

interface Props {
  onClose: () => void;
  direction?: FlowDirection;
  /** Fixed-position placement next to the selected node (set by QuickAddHost). */
  style?: CSSProperties;
  /** Test seam: skips the manifest fetch. */
  entries?: IconEntry[];
}

/**
 * Quick-add input (R1-E10-T06). Type a kind or a technology, Enter creates it beside the
 * selected node, connects selected → new (sync) and selects the new node so typing again chains.
 * Esc closes. The source is always the node that is selected right now.
 */
export default function QuickAdd({ onClose, direction = 'LR', style, entries }: Props) {
  const { nodes, selectedId, docDefaults } = useCoreDiagram();
  const { insertConnected } = useDiagramActions();
  const { activePageId } = useDiagramUI();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [manifest, setManifest] = useState<IconEntry[]>(entries ?? []);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (entries) return;
    let cancelled = false;
    loadIconManifest().then(
      (e) => { if (!cancelled) setManifest(e); },
      () => { /* icons are optional here: kind suggestions still work */ },
    );
    return () => { cancelled = true; };
  }, [entries]);

  // Return focus to the canvas (or whatever had it) on close.
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => { if (prev?.isConnected) prev.focus(); };
  }, []);

  const source = nodes.find((n) => n.id === selectedId) ?? null;
  const suggestions = useMemo(() => quickAddSuggestions(manifest, text), [manifest, text]);
  const idx = Math.min(active, Math.max(0, suggestions.length - 1));

  const create = (at: number = idx) => {
    const suggestion = suggestions[at];
    if (!source || !suggestion) return;
    const node = planQuickAdd({ source, nodes, suggestion, direction, docDefaults, pageId: activePageId });
    insertConnected(node, source.id);
    setText('');
    setActive(0);
  };

  return (
    <div role="dialog" aria-label="Quick add" className="quick-add" style={style}>
      <input
        ref={inputRef}
        role="combobox"
        aria-label="Quick add element"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={suggestions[idx] ? `${listId}-${idx}` : undefined}
        className="quick-add__input"
        placeholder={source ? `Add after ${source.label}…` : 'Select an element first'}
        value={text}
        disabled={!source}
        onChange={(e) => { setText(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); create(); }
        }}
      />
      {text.trim() && (
        <ul id={listId} role="listbox" aria-label="Quick add suggestions" className="quick-add__list">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === idx}
              className={`quick-add__row${i === idx ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => create(i)}
            >
              <span className="quick-add__title">{s.title}</span>
              <span className="quick-add__detail">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {!source && <p role="status" className="quick-add__hint">Select one element, then press Ctrl+Enter.</p>}
    </div>
  );
}
