import { useMemo } from 'react';
import type { DiagramDoc } from '../../types';
import { minimapTransform, worldToMini } from '../../lib/canvasGeometry';

const TW = 240;
const TH = 132;
const PAD = 18;
const MAX_NODES = 60;

/**
 * Card thumbnail (Library.dc.html): the doc's real nodes on its first page as
 * small white rects with a 1.5 px kind-colour border, joined by grey routes.
 * Uses the minimap transform so the preview matches the canvas overview.
 * An empty doc draws an empty frame; nothing is invented.
 */
export function DocThumbnail({ doc }: { doc: Pick<DiagramDoc, 'nodes' | 'edges' | 'pages'> }) {
  const shapes = useMemo(() => {
    const pages = doc.pages && doc.pages.length > 0 ? [...doc.pages].sort((a, b) => a.order - b.order) : [];
    const firstPage = pages[0]?.id;
    const nodes = doc.nodes
      .filter((n) => !firstPage || !n.pageId || n.pageId === firstPage)
      .slice(0, MAX_NODES);
    const t = minimapTransform(nodes, TW, TH, PAD);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const rects = nodes.map((n) => {
      const p = worldToMini(n.x, n.y, t);
      return { id: n.id, x: p.x, y: p.y, w: Math.max(4, n.w * t.s), h: Math.max(3, n.h * t.s), stroke: n.stroke || '#8A93A3' };
    });
    const lines = doc.edges.flatMap((e) => {
      const a = byId.get(e.from);
      const b = e.to ? byId.get(e.to) : undefined;
      if (!a || !b) return [];
      const p1 = worldToMini(a.x + a.w / 2, a.y + a.h / 2, t);
      const p2 = worldToMini(b.x + b.w / 2, b.y + b.h / 2, t);
      return [{ id: e.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }];
    });
    return { rects, lines };
  }, [doc.nodes, doc.edges, doc.pages]);

  return (
    <div className="libpage-card__thumb" data-testid="libpage-thumb" aria-hidden="true">
      <svg viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" focusable="false">
        {shapes.lines.map((l) => (
          <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#8A93A3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {shapes.rects.map((r) => (
          <rect key={r.id} data-thumb-node="" x={r.x} y={r.y} width={r.w} height={r.h} rx={3} style={{ fill: 'var(--bg-panel)' }} stroke={r.stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
}
