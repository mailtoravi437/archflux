import type { FreeStroke, FreeText } from '../../types';
import { useDiagram } from '../../state/useDiagram';
import { STROKE_COLORS, STROKE_WIDTHS } from './palette';

type ToolbarPos = { left: number; top: number };

export interface InkToolbarProps {
  stroke: FreeStroke;
  pos: ToolbarPos;
  onDeselect: () => void;
}

/** Floating style toolbar for a selected freehand ink stroke. */
export function InkToolbar({ stroke, pos, onDeselect }: InkToolbarProps) {
  const { checkpoint, updateStroke, deleteStroke } = useDiagram();
  return (
    <div style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translateX(-50%)', zIndex: 40, maxWidth: 'min(94vw, 700px)' }}>
      <div className="content-card" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', maxWidth: 'min(94vw, 700px)' }} role="dialog" aria-label="Ink stroke style">
        <span style={{ fontSize: 12, fontWeight: 700 }}>✏️ Ink</span>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Ink color">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Ink color ${c}`}
              title={c}
              onClick={() => { checkpoint(false); updateStroke(stroke.id, { color: c }); }}
              style={{
                width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                border: stroke.color === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                background: c,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Ink width">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              className={`btn btn--sm btn--${stroke.width === w ? 'primary' : 'secondary'}`}
              onClick={() => { checkpoint(false); updateStroke(stroke.id, { width: w }); }}
            >
              {w}px
            </button>
          ))}
        </div>
        <button className="btn btn--sm btn--secondary" onClick={() => { deleteStroke(stroke.id); onDeselect(); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
        <button className="btn btn--sm btn--secondary" onClick={() => onDeselect()}>Done</button>
      </div>
    </div>
  );
}

export interface TextToolbarProps {
  text: FreeText;
  pos: ToolbarPos;
  /** Opens the inline on-canvas editor for this label. */
  onEdit: (t: FreeText) => void;
  onDeselect: () => void;
}

/** Floating style toolbar for a selected free-text label. */
export function TextToolbar({ text, pos, onEdit, onDeselect }: TextToolbarProps) {
  const { checkpoint, updateText, deleteText } = useDiagram();
  return (
    <div style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translateX(-50%)', zIndex: 40, maxWidth: 'min(94vw, 700px)' }}>
      <div className="content-card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 'min(94vw, 700px)' }} role="dialog" aria-label="Text style">
        <span style={{ fontSize: 12, fontWeight: 700 }}>T Text</span>
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => onEdit(text)}
        >
          Edit
        </button>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Font family">
          {(['Caveat', 'Patrick Hand', 'Plus Jakarta Sans', 'Fira Code'] as const).map((f) => (
            <button
              key={f}
              className={`btn btn--sm btn--${(text.fontFamily ?? 'Caveat') === f ? 'primary' : 'secondary'}`}
              aria-label={`Font ${f}`}
              title={f}
              style={{ fontFamily: `'${f}', ${f === 'Fira Code' ? 'monospace' : f === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive'}` }}
              onClick={() => { checkpoint(false); updateText(text.id, { fontFamily: f }); }}
            >
              Ag
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Bold and italic">
          <button
            className={`btn btn--sm btn--${text.bold ? 'primary' : 'secondary'}`}
            aria-pressed={!!text.bold}
            aria-label="Bold"
            title="Bold"
            style={{ fontWeight: 800 }}
            onClick={() => { checkpoint(false); updateText(text.id, { bold: !text.bold }); }}
          >
            B
          </button>
          <button
            className={`btn btn--sm btn--${text.italic ? 'primary' : 'secondary'}`}
            aria-pressed={!!text.italic}
            aria-label="Italic"
            title="Italic"
            style={{ fontStyle: 'italic' }}
            onClick={() => { checkpoint(false); updateText(text.id, { italic: !text.italic }); }}
          >
            I
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Text color">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Text color ${c}`}
              title={c}
              onClick={() => { checkpoint(false); updateText(text.id, { color: c }); }}
              style={{
                width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                border: text.color === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                background: c,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Text size">
          {[16, 20, 28, 36].map((sz) => (
            <button
              key={sz}
              className={`btn btn--sm btn--${text.fontSize === sz ? 'primary' : 'secondary'}`}
              onClick={() => { checkpoint(false); updateText(text.id, { fontSize: sz }); }}
            >
              {sz}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} role="group" aria-label="Background fill">
          <button
            className={`btn btn--sm btn--${(text.fill ?? 'transparent') === 'transparent' ? 'primary' : 'secondary'}`}
            title="Transparent background"
            onClick={() => { checkpoint(false); updateText(text.id, { fill: 'transparent', border: false }); }}
          >
            ∅
          </button>
          {['#FEF3C7', '#DBEAFE', '#DCFCE7', '#FEE2E2', '#EDE9FE', '#1F2937'].map((c) => (
            <button
              key={c}
              aria-label={`Background ${c}`}
              title={`Background ${c}`}
              onClick={() => { checkpoint(false); updateText(text.id, { fill: c }); }}
              style={{
                width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
                border: text.fill === c ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                background: c,
              }}
            />
          ))}
          <button
            className={`btn btn--sm btn--${text.border ? 'primary' : 'secondary'}`}
            aria-pressed={!!text.border}
            title="Toggle border around background (needs a fill)"
            disabled={(text.fill ?? 'transparent') === 'transparent'}
            onClick={() => { checkpoint(false); updateText(text.id, { border: !text.border }); }}
          >
            ▢
          </button>
        </div>
        <button className="btn btn--sm btn--secondary" onClick={() => { deleteText(text.id); onDeselect(); }} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>Delete</button>
        <button className="btn btn--sm btn--secondary" onClick={() => onDeselect()}>Done</button>
      </div>
    </div>
  );
}
