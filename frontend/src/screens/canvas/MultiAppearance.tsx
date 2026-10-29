import type { CSSProperties } from 'react';
import type { ArchNode, DisplayStyle } from '../../types';
import { sharedStyle } from '../../state/ops/style';
import { useDiagram } from '../../state/useDiagram';
import { FILL_SWATCHES, NODE_COLOURS } from './palette';

const LABEL: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const MIXED: CSSProperties = { fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)' };

const DISPLAY: readonly { id: DisplayStyle; label: string }[] = [
  { id: 'icon', label: 'Icon' },
  { id: 'card', label: 'Card' },
  { id: 'shape', label: 'Shape' },
];
const BORDER: readonly { id: string; label: string; width: number }[] = [
  { id: 'thin', label: 'Thin', width: 1 },
  { id: 'regular', label: 'Regular', width: 1.5 },
  { id: 'bold', label: 'Bold', width: 2.5 },
];
/** The Inspector treats an unset width as Bold (2.5). */
const widthOf = (n: ArchNode): number => n.strokeWidth ?? 2.5;

/**
 * Appearance controls for a multi-node selection (R1-E04-T06). A field whose
 * values differ across the selection shows "Mixed" and has no option pressed.
 * Each pick is one undo step for all selected nodes (store `pasteStyle`).
 * Rendered by the Inspector when more than one node is selected (integration is a follow-up).
 */
export function MultiAppearance({ nodes }: { nodes: readonly ArchNode[] }) {
  const { pasteStyle } = useDiagram();
  const ids = nodes.map((n) => n.id);
  const stroke = sharedStyle(nodes, 'stroke');
  const fill = sharedStyle(nodes, 'fill');
  const display = sharedStyle(nodes.map((n) => ({ ...n, displayStyle: n.displayStyle ?? 'card' })), 'displayStyle');
  const widths = new Set(nodes.map(widthOf));
  const width = widths.size === 1 ? [...widths][0] : null;

  return (
    <div role="group" aria-label="Appearance of selected elements" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div role="group" aria-label="Colour" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={LABEL}>Colour {stroke.mixed && <span style={MIXED}>Mixed</span>}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {NODE_COLOURS.map((c) => {
            const on = !stroke.mixed && (stroke.value ?? '').toUpperCase() === c.value;
            return (
              <button
                key={c.name}
                type="button"
                aria-label={c.name}
                aria-pressed={on}
                title={c.name}
                onClick={() => pasteStyle(ids, { stroke: c.value })}
                style={{ width: 24, height: 24, borderRadius: 12, padding: 0, border: 'none', cursor: 'pointer', background: c.value, boxShadow: on ? `0 0 0 2px var(--bg-panel), 0 0 0 4px ${c.value}` : 'none' }}
              />
            );
          })}
        </div>
      </div>
      <div role="group" aria-label="Fill" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={LABEL}>Fill {fill.mixed && <span style={MIXED}>Mixed</span>}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            aria-label="No fill"
            aria-pressed={!fill.mixed && fill.value === undefined}
            onClick={() => pasteStyle(ids, { fill: undefined })}
          >
            Auto
          </button>
          {FILL_SWATCHES.map((v) => (
            <button
              key={v}
              type="button"
              aria-label={`Fill ${v}`}
              aria-pressed={!fill.mixed && fill.value?.toUpperCase() === v}
              title={v}
              onClick={() => pasteStyle(ids, { fill: v })}
              style={{ width: 22, height: 22, borderRadius: 6, border: !fill.mixed && fill.value?.toUpperCase() === v ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)', background: v, cursor: 'pointer', padding: 0 }}
            />
          ))}
        </div>
      </div>
      <div role="group" aria-label="Border" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={LABEL}>Border {width === null && <span style={MIXED}>Mixed</span>}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {BORDER.map((o) => (
            <button key={o.id} type="button" className="btn btn--sm btn--secondary" aria-pressed={width === o.width} onClick={() => pasteStyle(ids, { strokeWidth: o.width })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Display" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={LABEL}>Display {display.mixed && <span style={MIXED}>Mixed</span>}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {DISPLAY.map((o) => (
            <button key={o.id} type="button" className="btn btn--sm btn--secondary" aria-pressed={!display.mixed && display.value === o.id} onClick={() => pasteStyle(ids, { displayStyle: o.id })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
