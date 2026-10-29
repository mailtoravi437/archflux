/// <reference types="node" />
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

// R1-E14-T02: canvas workspace shell = Main.dc.html L69–L178 (rail, docked
// inspector frame, View toolbar, minimap).

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

/** Declarations of the first top-level rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

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

describe('canvas workspace shell', () => {
  it('rail lists tools in design order with labels', () => {
    setupCanvas();
    const rail = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(rail).toHaveAttribute('aria-orientation', 'vertical');
    const names = within(rail).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Select (V)', 'Pan (H)',
      'Service (S)', 'Gateway (G)', 'Database (D)', 'Queue (Q)', 'Shapes library (L)',
      'Connect (C)', 'Draw (P)', 'Text (T)', 'Comment (M)',
    ]);
    // Group dividers sit after Pan and after Shapes library.
    const kids = Array.from(rail.children).filter((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'separator');
    const seps = kids.map((el, i) => (el.getAttribute('role') === 'separator' ? i : -1)).filter((i) => i >= 0);
    expect(seps).toEqual([2, 8]);
    expect(within(rail).getByRole('button', { name: 'Select (V)' })).toHaveAttribute('title', 'Select  V');
    expect(within(rail).getByRole('button', { name: 'Comment (M)' })).toHaveAttribute('title', 'Comment  M');
    // Artboard icons, no old icon set and no extra top "Shapes" icon.
    expect(rail.querySelectorAll('img').length).toBe(0);
    expect(rail.querySelectorAll('svg[width="18"]').length).toBe(11);
    expect(within(rail).queryByRole('button', { name: 'Shapes' })).toBeNull();
    // 48 px floating rail, 38 px buttons.
    expect(rule('.vertical-tool-rail')).toMatch(/top: 12px;[\s\S]*left: 12px;[\s\S]*padding: 6px 4px;/);
    expect(css).toMatch(/--rail-width: 48px;/);
    expect(rule('.vertical-tool-rail .rail-btn')).toMatch(/width: 38px;[\s\S]*height: 38px;[\s\S]*border-radius: 8px;/);
    // M picks the Comment tool.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    });
    expect(api().tool).toBe('comment');
  });

  it('inspector is docked with text tabs and close', () => {
    const { container } = setupCanvas();
    const aside = screen.getByRole('complementary', { name: 'Inspector' });
    expect(aside.tagName).toBe('ASIDE');
    // Docked beside the canvas, not floating inside it.
    const viewport = container.querySelector('#canvasViewport');
    expect(viewport?.contains(aside)).toBe(false);
    expect(aside.parentElement).toBe(viewport?.parentElement);
    expect(rule('.linter-inspector')).toMatch(/width: 320px;[\s\S]*height: 100%;[\s\S]*border-left: 1px solid/);

    const tablist = within(aside).getByRole('tablist', { name: 'Right panel' });
    const tabs = within(tablist).getAllByRole('tab');
    // R1-E14-T10: the Linter tab became the R2 "AI assistant" placeholder; History joined in R1-E08-T03.
    expect(tabs.map((t) => t.textContent?.replace(/\s+\d+$/, ''))).toEqual(['Inspector', 'AI assistant', 'Live', 'History']);
    // Text only: no emoji or icon heads, and no lint count pill in the tab bar.
    for (const t of tabs) {
      expect(t.textContent).toMatch(/^[A-Za-z]+( [A-Za-z]+)?( \d+)?$/);
      expect(t.querySelector('svg, img')).toBeNull();
    }
    expect(tablist.querySelector('.utility-count')).toBeNull();
    expect(within(tablist).queryByRole('tab', { name: /linter/i })).toBeNull();
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    // Close hides the dock; the View toolbar gains "Show panel".
    fireEvent.click(within(aside).getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    const view = screen.getByRole('toolbar', { name: 'View' });
    fireEvent.click(within(view).getByRole('button', { name: 'Show panel' }));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(within(view).queryByRole('button', { name: 'Show panel' })).toBeNull();
  });

  it('view toolbar has zoom, fit, undo, redo, minimap, focus', () => {
    setupCanvas();
    const view = screen.getByRole('toolbar', { name: 'View' });
    const names = within(view).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Zoom out', 'Reset zoom to 100%', 'Zoom in', 'Fit to screen (F)', 'Undo', 'Redo', 'Hide minimap', 'Focus mode']);

    const reset = within(view).getByRole('button', { name: 'Reset zoom to 100%' });
    const startZoom = api().zoom;
    expect(reset.textContent).toBe(`${Math.round(startZoom * 100)}%`);
    fireEvent.click(within(view).getByRole('button', { name: 'Zoom in' }));
    expect(api().zoom).toBeCloseTo(startZoom + 0.1);
    fireEvent.click(reset);
    expect(api().zoom).toBe(1);
    expect(reset.textContent).toBe('100%');
    fireEvent.click(within(view).getByRole('button', { name: 'Zoom out' }));
    expect(api().zoom).toBeCloseTo(0.9);

    // Undo/Redo call the store's history actions.
    const undo = within(view).getByRole('button', { name: 'Undo' });
    const redo = within(view).getByRole('button', { name: 'Redo' });
    const before = api().nodes.length;
    act(() => api().addNode('service', 900, 600));
    expect(api().nodes.length).toBe(before + 1);
    fireEvent.click(undo);
    expect(api().nodes.length).toBe(before);
    fireEvent.click(redo);
    expect(api().nodes.length).toBe(before + 1);

    // Minimap toggle is a pressed button.
    const mini = within(view).getByRole('button', { name: 'Hide minimap' });
    expect(mini).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(mini);
    expect(within(view).getByRole('button', { name: 'Show minimap' })).toHaveAttribute('aria-pressed', 'false');

    expect(rule('.canvas-view-toolbar')).toMatch(/left: 72px;[\s\S]*bottom: 16px;[\s\S]*height: 40px;[\s\S]*border-radius: 10px;/);
    expect(rule('.view-btn')).toMatch(/width: 32px;[\s\S]*height: 32px;[\s\S]*border-radius: 6px;/);
  });

  it('minimap sits above the view toolbar on the left', () => {
    const { container } = setupCanvas();
    const map = screen.getByRole('img', { name: 'Minimap overview' });
    const viewport = container.querySelector('#canvasViewport');
    expect(viewport?.contains(map)).toBe(true);
    expect(screen.getByRole('complementary', { name: 'Inspector' }).contains(map)).toBe(false);
    // No bottom-right toggle or "Map" header any more.
    expect(container.querySelector('.minimap-toggle')).toBeNull();
    expect(map.textContent).toBe('');

    const mini = rule('.minimap-wrap');
    const bar = rule('.canvas-view-toolbar');
    const px = (body: string, prop: string) => Number(new RegExp(`\\n\\s*${prop}: (\\d+)px;`).exec(body)?.[1]);
    expect(px(mini, 'left')).toBe(72);
    expect(px(mini, 'left')).toBe(px(bar, 'left'));
    expect(px(mini, 'width')).toBe(176);
    expect(px(mini, 'height')).toBe(108);
    expect(px(mini, 'padding')).toBe(8);
    // Bottom of the minimap clears the toolbar (16 + 40 + 2 border) with an 8 px gap.
    expect(px(mini, 'bottom')).toBe(66);
    expect(px(mini, 'bottom')).toBeGreaterThan(px(bar, 'bottom') + px(bar, 'height'));
    expect(rule('.minimap-field')).toMatch(/background: var\(--minimap-field\);[\s\S]*border-radius: 6px;/);
  });
});
