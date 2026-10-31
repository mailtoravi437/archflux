/**
 * Live audit 2026-10-31 canvas fixes (BUG-LIVE-012 and friends).
 * Same jsdom canvas stub as inline-edit.test.tsx.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import AppShell from '../components/AppShell';
import { seedSampleDiagram } from './fixtures/sampleDiagram';
import { DEFAULT_SHORTCUTS } from '../screens/canvas/useCanvasKeyboard';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';

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
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  return { ...view, canvas };
}
const press = (key: string, target: EventTarget = window, init: KeyboardEventInit = {}) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init })); });

beforeAll(() => stub2d());
beforeEach(() => localStorage.clear());

describe('BUG-LIVE-012: shortcuts while the text editor is open', () => {
  it('does not switch tool when a letter key reaches the window while a text draft is open', () => {
    const { canvas } = setup();
    press('t');
    expect(api().tool).toBe('text');
    act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 600, clientY: 400, button: 0 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { button: 0 })); });
    // Focus has not reached the textarea yet (or was lost): the key target is not an input.
    press('h');
    press('v');
    press('s');
    expect(api().tool).toBe('text');
  });

  it('shortcuts work again once the draft is finished with Escape', () => {
    const { canvas } = setup();
    press('t');
    act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 600, clientY: 400, button: 0 })); });
    press('Escape');
    press('h');
    expect(api().tool).toBe('pan');
  });
});

describe('BUG-LIVE-020: unique shortcut keys', () => {
  it('default bindings use each key once', () => {
    const keys = Object.values(DEFAULT_SHORTCUTS).map((k) => k.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the help lists every canvas tool key exactly once and matches the bindings', () => {
    render(
      <MemoryRouter initialEntries={['/canvas']}>
        <DiagramProvider>
          <AppShell />
        </DiagramProvider>
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: '?' });
    const dialog = screen.getByRole('dialog', { name: 'Shortcuts' });
    const rows = Array.from(dialog.querySelectorAll('div > div')).filter((r) => !/outside canvas/.test(r.textContent ?? ''));
    const letters: string[] = [];
    for (const r of rows) {
      for (const st of Array.from(r.querySelectorAll('strong'))) {
        for (const tok of (st.textContent ?? '').split(/[\s/]+/)) if (/^[A-Z]$/.test(tok)) letters.push(tok);
      }
    }
    expect(new Set(letters).size).toBe(letters.length);
    for (const k of Object.values(DEFAULT_SHORTCUTS)) expect(letters).toContain(k.toUpperCase());
  });
});

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
/** Declarations of the first top-level rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('BUG-LIVE-021: dock tab bar never overlaps the close button', () => {
  it('the tab list scrolls instead of spilling under the close button, which never shrinks', () => {
    expect(rule('.utility-tablist')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.utility-tablist')).toMatch(/min-width:\s*0/);
    expect(rule('.utility-tab')).toMatch(/flex-shrink:\s*0/);
    expect(rule('.utility-close')).toMatch(/flex-shrink:\s*0/);
  });
});

describe('BUG-LIVE-024: empty-canvas card is centred on the canvas area', () => {
  it('reserves the same inset on both sides, so the card centre is the canvas centre (not shifted by the rail)', () => {
    const m = rule('.empty-canvas-overlay').match(/padding:\s*([^;]+);/);
    expect(m, 'padding declaration').not.toBeNull();
    const v = m![1].trim().split(/\s+/);
    // CSS shorthand: 1 = all, 2 = vertical horizontal, 3 = top horizontal bottom, 4 = top right bottom left.
    const right = v.length === 4 ? v[1] : v.length >= 2 ? v[1] : v[0];
    const left = v.length === 4 ? v[3] : v.length >= 2 ? v[1] : v[0];
    expect(left).toBe(right);
  });
});

describe('BUG-LIVE-023: outline and layer counts follow the active page', () => {
  function seeded() {
    setup();
    act(() => seedSampleDiagram(api()));
    return api().nodes.length;
  }

  it('Diagram outline shows the whole count on page 1 and 0 on an empty page 2', () => {
    const total = seeded();
    expect(total).toBeGreaterThan(0);
    expect(screen.getByText(`Diagram outline (${total})`)).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Add page' }).click());
    expect(screen.getByText('Diagram outline (0)')).toBeTruthy();
    expect(screen.getByText('No nodes yet.')).toBeTruthy();
  });

  it('the Layers panel counts only elements on the active page', () => {
    const total = seeded();
    act(() => screen.getByRole('button', { name: /^Layers, / }).click());
    const panel = screen.getByRole('region', { name: 'Layers' });
    expect(within(panel).getAllByLabelText(`${total} elements`).length).toBeGreaterThan(0);
    act(() => screen.getByRole('button', { name: 'Add page' }).click());
    expect(within(screen.getByRole('region', { name: 'Layers' })).queryAllByLabelText(`${total} elements`)).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: 'Layers' })).getAllByLabelText('0 elements').length).toBeGreaterThan(0);
  });
});

describe('BUG-LIVE-006/007/008: layout of the bottom controls and the library sidebar', () => {
  it('the pages bar is anchored bottom-right, not centred over the View toolbar', () => {
    const r = rule('.pages-bar');
    expect(r).toMatch(/right:\s*16px/);
    expect(r).not.toMatch(/translateX/);
    expect(r).not.toMatch(/left:\s*50%/);
    // The View toolbar is 72 px from the left and about 318 px wide: leave at least that free.
    const max = r.match(/max-width:\s*calc\(100% - (\d+)px\)/);
    expect(Number(max?.[1])).toBeGreaterThanOrEqual(72 + 318 + 16);
  });

  it('the pages bar renders with its class and no inline centring', () => {
    setup();
    const bar = document.querySelector('.pages-bar') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.left).toBe('');
    expect(bar!.style.transform).toBe('');
  });

  it('phones stack the pages bar above the View toolbar', () => {
    const m = css.match(/@media \(max-width: 600px\) \{\s*\.pages-bar,[\s\S]*?\n\}/);
    expect(m, 'mobile pages-bar block').not.toBeNull();
    expect(m![0]).toMatch(/bottom:\s*64px/);
    expect(m![0]).toMatch(/\.canvas-view-toolbar \{[^}]*left:\s*8px/);
  });

  it('the library sidebar collapses to a row on phones', () => {
    const m = css.match(/@media \(max-width: 720px\) \{\s*\.libshell \{ flex-direction: column; \}[\s\S]*?\n\}/);
    expect(m, 'mobile libside block').not.toBeNull();
    expect(m![0]).toMatch(/\.libside \{[^}]*width:\s*100%/);
    expect(m![0]).toMatch(/flex-direction:\s*row/);
    // The block sits after the base .libside__tree rule so its display:none wins the cascade.
    expect(css.indexOf('.libside__tree { list-style')).toBeLessThan(css.indexOf(m![0]));
  });
});
