import React from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii, motion } from '../tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', disabled, loading, children, style, ...rest }, ref) => {
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';

    const base = {
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      borderRadius: radii.md,
      border: '1px solid transparent',
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transition: `background-color ${motion.duration.fast}, border-color ${motion.duration.fast}, box-shadow ${motion.duration.fast}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[2],
      lineHeight: 1.25,
      outlineOffset: '2px',
    } as React.CSSProperties;

    const sizeStyles: Record<Size, React.CSSProperties> = {
      sm: { padding: '4px 12px', fontSize: '11px', height: '28px' },
      md: { padding: '8px 16px', fontSize: '14px', height: '36px' },
      lg: { padding: '10px 24px', fontSize: '16px', height: '44px' },
    };

    const getVariant = (v: Variant): React.CSSProperties => {
      if (v === 'primary') {
        return {
          backgroundColor: isDark ? '#8B83FF' : '#635BFF',
          color: '#FFFFFF',
          borderColor: isDark ? '#8B83FF' : '#635BFF',
        };
      }
      if (v === 'secondary') {
        return {
          backgroundColor: isDark ? '#191D25' : '#FFFFFF',
          color: isDark ? '#F2F4F8' : '#20242D',
          borderColor: isDark ? '#343A47' : '#E0E3EA',
        };
      }
      if (v === 'ghost') {
        return {
          backgroundColor: 'transparent',
          color: isDark ? '#F2F4F8' : '#20242D',
          borderColor: 'transparent',
        };
      }
      // destructive
      return {
        backgroundColor: isDark ? '#F47788' : '#C13E55',
        color: '#FFFFFF',
        borderColor: isDark ? '#F47788' : '#C13E55',
      };
    };

    const styles = getVariant(variant);

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        {...rest}
        style={{
          ...base,
          ...sizeStyles[size],
          ...styles,
          opacity: (disabled || loading) ? 0.55 : 1,
          boxShadow: variant === 'primary' ? '0 1px 2px rgba(0,0,0,0.1)' : undefined,
          ...style,
        }}
        onMouseEnter={(e) => {
          if (disabled || loading) return;
          const el = e.currentTarget;
          if (variant === 'primary') el.style.backgroundColor = isDark ? '#A49EFF' : '#5148E5';
          else if (variant === 'secondary') el.style.backgroundColor = isDark ? '#272D39' : '#F0F1F7';
          else if (variant === 'ghost') el.style.backgroundColor = isDark ? '#272D39' : '#F0F1F7';
          else if (variant === 'destructive') el.style.backgroundColor = isDark ? '#F8A5B0' : '#D65E6A';
        }}
        onMouseLeave={(e) => {
          if (disabled || loading) return;
          const el = e.currentTarget;
          const s = getVariant(variant);
          el.style.backgroundColor = s.backgroundColor ?? '';
          el.style.borderColor = s.borderColor ?? '';
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          el.style.outline = '2px solid';
          el.style.outlineColor = isDark ? '#A49EFF' : '#5148E5';
          el.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          el.style.outline = 'none';
        }}
      >
        {loading && <span aria-label="Loading" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
