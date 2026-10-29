/**
 * Design-token source validator (FRONTEND_SPEC "no magic values").
 *
 * Static source scan used in CI and the release checklist: component files
 * must consume design tokens (spacing/color objects) rather than hardcoded
 * px/margin constants or raw hex. Canvas palette contexts are exempt because
 * canvas drawing uses vendor brand colors that are pixel-exact by contract.
 *
 * Deliberately regex-based and dependency-free: runs before the toolchain in
 * check scripts, no AST parser cold-start.
 */

export interface TokenValidationResult {
  valid: boolean;
  violations: string[];
}

/** Spacing values 4–64px in 4px steps are reserved by the spacing scale. */
const HARDCODED_SPACING = /(?:padding|margin|gap|top|right|bottom|left|width|height)\s*:\s*['"]?(\d{1,2}(?:\.\d+)?)px/g;

/** Raw hex in component style; canvas palette classes suppress it. */
const RAW_HEX_IN_STYLE = /style\s*=\s*\{[^}]*?color\s*:\s*['"]#[0-9a-fA-F]{3,8}['"][^}]*?\}/;

/** Hex anywhere in an inline style object (broader secondary check). */
const RAW_HEX_ANY_STYLE = /style\s*=\s*\{[^}]*#[0-9a-fA-F]{3,8}[^}]*?\}/;

export const CANVAS_PALETTE_CLASS = 'canvasPalette';

/**
 * Validate component source against the token contract.
 * Pure: same input always yields the same violations list, no I/O.
 */
export function validateTokens(source: string): TokenValidationResult {
  const violations: string[] = [];

  // Spacing scale violations — always enforced
  const spacingMatches = source.matchAll(HARDCODED_SPACING);
  const seenSpacing = new Set<number>();
  for (const match of spacingMatches) {
    const px = Number.parseFloat(match[1] ?? '0');
    if (!Number.isFinite(px)) continue;
    if (px >= 4 && px <= 64 && !seenSpacing.has(px)) {
      seenSpacing.add(px);
      violations.push(`Hardcoded ${px}px spacing found; use spacing tokens`);
    }
  }

  // Raw hex color violations — suppressed inside canvas palette contexts
  const isCanvasPalette = source.includes(CANVAS_PALETTE_CLASS);
  const hasRawHex = RAW_HEX_IN_STYLE.test(source) || RAW_HEX_ANY_STYLE.test(source);
  if (hasRawHex && !isCanvasPalette) {
    violations.push('Component uses raw hex color; consume token only');
  }

  return { valid: violations.length === 0, violations };
}

/** Stable object for direct import in release-checklist scripts. */
export const tokenValidation = {
  /** Validate a named file's source; violations are prefixed with the path. */
  checkFile: (fileName: string, source: string): TokenValidationResult => {
    const result = validateTokens(source);
    return {
      valid: result.valid,
      violations: result.violations.map((v) => `${fileName}: ${v}`),
    };
  },
};

/**
 * WCAG 2.x contrast helpers (R1-E01-T01). Pure; accept `#RGB` or `#RRGGBB`.
 * Used by the token tests to keep text colours >= 4.5:1 on their surface.
 */
function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance per WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** True when the pair meets the given ratio (default WCAG AA body text, 4.5:1). */
export function meetsContrast(foreground: string, background: string, min = 4.5): boolean {
  return contrastRatio(foreground, background) >= min;
}
