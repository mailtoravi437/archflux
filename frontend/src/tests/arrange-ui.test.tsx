import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';
import { clearClipboard } from '../screens/canvas/nodeClipboard';

// R1-E04-T08: arrange buttons in the context toolbar, shortcuts, and the find bar.

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
  return view;
}
const key = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', init)); });
const selectAll = () => key({ key: 'a', ctrlKey: true });

beforeAll(() => stub2d());
beforeEach(() => {
  localStorage.clear();
  clearClipboard();
});

describe('arrange UI', () => {
  it('Align left button aligns selection', () => {
    setup();
    selectAll();
    const xs = new Set(api().nodes.map((n) => n.x));
    expect(xs.size).toBeGreaterThan(1);
    const bar = screen.getByRole('group', { name: 'Arrange' });
    act(() => within(bar).getByRole('button', { name: 'Align left' }).click());
    expect(new Set(api().nodes.map((n) => n.x)).size).toBe(1);
    act(() => api().undo());
    expect(new Set(api().nodes.map((n) => n.x)).size).toBeGreaterThan(1);
  });

  it('Alt+Shift+H distributes', () => {
    setup();
    selectAll();
    const before = api().nodes.map((n) => n.x).join(',');
    key({ key: 'H', code: 'KeyH', altKey: true, shiftKey: true });
    expect(api().nodes.map((n) => n.x).join(',')).not.toBe(before);
    // Gaps between nodes (sorted by x) are now equal.
    const sorted = [...api().nodes].sort((a, b) => a.x - b.x);
    const gaps = sorted.slice(1).map((n, i) => Math.round(n.x - (sorted[i].x + sorted[i].w)));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it('Ctrl+F opens find bar showing match count', () => {
    setup();
    key({ key: 'f', ctrlKey: true });
    const bar = screen.getByRole('search', { name: 'Find in diagram' });
    const input = within(bar).getByRole('searchbox', { name: 'Find' });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'e' } });
    const count = within(bar).getByRole('status', { name: 'Match count' });
    expect(count.textContent).toMatch(/^1 of \d+$/);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(count.textContent).toMatch(/^2 of \d+$/);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('search')).toBeNull();
  });
});
