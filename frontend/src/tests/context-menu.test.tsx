import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { ContextMenu } from '../screens/canvas/ContextMenu';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';
import { nodeBounds } from '../lib/canvasGeometry';
import { clearClipboard } from '../screens/canvas/nodeClipboard';

// R1-E04-T07 (SC-18): the canvas context menu, fed by the command registry.

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

function tree(extra?: React.ReactNode) {
  return (
    <MemoryRouter initialEntries={['/canvas']}>
      <DiagramProvider>
        <Probe />
        <CanvasScreen />
        {extra}
      </DiagramProvider>
    </MemoryRouter>
  );
}

function setupCanvas() {
  latest.v = null;
  const view = render(tree());
  if (api().nodes.length === 0) act(() => seedSampleDiagram(api()));
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('canvas element missing');
  return { ...view, canvas };
}

// Default zoom 1, pan (50,40), zero-size jsdom rect: client = world + pan.
const centreOf = (id: string) => {
  const n = api().nodes.find((m) => m.id === id);
  if (!n) throw new Error(`fixture missing ${id}`);
  const b = nodeBounds(n);
  return { x: b.x + b.w / 2 + 50, y: b.y + b.h / 2 + 40 };
};

beforeAll(() => stub2d());
beforeEach(() => {
  localStorage.clear();
  clearClipboard();
});

describe('context menu', () => {
  it('opens on contextmenu with grouped items', () => {
    const { canvas } = setupCanvas();
    const p = centreOf('client');
    fireEvent.contextMenu(canvas, { clientX: p.x, clientY: p.y });
    const menu = screen.getByRole('menu', { name: /actions$/ });
    expect(api().selectedId).toBe('client');
    for (const g of ['Edit', 'Arrange', 'Display', 'Review', 'Advanced']) {
      expect(within(menu).getByRole('group', { name: g })).toBeTruthy();
    }
    expect(within(menu).getByRole('menuitem', { name: /^Cut/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /^Duplicate/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /^Bring to front/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /^Copy link to element/ })).toBeTruthy();
    // Unavailable items are hidden, not disabled: one node cannot be aligned, nothing is on the clipboard.
    expect(within(menu).queryByRole('menuitem', { name: /^Align/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /^Paste/ })).toBeNull();
    // Choosing an action runs it and closes the menu.
    const before = api().nodes.length;
    act(() => within(menu).getByRole('menuitem', { name: /^Duplicate/ }).click());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(api().nodes.length).toBe(before + 1);
  });

  it('Shift+F10 opens at selection', () => {
    setupCanvas();
    act(() => api().setSelectedId('envoy'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true }));
    });
    const menu = screen.getByRole('menu', { name: /actions$/ });
    const p = centreOf('envoy');
    expect(menu.style.left).toBe(`${p.x}px`);
    expect(menu.style.top).toBe(`${p.y}px`);
  });

  it('arrow navigation and Esc returns focus', () => {
    const { canvas } = setupCanvas();
    const p = centreOf('client');
    fireEvent.contextMenu(canvas, { clientX: p.x, clientY: p.y });
    const menu = screen.getByRole('menu', { name: /actions$/ });
    const items = within(menu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    // Right arrow opens a submenu: select two nodes so Align is offered.
    fireEvent.keyDown(items[0], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(canvas);
    // Escape closing the menu did not clear the selection.
    expect(api().selectedId).toBe('client');
  });

  it('right arrow opens a submenu for a multi-selection', () => {
    const { canvas } = setupCanvas();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    });
    const p = centreOf('client');
    fireEvent.contextMenu(canvas, { clientX: p.x, clientY: p.y });
    const menu = screen.getByRole('menu', { name: /actions$/ });
    const align = within(menu).getByRole('menuitem', { name: 'Align' });
    expect(align.getAttribute('aria-haspopup')).toBe('menu');
    align.focus();
    fireEvent.keyDown(align, { key: 'ArrowRight' });
    const sub = screen.getByRole('menu', { name: 'Align' });
    expect(within(sub).getByRole('menuitem', { name: /^Align left/ })).toBeTruthy();
    fireEvent.keyDown(within(sub).getAllByRole('menuitem')[0], { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: 'Align' })).toBeNull();
    expect(document.activeElement).toBe(align);
  });

  it('viewer role hides editing items', () => {
    const { rerender } = setupCanvas();
    // Mount the menu once the canvas has registered its commands for the seeded diagram.
    rerender(tree(<ContextMenu x={10} y={10} selectionIds={['client']} role="viewer" label="Client actions" onClose={() => undefined} />));
    const menu = screen.getByRole('menu', { name: 'Client actions' });
    expect(within(menu).getByRole('menuitem', { name: /^Copy(?! link)/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /^Copy link to element/ })).toBeTruthy();
    for (const name of [/^Cut/, /^Delete/, /^Duplicate/, /^Lock/, /^Bring to front/, /^Icon/, /^Replace icon/]) {
      expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
    }
  });
});
