import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

// R1-BUG-08: connecting two elements without a pointer. Select a node in the screen-reader
// list, press C to arm it, then activate the target node in the same list.

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

describe('keyboard connect (R1-BUG-08)', () => {
  it('C arms the selected node and activating another node in the list connects them', () => {
    setupCanvas();
    const nav = screen.getByRole('navigation', { name: 'Diagram nodes and routes' });
    const btns = within(nav).getAllByRole('button');
    const before = api().edges.length;
    const [src, dst] = [api().nodes[0], api().nodes[api().nodes.length - 1]];
    // Pick two nodes that are not already linked.
    const linked = api().edges.some((e) => (e.from === src.id && e.to === dst.id) || (e.from === dst.id && e.to === src.id));
    expect(linked).toBe(false);
    fireEvent.click(btns[0]);
    fireEvent.keyDown(btns[0], { key: 'c' });
    fireEvent.click(btns[btns.length - 1]);
    expect(api().edges.length).toBe(before + 1);
    expect(api().edges.some((e) => e.from === src.id && e.to === dst.id)).toBe(true);
  });

  it('activating the armed source again cancels without adding an edge', () => {
    setupCanvas();
    const nav = screen.getByRole('navigation', { name: 'Diagram nodes and routes' });
    const btns = within(nav).getAllByRole('button');
    const before = api().edges.length;
    fireEvent.click(btns[0]);
    fireEvent.keyDown(btns[0], { key: 'c' });
    fireEvent.click(btns[0]);
    expect(api().edges.length).toBe(before);
  });
});
