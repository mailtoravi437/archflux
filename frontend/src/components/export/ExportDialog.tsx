import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  buildPrintSections,
  buildSVG,
  computeContentBounds,
  downloadExport,
  exportDocument,
  type ExportFormat,
  type ExportResult,
} from '../../canvas/export/ExportPipeline';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { track } from '../../lib/analytics';
import { pagesOf, scopeDoc, type ExportScope } from '../../lib/exportScope';
import type { DiagramDoc } from '../../types';

interface FormatDef {
  id: ExportFormat;
  name: string;
  sub: string;
  analytics: string;
}

/** Only formats the pipeline really produces. Mermaid, draw.io, Visio and Markdown export do not exist yet. */
const EXPORT_FORMATS: FormatDef[] = [
  { id: 'png', name: 'PNG', sub: 'Up to 3×', analytics: 'png' },
  { id: 'svg', name: 'SVG', sub: 'Vector', analytics: 'svg' },
  { id: 'print', name: 'PDF', sub: 'Via print dialog', analytics: 'pdf' },
  { id: 'json', name: '.arch', sub: 'Model + views', analytics: 'arch' },
  { id: 'csv', name: 'CSV', sub: 'Elements', analytics: 'csv' },
];

export interface ExportDialogProps {
  doc: DiagramDoc;
  /** Page shown on the canvas; "This page" exports it. Defaults to the first page. */
  activePageId?: string;
  /** Ids selected on the canvas. Empty disables "Selection". */
  selectedIds?: string[];
  isDark?: boolean;
  /** The `embedMetadata` setting, used as the initial value of the Metadata option. */
  embedMetadata?: boolean;
  onClose: () => void;
  onExported?: (result: ExportResult, format: ExportFormat) => void;
}

const btn: CSSProperties = { border: '1px solid #E3E6EB', background: '#FFFFFF', borderRadius: 8, font: 'inherit', cursor: 'pointer', color: '#1B1F27' };
const heading: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5B6474' };

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Export dialog (SC-39, Export.dc.html). The Publish and embed tab is not shown: nothing is published yet. */
export default function ExportDialog({ doc, activePageId, selectedIds = [], isDark = false, embedMetadata = true, onClose, onExported }: ExportDialogProps) {
  const uid = useId();
  const trap = useFocusTrap<HTMLDivElement>(true);
  const returnTo = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const pages = useMemo(() => pagesOf(doc), [doc]);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scope, setScope] = useState<ExportScope>('page');
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState<'theme' | 'white' | 'transparent'>('theme');
  const [hidden, setHidden] = useState(false);
  const [metadata, setMetadata] = useState(embedMetadata);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const allowsAll = format === 'print' || format === 'json';
  const effScope: ExportScope = scope === 'all' && !allowsAll ? 'page' : scope;
  const hasSelection = selectedIds.length > 0;
  const pageId = activePageId ?? pages[0].id;
  const bg = background === 'transparent' ? 'transparent' : background === 'white' ? 'white' : isDark ? 'dark' : 'white';

  // Keep one stable listener: the canvas Esc handler re-renders the shell mid-dispatch, and a listener
  // re-bound per `onClose` identity would be removed before it ran (Esc then did not close the dialog).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const prev = returnTo.current;
    return () => {
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  const scoped = useMemo(
    () => scopeDoc(doc, { scope: effScope, pageId, selectedIds, includeHiddenLayers: hidden }),
    [doc, effScope, pageId, selectedIds, hidden],
  );
  const empty = scoped.nodes.length === 0 && (scoped.strokes?.length ?? 0) === 0 && (scoped.texts?.length ?? 0) === 0;

  const previews = useMemo(() => {
    if (empty) return [];
    const opts = { format, background: bg, scope: effScope } as const;
    const ctx = { isDark: bg === 'dark', icons: new Map<string, string>() };
    if (format === 'print') return buildPrintSections(scoped, opts, ctx).map((s) => ({ key: s.pageId, name: s.name, svg: s.svg }));
    const svg = buildSVG(scoped, opts, ctx);
    return svg ? [{ key: 'all', name: scoped.title, svg }] : [];
  }, [scoped, empty, format, bg, effScope]);

  const estimate = useMemo(() => {
    if (empty || (format !== 'png' && format !== 'svg')) return null;
    const b = computeContentBounds(scoped.nodes, scoped.edges, scoped.strokes ?? [], scoped.texts ?? [], 40);
    if (!b) return null;
    const k = format === 'png' ? scale : 1;
    return `≈ ${Math.ceil((b.maxX - b.minX) * k)}×${Math.ceil((b.maxY - b.minY) * k)} px`;
  }, [scoped, empty, format, scale]);

  const primaryLabel =
    format === 'print' ? `Export PDF · ${previews.length} ${previews.length === 1 ? 'page' : 'pages'}`
      : `Export ${EXPORT_FORMATS.find((f) => f.id === format)?.name}`;

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await exportDocument(doc, {
        format,
        scale,
        background: bg,
        scope: effScope,
        pageId,
        selectedIds,
        includeHiddenLayers: hidden,
        embedMetadata: metadata,
      });
      if (format !== 'print' && !result.blob) {
        setStatus({ ok: false, text: `${EXPORT_FORMATS.find((f) => f.id === format)?.name} export failed. Nothing was downloaded.` });
        return;
      }
      downloadExport(result);
      track('export_completed', { format: EXPORT_FORMATS.find((f) => f.id === format)?.analytics ?? format, scope: effScope });
      setStatus({
        ok: true,
        text: format === 'print' ? 'Print view opened. Choose "Save as PDF" in the dialog.' : `Exported ${result.fileName} (${result.summary})`,
      });
      onExported?.(result, format);
    } catch {
      setStatus({ ok: false, text: 'Export failed. Nothing was downloaded.' });
    } finally {
      setBusy(false);
    }
  };

  const scopeBtn = (id: ExportScope, text: string, disabled = false, title?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={effScope === id}
      disabled={disabled}
      title={title}
      onClick={() => setScope(id)}
      style={{ height: 30, border: 'none', borderRadius: 6, font: 'inherit', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, background: effScope === id ? '#FFFFFF' : 'transparent', boxShadow: effScope === id ? '0 1px 2px rgba(16,24,40,.08)' : 'none', fontWeight: effScope === id ? 600 : 400 }}
    >
      {text}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,25,.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trap} role="dialog" aria-modal="true" aria-label="Export" style={{ width: 920, maxWidth: '96vw', height: 680, maxHeight: '94vh', boxSizing: 'border-box', background: '#FFFFFF', borderRadius: 14, boxShadow: '0 24px 64px rgba(16,24,40,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#1B1F27' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', borderBottom: '1px solid #E3E6EB' }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, padding: '18px 0' }}>Export</h1>
          <span style={{ flexGrow: 1 }} />
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: 6, fontSize: 18, color: '#5B6474', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
          <div role="region" aria-label="Export options" tabIndex={0} style={{ width: 380, flexShrink: 0, padding: '20px 24px', borderRight: '1px solid #EEF0F3', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div role="group" aria-label="Format" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={heading}>Format</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {EXPORT_FORMATS.map((f) => (
                  <button key={f.id} type="button" aria-pressed={format === f.id} onClick={() => setFormat(f.id)} style={{ ...btn, height: 56, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, padding: '0 10px', textAlign: 'left', border: format === f.id ? '1.5px solid #4F46E5' : '1px solid #E3E6EB', background: format === f.id ? '#EEF0FF' : '#FFFFFF' }}>
                    <span style={{ fontWeight: 600 }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: '#5B6474' }}>{f.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={heading}>Include</span>
              <div role="radiogroup" aria-label="Scope" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', padding: 2, background: '#F1F2F5', borderRadius: 8 }}>
                {scopeBtn('selection', 'Selection', !hasSelection, hasSelection ? undefined : 'Select elements on the canvas first')}
                {scopeBtn('page', 'This page')}
                {scopeBtn('all', `All ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`, !allowsAll, allowsAll ? undefined : 'All pages is available for PDF and .arch')}
              </div>
            </div>
            {format === 'png' && (
              <div role="radiogroup" aria-label="Scale" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={heading}>Scale</span>
                {[1, 2, 3].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={scale === k} onClick={() => setScale(k)} style={{ ...btn, height: 30, padding: '0 12px', border: scale === k ? '1.5px solid #4F46E5' : '1px solid #E3E6EB', background: scale === k ? '#EEF0FF' : '#FFFFFF' }}>{k}×</button>
                ))}
              </div>
            )}
            {(format === 'png' || format === 'svg') && (
              <label htmlFor={`${uid}-bg`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={heading}>Background</span>
                <select id={`${uid}-bg`} value={background} onChange={(e) => setBackground(e.target.value as 'theme' | 'white' | 'transparent')} style={{ height: 30, border: '1px solid #E3E6EB', borderRadius: 6, font: 'inherit', padding: '0 6px' }}>
                  <option value="theme">Theme</option>
                  <option value="white">White</option>
                  <option value="transparent">Transparent</option>
                </select>
              </label>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={heading}>Options</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />Hidden layers</label>
              {format === 'json' && <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={metadata} onChange={(e) => setMetadata(e.target.checked)} />Metadata</label>}
            </div>
            {estimate && <span role="status" aria-label="Size estimate" style={{ fontSize: 12, color: '#5B6474' }}>{estimate}</span>}
            <span style={{ flexGrow: 1 }} />
            {status && <span role={status.ok ? 'status' : 'alert'} style={{ fontSize: 12, color: status.ok ? '#047857' : '#B91C1C' }}>{status.text}</span>}
            <button type="button" disabled={busy || empty} onClick={() => void run()} style={{ height: 40, border: 'none', borderRadius: 8, background: '#4F46E5', color: '#FFFFFF', font: 'inherit', fontWeight: 600, cursor: busy || empty ? 'not-allowed' : 'pointer', opacity: busy || empty ? 0.6 : 1 }}>{primaryLabel}</button>
          </div>
          <div role="region" aria-label="Export preview" tabIndex={0} style={{ flexGrow: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, background: '#FAFBFC', overflowY: 'auto' }}>
            <span style={heading}>Preview</span>
            {empty ? (
              <p style={{ margin: 0, color: '#5B6474' }}>Nothing to export in this scope.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: previews.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 12 }}>
                {previews.map((p) => (
                  <figure key={p.key} style={{ margin: 0, background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <figcaption style={{ fontSize: 11, fontWeight: 600 }}>{p.name}</figcaption>
                    <img alt={`Preview of ${p.name}`} src={svgDataUri(p.svg)} style={{ width: '100%', maxHeight: 220, objectFit: 'contain' }} />
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
