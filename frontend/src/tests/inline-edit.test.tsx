/**
 * R1-E02-T06: inline editing of name and technology on the canvas.
 * Same jsdom canvas stub as canvas.test.tsx.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

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

/** Seeds the sample diagram, renames 'client' to "Order Service" and selects it with a canvas click. */
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
  act(() => api().updateNode('client', { label: 'Order Service', tag: 'ECS', technology: 'ECS' }));
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  // pan (50,40), zoom 1: client (150,210) maps to world (100,170), inside the node at (80,160).
  act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 })); });
  act(() => { window.dispatchEvent(new MouseEvent('pointerup', { button: 0 })); });
  expect(api().selectedId).toBe('client');
  return { ...view, canvas };
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init })); });
/** Queries inside the inline editor only (the Inspector also has name/technology fields). */
const editor = () => within(screen.getByTestId('inline-editor'));
const label = () => api().nodes.find((n) => n.id === 'client')!.label;
const technology = () => api().nodes.find((n) => n.id === 'client')!.technology;

beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

describe('inline editing of name and technology', () => {
  it('Enter opens name editor, typing + Enter commits', () => {
    setup();
    expect(screen.queryByTestId('inline-editor')).toBeNull();
    press('Enter');
    const input = editor().getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    expect(input.value).toBe('Order Service');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'Billing Service' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(label()).toBe('Billing Service');
    expect(screen.queryByTestId('inline-editor')).toBeNull();
  });

  it('Tab moves to technology, Shift+Tab back', () => {
    setup();
    press('Enter');
    const name = editor().getByRole('textbox', { name: 'Name' });
    fireEvent.keyDown(name, { key: 'Tab' });
    const tech = editor().getByRole('textbox', { name: 'Technology' }) as HTMLInputElement;
    expect(document.activeElement).toBe(tech);
    expect(tech.value).toBe('ECS');
    fireEvent.change(tech, { target: { value: 'EKS' } });
    fireEvent.keyDown(tech, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(name);
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(technology()).toBe('EKS');
    expect(label()).toBe('Order Service');
  });

  it('Esc cancels without change', () => {
    setup();
    const nodesBefore = api().nodes;
    press('Enter');
    const input = editor().getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('inline-editor')).toBeNull();
    expect(label()).toBe('Order Service');
    expect(api().nodes).toBe(nodesBefore);
  });

  it('empty name restores previous', () => {
    setup();
    press('Enter');
    const input = editor().getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(label()).toBe('Order Service');
  });

  it('one undo reverts the whole edit session', () => {
    setup();
    press('Enter');
    const name = editor().getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Billing Service' } });
    fireEvent.keyDown(name, { key: 'Tab' });
    const tech = editor().getByRole('textbox', { name: 'Technology' });
    fireEvent.change(tech, { target: { value: 'Lambda' } });
    fireEvent.keyDown(tech, { key: 'Enter' });
    expect(label()).toBe('Billing Service');
    expect(technology()).toBe('Lambda');
    act(() => api().undo());
    expect(label()).toBe('Order Service');
    expect(technology()).toBe('ECS');
  });

  it('announces "Editing name of Order Service"', () => {
    setup();
    press('Enter');
    expect(screen.getByText('Editing name of Order Service')).toBeTruthy();
    fireEvent.keyDown(editor().getByRole('textbox', { name: 'Name' }), { key: 'Tab' });
    expect(screen.getByText('Editing technology of Order Service')).toBeTruthy();
  });

  it('double-click opens the name editor', () => {
    const { canvas } = setup();
    act(() => { canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: 150, clientY: 210 })); });
    expect(editor().getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });
});
