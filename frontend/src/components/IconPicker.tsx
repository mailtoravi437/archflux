import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { loadIconManifest, resolveIcon, searchIcons, suggestIcons } from '../lib/icons';
import type { IconEntry } from '../lib/icons';
import { readRecentIcons, recordRecentIcon } from '../lib/recentIcons';
import type { ElementKind, IconRef } from '../types';

/**
 * R1-E05-T03: icon picker popover (DisplayStyles.dc.html "Replace icon"; UI_REVAMP_SPEC §5A.1b).
 * Presentational: it reports the pick through `onPick` (an IconRef, or null for "No icon") and
 * the caller applies it (see NodeIconPicker for the one-undo-step node wiring).
 */

const GRID_COLUMNS = 4;
const RENDER_LIMIT = 120;

type TabId = 'recent' | 'aws' | 'k8s' | 'generic' | 'uploaded';
const TABS: { id: TabId; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'aws', label: 'AWS' },
  { id: 'k8s', label: 'Kubernetes' },
  { id: 'generic', label: 'Generic' },
  { id: 'uploaded', label: 'Uploaded' },
];

export interface IconPickerProps {
  kind: ElementKind;
  technology?: string;
  /** The element's current icon, marked as selected. */
  current?: IconRef | null;
  /** Manifest entries; when omitted the picker loads `/icons/manifest.json`. */
  entries?: IconEntry[];
  /** Viewport position of the popover's top-left corner; centred near the top when omitted. */
  position?: { x: number; y: number };
  onPick: (ref: IconRef | null) => void;
  onClose: () => void;
}

const pillStyle = (active: boolean): CSSProperties => ({
  height: 24, padding: '0 8px', border: 'none', borderRadius: 999, cursor: 'pointer',
  background: active ? 'var(--accent-soft, #EEF0FF)' : 'var(--bg-panel-subtle, #F1F2F5)',
  color: active ? 'var(--accent-cyan-text, #4338CA)' : 'var(--text-main)',
  font: 'inherit', fontSize: 11, fontWeight: active ? 600 : 400,
});

const tileStyle = (selected: boolean): CSSProperties => ({
  height: 64, minWidth: 0, borderRadius: 8, cursor: 'pointer', padding: '0 2px',
  border: selected ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-panel)',
  background: selected ? 'var(--accent-soft, #EEF0FF)' : 'var(--bg-panel)',
  color: 'var(--text-main)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
  font: 'inherit', fontSize: 10,
});

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gap: 6 };
const groupLabelStyle: CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '2px 0' };

export function IconPicker({ kind, technology, current, entries: entriesProp, position, onPick, onClose }: IconPickerProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const uid = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<IconEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [recent] = useState<IconRef[]>(readRecentIcons);
  const [tab, setTab] = useState<TabId>(recent.length > 0 ? 'recent' : 'aws');
  const entries = entriesProp ?? loaded;

  // Restore focus to whatever opened the picker when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => { opener?.focus(); };
  }, []);

  useEffect(() => {
    if (entriesProp) return;
    let alive = true;
    loadIconManifest().then(
      (list) => { if (alive) setLoaded(list); },
      (err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : 'Icon manifest failed to load'); },
    );
    return () => { alive = false; };
  }, [entriesProp]);

  const suggested = useMemo(() => (entries ? suggestIcons(entries, kind, technology) : []), [entries, kind, technology]);
  const showSuggested = q.trim() === '' && tab !== 'recent' && tab !== 'uploaded' && suggested.length > 0;
  const suggestedIds = useMemo(() => new Set(showSuggested ? suggested.map((s) => s.id) : []), [showSuggested, suggested]);

  const tabPool = useMemo<IconEntry[]>(() => {
    if (!entries) return [];
    if (tab === 'recent') {
      return recent.map((r) => resolveIcon(r, entries)).filter((e): e is IconEntry => e !== null);
    }
    return entries.filter((e) => e.set === tab);
  }, [entries, tab, recent]);

  const matches = useMemo(() => searchIcons(tabPool, q), [tabPool, q]);
  const gridItems = matches.filter((e) => !suggestedIds.has(e.id));
  const visible = gridItems.slice(0, RENDER_LIMIT);
  const truncated = gridItems.length - visible.length;
  const options: IconEntry[] = [...(showSuggested ? suggested : []), ...visible];

  const pick = useCallback((entry: IconEntry) => {
    recordRecentIcon({ set: entry.set, id: entry.id });
    onPick({ set: entry.set, id: entry.id });
  }, [onPick]);

  const focusOption = (index: number) => {
    const root = trapRef.current;
    const el = root?.querySelectorAll<HTMLElement>('[role="option"]')[index];
    el?.focus();
  };

  const onOptionKey = (e: ReactKeyboardEvent, index: number, entry: IconEntry) => {
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(last, index + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (e.key === 'ArrowDown') next = Math.min(last, index + GRID_COLUMNS);
    else if (e.key === 'ArrowUp') {
      if (index < GRID_COLUMNS) { searchRef.current?.focus(); e.preventDefault(); return; }
      next = index - GRID_COLUMNS;
    } else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(entry); return; }
    if (next !== null) { e.preventDefault(); focusOption(next); }
  };

  const currentId = current?.id ?? null;
  const renderOption = (entry: IconEntry, index: number) => (
    <button
      key={entry.id}
      type="button"
      role="option"
      aria-selected={entry.id === currentId}
      aria-label={entry.name}
      title={entry.name}
      tabIndex={index === 0 ? 0 : -1}
      style={tileStyle(entry.id === currentId)}
      onClick={() => pick(entry)}
      onKeyDown={(e) => onOptionKey(e, index, entry)}
    >
      <img src={entry.src} alt="" width={28} height={28} style={{ borderRadius: 4 }} draggable={false} />
      <span aria-hidden="true" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
    </button>
  );

  const placement: CSSProperties = position
    ? { left: position.x, top: position.y }
    : { left: '50%', top: '16%', transform: 'translateX(-50%)' };
  const emptyText = tab === 'uploaded'
    ? 'Icon uploads arrive with workspace libraries (R2).'
    : tab === 'recent' && q.trim() === ''
      ? 'No recent icons yet. Pick one from AWS or Generic.'
      : `No icons match "${q.trim()}".`;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 129 }} onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Replace icon"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        style={{
          position: 'fixed', zIndex: 130, width: 320, maxHeight: '70vh', overflowY: 'auto', padding: 10,
          border: '1px solid var(--border-panel)', borderRadius: 10, background: 'var(--bg-panel)',
          boxShadow: '0 8px 24px rgba(16,24,40,.12)', display: 'flex', flexDirection: 'column', gap: 8,
          ...placement,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', border: '1px solid var(--accent-cyan)', borderRadius: 6, color: 'var(--text-muted)' }}>
          <input
            ref={searchRef}
            aria-label="Search icons"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && options.length > 0) { e.preventDefault(); focusOption(0); }
              else if (e.key === 'Enter' && options.length > 0) { e.preventDefault(); pick(options[0]); }
            }}
            placeholder="Search icons"
            style={{ border: 'none', outline: 'none', font: 'inherit', flexGrow: 1, minWidth: 0, background: 'transparent', color: 'var(--text-main)' }}
          />
        </label>
        <div role="tablist" aria-label="Icon sets" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`${uid}-tab-${t.id}`} aria-selected={tab === t.id} style={pillStyle(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {loadError && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--accent-rose)' }}>Icons could not be loaded: {loadError}</p>}
        {!entries && !loadError && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Loading icons…</p>}
        {entries && (
          <>
            <div role="listbox" aria-label="Icons" aria-orientation="vertical" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {showSuggested && (
                <div role="group" aria-label={`Suggested for ${kind}`}>
                  <div style={groupLabelStyle}>Suggested for {kind}</div>
                  <div style={gridStyle}>{suggested.map((entry, i) => renderOption(entry, i))}</div>
                </div>
              )}
              {visible.length > 0 && (
                <div role="group" aria-label={TABS.find((t) => t.id === tab)?.label}>
                  <div style={gridStyle}>{visible.map((entry, i) => renderOption(entry, i + (showSuggested ? suggested.length : 0)))}</div>
                </div>
              )}
            </div>
            {options.length === 0 && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{emptyText}</p>}
            {truncated > 0 && <p role="status" style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{truncated} more. Refine the search to see them.</p>}
          </>
        )}
        <button
          type="button"
          onClick={() => onPick(null)}
          style={{ height: 28, border: 'none', background: 'transparent', font: 'inherit', fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', cursor: 'pointer' }}
        >
          No icon
        </button>
      </div>
    </>
  );
}

export default IconPicker;
