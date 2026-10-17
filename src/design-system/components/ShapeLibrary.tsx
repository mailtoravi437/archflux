import { useState, useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii } from '../tokens';
import { ShapeIcon, iconLibrary, type ShapeIconKey } from './ShapeIcon';

interface ShapeLibraryProps { onAdd?: (key: ShapeIconKey) => void; className?: string; }

export const ShapeLibrary = ({ onAdd, className }: ShapeLibraryProps) => {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const [query, setQuery] = useState('');

  const entries = useMemo(() => Object.entries(iconLibrary) as Array<[ShapeIconKey, (typeof iconLibrary)[ShapeIconKey]]>, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return entries.filter(([k, v]) => k.toLowerCase().includes(q) || v.label.toLowerCase().includes(q));
  }, [entries, query]);

  const groups = useMemo(() => {
    const g = new Map<string, Array<[string, { src: string; kind?: string; label: string }]>>();
    for (const [k, v] of filtered) {
      const cat = (v.kind ?? 'OTHER').toLowerCase();
      if (!g.has(cat)) g.set(cat, []);
      g.get(cat)!.push([k, v]);
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div style={{ ...(className ? { className } : {}), display: 'flex', flexDirection: 'column', gap: spacing[3], background: isDark ? '#14171E' : '#FFFFFF', border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`, borderRadius: radii.lg, padding: spacing[5], fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search shapes…"
          style={{
            width: '100%', height: '36px', padding: `4px ${spacing[3]} 4px 36px`,
            borderRadius: radii.md, border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`,
            background: isDark ? '#191D25' : '#FFFFFF', color: isDark ? '#F2F4F8' : '#20242D',
            fontSize: '13px', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          }}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {groups.map(([cat, items]) => (
        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: spacing['1'] }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDark ? '#858E9F' : '#707989', marginBottom: spacing['1'] }}>{cat}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: spacing[2] }}>
            {items.map(([key, entry]) => (
              <button
                key={key}
                onClick={() => onAdd?.(key as ShapeIconKey)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing['1'],
                  padding: spacing[3], borderRadius: radii.md, border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`,
                  background: 'transparent', cursor: 'pointer', color: isDark ? '#F2F4F8' : '#20242D',
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  transition: 'border-color 140ms ease, background-color 140ms ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#202530' : '#F0F1F7'; (e.currentTarget as HTMLElement).style.borderColor = isDark ? '#8B83FF' : '#635BFF'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = isDark ? '#343A47' : '#E0E3EA'; }}
              >
                <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? '#202530' : '#F0F1F7', borderRadius: radii.md }}>
                  <ShapeIcon name={key as ShapeIconKey} size={20} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>{entry.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
