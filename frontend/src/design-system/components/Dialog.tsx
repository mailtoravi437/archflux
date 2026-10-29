import React from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii, typography, shadows } from '../tokens';

export interface DialogProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean;
  title: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  destructive?: boolean;
  children: React.ReactNode;
  onClose?: () => void;
}

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ open, title, primary, secondary, destructive, children, onClose, style, ...rest }, ref) => {
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';
    if (!open) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        ref={ref}
        {...rest}
        style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isDark ? 'rgba(16,19,24,0.7)' : 'rgba(245,246,248,0.7)',
          backdropFilter: 'blur(4px)',
          ...style,
        }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(640px, 92vw)',
            background: isDark ? '#191D25' : '#FFFFFF',
            border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`,
            borderRadius: radii.xl,
            padding: spacing[6],
            boxShadow: isDark ? shadows.lg : shadows.md,
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            color: isDark ? '#F2F4F8' : '#20242D',
          }}
        >
          <h2 style={{ fontSize: typography.size.lg, fontWeight: 600, margin: 0, marginBottom: spacing[4] }}>{title}</h2>
          <div style={{ fontSize: typography.size.base, lineHeight: 1.5, color: isDark ? '#A1A9B8' : '#626B7A', marginBottom: spacing[6] }}>{children}</div>
          <div style={{ display: 'flex', gap: spacing[3], justifyContent: 'flex-end' }}>
            {secondary && <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: radii.md, border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`, background: 'transparent', color: isDark ? '#F2F4F8' : '#20242D', cursor: 'pointer', fontWeight: 500 }}>{secondary}</button>}
            {primary && <button style={{ padding: '8px 16px', borderRadius: radii.md, border: 'none', background: destructive ? (isDark ? '#F47788' : '#C13E55') : (isDark ? '#8B83FF' : '#4F46E5'), color: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>{primary}</button>}
          </div>
        </div>
      </div>
    );
  }
);
Dialog.displayName = 'Dialog';
