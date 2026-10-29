import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { pageView } from '../lib/pageView';
import { seedSampleDiagram } from './fixtures/sampleDiagram';



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

// R1-E03-T05: layers panel.
function setup() {
  latest.v = null;
  const view = render(
    <MemoryRouter initialEntries={['/canvas']}>
      <DiagramProvider>
        <Probe />
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
  if (api().nodes.length === 0) act(() => seedSampleDiagram(api()));
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  return { ...view, canvas };
}
beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

const openPanel = () => {
  act(() => screen.getByRole('button', { name: /^Layers, / }).click());
  return screen.getByRole('region', { name: 'Layers' });
};
const view = () => {
  const v = api();
  return pageView({ nodes: v.nodes, edges: v.edges, strokes: v.strokes, texts: v.texts, pages: v.pages, layers: v.layers }, v.activePageId);
};

describe('layers panel', () => {
  it('hiding a layer removes its elements from render and hit test', () => {
    setup();
    const panel = openPanel();
    act(() => { api().addLayer('Overlay'); });
    const ly = api().layers.find((l) => l.name === 'Overlay')!;
    act(() => { api().moveToLayer(['client'], ly.id); });
    expect(view().nodes.some((n) => n.id === 'client')).toBe(true);
    expect(screen.getByTestId('canvas-node-client')).toBeTruthy();
    act(() => within(panel).getByRole('button', { name: 'Hide Overlay' }).click());
    expect(within(panel).getByRole('button', { name: 'Hide Overlay' }).getAttribute('aria-pressed')).toBe('true');
    expect(view().nodes.some((n) => n.id === 'client')).toBe(false);
    expect(screen.queryByTestId('canvas-node-client')).toBeNull();
    // Edges to a hidden node disappear with it.
    expect(view().edges.every((e) => e.from !== 'client' && e.to !== 'client')).toBe(true);
  });

  it('locked layer elements cannot be selected', () => {
    const { canvas } = setup();
    const panel = openPanel();
    act(() => { api().addLayer('Frozen'); });
    const ly = api().layers.find((l) => l.name === 'Frozen')!;
    act(() => { api().moveToLayer(['client'], ly.id); });
    act(() => within(panel).getByRole('button', { name: 'Lock Frozen' }).click());
    const c = api().nodes.find((n) => n.id === 'client')!;
    const x = c.x + 50 + c.w / 2;
    const y = c.y + 40 + c.h / 2;
    act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y })); });
    expect(api().selectedId).not.toBe('client');
    // Still drawn: part of the page view.
    expect(view().nodes.some((n) => n.id === 'client')).toBe(true);
    // Select all skips it too.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })); });
    expect(api().selectedId).not.toBe('client');
  });

  it('move selection to layer', () => {
    setup();
    const panel = openPanel();
    act(() => { api().addLayer('Target'); });
    const ly = api().layers.find((l) => l.name === 'Target')!;
    act(() => api().setSelectedId('envoy'));
    act(() => within(panel).getByRole('button', { name: 'Move selection to Target' }).click());
    expect(api().nodes.find((n) => n.id === 'envoy')?.layerId).toBe(ly.id);
  });

  it('reorder changes draw order', () => {
    setup();
    const panel = openPanel();
    act(() => { api().addLayer('Top'); });
    const top = api().layers.find((l) => l.name === 'Top')!;
    act(() => { api().moveToLayer(['client'], top.id); });
    const lastId = () => view().nodes[view().nodes.length - 1].id;
    // 'client' is on the highest layer, so it paints last.
    expect(lastId()).toBe('client');
    act(() => within(panel).getByRole('button', { name: 'Move Top down' }).click());
    expect(lastId()).not.toBe('client');
    expect(view().nodes[0].id).toBe('client');
    act(() => api().undo());
    expect(lastId()).toBe('client');
  });

  it('21st layer is refused with toast "A diagram can have up to 20 layers"', () => {
    setup();
    for (let i = 0; i < 19; i++) act(() => { api().addLayer(); });
    expect(api().layers).toHaveLength(20);
    act(() => { api().addLayer(); });
    expect(api().layers).toHaveLength(20);
    expect(api().toasts.some((t) => t.text === 'A diagram can have up to 20 layers')).toBe(true);
  });
});
