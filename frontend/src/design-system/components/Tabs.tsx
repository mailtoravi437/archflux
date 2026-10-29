import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, typography, motion } from '../tokens';

export interface TabItem { id: string; label: React.ReactNode; disabled?: boolean; }
export interface TabsProps { tabs: TabItem[]; defaultActive?: string; onChange?: (id: string) => void; }

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ tabs, defaultActive = tabs[0]?.id, onChange }, ref) => {
    const [active, setActive] = useState(defaultActive);
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';
    const handle = (id: string, disabled?: boolean) => {
      if (disabled) return;
      setActive(id);
      onChange?.(id);
    };
    return (
      <div ref={ref} role="tablist" aria-label="Tabs" style={{ display: 'flex', gap: spacing['1'], borderBottom: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`, paddingBottom: spacing['1'] }}>
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-disabled={t.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handle(t.id, t.disabled)}
              disabled={t.disabled}
              style={{
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                fontSize: typography.size.sm,
                fontWeight: 500,
                color: isActive ? (isDark ? '#8B83FF' : '#4F46E5') : (isDark ? '#A1A9B8' : '#626B7A'),
                background: 'transparent',
                border: 'none',
                padding: `${spacing['2']} ${spacing[3]}`,
                cursor: t.disabled ? 'not-allowed' : 'pointer',
                borderBottom: isActive ? `2px solid ${isDark ? '#8B83FF' : '#4F46E5'}` : '2px solid transparent',
                transition: `color ${motion.duration.fast}, border-color ${motion.duration.fast}`,
                opacity: t.disabled ? 0.5 : 1,
                outline: 'none',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = '2px solid'; (e.currentTarget as HTMLElement).style.outlineColor = isDark ? '#A49EFF' : '#5148E5'; (e.currentTarget as HTMLElement).style.outlineOffset = '2px'; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = 'none'; }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }
);
Tabs.displayName = 'Tabs';
