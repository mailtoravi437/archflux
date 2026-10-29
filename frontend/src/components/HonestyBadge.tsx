import type { CSSProperties } from 'react';

export type HonestyTone = 'demo' | 'neutral' | 'info' | 'warn';

/**
 * Small honest-labeling badge (HON-R1, HON-R7).
 * Conveyed by text + shape (glyph prefix + dashed outline), never color
 * alone. Theme-safe: uses only CSS tokens, no hardcoded hex. Exposed to
 * assistive tech via text content + aria-label.
 */
const TONE_GLYPH: Record<HonestyTone, string> = {
  demo: '◌',
  neutral: '○',
  info: '◇',
  warn: '△',
};

interface HonestyBadgeProps {
  label: string;
  tone?: HonestyTone;
  /** Tooltip with the longer explanation (ownership, evidence, next step). */
  title?: string;
  className?: string;
  style?: CSSProperties;
  /** Stable hook for E2E (e.g. "source-mode-badge"). */
  'data-testid'?: string;
}

export default function HonestyBadge({
  label,
  tone = 'neutral',
  title,
  className,
  style,
  'data-testid': testId,
}: HonestyBadgeProps) {
  const ariaLabel = title ? `${label}: ${title}` : label;
  return (
    <span
      className={`badge-count honesty-badge honesty-${tone}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={ariaLabel}
      title={title ?? label}
      style={style}
      data-testid={testId}
    >
      <span aria-hidden="true">{TONE_GLYPH[tone]}</span> {label}
    </span>
  );
}
