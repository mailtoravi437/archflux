/**
 * CanvasEngine unit tests — subset layer mounting, self-dirtying render keys,
 * coordinate math, and compositeWorld. jsdom has no 2D context, so a small
 * explicit stub is registered for the duration of these tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasEngine, type CanvasScene } from '../canvas/CanvasEngine';
import type { ArchNode } from '../types';

const emptyScene = (): CanvasScene => ({
  nodes: [],
  edges: [],
  strokes: [],
  texts: [],
  selectedIds: [],
  selectedEdgeId: null,
  pendingFrom: null,
  showPorts: false,
  pendingInk: null,
  cursors: [],
  alignGuides: [],
});

function makeEngine(): CanvasEngine {
  return new CanvasEngine({
    viewport: { x: 0, y: 0, zoom: 1 },
    isDark: false,
    gridStyle: 'none',
    connectorCurve: 'orthogonal',
    orthogonal: true,
    devicePixelRatio: 1,
  });
}

/** Stub 2D context that records clearRect calls (the proxy in jsdom lacks one). */
function stubContext(calls: string[]): CanvasRenderingContext2D {
  const noop = () => undefined;
  const ctx = {
    clearRect: () => { calls.push('clearRect'); },
    save: noop,
    restore: noop,
    setTransform: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    drawImage: noop,
    setLineDash: noop,
    measureText: () => ({ width: 40 }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe('CanvasEngine', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    document.body.innerHTML = '';
  });

  it('mounts only the requested subset of layers', () => {
    const calls: string[] = [];
    const getContextOrig = HTMLCanvasElement.prototype.getContext;
    const ctx = stubContext(calls);
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
      return kind === '2d' ? ctx : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
    restore = () => { HTMLCanvasElement.prototype.getContext = getContextOrig; };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const engine = makeEngine();
    engine.mount(host, ['decorations']);
    expect(engine.layerCanvas('decorations')).not.toBeNull();
    expect(engine.layerCanvas('grid')).toBeUndefined();
    expect(engine.layerCanvas('content')).toBeUndefined();
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(engine.layerCanvas('decorations')!.dataset.layer).toBe('decorations');
    expect(engine.size.w).toBe(host.clientWidth);
    engine.destroy();
    expect(engine.layerCanvas('decorations')).toBeUndefined();
  });

  it('skips repaints when render inputs are unchanged (self-dirty keys)', () => {
    const calls: string[] = [];
    const getContextOrig = HTMLCanvasElement.prototype.getContext;
    const ctx = stubContext(calls);
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
      return kind === '2d' ? ctx : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
    restore = () => { HTMLCanvasElement.prototype.getContext = getContextOrig; };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const engine = makeEngine();
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    engine.mount(host2, ['decorations']);

    const cursor = { userId: 'u1', userName: 'Ada', userColor: '#ff0000', x: 10, y: 10 };
    // Mount leaves the layer dirty → first render paints once…
    engine.render({ ...emptyScene(), cursors: [cursor] });
    const clearCountAfterFirst = calls.filter((c) => c === 'clearRect').length;
    expect(clearCountAfterFirst).toBeGreaterThan(0);
    // …then equal inputs repaint nothing…
    const countBefore = calls.length;
    engine.render({ ...emptyScene(), cursors: [cursor] });
    expect(calls.length).toBe(countBefore);
    // …and moving the cursor dirties exactly one repaint.
    engine.render({ ...emptyScene(), cursors: [{ ...cursor, x: 40 }] });
    expect(calls.length).toBe(countBefore + 1);
  });

  it('round-trips viewport transforms', () => {
    const engine = makeEngine();
    engine.setViewport({ x: 100, y: -40, zoom: 2 });
    expect(engine.worldToScreen(10, 5)).toEqual({ x: 120, y: -30 });
    expect(engine.screenToWorld(120, -30)).toEqual({ x: 10, y: 5 });
    const rect = engine.viewportWorldRect();
    expect(rect.x).toBeCloseTo(-50);
    expect(rect.y).toBeCloseTo(20);
  });

  it('compositeWorld produces an output canvas of the requested scale', () => {
    const calls: string[] = [];
    const getContextOrig = HTMLCanvasElement.prototype.getContext;
    const ctx = stubContext(calls);
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
      return kind === '2d' ? ctx : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
    restore = () => { HTMLCanvasElement.prototype.getContext = getContextOrig; };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const engine = makeEngine();
    engine.mount(host);
    const out = engine.compositeWorld({ x: 0, y: 0, w: 100, h: 50 }, 2, '#FFFFFF');
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
  });
});
