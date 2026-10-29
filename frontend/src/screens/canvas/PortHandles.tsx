import { nodePorts, PORT_SIZE, type GeometryNode, type PortSide } from '../../lib/canvasGeometry';

export interface PortHandlesProps {
  /** Node whose four ports show (the hovered node, or the drop target during a connect drag). */
  node: GeometryNode | null;
  zoom: number;
  pan: { x: number; y: number };
  /** Port to highlight (the one a release would connect to). */
  activePort?: PortSide | null;
  /** Live connect drag: world points of the preview line. */
  preview?: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
}

/**
 * R1-E04-T05: the four 8 px port dots at the mid-edges of the hovered node, plus the preview line
 * while a connection is dragged. Purely visual (`pointer-events: none`): the canvas pointer
 * handlers do the hit testing with `hitPort`, so the dots never steal events.
 */
export function PortHandles({ node, zoom, pan, activePort = null, preview = null }: PortHandlesProps) {
  const sx = (x: number) => x * zoom + pan.x;
  const sy = (y: number) => y * zoom + pan.y;
  return (
    <div aria-hidden="true" data-testid="port-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
      {preview && (
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <line
            data-testid="connect-preview"
            x1={sx(preview.from.x)}
            y1={sy(preview.from.y)}
            x2={sx(preview.to.x)}
            y2={sy(preview.to.y)}
            stroke="var(--accent, #2563EB)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </svg>
      )}
      {node &&
        nodePorts(node).map((p) => (
          <span
            key={p.side}
            data-port={p.side}
            data-active={activePort === p.side ? 'true' : undefined}
            style={{
              position: 'absolute',
              left: sx(p.x) - PORT_SIZE / 2,
              top: sy(p.y) - PORT_SIZE / 2,
              width: PORT_SIZE,
              height: PORT_SIZE,
              borderRadius: '50%',
              boxSizing: 'border-box',
              background: activePort === p.side ? 'var(--accent, #2563EB)' : 'var(--bg-panel, #fff)',
              border: '2px solid var(--accent, #2563EB)',
            }}
          />
        ))}
    </div>
  );
}
