import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../store';
import { useDiagram } from '../useDiagram';

const STORE_KEY = 'archflux:v2-light';

function stub2d() {
  const makeCtx = () =>
    new Proxy(
      {},
      {
        get: (_t, p) => {
          if (p === 'measureText') return () => ({ width: 10 });
          if (typeof p === 'string') return () => undefined;
          return undefined;
        },
        set: () => true,
      },
    );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function () {
      return makeCtx();
    },
  });
}

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  latest.v = useDiagram();
  return null;
}

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
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('canvas element missing');
  return { ...view, canvas };
}

const api = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dragNode(canvas: HTMLCanvasElement, fromX: number, fromY: number, toX: number, toY: number) {
  act(() => {
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, clientY: fromY, button: 0 }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: toX, clientY: toY, button: 0 }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
  });
}

function storedActiveNodes(): { id: string; x: number; y: number }[] {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) throw new Error('nothing persisted to ' + STORE_KEY);
  const parsed = JSON.parse(raw) as { docs: { id: string; nodes: { id: string; x: number; y: number }[] }[]; activeDocId: string };
  const active = parsed.docs.find((d) => d.id === parsed.activeDocId);
  if (!active) throw new Error('active doc missing in persisted payload');
  return active.nodes;
}

beforeAll(() => {
  stub2d();
});

beforeEach(() => {
  localStorage.clear();
});

describe('drag persistence across refresh', () => {
  it('writes the dragged position to storage (debounced persist)', async () => {
    const { canvas, unmount } = setupCanvas();
    // 'client' starts at (80,160); drag to world (150,220) → node at (130,210).
    dragNode(canvas, 150, 210, 200, 260);
    expect(api().nodes.find((n) => n.id === 'client')).toMatchObject({ x: 130, y: 210 });
    await act(async () => {
      await sleep(450);
    });
    expect(storedActiveNodes().find((n) => n.id === 'client')).toMatchObject({ x: 130, y: 210 });
    unmount();
  });

  it('restores the dragged position on reload', async () => {
    const first = setupCanvas();
    dragNode(first.canvas, 150, 210, 200, 260);
    await act(async () => {
      await sleep(450);
    });
    first.unmount();
    // Simulate refresh: fresh provider reads from localStorage.
    setupCanvas();
    expect(api().nodes.find((n) => n.id === 'client')).toMatchObject({ x: 130, y: 210 });
  });

  it('restores pan and zoom on reload', async () => {
    const first = setupCanvas();
    act(() => {
      api().setPan({ x: -120, y: 300 });
      api().zoomTo(1.5);
    });
    expect(api().pan).toMatchObject({ x: -120, y: 300 });
    expect(api().zoom).toBe(1.5);
    await act(async () => {
      await sleep(450);
    });
    first.unmount();
    // Simulate refresh: fresh provider reads view from localStorage.
    setupCanvas();
    expect(api().pan).toMatchObject({ x: -120, y: 300 });
    expect(api().zoom).toBe(1.5);
  });

  it('flushes the dragged position on beforeunload without waiting', () => {
    const { canvas, unmount } = setupCanvas();
    dragNode(canvas, 150, 210, 200, 260);
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(storedActiveNodes().find((n) => n.id === 'client')).toMatchObject({ x: 130, y: 210 });
    unmount();
  });
});
