import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useDiagram } from '../../state/useDiagram';
import type { FindMatch, FindQuery } from '../../state/ops/findReplace';

export interface FindBarProps {
  /** Start with the replace row open (Ctrl+H). */
  withReplace: boolean;
  /** Select and reveal a match on the canvas. */
  onReveal: (m: FindMatch) => void;
  onClose: () => void;
}

const FIELDS: FindQuery['fields'] = ['label', 'technology', 'edgeLabel', 'properties'];

/**
 * R1-E10-T05 UI, wired in R1-E04-T08: find bar at the top of the canvas. Shows "3 of 12";
 * Enter / Shift+Enter step through matches, Ctrl+H toggles replace, "Replace all" is one undo step.
 * Esc closes. Searches the active page.
 */
export function FindBar({ withReplace, onReveal, onClose }: FindBarProps) {
  const { findMatches, replaceAll, nodes, edges, activePageId } = useDiagram();
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(withReplace);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  // Ctrl+H while the bar is open re-opens the replace row (adjusted during render, not in an effect).
  const [prevWith, setPrevWith] = useState(withReplace);
  if (prevWith !== withReplace) {
    setPrevWith(withReplace);
    setShowReplace(withReplace);
  }

  const query: FindQuery = useMemo(() => ({ text, fields: FIELDS, caseSensitive, wholeWord, pageScope: 'page' }), [text, caseSensitive, wholeWord]);
  // Re-run when the doc or page changes, not only when the query does.
  const matches = useMemo(() => {
    void nodes; void edges; void activePageId;
    return text ? findMatches(query) : [];
  }, [text, query, findMatches, nodes, edges, activePageId]);
  const current = matches.length > 0 ? Math.min(index, matches.length - 1) : -1;

  const step = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (current + dir + matches.length) % matches.length;
    setIndex(next);
    onReveal(matches[next]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      inputRef.current?.select();
    } else if (mod && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      setShowReplace((v) => !v);
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement) === inputRef.current) {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  };

  const status = !text ? '' : matches.length === 0 ? 'No matches' : `${current + 1} of ${matches.length}`;
  const btn = { height: 28, padding: '0 8px' } as const;
  return (
    <div
      role="search"
      aria-label="Find in diagram"
      onKeyDown={onKeyDown}
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 45,
        display: 'flex', flexDirection: 'column', gap: 6, padding: 8, minWidth: 420,
        background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', borderRadius: 10,
        boxShadow: '0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.12)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={inputRef}
          type="search"
          aria-label="Find"
          placeholder="Find in this page"
          value={text}
          onChange={(e) => { setText(e.target.value); setIndex(0); }}
          style={{ flexGrow: 1, height: 28, padding: '0 8px', border: '1px solid var(--border-panel)', borderRadius: 6, font: 'inherit', fontSize: 13, background: 'var(--bg-panel)', color: 'var(--text-main)' }}
        />
        <span role="status" aria-label="Match count" style={{ minWidth: 64, fontSize: 12, color: 'var(--text-muted)' }}>{status}</span>
        <button type="button" className="btn btn--sm btn--secondary" style={btn} aria-label="Previous match" disabled={matches.length === 0} onClick={() => step(-1)}>↑</button>
        <button type="button" className="btn btn--sm btn--secondary" style={btn} aria-label="Next match" disabled={matches.length === 0} onClick={() => step(1)}>↓</button>
        <button type="button" className="btn btn--sm btn--secondary" style={btn} aria-pressed={caseSensitive} aria-label="Match case" title="Match case" onClick={() => setCaseSensitive((v) => !v)}>Aa</button>
        <button type="button" className="btn btn--sm btn--secondary" style={btn} aria-pressed={wholeWord} aria-label="Whole word" title="Whole word" onClick={() => setWholeWord((v) => !v)}>“ab”</button>
        <button type="button" className="btn btn--sm btn--secondary" style={btn} aria-pressed={showReplace} aria-label="Toggle replace" title="Replace (Ctrl+H)" onClick={() => setShowReplace((v) => !v)}>⇄</button>
        <button type="button" className="btn btn--sm btn--secondary" style={btn} aria-label="Close find" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      {showReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="text"
            aria-label="Replace with"
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            style={{ flexGrow: 1, height: 28, padding: '0 8px', border: '1px solid var(--border-panel)', borderRadius: 6, font: 'inherit', fontSize: 13, background: 'var(--bg-panel)', color: 'var(--text-main)' }}
          />
          <button type="button" className="btn btn--sm btn--primary" style={btn} disabled={matches.length === 0} onClick={() => { replaceAll(query, replacement); setIndex(0); }}>
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
