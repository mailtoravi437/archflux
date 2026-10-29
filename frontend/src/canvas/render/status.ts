/**
 * R1-E02-T08: element state rendering shared by the card, shape and icon styles
 * (UI_REVAMP_SPEC §5A.5, States.dc.html). Pure: draws on the context it is given.
 */
import type { NodeStatus } from './types';

interface Box { x: number; y: number; w: number; h: number; }

const ACCENT = '#4F46E5';
const ACCENT_DARK = '#8B83FF';
const AMBER = '#D97706';
const RED = '#B91C1C';
const GREEN = '#15803D';
const PILL_FONT = "700 10px 'Inter', -apple-system, sans-serif";

/** How the states change the box itself: fill, border colour and dash, opacity and a struck-through name. */
export interface StatusLook {
  fill: string | null;
  stroke: string | null;
  dashed: boolean;
  alpha: number;
  strike: boolean;
}

/**
 * Diff and proposal states recolour the box (States.dc.html): changed = amber fill, removed = red
 * dashed at 60 % with a struck name, added and proposed = green dashed. No status leaves it as is.
 */
export function statusLook(status: NodeStatus | undefined, isDark = false): StatusLook {
  const plain: StatusLook = { fill: null, stroke: null, dashed: false, alpha: 1, strike: false };
  if (!status) return plain;
  if (status.diff === 'removed') return { fill: isDark ? '#3A1D1D' : '#FEF2F2', stroke: RED, dashed: true, alpha: 0.6, strike: true };
  if (status.diff === 'changed') return { fill: isDark ? '#3A2F14' : '#FEF3C7', stroke: AMBER, dashed: false, alpha: 1, strike: false };
  if (status.diff === 'added' || status.proposed) return { fill: isDark ? '#12301F' : '#F0FDF4', stroke: GREEN, dashed: true, alpha: 1, strike: false };
  return plain;
}

/** Number of marks in the top-right status slot, so the name row can leave room for them. */
export function statusMarkCount(status: NodeStatus | undefined): number {
  if (!status) return 0;
  return (status.drift ? 1 : 0) + (status.lint ? 1 : 0) + ((status.comments ?? 0) > 0 ? 1 : 0) + (status.locked ? 1 : 0);
}

/** Width reserved for the status slot (marks are at most 16 px wide with a 4 px gap). */
export function statusSlotWidth(status: NodeStatus | undefined): number {
  const n = statusMarkCount(status);
  return n === 0 ? 0 : n * 20;
}

/**
 * Top-right status slot, drawn right to left from `right` on the row centred at `cy`: lock,
 * comment-count pin, lint dot, drift dot.
 */
export function drawStatusMarks(ctx: CanvasRenderingContext2D, status: NodeStatus | undefined, right: number, cy: number, isDark: boolean): void {
  if (!status || statusMarkCount(status) === 0) return;
  ctx.save();
  ctx.setLineDash([]);
  let x = right;
  if (status.locked) {
    // Lock glyph on a grey pill: body plus shackle.
    ctx.fillStyle = isDark ? '#2D3340' : '#F1F2F5';
    ctx.beginPath();
    ctx.roundRect(x - 16, cy - 8, 16, 16, 4);
    ctx.fill();
    ctx.strokeStyle = isDark ? '#D1D5DB' : '#3D4553';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 12, cy - 1, 8, 6, 1.5);
    ctx.moveTo(x - 10.5, cy - 1);
    ctx.lineTo(x - 10.5, cy - 3);
    ctx.arc(x - 8, cy - 3, 2.5, Math.PI, 0);
    ctx.lineTo(x - 5.5, cy - 1);
    ctx.stroke();
    x -= 20;
  }
  const count = status.comments ?? 0;
  if (count > 0) {
    ctx.fillStyle = isDark ? ACCENT_DARK : ACCENT;
    ctx.beginPath();
    ctx.arc(x - 8, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = PILL_FONT;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count > 9 ? '9+' : String(count), x - 8, cy + 0.5);
    x -= 20;
  }
  if (status.lint) {
    ctx.fillStyle = status.lint === 'error' ? RED : AMBER;
    ctx.beginPath();
    ctx.arc(x - 4, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    x -= 12;
  }
  if (status.drift) {
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(x - 5, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** "Drift" text, right-aligned at (`right`, `cy`): card style only (States.dc.html "Amber dot + label"). */
export function drawDriftLabel(ctx: CanvasRenderingContext2D, right: number, cy: number): void {
  ctx.save();
  ctx.font = PILL_FONT;
  ctx.fillStyle = '#92400E';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('Drift', right, cy);
  ctx.restore();
}

/** "Proposed" chip straddling the top edge at the right (States.dc.html: #DCF3E6 / #047857). */
export function drawProposedChip(ctx: CanvasRenderingContext2D, box: Box, isDark: boolean): void {
  const label = 'Proposed';
  ctx.save();
  ctx.font = PILL_FONT;
  const w = ctx.measureText(label).width + 12;
  const x = box.x + box.w - 8 - w;
  const y = box.y - 8;
  ctx.fillStyle = isDark ? '#0F3D2A' : '#DCF3E6';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = isDark ? '#6EE7B7' : '#047857';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + 8.5);
  ctx.restore();
}

/** Keyboard focus-visible ring: 2 px accent, offset 3 px outside the box (States.dc.html). */
export function drawFocusRing(ctx: CanvasRenderingContext2D, box: Box, radius: number, isDark: boolean): void {
  const off = 3 + 1;
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = isDark ? ACCENT_DARK : ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(box.x - off, box.y - off, box.w + 2 * off, box.h + 2 * off, radius + off);
  ctx.stroke();
  ctx.restore();
}

/** Strike-through line across `width` starting at `x`, at the text row centre `y`. */
export function drawStrike(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string, centered = false): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const x0 = centered ? x - width / 2 : x;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + width, y);
  ctx.stroke();
  ctx.restore();
}
