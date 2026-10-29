import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../../lib/analytics';
import type { DocState } from '../../state/ops/types';
import type { ChangeKind, ElementChange } from '../../lib/semanticDiff';
import { buildCompareScene, groupChanges, nodeForChange, panToNode, visibleChanges } from '../../state/compare';
import CompareCanvas, { COMPARE_ZOOM } from './CompareCanvas';

/**
 * Compare mode (SC-28, R1-E08-T04). Layout follows History.dc.html: a top bar, the read-only
 * canvas (after state with diff flags, removed elements as ghosts), and the change list on the right.
 */
export interface CompareViewProps {
  before: DocState;
  after: DocState;
  beforeLabel: string;
  afterLabel: string;
  isDark: boolean;
  /** False when the user may not edit; hides "Revert this change". */
  canRevert: boolean;
  onSwap: () => void;
  onExit: () => void;
  onRevert: (change: ElementChange) => Promise<void> | void;
}

const PILL: Record<ChangeKind, { bg: string; fg: string; border: string; dashed?: boolean }> = {
  added: { bg: '#DCF3E6', fg: '#047857', border: '#15803D' },
  removed: { bg: '#FDE8E8', fg: '#B91C1C', border: '#B91C1C', dashed: true },
  changed: { bg: '#FEF3C7', fg: '#92400E', border: '#D97706' },
  moved: { bg: '#EEF0FF', fg: '#4338CA', border: '#4F46E5' },
};
const btn = { height: 32, padding: '0 12px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', font: 'inherit', fontWeight: 500, color: '#1B1F27', cursor: 'pointer' } as const;

function fmt(v: unknown): string {
  if (v === undefined) return '(none)';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export default function CompareView({ before, after, beforeLabel, afterLabel, isDark, canRevert, onSwap, onExit, onRevert }: CompareViewProps) {
  const [showLayout, setShowLayout] = useState(false);
  const [focus, setFocus] = useState<ElementChange | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 520 });
  const [reverting, setReverting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scene = useMemo(() => buildCompareScene(before, after, showLayout), [before, after, showLayout]);
  const groups = useMemo(() => groupChanges(scene.diff, showLayout), [scene, showLayout]);
  const flat = useMemo(() => visibleChanges(scene.diff, showLayout), [scene, showLayout]);
  const total = flat.length;

  const select = useCallback((c: ElementChange) => {
    setFocus(c);
    const n = nodeForChange(scene, c);
    if (n) setPan(panToNode(n, COMPARE_ZOOM, viewport));
  }, [scene, viewport]);

  // One event per opening of the compare view (mount), no props.
  useEffect(() => { track('compare_opened'); }, []);

  // Esc exits; J / K step through the changes (not while typing in a field).
  const stateRef = useRef({ flat, focus, select, onExit });
  stateRef.current = { flat, focus, select, onExit };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.key === 'Escape') { s.onExit(); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'j' && e.key !== 'k' && e.key !== 'J' && e.key !== 'K') return;
      if (s.flat.length === 0) return;
      const i = s.focus ? s.flat.findIndex((c) => c.id === s.focus!.id && c.entity === s.focus!.entity) : -1;
      const next = e.key.toLowerCase() === 'j' ? Math.min(s.flat.length - 1, i + 1) : Math.max(0, i <= 0 ? 0 : i - 1);
      s.select(s.flat[next]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const revert = async (c: ElementChange) => {
    setError(null);
    setReverting(`${c.entity}:${c.id}`);
    try {
      await onRevert(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revert this change');
    } finally {
      setReverting(null);
    }
  };

  const s = scene.diff.summary;
  const focusNodeId = focus && focus.entity === 'node' ? focus.id : null;

  return (
    <div role="region" aria-label="Compare versions" style={{ position: 'absolute', inset: 0, display: 'flex', background: '#F6F7F9', color: '#1B1F27', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 }}>
      <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ position: 'absolute', left: 16, top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 10, boxShadow: '0 4px 12px rgba(16,24,40,.06)', zIndex: 2, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Comparing {beforeLabel} → {afterLabel}</span>
          <button type="button" style={btn} onClick={onSwap}>Swap</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showLayout} onChange={(e) => setShowLayout(e.target.checked)} />
            Show layout changes
          </label>
          <span style={{ flexGrow: 1 }} />
          <span style={{ display: 'flex', gap: 12, fontSize: 12 }}>
            {(['added', 'removed', 'changed'] as const).map((k) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: PILL[k].bg, border: `1.5px ${PILL[k].dashed ? 'dashed' : 'solid'} ${PILL[k].border}` }} />
                {k[0].toUpperCase() + k.slice(1)} {s[k]}
              </span>
            ))}
          </span>
          <button type="button" style={btn} onClick={onExit} aria-keyshortcuts="Escape">Exit compare <kbd style={{ fontSize: 11, color: '#5B6474' }}>Esc</kbd></button>
        </div>
        <CompareCanvas scene={scene} focusId={focusNodeId} pan={pan} onPan={setPan} isDark={isDark} onViewport={setViewport} />
      </div>
      <aside aria-label="Changes" style={{ width: 320, flexShrink: 0, background: '#FFFFFF', borderLeft: '1px solid #E3E6EB', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{total === 0 ? 'No changes' : `${total} ${total === 1 ? 'change' : 'changes'}`}</span>
        {total === 0 && <span style={{ color: '#5B6474' }}>These two versions have the same content.</span>}
        {error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12 }}>{error}</div>}
        {groups.map((g) => (
          <section key={g.kind} aria-label={`${g.label} ${g.changes.length}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#5B6474', textTransform: 'uppercase', letterSpacing: '.04em' }}>{g.label} · {g.changes.length}</span>
            {g.changes.map((c) => {
              const key = `${c.entity}:${c.id}`;
              const active = !!focus && focus.id === c.id && focus.entity === c.entity;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', borderRadius: 6, background: active ? '#EEF0FF' : 'transparent' }}>
                  <span style={{ width: 64, textAlign: 'center', padding: '1px 0', borderRadius: 999, fontSize: 11, fontWeight: 600, background: PILL[c.kind].bg, color: PILL[c.kind].fg }}>{g.label}</span>
                  <button type="button" onClick={() => select(c)} aria-current={active ? 'true' : undefined} style={{ flexGrow: 1, textAlign: 'left', border: 'none', background: 'transparent', font: 'inherit', fontWeight: 500, cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</button>
                  {canRevert && (
                    <button type="button" aria-label={`Revert this change: ${c.label}`} disabled={reverting === key} onClick={() => void revert(c)} style={{ ...btn, height: 26, padding: '0 8px', fontSize: 11 }}>Revert this change</button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        {focus && focus.fields.length > 0 && (
          <div style={{ padding: 12, border: '1px solid #E3E6EB', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{focus.label} · properties</span>
            {focus.fields.slice(0, 12).map((f) => (
              <div key={f.field} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                <span style={{ color: '#B91C1C', background: '#FEF2F2', padding: '2px 6px', borderRadius: 4 }}>− {f.field}: {fmt(f.before)}</span>
                <span style={{ color: '#047857', background: '#ECFDF3', padding: '2px 6px', borderRadius: 4 }}>+ {f.field}: {fmt(f.after)}</span>
              </div>
            ))}
          </div>
        )}
        <span style={{ fontSize: 12, color: '#5B6474' }}>Restore and revert add a new version on top — history is never rewritten.</span>
      </aside>
    </div>
  );
}
