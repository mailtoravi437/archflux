/**
 * R1-E02-T02: canvas text measuring helpers shared by the render passes.
 * Pure: the only context access is `measureText` with the caller's current font.
 */

const ELLIPSIS = '…';

function width(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

/**
 * Longest prefix of `text` that fits `maxWidth` once "…" is appended. Returns "…" alone when even one
 * character does not fit, and `text` unchanged when it already fits.
 */
export function ellipsizeToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (width(ctx, text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  // Binary search on the prefix length: measureText is monotonic in the prefix.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (width(ctx, text.slice(0, mid).trimEnd() + ELLIPSIS) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + ELLIPSIS;
}

/** Splits a word wider than `maxWidth` into chunks that each fit (at least one character each). */
function breakWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const out: string[] = [];
  let rest = word;
  while (rest.length > 0) {
    let n = 1;
    while (n < rest.length && width(ctx, rest.slice(0, n + 1)) <= maxWidth) n++;
    out.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  return out;
}

/**
 * Word-wraps `text` into at most `maxLines` lines no wider than `maxWidth` (canvas px, measured
 * with the context's current font). When text is left over, the last line ends in "…".
 * Words wider than a line are broken by character. Empty text gives no lines.
 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || maxLines < 1) return [];
  const lines: string[] = [];
  let current = '';
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (width(ctx, candidate) <= maxWidth) {
      current = candidate;
      i++;
    } else if (current) {
      lines.push(current);
      current = '';
    } else {
      // A single word wider than the line: put its first chunk here and keep the rest as a word.
      const [head, ...tail] = breakWord(ctx, word, maxWidth);
      lines.push(head);
      if (tail.length > 0) words[i] = tail.join('');
      else i++;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (i < words.length) {
    const remaining = words.slice(i).join(' ');
    const last = lines.length - 1;
    lines[last] = ellipsizeToWidth(ctx, `${lines[last]} ${remaining}`, maxWidth);
  }
  return lines;
}
