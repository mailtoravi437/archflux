import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { pageView } from '../../lib/pageView';
import { useDiagram } from '../../state/useDiagram';
import { minimapTransform, miniToWorld, worldToMini } from '../../lib/canvasGeometry';
import { notationFor } from '../../canvas/notation';

export interface MinimapProps {
  open: boolean;
  /** The main canvas viewport, used to size the view rectangle and recentre. */
  viewportRef: RefObject<HTMLDivElement | null>;
}

/** Inner drawing area: 176×108 frame minus a 1 px border and 8 px padding (Main.dc.html L160). */
const MW = 158;
const MH = 90;

/** Mix a #RRGGBB colour toward `base` by `t` (0.5 ≈ the artboard's 50 % kind tints). */
function tint(hex: string, base: [number, number, number], t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c, i) => Math.round(c + (base[i] - c) * t));
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

/**
 * Minimap overview above the View toolbar (R1-E14-T02, Main.dc.html L159–L170): nodes as kind-tinted
 * rects on a #F6F7F9 field, the current view as a 1.5 px accent rectangle. Click recentres.
 * The show/hide toggle lives in the View toolbar.
 */
export function Minimap({ open, viewportRef }: MinimapProps) {
  const { nodes: allNodes, edges, strokes, texts, pages, layers, activePageId, theme, zoom, pan, setPan } = useDiagram();
  // Only the active page's visible layers (R1-E03-T04).
  const nodes = useMemo(() => pageView({ nodes: allNodes, edges, strokes, texts, pages, layers }, activePageId).nodes, [allNodes, edges, strokes, texts, pages, layers, activePageId]);
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Minimap click-to-navigate: center the main canvas on the clicked world point.
  const onMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mc = miniCanvasRef.current;
    const v = viewportRef.current;
    if (!mc || !v) return;
    const r = mc.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const mx = ((e.clientX - r.left) / r.width) * MW;
    const my = ((e.clientY - r.top) / r.height) * MH;
    const t = minimapTransform(nodes, MW, MH);
    const wpt = miniToWorld(mx, my, t);
    setPan({ x: v.clientWidth / 2 - wpt.x * zoom, y: v.clientHeight / 2 - wpt.y * zoom });
  };

  useEffect(() => {
    if (!open) return;
    const mc = miniCanvasRef.current;
    if (!mc) return;
    const mctx = mc.getContext('2d');
    if (!mctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (mc.width !== Math.round(MW * dpr)) {
      mc.width = Math.round(MW * dpr);
      mc.height = Math.round(MH * dpr);
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const isDark = theme === 'dark';
    const base: [number, number, number] = isDark ? [25, 29, 37] : [255, 255, 255];
    const t = minimapTransform(nodes, MW, MH);
    mctx.clearRect(0, 0, MW, MH);
    nodes.forEach((n) => {
      const p = worldToMini(n.x, n.y, t);
      mctx.fillStyle = tint(n.stroke || notationFor(n.kind).color, base, 0.5);
      mctx.beginPath();
      mctx.roundRect(p.x, p.y, Math.max(3, n.w * t.s), Math.max(3, n.h * t.s), 2);
      mctx.fill();
    });
    const v = viewportRef.current;
    if (v && zoom > 0 && nodes.length > 0) {
      const tl = worldToMini((0 - pan.x) / zoom, (0 - pan.y) / zoom, t);
      mctx.strokeStyle = isDark ? '#8B83FF' : '#4F46E5';
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.roundRect(tl.x, tl.y, (v.clientWidth / zoom) * t.s, (v.clientHeight / zoom) * t.s, 3);
      mctx.stroke();
    }
    // viewportRef is a stable ref object; listing it changes nothing.
  }, [nodes, theme, open, zoom, pan, viewportRef]);

  if (!open) return null;
  return (
    <div className="minimap-wrap" role="img" aria-label="Minimap overview">
      <canvas
        ref={miniCanvasRef}
        id="minimapCanvas"
        width={MW}
        height={MH}
        onClick={onMinimapClick}
        className="minimap-field"
        aria-hidden="true"
      />
    </div>
  );
}
