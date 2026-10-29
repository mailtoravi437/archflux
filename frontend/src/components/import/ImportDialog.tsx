import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../../lib/analytics';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { minimapTransform, worldToMini } from '../../lib/canvasGeometry';
import { applyKindMap, detectImportFormat, KIND_OPTIONS, mappingGroups, runImport } from '../../lib/import/mapping';
import type { ImportFormat, ImportResult } from '../../lib/import/types';
import { useDiagram } from '../../state/useDiagram';
import type { ElementKind } from '../../types';

export interface ImportDialogProps {
  onClose: () => void;
  /** Called after a successful import so the caller can navigate to the canvas. */
  onImported?: (mode: 'new' | 'page') => void;
  /** A file dropped on the Library or the canvas. */
  initialFile?: File;
}

const FORMAT_NAME: Record<ImportFormat, string> = { drawio: 'draw.io', mermaid: 'Mermaid', arch: 'ArchFlux (.arch)' };
const PW = 360;
const PH = 300;

function statsLine(r: ImportResult): string {
  const s = r.stats;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  return [plural(s.pages, 'page'), plural(s.nodes, 'element'), plural(s.edges, 'connection'), plural(s.boundaries, 'boundary', 'boundaries'), `${s.skipped} skipped`].join(' · ');
}

/** Import wizard (SC-10): choose a file or paste text, review the mapping, then import. */
export default function ImportDialog({ onClose, onImported, initialFile }: ImportDialogProps) {
  const { importDocument } = useDiagram();
  const trap = useFocusTrap<HTMLDivElement>(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remap, setRemap] = useState<Record<string, ElementKind>>({});
  const [showWarnings, setShowWarnings] = useState(false);

  const detected = useMemo(() => (text.trim() ? detectImportFormat(fileName, text) : null), [fileName, text]);

  // Esc closes; focus returns to the opener.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);

  const analyse = async (name: string, body: string) => {
    setBusy(true);
    try {
      const r = await runImport(name, body);
      if (r.ok && r.doc) {
        setResult(r);
        setError(null);
        setRemap({});
      } else {
        setResult(null);
        setError(r.error ?? 'Unknown error');
      }
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    let body = '';
    try {
      body = await f.text();
    } catch {
      setResult(null);
      setError('the file could not be read');
      return;
    }
    setText(body);
    await analyse(f.name, body);
  };

  const droppedRef = useRef(false);
  useEffect(() => {
    if (initialFile && !droppedRef.current) {
      droppedRef.current = true;
      void readFile(initialFile);
    }
  });

  const doc = useMemo(() => (result?.doc ? applyKindMap(result.doc, remap) : null), [result, remap]);
  const groups = useMemo(() => (result?.doc ? mappingGroups(result.doc) : []), [result]);

  const preview = useMemo(() => {
    if (!doc) return { rects: [], lines: [] };
    const first = [...(doc.pages ?? [])].sort((a, b) => a.order - b.order)[0]?.id;
    const nodes = doc.nodes.filter((n) => !first || !n.pageId || n.pageId === first).slice(0, 200);
    const t = minimapTransform(nodes, PW, PH, 20);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const rects = nodes.map((n) => {
      const p = worldToMini(n.x, n.y, t);
      return { id: n.id, x: p.x, y: p.y, w: Math.max(4, n.w * t.s), h: Math.max(3, n.h * t.s), stroke: n.stroke || '#8A93A3', boundary: n.kind === 'boundary', label: n.label };
    });
    const lines = doc.edges.flatMap((e) => {
      const a = byId.get(e.from);
      const b = e.to ? byId.get(e.to) : undefined;
      if (!a || !b) return [];
      const p1 = worldToMini(a.x + a.w / 2, a.y + a.h / 2, t);
      const p2 = worldToMini(b.x + b.w / 2, b.y + b.h / 2, t);
      return [{ id: e.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }];
    });
    return { rects, lines };
  }, [doc]);

  const commit = (mode: 'new' | 'page') => {
    if (!doc) return;
    if (importDocument(doc, mode)) {
      track('import_completed', { format: result?.format ?? 'unknown', nodes: doc.nodes.length });
      if (mode === 'new') track('diagram_created', { source: 'import' });
      onImported?.(mode);
      onClose();
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setText('');
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const btn: React.CSSProperties = { height: 36, display: 'flex', alignItems: 'center', padding: '0 14px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', color: '#1B1F27', fontWeight: 500, font: 'inherit', cursor: 'pointer' };
  const primary: React.CSSProperties = { ...btn, border: 'none', background: '#4F46E5', color: '#FFFFFF', fontWeight: 600 };

  const title = fileName ? `Review import: ${fileName}` : 'Import a diagram';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        ref={trap}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 1100, maxHeight: '92vh', overflow: 'auto', background: '#F6F7F9', color: '#1B1F27', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, borderRadius: 12, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ flexGrow: 1 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#5B6474' }}>New diagram › Import file</p>
            <h1 id="import-title" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{title}</h1>
            {result && <p style={{ margin: '4px 0 0', color: '#5B6474' }}>{statsLine(result)}</p>}
          </div>
          <button type="button" style={btn} onClick={onClose}>{result ? 'Cancel' : 'Close'}</button>
          {result && doc && (
            <>
              <button type="button" style={btn} onClick={() => commit('page')}>Add to this diagram</button>
              <button type="button" style={primary} onClick={() => commit('new')}>Import as new diagram</button>
            </>
          )}
        </div>

        {error && (
          <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
            <span style={{ flexGrow: 1 }}>We couldn't read this file — {error}</span>
            <button type="button" style={{ ...btn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={reset}>Choose another file</button>
          </div>
        )}

        {!result && (
          <section style={{ background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" style={btn} onClick={() => fileRef.current?.click()}>Choose file</button>
              <input
                ref={fileRef}
                type="file"
                accept=".drawio,.xml,.mmd,.mermaid,.arch,.json"
                aria-label="Choose a file to import"
                style={{ display: 'none' }}
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
              <span style={{ color: '#5B6474' }}>.drawio, .xml, .mmd or .arch</span>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 600 }}>
              Or paste text
              <textarea
                aria-label="Paste diagram text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFileName('');
                  setError(null);
                }}
                rows={8}
                placeholder="flowchart TD&#10;  A[API] --> B[(DB)]"
                style={{ font: '12px "JetBrains Mono", monospace', border: '1px solid #E3E6EB', borderRadius: 6, padding: 8, resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span role="status" style={{ flexGrow: 1, color: '#5B6474' }}>
                {text.trim() ? (detected ? `Detected format: ${FORMAT_NAME[detected]}` : 'Format not recognised') : 'Nothing chosen yet'}
              </span>
              <button type="button" style={{ ...primary, opacity: text.trim() && !busy ? 1 : 0.5 }} disabled={!text.trim() || busy} onClick={() => void analyse(fileName || 'pasted', text)}>
                {busy ? 'Reading…' : 'Continue'}
              </button>
            </div>
          </section>
        )}

        {result && doc && (
          <>
            {result.warnings.length > 0 && (
              <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #F3D9A4', borderRadius: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
                  <span style={{ flexGrow: 1 }}>
                    <strong>{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}</strong>
                    {result.stats.skipped > 0 && <> — {result.stats.skipped} shape{result.stats.skipped === 1 ? ' is' : 's are'} skipped</>}. Nothing else is changed.
                  </span>
                  <button type="button" aria-expanded={showWarnings} style={{ ...btn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => setShowWarnings((v) => !v)}>
                    {showWarnings ? 'Hide warnings' : 'Show warnings'}
                  </button>
                </div>
                {showWarnings && (
                  <ul aria-label="Import warnings" style={{ margin: '8px 0 0', paddingLeft: 30, fontSize: 12 }}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>
                        {w.message}
                        {w.sourceRef ? <span style={{ color: '#5B6474', fontFamily: '"JetBrains Mono", monospace' }}> ({w.sourceRef})</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 16 }}>
              <section aria-label="Shape mapping" style={{ gridColumn: 'span 3', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8, padding: '10px 16px', background: '#F6F7F9', fontSize: 11, fontWeight: 600, color: '#5B6474', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <span>Shape in file</span><span>Becomes</span><span>Elements</span>
                </div>
                {groups.length === 0 && <p style={{ margin: 0, padding: '12px 16px', color: '#5B6474' }}>No elements to map.</p>}
                {groups.map((g) => (
                  <div key={g.key} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8, padding: '10px 16px', borderTop: '1px solid #F1F2F5', alignItems: 'center' }}>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>All {g.name}</span>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#5B6474' }}>e.g. {g.sample}</span>
                    </span>
                    <select
                      aria-label={`Map ${g.name} to`}
                      value={remap[g.key] ?? g.kind}
                      onChange={(e) => {
                        const kind = KIND_OPTIONS.find((o) => o.kind === e.target.value)?.kind;
                        if (kind) setRemap((m) => ({ ...m, [g.key]: kind }));
                      }}
                      style={{ height: 32, padding: '0 8px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', font: 'inherit' }}
                    >
                      {KIND_OPTIONS.map((o) => (
                        <option key={o.kind} value={o.kind}>{o.label}</option>
                      ))}
                    </select>
                    <span style={{ fontWeight: 500 }}>{g.count}</span>
                  </div>
                ))}
              </section>
              <section style={{ gridColumn: 'span 2', background: '#FFFFFF', border: '1px solid #E3E6EB', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Preview</h2>
                <div role="img" aria-label="Import preview" style={{ height: PH, background: '#F6F7F9', borderRadius: 8 }}>
                  <svg viewBox={`0 0 ${PW} ${PH}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" focusable="false">
                    {preview.rects.filter((r) => r.boundary).map((r) => (
                      <g key={r.id}>
                        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill="none" stroke={r.stroke} strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                      </g>
                    ))}
                    {preview.lines.map((l) => (
                      <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#8A93A3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    ))}
                    {preview.rects.filter((r) => !r.boundary).map((r) => (
                      <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill="#FFFFFF" stroke={r.stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                </div>
                <p style={{ margin: 0, color: '#5B6474', fontSize: 12 }}>
                  Page 1 of {result.stats.pages}. Format: {FORMAT_NAME[result.format]}.
                </p>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
