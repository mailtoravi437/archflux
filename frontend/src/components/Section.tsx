import { useId, useState, type ReactNode } from 'react';

/** Read the persisted open/closed map; any storage or parse error means "no saved state". */
function readOpenMap(storageKey: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOpen(storageKey: string, id: string, open: boolean): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...readOpenMap(storageKey), [id]: open }));
  } catch {
    /* storage full or blocked: the toggle still works for this session */
  }
}

export interface SectionProps {
  /** Stable key for persistence (e.g. 'content'). */
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** localStorage key holding `{ [id]: open }`; omit to keep the state in memory only. */
  storageKey?: string;
  /** Heading level wrapping the toggle button (default 3). */
  level?: 3 | 4 | 5;
  /** Muted text shown on the right of the title, before the chevron (R1-E14-T03). */
  summary?: ReactNode;
  children: ReactNode;
}

/** Disclosure section: a heading button with `aria-expanded` controlling a labelled region. */
export function Section({ id, title, defaultOpen = false, storageKey, level = 3, summary, children }: SectionProps) {
  const Heading = `h${level}` as const;
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    const saved = readOpenMap(storageKey)[id];
    return saved ?? defaultOpen;
  });
  const uid = useId();
  const buttonId = `${uid}-btn`;
  const regionId = `${uid}-region`;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) writeOpen(storageKey, id, next);
  };
  return (
    <div className="inspector-section">
      <Heading style={{ margin: 0, fontSize: 'inherit' }}>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={regionId}
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
            color: 'var(--text-main)', font: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600,
          }}
        >
          <span>{title}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: 'var(--text-muted)' }}>
            {summary !== undefined && <span>{summary}</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
            </svg>
          </span>
        </button>
      </Heading>
      <div id={regionId} role="region" aria-labelledby={buttonId} hidden={!open} style={{ paddingBottom: 6 }}>
        {open && children}
      </div>
    </div>
  );
}
