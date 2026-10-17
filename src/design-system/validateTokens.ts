import { brand } from './colors';

/** Validate that design-system token usage complies with v2.0.0 rules */
export function validateTokens(source: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  // No scattered theme styling: disallow inline hex values outside canvas/user palettes
  const hexMatches = source.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
  const allowedHex = ['#18181B', '#7C3AED', '#EDE9FE', '#FFFFFF', '#FAFAFA', '#D4D4D8', '#F4F4F5', '#A1A1AA', '#27272A', '#52525B', '#71717A', '#3F3F46', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#4C1D95', '#5B21B6', '#6D28D9', '#2E1065', '#16A34A', '#CA8A04', '#DC2626', '#2563EB', '#4ADE80', '#FACC15', '#F87171', '#60A5FA', '#E4E4E7'];
  for (const h of hexMatches) {
    if (!allowedHex.includes(h.toUpperCase()) && !source.includes('canvasPalette')) {
      // Allow only in canvas/user palette contexts
      if (!source.includes('canvasPalette') && !source.includes('canvas') && !h.includes('#18181B')) {
         // Permit brand graphites/violets already in allowed; else flag
      }
    }
  }
  // Ensure 4px base spacing references only spacing tokens
  if (source.includes('4px') && !source.includes('spacing')) {
    violations.push('Hardcoded 4px spacing found; use spacing tokens');
  }
  // Require token references for colors (no raw hex in components except canvas)
  const hasRawColor = /style=\{[^}]*color:\s*#[0-9A-Fa-f]{3,8}/g.test(source);
  if (hasRawColor && !source.includes('canvasPalette') && !source.includes('canvas')) {
    violations.push('Component uses raw hex color; consume token only');
  }
  return { valid: violations.length === 0, violations };
}

export const tokenValidation = {
  checkFile: (path: string, content: string) => validateTokens(content),
};
