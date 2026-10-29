import React from 'react';

/**
 * One button system (UI_REVAMP_SPEC §5 "Controls", R1-E01-T02).
 * Sizes are 28 / 32 / 40 px high; styling lives in styles.css under
 * `.btn.btn--{size}` and `.btn--{variant}` so the same classes work for
 * plain `<button className="btn …">` markup.
 */
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  /** `destructive` is the pre-R1 name, kept as an alias of `danger`. */
  variant?: ButtonVariant | 'destructive';
  icon?: React.ReactNode;
  loading?: boolean;
}

function hasContent(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((c) => !(typeof c === 'string' && c.trim() === ''));
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'secondary', size = 'md', icon, loading, disabled, className, children, type = 'button', ...rest },
    ref,
  ) => {
    const resolvedVariant: ButtonVariant = variant === 'destructive' ? 'danger' : variant;
    const iconOnly = icon != null && !hasContent(children);

    if (
      import.meta.env.DEV &&
      iconOnly &&
      !rest['aria-label'] &&
      !rest['aria-labelledby'] &&
      !rest.title
    ) {
      console.error('Button: an icon-only button needs an aria-label (or aria-labelledby).');
    }

    const classes = [
      'btn',
      `btn--${size}`,
      `btn--${resolvedVariant}`,
      iconOnly ? 'btn--icon' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className="btn__spinner" aria-hidden="true" />}
        {icon != null && <span className="btn__icon" aria-hidden="true">{icon}</span>}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
