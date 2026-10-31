import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

// R1-E02-BUG-SELECT-ALL: Ctrl+A selects nodes, strokes and texts; Delete removes them in one undo step.

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

function setupCanvas(seed = true) {
  latest.v = null;
  // The minimap opens by default only for content-rich diagrams on load; pin it open here.
  localStorage.setItem('archflux:minimap:v1', 'open');
  const view = render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
  if (seed && api().nodes.length === 0) act(() => seedSampleDiagram(api()));
  return view;
}

beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

const pts = [{ x: 10, y: 10 }, { x: 60, y: 40 }, { x: 90, y: 20 }];

describe('select all includes freehand strokes and texts', () => {
  it('Ctrl+A then Delete removes nodes, edges, strokes and texts; one undo restores all', () => {
    setupCanvas();
    act(() => {
      api().addStroke(pts, '#ff0000', 3);
      api().addStroke(pts.map((p) => ({ x: p.x + 200, y: p.y + 200 })), '#00ff00', 3);
      api().addText(300, 300, 'hello', 16, '#111111');
    });
    const n0 = api().nodes.length;
    const e0 = api().edges.length;
    expect(n0).toBeGreaterThan(0);
    expect(api().strokes.length).toBe(2);
    expect(api().texts.length).toBe(1);

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(api().nodes.length).toBe(0);
    expect(api().edges.length).toBe(0);
    expect(api().strokes.length).toBe(0);
    expect(api().texts.length).toBe(0);

    act(() => api().undo());
    expect(api().nodes.length).toBe(n0);
    expect(api().edges.length).toBe(e0);
    expect(api().strokes.length).toBe(2);
    expect(api().texts.length).toBe(1);
  });

  it('Ctrl+A then Delete clears a doc that has a single stroke and nothing else', () => {
    setupCanvas(false);
    act(() => api().addStroke(pts, '#ff0000', 3));
    expect(api().strokes.length).toBe(1);
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(api().strokes.length).toBe(0);
  });
});
