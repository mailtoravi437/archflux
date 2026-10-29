import React from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii } from '../tokens';

type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: Status;
  children: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ status = 'neutral', children, style, ...rest }, ref) => {
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';
    const colors = {
      success: isDark ? { bg: '#0F3D35', fg: '#53D6B0', border: '#1A5A4B' } : { bg: '#E8F5F0', fg: '#13795B', border: '#C8E6D8' },
      warning: isDark ? { bg: '#4A2E0A', fg: '#F0B86E', border: '#8A5E18' } : { bg: '#FFF6E5', fg: '#98600A', border: '#F5DEB3' },
      error: isDark ? { bg: '#4A1A2A', fg: '#F47788', border: '#8A2A3A' } : { bg: '#FCE8EB', fg: '#C13E55', border: '#F5C8CE' },
      info: isDark ? { bg: '#142A55', fg: '#72B8FF', border: '#1A3D7A' } : { bg: '#E8F2FA', fg: '#2268B3', border: '#C5D7EA' },
      neutral: isDark ? { bg: '#202530', fg: '#A1A9B8', border: '#343A47' } : { bg: '#F0F1F7', fg: '#626B7A', border: '#E0E3EA' },
    };
    const c = colors[status];
    return (
      <span
        ref={ref}
        {...rest}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing['1'],
          padding: '2px 8px',
          fontSize: '11px',
          fontWeight: 500,
          borderRadius: radii.pill,
          border: `1px solid ${c.border}`,
          backgroundColor: c.bg,
          color: c.fg,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          ...style,
        }}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = 'Badge';
