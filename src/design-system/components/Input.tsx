import React from 'react';
import { useTheme } from './ThemeProvider';
import { spacing, radii, typography } from '../tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, disabled, style, ...rest }, ref) => {
    const { resolved } = useTheme();
    const isDark = resolved === 'dark';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['1'] }}>
        {label && <label htmlFor={rest.id} style={{ fontSize: '12px', fontWeight: 500, color: isDark ? '#A1A9B8' : '#626B7A' }}>{label}</label>}
        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={error}
          aria-describedby={error ? `${rest.id}-error` : undefined}
          {...rest}
          style={{
            height: '36px',
            padding: `${spacing['2']} ${spacing[3]}`,
            fontSize: typography.size.base,
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            borderRadius: radii.md,
            border: `1px solid ${error ? (isDark ? '#F47788' : '#C13E55') : (isDark ? '#343A47' : '#E0E3EA')}`,
            backgroundColor: isDark ? '#191D25' : '#FFFFFF',
            color: isDark ? '#F2F4F8' : '#20242D',
            outline: 'none',
            transition: 'border-color 140ms ease, box-shadow 140ms ease',
            ...style,
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderColor = isDark ? '#A49EFF' : '#5148E5';
            (e.currentTarget as HTMLInputElement).style.boxShadow = `0 0 0 3px ${isDark ? 'rgba(139,131,255,0.2)' : 'rgba(99,91,255,0.2)'}`;
          }}
          onBlur={(e) => {
            const el = e.currentTarget as HTMLInputElement;
            el.style.borderColor = error ? (isDark ? '#F47788' : '#C13E55') : (isDark ? '#343A47' : '#E0E3EA');
            el.style.boxShadow = 'none';
          }}
        />
        {error && <span id={`${rest.id}-error`} style={{ fontSize: '11px', color: isDark ? '#F47788' : '#C13E55' }}>Invalid value</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
