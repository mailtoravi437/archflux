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
