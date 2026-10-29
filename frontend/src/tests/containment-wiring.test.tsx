import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';



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

// R1-E03-T02 / T03 / T06 wired into the canvas: drop-in, move together, collapse chips, frames, delete dialog.
import type { ArchNode } from '../types';

const node = (id: string, x: number, y: number, extra: Partial<ArchNode> = {}): ArchNode => ({
  id, type: 'service', kind: 'service', displayStyle: 'card', label: id, tag: '', health: 'ok', x, y, w: 100, h: 60, stroke: '#2563EB', ...extra,
});
const vpc = (): ArchNode => node('vpc', 100, 100, { type: 'boundary', kind: 'boundary', boundaryKind: 'vpc', w: 400, h: 300, label: 'VPC' });

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
  act(() => api().loadGraph([vpc(), node('c', 140, 180, { parentId: 'vpc' }), node('free', 600, 200)], [], 'test'));
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  return { ...view, canvas };
}
beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

const get = (id: string) => {
  const n = api().nodes.find((m) => m.id === id);
  if (!n) throw new Error(`missing ${id}`);
  return n;
};
// client = world + pan (50, 40)
const down = (canvas: HTMLCanvasElement, x: number, y: number) => act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x + 50, clientY: y + 40, button: 0, bubbles: true })); });
const move = (x: number, y: number) => act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x + 50, clientY: y + 40 })); });
const up = (x: number, y: number) => act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: x + 50, clientY: y + 40 })); });
const key = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', init)); });

describe('containment on the canvas', () => {
  it('dropping a node inside a VPC sets parentId, and outside clears it', () => {
    const { canvas } = setup();
    down(canvas, 650, 230);
    move(400, 330);
    up(400, 330);
    expect(get('free').parentId).toBe('vpc');
    down(canvas, get('free').x + 50, get('free').y + 30);
    move(900, 600);
    up(900, 600);
    expect(get('free').parentId ?? null).toBeNull();
  });

  it('moving the VPC by its border moves its children; one undo restores all', () => {
    const { canvas } = setup();
    const before = { vpc: get('vpc').x, c: get('c').x };
    down(canvas, 102, 300);
    move(142, 300);
    move(182, 300);
    up(182, 300);
    expect(get('vpc').x).toBeGreaterThan(before.vpc);
    expect(get('c').x - get('vpc').x).toBe(before.c - before.vpc);
    act(() => api().undo());
    expect(get('vpc').x).toBe(before.vpc);
    expect(get('c').x).toBe(before.c);
  });

  it('a click in a boundary interior does not select the boundary', () => {
    const { canvas } = setup();
    down(canvas, 400, 350);
    up(400, 350);
    expect(api().selectedId).toBeNull();
  });

  it('collapse hides children from the node list and expand brings them back', () => {
    setup();
    act(() => api().setSelectedId('vpc'));
    expect(screen.getByTestId('canvas-node-c')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Collapse' }).click());
    expect(get('vpc').collapsed).toBe(true);
    expect(screen.queryByTestId('canvas-node-c')).toBeNull();
    act(() => screen.getByRole('button', { name: 'Expand' }).click());
    expect(screen.getByTestId('canvas-node-c')).toBeTruthy();
    key({ key: 'c', code: 'KeyC', altKey: true });
    expect(get('vpc').collapsed).toBe(true);
  });

  it('Shift+F then drag creates a frame boundary', () => {
    const { canvas } = setup();
    key({ key: 'F', code: 'KeyF', shiftKey: true });
    expect(api().tool).toBe('frame');
    down(canvas, 600, 450);
    move(800, 560);
    up(800, 560);
    const frame = api().nodes.find((n) => n.boundaryKind === 'frame');
    expect(frame).toBeTruthy();
    expect([frame!.x, frame!.y, frame!.w, frame!.h]).toEqual([600, 450, 200, 110]);
    expect(api().tool).toBe('select');
    act(() => api().undo());
    expect(api().nodes.some((n) => n.boundaryKind === 'frame')).toBe(false);
  });

  it('Add lane below creates a lane from the toolbar', () => {
    const { canvas } = setup();
    key({ key: 'W', code: 'KeyW', shiftKey: true });
    expect(api().tool).toBe('swimlane');
    down(canvas, 600, 450);
    move(900, 520);
    up(900, 520);
    const lane = api().nodes.find((n) => n.boundaryKind === 'swimlane')!;
    act(() => screen.getByRole('button', { name: 'Add lane below' }).click());
    const lanes = api().nodes.filter((n) => n.boundaryKind === 'swimlane');
    expect(lanes).toHaveLength(2);
    const added = lanes.find((n) => n.id !== lane.id)!;
    expect([added.x, added.y, added.w]).toEqual([lane.x, lane.y + lane.h, lane.w]);
  });

  it('deleting a boundary with contents asks, and "boundary only" keeps the children', () => {
    setup();
    act(() => api().setSelectedId('vpc'));
    key({ key: 'Delete' });
    const dialog = screen.getByRole('dialog', { name: 'Delete boundary' });
    act(() => within(dialog).getByRole('button', { name: 'Delete boundary only' }).click());
    expect(api().nodes.some((n) => n.id === 'vpc')).toBe(false);
    expect(get('c').parentId ?? null).toBeNull();
  });

  it('History is a right-dock tab listing the local checkpoints', () => {
    setup();
    act(() => api().tagCheckpoint('before refactor'));
    act(() => screen.getByRole('tab', { name: 'History' }).click());
    const panel = screen.getByRole('complementary', { name: 'Version history' });
    expect(within(panel).getByText(/before refactor/)).toBeTruthy();
  });
});
