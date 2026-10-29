import React, { useId } from 'react';

/**
 * Text input (UI_REVAMP_SPEC §5 "Controls", R1-E01-T02): 32 px high, 13 px
 * UI font, focus ring = 2 px accent at 35 % plus a 1 px accent border.
 * Styling lives in styles.css under `.input`.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, id, className, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    return (
      <div className="input-field">
        {label && <label htmlFor={inputId} className="input-label">{label}</label>}
        <input
          ref={ref}
          id={inputId}
          className={['input', className ?? ''].filter(Boolean).join(' ')}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {error && <span id={errorId} className="input-error">Invalid value</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
