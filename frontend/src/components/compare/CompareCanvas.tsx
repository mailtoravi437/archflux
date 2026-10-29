import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeIconSource } from '../../canvas/render/types';
import { drawEdgeLabelPass, drawEdgePass } from '../../canvas/render/edges';
import { drawNodePass } from '../../canvas/render/nodePass';
import { edgePoints } from '../../lib/canvasGeometry';
import { sceneBounds, type CompareScene } from '../../state/compare';

/**
 * Read-only canvas for compare mode. Draws the shared render passes with `NodeStatus.diff`:
 * added green, changed amber, removed ghosts red dashed at 60 % alpha. Drag to pan.
 * The pan is exposed as data attributes so it can be asserted without pixels.
 */
const GREEN = '#15803D';
const RED = '#B91C1C';

function useIconSource(onLoad: () => void): NodeIconSource {
  const cache = useRef(new Map<string, HTMLImageElement>());
  return useMemo<NodeIconSource>(() => ({
    get: (src) => cache.current.get(src) ?? null,
    ensure: (src) => {
      if (cache.current.has(src) || typeof Image === 'undefined') return;
      const img = new Image();
      img.onload = onLoad;
      img.onerror = () => { cache.current.delete(src); };
      cache.current.set(src, img);
      img.src = src;
    },
  }), [onLoad]);
}

export interface CompareCanvasProps {
  scene: CompareScene;
  /** Id of the node highlighted by the change list. */
  focusId: string | null;
  pan: { x: number; y: number } | null;
  onPan: (p: { x: number; y: number }) => void;
  isDark: boolean;
  onViewport?: (v: { w: number; h: number }) => void;
}

export const COMPARE_ZOOM = 1;

export default function CompareCanvas({ scene, focusId, pan, onPan, isDark, onViewport }: CompareCanvasProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [tick, setTick] = useState(0);
  const icons = useIconSource(() => setTick((t) => t + 1));
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => { ro.disconnect?.(); };
  }, []);

  useEffect(() => { onViewport?.(size); }, [size, onViewport]);

  // First fit: centre the content once the viewport is known.
  const effectivePan = useMemo(() => {
    if (pan) return pan;
    const b = sceneBounds(scene);
    if (!b) return { x: 40, y: 40 };
    return { x: Math.round(size.w / 2 - ((b.minX + b.maxX) / 2) * COMPARE_ZOOM), y: Math.round(size.h / 2 - ((b.minY + b.maxY) / 2) * COMPARE_ZOOM) };
  }, [pan, scene, size]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el && typeof el.getContext === 'function' ? el.getContext('2d') : null;
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size.w * dpr;
    el.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(effectivePan.x, effectivePan.y);
    ctx.scale(COMPARE_ZOOM, COMPARE_ZOOM);
    const nodes = scene.nodes.map((n) => n.node);
    const edgeFlags = { isDark, selected: false, orthogonal: true, curve: 'orthogonal' as const, zoom: COMPARE_ZOOM };
    for (const { edge, diff } of scene.edges) {
      if (diff === 'removed') {
        const pts = edgePoints(edge, nodes, true, 'orthogonal');
        if (!pts) continue;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = RED;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
        continue;
      }
      drawEdgePass(ctx, edge, nodes, { ...edgeFlags, pill: false });
      if (diff === 'added') {
        const pts = edgePoints(edge, nodes, true, 'orthogonal');
        if (pts) {
          ctx.save();
          ctx.strokeStyle = GREEN;
          ctx.lineWidth = 2;
          ctx.beginPath();
          pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    for (const { node, status } of scene.nodes) {
      drawNodePass(ctx, node, icons, {
        isDark,
        selected: focusId === node.id,
        pending: false,
        showPorts: false,
        zoom: COMPARE_ZOOM,
        status,
      });
    }
    for (const m of scene.moves) {
      ctx.save();
      ctx.strokeStyle = '#4F46E5';
      ctx.fillStyle = '#4F46E5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.from.x, m.from.y);
      ctx.lineTo(m.to.x, m.to.y);
      ctx.stroke();
      const a = Math.atan2(m.to.y - m.from.y, m.to.x - m.from.x);
      ctx.beginPath();
      ctx.moveTo(m.to.x, m.to.y);
      ctx.lineTo(m.to.x - 8 * Math.cos(a - 0.4), m.to.y - 8 * Math.sin(a - 0.4));
      ctx.lineTo(m.to.x - 8 * Math.cos(a + 0.4), m.to.y - 8 * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const { edge, diff } of scene.edges) {
      if (diff !== 'removed') drawEdgeLabelPass(ctx, edge, nodes, edgeFlags);
    }
    ctx.restore();
  }, [scene, size, effectivePan, isDark, focusId, icons, tick]);

  return (
    <div
      ref={wrap}
      data-testid="compare-canvas"
      data-pan-x={effectivePan.x}
      data-pan-y={effectivePan.y}
      data-focus={focusId ?? ''}
      style={{ position: 'absolute', inset: 0, backgroundColor: '#FFFFFF', backgroundImage: 'radial-gradient(#DADDE3 1px, transparent 1px)', backgroundSize: '20px 20px', cursor: 'grab', overflow: 'hidden' }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: effectivePan.x, py: effectivePan.y }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) onPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
    >
      <canvas ref={canvas} role="img" aria-label="Read-only comparison of two versions" style={{ width: size.w, height: size.h, display: 'block' }} />
    </div>
  );
}
