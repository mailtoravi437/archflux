import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { pageLinkBadge } from '../lib/canvasGeometry';
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

// R1-E03-T04: pages bar and per-page rendering.
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

const tabs = () => within(screen.getByRole('tablist', { name: 'Pages' })).getAllByRole('tab');

describe('pages bar', () => {
  it('adds, renames, switches pages via tabs', () => {
    setup();
    expect(tabs()).toHaveLength(1);
    act(() => screen.getByRole('button', { name: 'Add page' }).click());
    expect(tabs()).toHaveLength(2);
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.doubleClick(tabs()[1]);
    const input = screen.getByRole('textbox', { name: 'Rename page' });
    fireEvent.change(input, { target: { value: 'Deployment' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(tabs()[1].textContent).toBe('2 · Deployment');
    act(() => tabs()[0].click());
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(api().activePageId).toBe(api().pages[0].id);
  });

  it('canvas only renders nodes of the active page', () => {
    setup();
    expect(screen.getByTestId('canvas-node-client')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Add page' }).click());
    expect(screen.queryByTestId('canvas-node-client')).toBeNull();
    act(() => tabs()[0].click());
    expect(screen.getByTestId('canvas-node-client')).toBeTruthy();
  });

  it('Ctrl+PageDown goes to next page', () => {
    setup();
    act(() => { api().addPage(); });
    act(() => tabs()[0].click());
    const [first, second] = api().pages;
    expect(api().activePageId).toBe(first.id);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true })); });
    expect(api().activePageId).toBe(second.id);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true })); });
    expect(api().activePageId).toBe(first.id);
  });

  it('page link badge switches page', () => {
    const { canvas } = setup();
    act(() => { api().addPage(); });
    act(() => tabs()[0].click());
    const second = api().pages[1];
    const client = api().nodes.find((n) => n.id === 'client');
    if (!client) throw new Error('fixture missing client');
    act(() => api().updateNode('client', { linkPageId: second.id }));
    const k = pageLinkBadge(api().nodes.find((n) => n.id === 'client')!, 1);
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: k.x + 50, clientY: k.y + 40, button: 0, bubbles: true }));
    });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: k.x + 50, clientY: k.y + 40 })); });
    expect(api().activePageId).toBe(second.id);
  });

  it('51st page is refused with toast "A diagram can have up to 50 pages"', () => {
    setup();
    for (let i = 0; i < 49; i++) act(() => { api().addPage(); });
    expect(api().pages).toHaveLength(50);
    act(() => { api().addPage(); });
    expect(api().pages).toHaveLength(50);
    expect(api().toasts.some((t) => t.text === 'A diagram can have up to 50 pages')).toBe(true);
  });

  it('tab context menu offers Rename, Duplicate, Delete, Move left, Move right', () => {
    setup();
    act(() => { api().addPage(); });
    act(() => { api().addPage(); });
    fireEvent.contextMenu(tabs()[1]);
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(names).toEqual(['Rename', 'Duplicate', 'Delete', 'Move left', 'Move right']);
    const second = api().pages[1].id;
    act(() => screen.getByRole('menuitem', { name: 'Move left' }).click());
    expect(api().pages[0].id).toBe(second);
  });
});
