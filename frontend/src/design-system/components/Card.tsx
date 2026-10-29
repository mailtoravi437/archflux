import React from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii } from '../tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ elevated, children, style, ...rest }, ref) => {
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';
    return (
      <div
        ref={ref}
        {...rest}
        style={{
          backgroundColor: isDark ? '#191D25' : '#FFFFFF',
          border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`,
          borderRadius: radii.lg,
          padding: spacing[5],
          boxShadow: elevated ? (isDark ? '0 4px 12px rgba(0,0,0,0.35)' : '0 4px 12px rgba(0,0,0,0.08)') : 'none',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          color: isDark ? '#F2F4F8' : '#20242D',
          ...style,
        }}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';
