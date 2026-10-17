import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii, typography } from '../tokens';

export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  shortcut?: string;
  children: React.ReactNode;
}

export const Tooltip = React.forwardRef<HTMLSpanElement, TooltipProps>(
  ({ text, shortcut, children, ...rest }, ref) => {
    const [visible, setVisible] = useState(false);
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';
    return (
      <span
        ref={ref}
        {...rest}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        role="tooltip"
        aria-label={text}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {children}
        {visible && (
          <span
            role="tooltip"
            style={{
              position: 'absolute', zIndex: 50, bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
              background: isDark ? '#202530' : '#20242D', color: '#F2F4F8', padding: `${spacing['1']} ${spacing[2]}`,
              borderRadius: radii.md, fontSize: typography.size.sm, whiteSpace: 'nowrap', pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {text} {shortcut && <span style={{ opacity: 0.7, marginLeft: 4 }}>({shortcut})</span>}
          </span>
        )}
      </span>
    );
  }
);
Tooltip.displayName = 'Tooltip';
