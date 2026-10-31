import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { blueprintGraph, blueprints } from '../data/blueprints';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { isSignedIn } from '../state/session';
import { moveDoc, useLibrary } from '../state/library';
import { useDiagram } from '../state/useDiagram';
import type { DisplayStyle } from '../types';
import { uniqueTitle } from './library/libraryModel';
import ImportDialog from './import/ImportDialog';

type Tab = 'blank' | 'template' | 'import' | 'ai';

interface Pending {
  knownIds: string[];
  title: string;
  style?: DisplayStyle;
  graph?: ReturnType<typeof blueprintGraph>;
  label?: string;
}

const STYLES: { value: DisplayStyle; label: string }[] = [
  { value: 'icon', label: 'Icon' },
  { value: 'card', label: 'Card' },
  { value: 'shape', label: 'Shape' },
];

const field: CSSProperties = { height: 36, padding: '0 10px', border: '1px solid #E3E6EB', borderRadius: 6, font: 'inherit', color: '#1B1F27', background: '#FFFFFF' };
const btn: CSSProperties = { height: 36, display: 'flex', alignItems: 'center', padding: '0 14px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', color: '#1B1F27', fontWeight: 500, font: 'inherit', cursor: 'pointer' };
const primary: CSSProperties = { ...btn, border: 'none', background: '#4F46E5', color: '#FFFFFF', fontWeight: 600, padding: '0 16px' };

/**
 * New diagram dialog (SC-09, NewDiagram.dc.html): Blank, Templates, Import file
 * and Generate with AI. The AI tab is an honest notice; nothing is generated.
 */
export default function NewDiagramDialog({ onClose, initialTab = 'blank' }: { onClose: () => void; initialTab?: Tab }) {
  const navigate = useNavigate();
  const { docs, activeDocId, newDoc, setDocTitle, setDocDefaults, loadGraph } = useDiagram();
  const lib = useLibrary();
  const trap = useFocusTrap<HTMLDivElement>(true);
  const titleId = useId();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [name, setName] = useState('');
  const [style, setStyle] = useState<DisplayStyle>('icon');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const pending = useRef<Pending | null>(null);
  const folderId = lib.currentFolderId;
  const folder = lib.folders.find((f) => f.id === folderId) ?? null;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose, importing]);

  // After newDoc() the new doc becomes active: apply the title, style or blueprint to it, then open it.
  useEffect(() => {
    const p = pending.current;
    if (!p || docs.some((d) => d.id === activeDocId && p.knownIds.includes(d.id))) return;
    pending.current = null;
    setDocTitle(p.title);
    if (p.style) setDocDefaults({ displayStyle: p.style });
    if (p.graph) loadGraph(p.graph.nodes, p.graph.edges, p.label);
    if (folderId) void moveDoc(activeDocId, folderId);
    track('diagram_created', { source: p.graph ? 'template' : 'blank' });
    onClose();
    navigate('/canvas');
  }, [docs, activeDocId, setDocTitle, setDocDefaults, loadGraph, folderId, onClose, navigate]);

  const start = (p: Omit<Pending, 'knownIds'>) => {
    pending.current = { ...p, knownIds: docs.map((d) => d.id) };
    newDoc();
    // A full library (25) creates nothing: do not file the next doc by mistake.
    window.setTimeout(() => { pending.current = null; }, 2000);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blueprints.filter((b) => !q || `${b.title} ${b.category} ${b.desc}`.toLowerCase().includes(q));
  }, [query]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'blank', label: 'Blank' },
    { id: 'template', label: 'Templates' },
    { id: 'import', label: 'Import file' },
    { id: 'ai', label: 'Generate with AI' },
  ];
  const saveTarget = folder ? <strong style={{ color: '#1B1F27' }}>{folder.name}</strong> : <strong style={{ color: '#1B1F27' }}>{isSignedIn() ? 'your Library' : 'this device'}</strong>;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,25,.45)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
        <section
          ref={trap}
          role="dialog"
          aria-modal="true"
          aria-label="New diagram"
          onClick={(e) => e.stopPropagation()}
          style={{ width: 960, maxWidth: '100%', height: 740, maxHeight: '92vh', boxSizing: 'border-box', background: '#FFFFFF', color: '#1B1F27', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, borderRadius: 14, boxShadow: '0 24px 64px rgba(16,24,40,.25)', display: 'flex', overflow: 'hidden' }}
        >
          <nav aria-label="Ways to start" style={{ width: 220, flexShrink: 0, background: '#F6F7F9', borderRight: '1px solid #E3E6EB', padding: '20px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 id={titleId} style={{ margin: '0 8px 12px', fontSize: 17, fontWeight: 700 }}>New diagram</h2>
            <div role="tablist" aria-label="Ways to start" aria-orientation="vertical" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tabs.map((t) => {
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`nd-tab-${t.id}`}
                    aria-selected={on}
                    aria-controls="nd-panel"
                    aria-disabled={t.id === 'ai' ? true : undefined}
                    onClick={() => setTab(t.id)}
                    style={{ height: 36, textAlign: 'left', padding: '0 10px', border: 'none', borderRadius: 6, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 1px 2px rgba(16,24,40,.08)' : 'none', font: 'inherit', fontWeight: on ? 600 : 400, color: on ? '#1B1F27' : '#3D4553', cursor: 'pointer', opacity: t.id === 'ai' ? 0.8 : 1 }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flexGrow: 1 }} />
            <p style={{ margin: '0 8px', fontSize: 12, color: '#5B6474' }}>Saves to {saveTarget}</p>
          </nav>

          <div id="nd-panel" role="tabpanel" aria-labelledby={`nd-tab-${tab}`} style={{ flexGrow: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, flexGrow: 1 }}>
                {tab === 'blank' ? 'Start with a blank diagram' : tab === 'template' ? 'Start from a template' : tab === 'import' ? 'Import a file' : 'Generate with AI'}
              </h3>
              <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: 6, fontSize: 18, color: '#5B6474', cursor: 'pointer' }}>×</button>
            </div>

            {tab === 'blank' && (
              <form
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  start({ title: name.trim() || 'untitled.arch', style });
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#5B6474', fontSize: 12 }}>
                  Name
                  <input autoFocus style={field} value={name} maxLength={80} placeholder="untitled.arch" onChange={(e) => setName(e.target.value)} />
                </label>
                <div role="radiogroup" aria-label="Default display style" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#5B6474' }}>Default display style</span>
                  {STYLES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={style === s.value}
                      onClick={() => setStyle(s.value)}
                      style={{ height: 28, padding: '0 10px', border: `1px solid ${style === s.value ? '#4F46E5' : '#E3E6EB'}`, borderRadius: 999, background: style === s.value ? '#EEF0FF' : '#FFFFFF', color: style === s.value ? '#4338CA' : '#1B1F27', font: 'inherit', fontSize: 12, fontWeight: style === s.value ? 600 : 400, cursor: 'pointer' }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" style={primary}>Create</button>
                </div>
              </form>
            )}

            {tab === 'template' && (
              <>
                <input type="search" aria-label="Search templates" placeholder="Search templates" style={field} value={query} onChange={(e) => setQuery(e.target.value)} />
                {shown.length === 0 ? (
                  <p role="status" style={{ color: '#5B6474', margin: 0 }}>No templates match “{query}”.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {shown.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => start({ title: uniqueTitle(b.title, docs.map((d) => d.title)), graph: blueprintGraph(b.id), label: `Loaded blueprint: ${b.title}` })}
                          style={{ width: '100%', textAlign: 'left', padding: 14, border: '1px solid #E3E6EB', borderRadius: 10, background: '#FFFFFF', font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                          <span style={{ fontWeight: 600 }}>{b.title}</span>
                          <span style={{ fontSize: 12, color: '#5B6474' }}>{b.category} · {b.nodeCount} elements · {b.edgeCount} connections</span>
                          <span style={{ fontSize: 12, color: '#3D4553' }}>{b.desc}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {tab === 'import' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                <p style={{ margin: 0, color: '#5B6474' }}>Bring in a draw.io, Mermaid or ArchFlux (.arch) file. You review what will be imported before anything is created.</p>
                <button type="button" style={primary} onClick={() => setImporting(true)}>Choose a file…</button>
              </div>
            )}

            {tab === 'ai' && (
              <div role="status" style={{ padding: 16, border: '1px solid #F3D9A4', background: '#FFFBEB', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#92400E' }}>AI drafts arrive in R2</span>
                <span style={{ color: '#3D4553' }}>Generating a diagram from a prompt is not available yet, so nothing is generated or created here. Start from Blank, a template or an import instead.</span>
              </div>
            )}
          </div>
        </section>
      </div>
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            onClose();
            navigate('/canvas');
          }}
        />
      )}
    </>
  );
}
