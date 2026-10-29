import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

// R1-E01-T07: a click with the Select tool only selects. Connecting is
// explicit: the Connector tool, `C` with one node selected, or a drag that
// starts on a node's edge (within 8 px).

function stub2d() {
  const ctx = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'getImageData') return () => ({ data: [] });
        if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern')
          return () => ({ addColorStop: () => {} });
        if (typeof p === 'string') return () => undefined;
        return undefined;
      },
      set: () => true,
    },
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ctx,
  });
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
// 'client' is at world (80,160) 160×70; 'envoy' is at world (300,150).
const down = (canvas: HTMLCanvasElement, x: number, y: number) =>
  act(() => {
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0 }));
  });
const move = (x: number, y: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, button: 0 }));
  });
const up = (x: number, y: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, button: 0 }));
  });
const click = (canvas: HTMLCanvasElement, x: number, y: number) => {
  down(canvas, x, y);
  up(x, y);
};

beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

describe('select vs connect', () => {
  it('single click selects without connecting hint', () => {
    const { canvas, container } = setupCanvas();
    const before = api().edges.length;
    click(canvas, 210, 235); // centre of 'client'
    expect(api().selectedId).toBe('client');
    expect(container.querySelector('.connect-hint')).toBeNull();
    click(canvas, 350, 190); // 'envoy': still only a selection change
    expect(api().selectedId).toBe('envoy');
    expect(api().edges.length).toBe(before);
    expect(container.querySelector('.connect-hint')).toBeNull();
  });

  it('C then click target creates an edge', () => {
    const { canvas, container } = setupCanvas();
    const before = api().edges.length;
    click(canvas, 210, 235);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    expect(api().tool).toBe('connector');
    expect(container.querySelector('.connect-hint')).not.toBeNull();
    click(canvas, 350, 190);
    const edges = api().edges;
    expect(edges.length).toBe(before + 1);
    expect(edges[edges.length - 1].from).toBe('client');
    expect(edges[edges.length - 1].to).toBe('envoy');
    expect(container.querySelector('.connect-hint')).toBeNull();
    expect(api().tool).toBe('select');
  });

  it('C with nothing selected only picks the Connector tool', () => {
    const { container } = setupCanvas();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    expect(api().tool).toBe('connector');
    expect(container.querySelector('.connect-hint')).toBeNull();
  });

  it('dragging from a node edge connects to the node it is released on', () => {
    const { canvas } = setupCanvas();
    const before = api().edges.length;
    const client = api().nodes.find((n) => n.id === 'client');
    if (!client) throw new Error('fixture missing client');
    // 3 px inside the left edge of 'client' (not a resize grip).
    down(canvas, client.x + 50 + 3, client.y + 40 + 35);
    move(300, 200);
    up(350, 190);
    const edges = api().edges;
    expect(edges.length).toBe(before + 1);
    expect(edges[edges.length - 1].from).toBe('client');
    expect(edges[edges.length - 1].to).toBe('envoy');
    // The source did not move: an edge drag connects, it never drags.
    expect(api().nodes.find((n) => n.id === 'client')?.x).toBe(client.x);
  });

  it('dragging from the node interior moves it and creates no edge', () => {
    const { canvas } = setupCanvas();
    const before = api().edges.length;
    down(canvas, 210, 235);
    move(215, 300);
    up(215, 300);
    expect(api().edges.length).toBe(before);
  });
});
