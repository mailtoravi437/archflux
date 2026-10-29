/**
 * R1-E02-T03: notation geometry for the shape display style (UI_REVAMP_SPEC §5A.2, Elements.dc.html).
 * One outline builder per `BaseShape`, plus the inner details (cylinder front cap, queue bars, log
 * segments, browser chrome, note fold) and the rectangle the name/icon sit in.
 * Pure: path calls on the context the caller passes in; no React, no store, no DOM.
 */
import type { BaseShape } from '../notation';

export interface ShapeBox { x: number; y: number; w: number; h: number; }

/** Shapes drawn as the rounded card (Elements.dc.html draws them as cards with a kind colour). */
export function isCardFamily(shape: BaseShape): boolean {
  switch (shape) {
    case 'card':
    case 'card-dashed':
    case 'card-clock':
    case 'card-pulse':
    case 'card-chevron':
    case 'card-lambda':
    // The CDN is a card on the Elements artboard; the `globe` outline stays available to pathFor.
    case 'globe':
      return true;
    default:
      return false;
  }
}

const TWO_PI = Math.PI * 2;
/** Inset so a 1.5 px centred stroke stays inside the node box (artboard paths start at 1). */
const INSET = 0.75;

/** Cylinder cap radius: 13 of 104 (Elements.dc.html relational DB). */
export const CAP_RATIO = 13 / 104;
/** Pipe end-cap radius: 15 of 210 wide. */
const PIPE_CAP_RATIO = 15 / 210;
/** Bucket top cap: 11 of 100 tall; the base is 14/170 narrower on each side. */
const BUCKET_CAP_RATIO = 11 / 100;
const BUCKET_TAPER_RATIO = 14 / 170;
const FOLD = 14;
const BROWSER_BAR = 16;

function capRy(h: number): number {
  return Math.max(2, h * CAP_RATIO);
}

function pipeRx(w: number, h: number): number {
  return Math.min(Math.max(8, w * PIPE_CAP_RATIO), w / 4, h);
}

const isCylinder = (s: BaseShape) => s === 'cylinder' || s === 'cylinder-braces' || s === 'cylinder-bolt' || s === 'cylinder-search';
const isPipe = (s: BaseShape) => s === 'pipe' || s === 'pipe-log';

/** Person geometry: head circle radius `h × 0.18`, body overlapping the head by 6. */
export function personParts(box: ShapeBox): { head: { cx: number; cy: number; r: number }; body: ShapeBox; radii: number[] } {
  const r = box.h * 0.18;
  const bodyTop = box.y + 2 * r - 6;
  const bodyH = box.y + box.h - bodyTop;
  const top = Math.min(28, bodyH / 2, box.w / 2);
  return {
    head: { cx: box.x + box.w / 2, cy: box.y + r + INSET, r: r - INSET },
    body: { x: box.x + INSET, y: bodyTop, w: box.w - 2 * INSET, h: bodyH - INSET },
    radii: [top, top, Math.min(10, top), Math.min(10, top)],
  };
}

/**
 * Silhouette of a base shape inside `x, y, w, h` as a path builder. Adds closed sub-paths to the
 * current path (the caller fills and strokes it); it does not begin or stroke the path itself.
 * Card-family shapes give the rounded rectangle.
 */
export function pathFor(shape: BaseShape, x: number, y: number, w: number, h: number): (ctx: CanvasRenderingContext2D) => void {
  const l = x + INSET;
  const t = y + INSET;
  const r = x + w - INSET;
  const b = y + h - INSET;
  const cx = x + w / 2;
  if (isCylinder(shape)) {
    const ry = capRy(h);
    const rx = (r - l) / 2;
    return (ctx) => {
      ctx.moveTo(l, t + ry);
      ctx.ellipse(cx, t + ry, rx, ry, 0, Math.PI, TWO_PI);
      ctx.lineTo(r, b - ry);
      ctx.ellipse(cx, b - ry, rx, ry, 0, 0, Math.PI);
      ctx.closePath();
    };
  }
  if (isPipe(shape)) {
    const rx = pipeRx(w, h);
    const ry = (b - t) / 2;
    const cy = t + ry;
    return (ctx) => {
      ctx.moveTo(l + rx, t);
      ctx.lineTo(r - rx, t);
      ctx.ellipse(r - rx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(l + rx, b);
      ctx.ellipse(l + rx, cy, rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
    };
  }
  if (shape === 'bucket') {
    const ry = h * BUCKET_CAP_RATIO;
    const taper = w * BUCKET_TAPER_RATIO;
    const baseRy = ry * 0.9;
    return (ctx) => {
      const rx = (r - l) / 2;
      ctx.moveTo(l, t + ry);
      ctx.ellipse(cx, t + ry, rx, ry, 0, Math.PI, TWO_PI);
      ctx.lineTo(r - taper, b - baseRy);
      ctx.ellipse(cx, b - baseRy, rx - taper, baseRy, 0, 0, Math.PI);
      ctx.closePath();
    };
  }
  if (shape === 'person') {
    const { head, body, radii } = personParts({ x, y, w, h });
    return (ctx) => {
      ctx.moveTo(head.cx + head.r, head.cy);
      ctx.arc(head.cx, head.cy, head.r, 0, TWO_PI);
      ctx.roundRect(body.x, body.y, body.w, body.h, radii);
    };
  }
  if (shape === 'note') {
    return (ctx) => {
      ctx.moveTo(l, t);
      ctx.lineTo(r - FOLD, t);
      ctx.lineTo(r, t + FOLD);
      ctx.lineTo(r, b);
      ctx.lineTo(l, b);
      ctx.closePath();
    };
  }
  if (shape === 'browser') {
    return (ctx) => ctx.roundRect(l, t, r - l, b - t, 8);
  }
  return (ctx) => ctx.roundRect(l, t, r - l, b - t, 8);
}

/** Circle with two meridians (the `globe` outline), centred in the box. */
export function drawGlobeOutline(ctx: CanvasRenderingContext2D, box: ShapeBox): void {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = Math.min(box.w, box.h) / 2 - INSET;
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.moveTo(cx, cy - r);
  ctx.ellipse(cx, cy, r * 0.42, r, 0, -Math.PI / 2, (3 * Math.PI) / 2);
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
}

/** Soft accent used for the decorative bars/segments of queue and stream (Elements.dc.html). */
const DECOR: Partial<Record<BaseShape, string>> = { pipe: '#F9A8D4', 'pipe-log': '#DDD6FE' };

export interface ShapePaint {
  fill: string;
  stroke: string;
  lineWidth: number;
  dash: number[];
  /** Fill of the browser title bar. */
  chrome: string;
  /** Fold fill of a note. */
  fold: string;
}

/**
 * Fills and strokes `shape` in `box`: silhouette first, then the inner details (cylinder front cap,
 * pipe front cap, queue bars, log segments, bucket front rim, browser title bar and dots, note fold).
 */
export function paintShape(ctx: CanvasRenderingContext2D, shape: BaseShape, box: ShapeBox, paint: ShapePaint): void {
  const { x, y, w, h } = box;
  ctx.beginPath();
  pathFor(shape, x, y, w, h)(ctx);
  ctx.fillStyle = paint.fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = paint.stroke;
  ctx.lineWidth = paint.lineWidth;
  ctx.setLineDash(paint.dash);
  ctx.stroke();
  ctx.setLineDash([]);

  const l = x + INSET;
  const r = x + w - INSET;
  const t = y + INSET;
  const b = y + h - INSET;
  const cx = x + w / 2;
  if (isCylinder(shape) || shape === 'bucket') {
    // Front half of the top cap.
    const ry = shape === 'bucket' ? h * BUCKET_CAP_RATIO : capRy(h);
    ctx.beginPath();
    ctx.ellipse(cx, t + ry, (r - l) / 2, ry, 0, 0, Math.PI);
    ctx.stroke();
    return;
  }
  if (isPipe(shape)) {
    const rx = pipeRx(w, h);
    const ry = (b - t) / 2;
    const cy = t + ry;
    const decor = DECOR[shape] ?? paint.stroke;
    ctx.save();
    ctx.strokeStyle = decor;
    if (shape === 'pipe') {
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const fx of [120 / 210, 136 / 210, 152 / 210]) {
        ctx.moveTo(x + w * fx, y + h * (24 / 76));
        ctx.lineTo(x + w * fx, y + h * (52 / 76));
      }
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const fx of [112 / 210, 128 / 210, 144 / 210, 160 / 210, 176 / 210]) {
        ctx.moveTo(x + w * fx, t);
        ctx.lineTo(x + w * fx, b);
      }
      ctx.stroke();
    }
    ctx.restore();
    // Front face of the right end cap.
    ctx.beginPath();
    ctx.ellipse(r - rx, cy, rx, ry, 0, -Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fillStyle = paint.fill;
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (shape === 'person') {
    // Body overlaps the head: repaint the body on top, then outline both.
    const { body, radii } = personParts(box);
    ctx.beginPath();
    ctx.roundRect(body.x, body.y, body.w, body.h, radii);
    ctx.fillStyle = paint.fill;
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (shape === 'browser') {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(l, t, r - l, b - t, 8);
    ctx.clip();
    ctx.fillStyle = paint.chrome;
    ctx.fillRect(l, t, r - l, BROWSER_BAR);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l, t + BROWSER_BAR);
    ctx.lineTo(r, t + BROWSER_BAR);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#94A3B8';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(l + 8.5 + i * 9, t + BROWSER_BAR / 2, 2.5, 0, TWO_PI);
      ctx.fill();
    }
    return;
  }
  if (shape === 'note') {
    ctx.beginPath();
    ctx.moveTo(r - FOLD, t);
    ctx.lineTo(r - FOLD, t + FOLD);
    ctx.lineTo(r, t + FOLD);
    ctx.closePath();
    ctx.fillStyle = paint.fold;
    ctx.fill();
    ctx.stroke();
  }
}

export interface ShapeContent {
  /** Rectangle the icon and text group sits in. */
  rect: ShapeBox;
  align: 'left' | 'center';
  vAlign: 'middle' | 'top';
  /** Whether the shape shows an icon slot beside the name. */
  icon: boolean;
}

/** Where the icon + name + kind line go inside each geometry (Elements.dc.html offsets). */
export function shapeContent(shape: BaseShape, box: ShapeBox): ShapeContent {
  const { x, y, w, h } = box;
  if (isCylinder(shape)) {
    // Below the front rim of the cap (artboard: content starts 34 of 104 down).
    const ry = capRy(h);
    const top = 2 * ry + 8;
    return { rect: { x: x + 12, y: y + top, w: w - 24, h: Math.max(0, h - top - ry) }, align: 'left', vAlign: 'top', icon: true };
  }
  if (isPipe(shape)) {
    // Queue bars / log segments sit behind the text, as on the artboard; stop before the end cap.
    const left = 14;
    return { rect: { x: x + left, y: y + 4, w: Math.max(0, w - left - pipeRx(w, h) - 8), h: h - 8 }, align: 'left', vAlign: 'middle', icon: true };
  }
  if (shape === 'bucket') {
    const ry = h * BUCKET_CAP_RATIO;
    const top = 2 * ry + 10;
    return { rect: { x: x + w * 0.13, y: y + top, w: w * 0.74, h: Math.max(0, h - top - ry) }, align: 'left', vAlign: 'top', icon: true };
  }
  if (shape === 'person') {
    const { body } = personParts(box);
    return { rect: { x: body.x + 8, y: body.y + 8, w: body.w - 16, h: body.h - 12 }, align: 'center', vAlign: 'top', icon: false };
  }
  if (shape === 'browser') {
    return { rect: { x: x + 10, y: y + BROWSER_BAR + 8, w: w - 20, h: h - BROWSER_BAR - 12 }, align: 'left', vAlign: 'top', icon: false };
  }
  if (shape === 'note') {
    return { rect: { x: x + 10, y: y + 10, w: w - 20, h: h - 16 }, align: 'left', vAlign: 'top', icon: false };
  }
  return { rect: { x: x + 12, y: y + 12, w: w - 24, h: h - 18 }, align: 'left', vAlign: 'top', icon: true };
}
