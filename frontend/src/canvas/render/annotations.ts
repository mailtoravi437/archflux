/** Annotation render passes: freehand ink, free text, review-thread pins. Pure: no React, no store. */
import type { FreeText } from '../../types';

/** One freehand stroke (single point renders as a round dot). */
export function drawInkPass(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  width: number,
  selected: boolean,
): void {
  if (pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = selected ? '#4F46E5' : color;
  ctx.fillStyle = selected ? '#4F46E5' : color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (selected) {
    ctx.shadowColor = '#4F46E5';
    ctx.shadowBlur = 8;
  }
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Free-standing text label (multi-line, background pill, selection glow). */
export function drawFreeTextPass(
  ctx: CanvasRenderingContext2D,
  t: FreeText,
  selected: boolean,
  isDark: boolean,
): void {
  const lines = t.text.split('\n');
  const lh = t.fontSize * 1.3;
  ctx.save();
  const fam = t.fontFamily ?? 'Caveat';
  const generic = fam === 'Fira Code' ? 'monospace' : fam === 'Plus Jakarta Sans' ? 'sans-serif' : 'cursive';
  ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '600'} ${t.fontSize}px '${fam}', ${generic}`;
  // Background pill behind the whole block.
  if (t.fill && t.fill !== 'transparent') {
    let maxW = 0;
    lines.forEach((line) => { maxW = Math.max(maxW, ctx.measureText(line).width); });
    const pad = 8;
    const bw = maxW + pad * 2;
    const bh = lines.length * lh + pad;
    const bx = t.x - pad;
    const by = t.y - t.fontSize - pad / 2;
    ctx.fillStyle = t.fill;
    ctx.beginPath();
    const rr = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    if (typeof rr.roundRect === 'function') rr.roundRect(bx, by, bw, bh, 8);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    if (t.border) {
      ctx.strokeStyle = selected ? '#4F46E5' : t.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.fillStyle = selected ? '#4F46E5' : t.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (selected) {
    ctx.shadowColor = '#4F46E5';
    ctx.shadowBlur = 8;
  }
  lines.forEach((line, i) => {
    ctx.fillText(line, t.x, t.y + i * lh);
  });
  ctx.restore();
  void isDark;
}

/** Review-thread pin at a node's top-right (amber open / green resolved). */
export function drawThreadPinPass(
  ctx: CanvasRenderingContext2D,
  node: { x: number; y: number; w: number; h: number },
  opts: { resolved: boolean; isDark: boolean },
): void {
  const cx = node.x + node.w + 6;
  const cy = node.y - 6;
  ctx.save();
  ctx.fillStyle = opts.resolved ? '#16A34A' : '#F59E0B';
  ctx.strokeStyle = opts.isDark ? '#1F2937' : '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "bold 10px 'Patrick Hand', cursive";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.resolved ? '✓' : '!', cx, cy + 0.5);
  ctx.restore();
}
