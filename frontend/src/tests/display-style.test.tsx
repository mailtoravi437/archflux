/**
 * R1-E02-T05: switch display style from the store, the context toolbar and Alt+1/2/3.
 * Same jsdom canvas stub as inline-edit.test.tsx.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';
import { edgePoints } from '../lib/canvasGeometry';

function stub2d() {
  const makeCtx = () =>
    new Proxy({}, {
      get: (_t, p) => {
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'getImageData') return () => ({ data: [] });
        if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => ({ addColorStop: () => {} });
        if (typeof p === 'string') return () => undefined;
        return undefined;
      },
      set: () => true,
    });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => makeCtx() });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
}

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  const value = useDiagram();
  useEffect(() => { latest.v = value; });
  return null;
}
const api = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};
const style = (id: string) => api().nodes.find((n) => n.id === id)!.displayStyle;

function setup() {
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
  // Every sample node starts as a card so the tests control the style.
  act(() => { for (const n of api().nodes) api().updateNode(n.id, { displayStyle: 'card' }); });
  return view;
}
const selectIds = (ids: string[]) => act(() => { api().setSelectedId(ids[ids.length - 1]); });
const altKey = (digit: number) =>
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: String(digit), code: `Digit${digit}`, altKey: true })); });

beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

describe('display style switching', () => {
  it('switching 3 selected nodes is one undo step', () => {
    setup();
    const ids = ['client', 'envoy', 'kafka'].filter((id) => api().nodes.some((n) => n.id === id)).slice(0, 3);
    expect(ids).toHaveLength(3);
    act(() => api().setDisplayStyle(ids, 'shape'));
    for (const id of ids) expect(style(id)).toBe('shape');
    act(() => api().undo());
    for (const id of ids) expect(style(id)).toBe('card');
  });

  it('edges stay attached after switching', () => {
    setup();
    const edge = api().edges.find((e) => e.to);
    expect(edge).toBeTruthy();
    const before = edgePoints(edge!, api().nodes, false)!;
    act(() => api().setDisplayStyle([edge!.from], 'icon'));
    const after = api().edges.find((e) => e.id === edge!.id)!;
    expect(after.from).toBe(edge!.from);
    expect(after.to).toBe(edge!.to);
    const pts = edgePoints(after, api().nodes, false)!;
    const src = api().nodes.find((n) => n.id === edge!.from)!;
    expect(src.w).toBe(64);
    // The start point now sits on the new, smaller box.
    expect(pts[0]).not.toEqual(before[0]);
    expect(pts[0].x).toBeLessThanOrEqual(src.x + src.w);
  });

  it('Alt+2 sets card style', () => {
    setup();
    act(() => api().setDisplayStyle(['client'], 'icon'));
    selectIds(['client']);
    altKey(2);
    expect(style('client')).toBe('card');
    altKey(1);
    expect(style('client')).toBe('icon');
    altKey(3);
    expect(style('client')).toBe('shape');
    // One undo per switch.
    act(() => api().undo());
    expect(style('client')).toBe('icon');
  });

  it('context toolbar radiogroup reflects mixed selection as no checked option', () => {
    setup();
    act(() => api().setDisplayStyle(['client'], 'icon'));
    selectIds(['client']);
    const group = screen.getByRole('radiogroup', { name: 'Display style' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Icon', 'Card', 'Shape']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    // Mixed: client is an icon, envoy a card.
    // Ctrl+A selects every node: client is an icon, the rest are cards.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })); });
    const mixed = within(screen.getByRole('radiogroup', { name: 'Display style' })).getAllByRole('radio');
    expect(mixed.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    // Picking Card sets them all in one step.
    fireEvent.click(mixed[1]);
    for (const n of api().nodes) expect(n.displayStyle).toBe('card');
    act(() => api().undo());
    expect(style('client')).toBe('icon');
  });
});
