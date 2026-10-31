import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ArchEdge, ArchNode, DisplayStyle } from '../../types';
import { useDiagram } from '../../state/useDiagram';
import { useCanvasLocal } from './CanvasLocalContext';
import { Swatches } from './Swatches';
import { BORDER_SWATCHES, NODE_COLOURS, NODE_ICONS, PROTOCOLS } from './palette';
import { Section } from '../../components/Section';
import { NodeIconPicker } from '../../components/NodeIconPicker';
import { MultiAppearance } from './MultiAppearance';
import { PropertiesSection } from './PropertiesSection';
import { notationFor } from '../../canvas/notation';
import { drawKindGlyph, glyphTileTint, isIconPath } from '../../canvas/render/nodes';

/** localStorage key for the Inspector sections' open state: `{ [sectionId]: boolean }`. */
export const INSPECTOR_SECTIONS_KEY = 'archflux:inspector:sections:v1';

/** Edge relationship kinds (UI_REVAMP_SPEC §5A.4): radiogroup labels. */
const REL_LABELS: Record<'sync' | 'async' | 'replication' | 'bidirectional', string> = {
  sync: 'Sync request',
  async: 'Async message',
  replication: 'Data replication',
  bidirectional: 'Bidirectional',
};

const FIELD_LABEL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' };
const FIELD_INPUT: CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', borderRadius: 6,
  border: '1px solid var(--border-panel)', background: 'var(--bg-panel)', color: 'var(--text-main)',
  font: 'inherit', fontSize: 13,
};
const FOOTER_BTN: CSSProperties = { flexGrow: 1, height: 32, borderRadius: 6, background: 'var(--bg-panel)', font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

/** Inspector Icon summary: the name of what the canvas shows (iconRef, then iconSrc, then a legacy icon path). */
function nodeIconName(n: ArchNode): string {
  if (n.iconRef === null) return 'None';
  const tail = (s: string) => s.split('/').pop()?.replace(/\.(svg|png)$/i, '') ?? 'icon';
  if (n.iconRef) return tail(n.iconRef.id);
  if (n.iconSrc) return tail(n.iconSrc);
  if (isIconPath(n.icon)) return tail(n.icon);
  return n.icon ? n.icon : 'None';
}

/** Kind label for the header subtitle: "service" → "Service". */
function kindLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Header tile (Main.dc.html L182): 32 px, radius 8, artboard tint, the kind glyph. The glyph is drawn
 * by the same routine as the canvas card so both always agree.
 */
function KindTile({ kind }: { kind: ArchNode['kind'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const notation = notationFor(kind);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 32 * dpr;
    canvas.height = 32 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 32, 32);
    drawKindGlyph(ctx, notation.glyph, 0, 0, 32, notation.color, glyphTileTint(notation.color), { radius: 8, glyphScale: 18 / 16 });
  }, [notation.glyph, notation.color]);
  return <canvas ref={ref} aria-hidden="true" width={32} height={32} style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />;
}

/** 28 px kind-tinted glyph tile for an outline row (States.dc.html), drawn by the canvas card's routine. */
function OutlineGlyph({ kind }: { kind: ArchNode['kind'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const notation = notationFor(kind);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 28 * dpr;
    canvas.height = 28 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 28, 28);
    drawKindGlyph(ctx, notation.glyph, 0, 0, 28, notation.color, glyphTileTint(notation.color), { radius: 7, glyphScale: 16 / 16 });
  }, [notation.glyph, notation.color]);
  return <canvas ref={ref} aria-hidden="true" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />;
}

interface SegmentOption<T extends string> { id: T; label: string }

/**
 * Segmented radiogroup (R1-E14-T03): roving tabindex, arrow keys move and select.
 * Shared by the Display and Border controls.
 */
function Segmented<T extends string>({ label, options, value, onPick }: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onPick: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const at = options.findIndex((o) => o.id === value);
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = (at + step + options.length) % options.length;
    onPick(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, padding: 2, background: 'var(--inspector-track, var(--bg-panel-subtle))', borderRadius: 8 }}
    >
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(o.id)}
            style={{
              height: 28, border: 'none', borderRadius: 6, font: 'inherit', fontSize: 12, cursor: 'pointer',
              fontWeight: on ? 600 : 500,
              color: on ? 'var(--text-main)' : 'var(--text-muted)',
              background: on ? 'var(--bg-panel)' : 'transparent',
              boxShadow: on ? '0 1px 2px rgba(16,24,40,.08)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const DISPLAY_OPTIONS: readonly SegmentOption<DisplayStyle>[] = [
  { id: 'icon', label: 'Icon' },
  { id: 'card', label: 'Card' },
  { id: 'shape', label: 'Shape' },
];

type BorderChoice = 'thin' | 'regular' | 'bold' | 'dashed';
const BORDER_OPTIONS: readonly SegmentOption<BorderChoice>[] = [
  { id: 'thin', label: 'Thin' },
  { id: 'regular', label: 'Regular' },
  { id: 'bold', label: 'Bold' },
  { id: 'dashed', label: 'Dashed' },
];
/** Stroke widths behind the Thin / Regular / Bold choices (R1-E14-T03). */
const BORDER_WIDTH: Record<Exclude<BorderChoice, 'dashed'>, number> = { thin: 1, regular: 1.5, bold: 2.5 };

interface DiagramOutlineProps {
  nodes: ArchNode[];
  edges: ArchEdge[];
  selectedId: string | null;
  onPick: (id: string) => void;
}

/**
 * "Diagram outline" list. Memoized on the document arrays and selection, so a pan or zoom (which
 * re-renders the Inspector) does not rebuild thousands of rows; connection counts come from one pass.
 */
const DiagramOutline = memo(function DiagramOutline({ nodes, edges, selectedId, onPick }: DiagramOutlineProps) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
      if (e.to && e.to !== e.from) counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
    }
    return [...nodes].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => ({ n, conns: counts.get(n.id) ?? 0 }));
  }, [nodes, edges]);
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
        Diagram outline ({nodes.length})
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, maxHeight: 180, overflowY: 'auto' }} role="list" aria-label="Diagram outline, top to bottom">
        {rows.map(({ n, conns }) => (
          <button
            key={n.id}
            type="button"
            role="listitem"
            className={`outline-row${n.id === selectedId ? ' is-selected' : ''}`}
            aria-current={n.id === selectedId}
            aria-label={`${n.label}, ${n.tag}, ${conns} ${conns === 1 ? 'connection' : 'connections'}`}
            title={n.label}
            onClick={() => onPick(n.id)}
          >
            <OutlineGlyph kind={n.kind} />
            <span className="outline-row__name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
            <span className="outline-row__count" aria-hidden="true">{conns}</span>
          </button>
        ))}
        {nodes.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No nodes yet.</div>
        )}
      </div>
    </details>
  );
});

export interface InspectorProps {
  /** Coalesces inspector edits into one undo step per key (see CanvasScreen). */
  checkpointInspector: (key: string) => void;
}

/** Right-dock Inspector tab body: outline, node / route / text properties, jump-to-node. */
export function Inspector({ checkpointInspector }: InspectorProps) {
  const {
    nodes,
    edges,
    selectedId,
    setSelectedId,
    panToNode,
    updateNode,
    updateEdge,
    updateText,
    deleteText,
    deleteEdge,
    deleteSelected,
    duplicateSelected,
    setDisplayStyle,
    multiSel,
    checkpoint,
  } = useDiagram();
  const [iconPickerAt, setIconPickerAt] = useState<{ x: number; y: number } | null>(null);
  const multiNodes = multiSel.length > 1 ? nodes.filter((n) => multiSel.includes(n.id)) : [];
  const { selected, selectedEdge, selectedText, selToolbarPos, setSelectedEdgeId, setSelectedTextId, beginTextEdit } = useCanvasLocal();
  // Stable across pan and zoom renders (latest closure behind a ref) so the memoized outline is not rebuilt.
  const pickRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    pickRef.current = (id) => {
      setSelectedId(id);
      setSelectedEdgeId(null);
      panToNode(id);
    };
  });
  const pickOutline = useCallback((id: string) => pickRef.current(id), []);
  return (
    <>
      {multiNodes.length > 1 && (
        <div>
          <h3 style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 600 }}>{multiNodes.length} elements selected</h3>
          <Section id="multi-appearance" title="Appearance" defaultOpen storageKey={INSPECTOR_SECTIONS_KEY} level={4}>
            <MultiAppearance nodes={multiNodes} />
          </Section>
        </div>
      )}
      {multiNodes.length <= 1 && !selected && !selectedEdge && (
        <div className="callout-block">Nothing selected — click a node or route to edit its properties here.</div>
      )}
      {multiNodes.length <= 1 && !selected && !selectedEdge && (
      <DiagramOutline nodes={nodes} edges={edges} selectedId={selectedId} onPick={pickOutline} />
      )}
      {multiNodes.length <= 1 && selected && (() => {
        const connections = edges.filter((e) => e.from === selected.id || e.to === selected.id).length;
        const strokeWidth = selected.strokeWidth ?? 2.5;
        const borderValue: BorderChoice = selected.borderDashed
          ? 'dashed'
          : strokeWidth <= 1 ? 'thin' : strokeWidth <= 1.5 ? 'regular' : 'bold';
        const iconName = nodeIconName(selected);
        return (
      <div className="inspector-node">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <KindTile kind={selected.kind} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{selected.label || 'Untitled'}</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {`${kindLabel(selected.type)} · ${connections} ${connections === 1 ? 'connection' : 'connections'}`}
            </span>
          </div>
        </div>
        <Section id="content" title="Content" defaultOpen storageKey={INSPECTOR_SECTIONS_KEY} level={4}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={FIELD_LABEL}>Label
            <input id="inspector-label" style={FIELD_INPUT} value={selected.label} onFocus={() => checkpointInspector(selected.id)} onChange={(e) => updateNode(selected.id, { label: e.target.value })} />
          </label>
          <label style={FIELD_LABEL}>Technology
            <input style={FIELD_INPUT} value={selected.tag} onFocus={() => checkpointInspector(selected.id)} onChange={(e) => updateNode(selected.id, { tag: e.target.value })} />
          </label>
          <label style={FIELD_LABEL}>Details
            <textarea
              style={{ ...FIELD_INPUT, height: 56, padding: '8px 10px', resize: 'none' }}
              value={selected.details ?? ''}
              onFocus={() => checkpointInspector(selected.id)}
              onChange={(e) => updateNode(selected.id, { details: e.target.value || undefined })}
              placeholder="Shown inside the node — e.g. region, replicas"
            />
          </label>
        </div>
        </Section>
        <Section id="appearance" title="Appearance" defaultOpen storageKey={INSPECTOR_SECTIONS_KEY} level={4}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div role="group" aria-label="Colour" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Colour</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {NODE_COLOURS.map((c) => {
                const on = selected.stroke.toUpperCase() === c.value;
                return (
                  <button
                    key={c.name}
                    type="button"
                    aria-label={c.name}
                    aria-pressed={on}
                    title={c.name}
                    onClick={() => { checkpointInspector(`stroke:${selected.id}`); updateNode(selected.id, { stroke: c.value }); }}
                    style={{
                      width: 24, height: 24, borderRadius: 12, padding: 0, border: 'none', cursor: 'pointer', background: c.value,
                      boxShadow: on ? `0 0 0 2px var(--bg-panel), 0 0 0 4px ${c.value}` : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div role="group" aria-label="Display" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Display</span>
            <Segmented
              label="Display"
              options={DISPLAY_OPTIONS}
              value={selected.displayStyle ?? 'card'}
              onPick={(v) => { setDisplayStyle([selected.id], v); }}
            />
          </div>
          <div role="group" aria-label="Border" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Border</span>
            <Segmented
              label="Border"
              options={BORDER_OPTIONS}
              value={borderValue}
              onPick={(v) => {
                checkpointInspector(`border:${selected.id}`);
                if (v === 'dashed') updateNode(selected.id, { borderDashed: true });
                else updateNode(selected.id, { strokeWidth: BORDER_WIDTH[v], borderDashed: false });
              }}
            />
          </div>
        </div>
        </Section>
        <Section id="icon" title="Icon" summary={iconName} storageKey={INSPECTOR_SECTIONS_KEY} level={4}>
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          aria-label="Replace icon"
          aria-haspopup="dialog"
          style={{ marginBottom: 8 }}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setIconPickerAt({ x: Math.max(8, r.left - 200), y: r.bottom + 6 }); }}
        >
          Replace icon
        </button>
        {iconPickerAt && <NodeIconPicker node={selected} position={iconPickerAt} onClose={() => setIconPickerAt(null)} />}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Provider icon">
          {NODE_ICONS.map((icon) => {
            const name = icon.split('/').pop()?.replace(/\.svg$/i, '') ?? 'icon';
            return (
              <button
                key={icon}
                className="btn btn--sm btn--secondary"
                aria-pressed={selected.iconRef == null && selected.iconSrc === icon}
                aria-label={`Provider icon ${name}`}
                title={`Provider icon ${name}`}
                onClick={() => { checkpointInspector(`icon:${selected.id}`); updateNode(selected.id, { iconSrc: icon, iconRef: undefined, icon: undefined }); }}
                style={selected.iconRef == null && selected.iconSrc === icon ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : undefined}
              >
                <img src={icon} alt="" style={{ width: 20, height: 20, display: 'block' }} />
              </button>
            );
          })}
        </div>
        </Section>
        <PropertiesSection node={selected} storageKey={INSPECTOR_SECTIONS_KEY} />
        <Section id="metadata" title="Metadata" summary="Port, repo, spec" storageKey={INSPECTOR_SECTIONS_KEY} level={4}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            ['port', 'Port (e.g. :8080 / 5432)'],
            ['repo', 'Repo link (e.g. org/service)'],
            ['source', 'Source spec (e.g. k8s/deploy.yaml)'],
          ] as const).map(([field, placeholder]) => (
            <input
              key={field}
              style={{ ...FIELD_INPUT, fontSize: 11, fontFamily: 'var(--mono-font)' }}
              placeholder={placeholder}
              aria-label={`Node ${field}`}
              value={selected[field] ?? ''}
              onFocus={() => checkpointInspector(`${field}:${selected.id}`)}
              onChange={(e) => updateNode(selected.id, { [field]: e.target.value } as Partial<ArchNode>)}
            />
          ))}
        </div>
        </Section>
        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--inspector-divider, var(--border-panel))' }}>
          <button type="button" onClick={() => duplicateSelected()} style={{ ...FOOTER_BTN, border: '1px solid var(--border-panel)', color: 'var(--text-main)' }}>Duplicate</button>
          <button type="button" onClick={deleteSelected} style={{ ...FOOTER_BTN, border: '1px solid #F5C2C2', color: '#B91C1C' }}>Delete</button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono-font)', marginTop: 6 }}>Arrows nudge • Del deletes</div>
      </div>
        );
      })()}
      {selectedEdge && !selected && (() => {
        const from = nodes.find((n) => n.id === selectedEdge.from);
        const to = selectedEdge.to ? nodes.find((n) => n.id === selectedEdge.to) : null;
        return (
        <div>
          <div className="dock-headline"><span>Route Inspector</span><span>{selectedEdge.isDangling ? 'dangling' : 'route'}</span></div>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', marginBottom: 6 }}>
            {(from?.label ?? selectedEdge.from)} → {(to?.label ?? '∅')}
          </div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Label
            <input className="doc-title-input" style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2 }} value={selectedEdge.label} onFocus={() => checkpointInspector(`e:${selectedEdge.id}`)} onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value })} />
          </label>
          {(selectedEdge.waypoints?.length ?? 0) > 0 && (
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={() => { checkpoint(false); updateEdge(selectedEdge.id, { waypoints: undefined }); }}
            >
              Reset route
            </button>
          )}
          <Swatches values={BORDER_SWATCHES} current={selectedEdge.color} nullLabel="" label="Color" onPick={(v) => { if (v) { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { color: v }); } }} />
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Protocol Tag</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Protocol tag">
              {PROTOCOLS.map((p) => (
                <button
                  key={p}
                  className={`btn btn--sm btn--${selectedEdge.protocol === p ? 'primary' : 'secondary'}`}
                  onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { protocol: p }); }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Line Style</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }} role="group" aria-label="Line style">
            {(['solid', 'dashed', 'dotted'] as const).map((ls) => {
              const active = (selectedEdge.lineStyle ?? (selectedEdge.dashed ? 'dashed' : 'solid')) === ls;
              return (
                <button
                  key={ls}
                  className={`btn btn--sm btn--${active ? 'primary' : 'secondary'}`}
                  onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { lineStyle: ls, dashed: ls === 'dashed' }); }}
                >
                  {ls[0].toUpperCase() + ls.slice(1)}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 6 }}>
            <div id="inspector-rel-label" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Relationship</div>
            <div role="radiogroup" aria-label="Relationship" aria-labelledby="inspector-rel-label" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(['sync', 'async', 'replication', 'bidirectional'] as const).map((rk) => {
                const active = (selectedEdge.relKind ?? 'sync') === rk;
                return (
                  <button
                    type="button"
                    key={rk}
                    role="radio"
                    aria-checked={active}
                    className={`btn btn--sm btn--${active ? 'primary' : 'secondary'}`}
                    onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { relKind: rk }); }}
                  >
                    {REL_LABELS[rk]}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Step number
              <input
                type="number"
                min={1}
                max={99}
                className="doc-title-input"
                style={{ width: 72, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2 }}
                value={selectedEdge.step ?? ''}
                placeholder="—"
                onFocus={() => checkpointInspector(`ec:${selectedEdge.id}`)}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  updateEdge(selectedEdge.id, { step: Number.isFinite(v) && v > 0 ? v : null });
                }}
              />
            </label>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Arrow Heads</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }} role="group" aria-label="Arrow head configuration">
            {(['end', 'both', 'none'] as const).map((a) => (
              <button
                key={a}
                className={`btn btn--sm btn--${(selectedEdge.arrow ?? 'end') === a ? 'primary' : 'secondary'}`}
                onClick={() => { checkpointInspector(`ec:${selectedEdge.id}`); updateEdge(selectedEdge.id, { arrow: a }); }}
              >
                {a === 'end' ? '→ End' : a === 'both' ? '↔ Both' : '— None'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn--sm btn--secondary" onClick={() => panToNode(selectedEdge.from)}>Focus</button>
            <button className="btn btn--sm btn--secondary" onClick={() => { deleteEdge(selectedEdge.id); setSelectedEdgeId(null); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete route</button>
          </div>
        </div>
        );
      })()}
      {selectedText && !selected && !selectedEdge && !selToolbarPos && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-panel)', paddingTop: 8 }}>
          <div className="dock-headline"><span>Text Style</span><span>{selectedText.fontSize}px</span></div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Content
            <textarea
              rows={2}
              className="doc-title-input"
              style={{ width: '100%', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 8px', marginTop: 2, fontFamily: "'Caveat', cursive", fontSize: 15, resize: 'vertical' }}
              value={selectedText.text}
              onFocus={() => checkpointInspector(`t:${selectedText.id}`)}
              onChange={(e) => updateText(selectedText.id, { text: e.target.value })}
              aria-label="Text content"
            />
          </label>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Font</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }} role="group" aria-label="Font family">
            {(['Caveat', 'Patrick Hand', 'Plus Jakarta Sans', 'Fira Code'] as const).map((f) => (
              <button
                key={f}
                className={`btn btn--sm btn--${(selectedText.fontFamily ?? 'Caveat') === f ? 'primary' : 'secondary'}`}
                title={f}
                aria-label={`Font ${f}`}
                style={{ fontFamily: `'${f}', ${f === 'Fira Code' ? 'monospace' : f === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive'}` }}
                onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fontFamily: f }); }}
              >
                Ag
              </button>
            ))}
            <button
              className={`btn btn--sm btn--${selectedText.bold ? 'primary' : 'secondary'}`}
              aria-pressed={!!selectedText.bold}
              aria-label="Bold"
              title="Bold"
              style={{ fontWeight: 800 }}
              onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { bold: !selectedText.bold }); }}
            >
              B
            </button>
            <button
              className={`btn btn--sm btn--${selectedText.italic ? 'primary' : 'secondary'}`}
              aria-pressed={!!selectedText.italic}
              aria-label="Italic"
              title="Italic"
              style={{ fontStyle: 'italic' }}
              onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { italic: !selectedText.italic }); }}
            >
              I
            </button>
          </div>
          <Swatches values={BORDER_SWATCHES} current={selectedText.color} nullLabel="" label="Color" onPick={(v) => { if (v) { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { color: v }); } }} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Size</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }} role="group" aria-label="Text size">
            {[16, 20, 28, 36].map((sz) => (
              <button
                key={sz}
                className={`btn btn--sm btn--${selectedText.fontSize === sz ? 'primary' : 'secondary'}`}
                onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fontSize: sz }); }}
              >
                {sz}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Background</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Background fill">
            <button
              className={`btn btn--sm btn--${(selectedText.fill ?? 'transparent') === 'transparent' ? 'primary' : 'secondary'}`}
              title="Transparent background"
              onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fill: 'transparent', border: false }); }}
            >
              ∅
            </button>
            {['#FEF3C7', '#DBEAFE', '#DCFCE7', '#FEE2E2', '#EDE9FE', '#1F2937'].map((c) => (
              <button
                key={c}
                aria-label={`Background ${c}`}
                title={`Background ${c}`}
                onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { fill: c }); }}
                style={{
                  width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                  border: selectedText.fill === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                  background: c,
                }}
              />
            ))}
            <button
              className={`btn btn--sm btn--${selectedText.border ? 'primary' : 'secondary'}`}
              aria-pressed={!!selectedText.border}
              title="Border around background (needs a fill)"
              disabled={(selectedText.fill ?? 'transparent') === 'transparent'}
              onClick={() => { checkpointInspector(`t:${selectedText.id}`); updateText(selectedText.id, { border: !selectedText.border }); }}
            >
              ▢
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn--sm btn--secondary" onClick={() => beginTextEdit(selectedText)}>Edit on canvas</button>
            <button className="btn btn--sm btn--secondary" onClick={() => { deleteText(selectedText.id); setSelectedTextId(null); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
          </div>
        </div>
      )}
    </>
  );
}
