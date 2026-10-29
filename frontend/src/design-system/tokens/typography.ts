// 4px base scale; Inter + JetBrains Mono fallbacks
export const fontFamily = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, "Noto Sans", sans-serif',
  mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
} as const;

/** Code font (`--code-font`): only for code, kbd, `.mono`, IDs and diffs. */
export const codeFont = fontFamily.mono;

/** UI_REVAMP_SPEC §5 type scale, mirrored by `--text-*` / `--lh-*` in styles.css. */
export const textScale = {
  xs: { size: '11px', lineHeight: '16px', weight: 500 },
  sm: { size: '12px', lineHeight: '18px', weight: 500 },
  md: { size: '13px', lineHeight: '20px', weight: 400 },
  lg: { size: '15px', lineHeight: '22px', weight: 600 },
  xl: { size: '20px', lineHeight: '28px', weight: 700 },
} as const;

export const typography = {
  size: {
    '2xs': '0.625rem',   // 10px
    xs: '0.75rem',       // 12px
    sm: '0.875rem',      // 14px
    base: '1rem',        // 16px
    lg: '1.125rem',      // 18px
    xl: '1.25rem',       // 20px
    '2xl': '1.5rem',     // 24px
    '3xl': '1.875rem',   // 30px
  } as const,
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  } as const,
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
  } as const,
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
  } as const,
} as const;
