import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';
import { edgePoints, nearestPort, nodePorts, portPoint } from '../lib/canvasGeometry';

// R1-E04-T05: four ports on the hovered node; dragging from a port connects to the nearest port of the target.

function stub2d() {
  const ctx = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'getImageData') return () => ({ data: [] });
        if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => ({ addColorStop: () => {} });
        if (typeof p === 'string') return () => undefined;
        return undefined;
      },
      set: () => true,
    },
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
}

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  const v = useDiagram();
  useEffect(() => {
    latest.v = v;
  });
  return null;
}
const api = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

function setupCanvas() {
  latest.v = null;
  const view = render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
  if (api().nodes.length === 0) act(() => seedSampleDiagram(api()));
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('canvas element missing');
  return { ...view, canvas };
}

// Default zoom 1, pan (50,40), zero-size jsdom rect: client = world + pan.
const hover = (canvas: HTMLCanvasElement, x: number, y: number) =>
  act(() => {
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  });
const down = (canvas: HTMLCanvasElement, x: number, y: number) =>
  act(() => {
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true }));
  });
const move = (x: number, y: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, button: 0 }));
  });
const up = (x: number, y: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, button: 0 }));
  });

beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

const node = (id: string) => {
  const n = api().nodes.find((m) => m.id === id);
  if (!n) throw new Error(`fixture missing ${id}`);
  return n;
};

describe('ports', () => {
  it('hover shows 4 ports', () => {
    const { canvas, container } = setupCanvas();
    expect(container.querySelectorAll('[data-port]')).toHaveLength(0);
    const c = node('client');
    hover(canvas, c.x + 50 + c.w / 2, c.y + 40 + c.h / 2);
    const ports = Array.from(container.querySelectorAll('[data-port]')).map((el) => el.getAttribute('data-port'));
    expect(ports.sort()).toEqual(['e', 'n', 's', 'w']);
    // Dots are 8 px.
    expect((container.querySelector('[data-port="e"]') as HTMLElement).style.width).toBe('8px');
    hover(canvas, 900, 700);
    expect(container.querySelectorAll('[data-port]')).toHaveLength(0);
  });

  it('drag from E port to node connects with fromPort e', () => {
    const { canvas } = setupCanvas();
    const before = api().edges.length;
    const c = node('client');
    const e = nodePorts(c).find((p) => p.side === 'e')!;
    hover(canvas, c.x + 50 + c.w / 2, c.y + 40 + c.h / 2);
    down(canvas, e.x + 50, e.y + 40);
    const t = node('envoy');
    move(t.x + 50 + t.w / 2, t.y + 40 + t.h / 2);
    up(t.x + 50 + 4, t.y + 40 + t.h / 2);
    const edges = api().edges;
    expect(edges.length).toBe(before + 1);
    const made = edges[edges.length - 1];
    expect(made.from).toBe('client');
    expect(made.to).toBe('envoy');
    expect(made.fromPort).toBe('e');
    // The source did not move.
    expect(node('client').x).toBe(c.x);
    // The route starts at the E port.
    const pts = edgePoints(made, api().nodes, true, 'orthogonal')!;
    expect(pts[0]).toEqual({ x: e.x, y: e.y });
  });

  it('nearest target port chosen', () => {
    const t = { id: 't', x: 100, y: 100, w: 160, h: 70 };
    expect(nearestPort(t, 105, 135)).toBe('w');
    expect(nearestPort(t, 180, 102)).toBe('n');
    expect(nearestPort(t, 255, 140)).toBe('e');
    expect(nearestPort(t, 180, 168)).toBe('s');
    expect(portPoint(t, 'w')).toEqual({ x: 100, y: 135 });
    // End to end: released near the target's bottom edge.
    const { canvas } = setupCanvas();
    const c = node('client');
    const e = nodePorts(c).find((p) => p.side === 'e')!;
    hover(canvas, c.x + 50 + c.w / 2, c.y + 40 + c.h / 2);
    down(canvas, e.x + 50, e.y + 40);
    const n = node('envoy');
    const bottom = nodePorts(n).find((p) => p.side === 's')!;
    move(bottom.x + 50, bottom.y + 40 - 10);
    up(bottom.x + 50, bottom.y + 40 - 10);
    const made = api().edges[api().edges.length - 1];
    expect(made.to).toBe('envoy');
    expect(made.toPort).toBe('s');
  });
});
