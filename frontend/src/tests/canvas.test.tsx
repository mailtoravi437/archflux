import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

// jsdom has no canvas 2d context — stub it so the draw effect can run.
// paintCalls counts mutating paint ops to prove repaints happen live.
export const paintCalls = { n: 0 };
export const paintLog: { op: string; args: unknown[] }[] = [];
const PAINT_OPS = new Set(['fillRect', 'clearRect', 'fillText', 'strokeRect', 'fill', 'stroke', 'roundRect']);
function stub2d() {
  const makeCtx = () =>
    new Proxy(
      {},
      {
        get: (_t, p) => {
          if (p === 'measureText') return () => ({ width: 10 });
          if (p === 'getImageData') return () => ({ data: [] });
          if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern')
            return () => ({ addColorStop: () => {} });
          if (p === 'roundRect') return () => undefined;
          if (typeof p === 'string')
            return (...args: unknown[]) => {
              if (PAINT_OPS.has(p)) {
                paintCalls.n += 1;
                paintLog.push({ op: p, args });
              }
              return undefined;
            };
          return undefined;
        },
        set: () => true,
      },
    );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function () {
      return makeCtx();
    },
  });
  // jsdom reports zero-size viewports, which makes the canvas cull every
  // node as off-screen. Fake a desktop viewport so nodes actually paint.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
}

const latest: { v: DiagramContextValue | null } = { v: null };

function Probe() {
  latest.v = useDiagram();
  return null;
}

function setupCanvas() {
  latest.v = null;
  const view = render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
  if (!latest.v) throw new Error('store context lost');
  // First run is an empty canvas; these suites exercise a populated one.
  if (latest.v.nodes.length === 0) act(() => seedSampleDiagram(latest.v!));
  const canvas = view.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('canvas element missing');
  return { ...view, canvas };
}

const api = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

beforeAll(() => {
  stub2d();
});

beforeEach(() => {
  localStorage.clear();
});

describe('canvas node dragging', () => {
  it('moves a node on pointer drag with the select tool', () => {
    const { canvas } = setupCanvas();
    // Default store seeds mockNodes; 'client' sits at x:80 y:160 w:160 h:70.
    // Default zoom=1, pan={x:50,y:40}; jsdom rects are zero so
    // client (150,210) maps to world (100,170) — inside the node.
    const before = api().nodes.find((n) => n.id === 'client');
    expect(before).toBeDefined();

    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 260, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });

    const after = api().nodes.find((n) => n.id === 'client');
    // pointerdown world (100,170): dx=20, dy=10. pointermove world (150,220)
    // → raw target (130,210), but the alignment snap pulls the right edge
    // (290) to envoy's left edge (300, d=10 ≤ threshold) → lands at (140,210).
    expect(after?.x).toBe(140);
    expect(after?.y).toBe(210);
  });

  it('selects the node on pointerdown', () => {
    const { canvas } = setupCanvas();
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    expect(api().selectedId).toBe('client');
  });

  // R1-E01-T07: a plain click only selects; `C` arms the selected node.
  it('connects on click, C, click without a drag', () => {
    const { canvas, container } = setupCanvas();
    const before = api().edges.length;
    const click = (x: number, y: number) => {
      act(() => {
        canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0 }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
      });
    };
    click(150, 210); // select 'client' — no hint yet
    expect(container.querySelector('.connect-hint')).toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    expect(container.querySelector('.connect-hint')).not.toBeNull();
    click(350, 190); // click 'envoy' (world 300,150) without moving
    const edges = api().edges;
    expect(edges.length).toBe(before + 1);
    expect(edges[edges.length - 1].from).toBe('client');
    expect(edges[edges.length - 1].to).toBe('envoy');
    expect(container.querySelector('.connect-hint')).toBeNull();
  });

  it('repaints live during a drag (node visibly follows the pointer)', () => {
    const { canvas } = setupCanvas();
    paintCalls.n = 0;
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    const afterDown = paintCalls.n;
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 260, button: 0 }));
    });
    // A pointermove that moves the node must trigger fresh paint calls —
    // otherwise the drag is invisible until release.
    expect(paintCalls.n).toBeGreaterThan(afterDown);
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
  });

  it('renders details inside node bounds without overlapping the tag', () => {
    setupCanvas();
    paintLog.length = 0;
    act(() => {
      api().updateNode('client', { details: 'mimkmimk.ml' });
    });
    // 'client' is a 160x70 card at (80,160) with an icon slot:
    // the details column is the card's text column (x + 54 = 134: padding 12 + icon 32 + gap 10) and the
    // first details line must sit clearly inside the box (bottom edge y=224,
    // details stop at bottomPad = 6 → y ≤ 218).
    const detailCalls = paintLog.filter(
      (c) => c.op === 'fillText' && typeof c.args[0] === 'string' && (c.args[0] as string).includes('mimkmimk'),
    );
    expect(detailCalls.length).toBeGreaterThan(0);
    for (const c of detailCalls) {
      const x = c.args[1] as number;
      const y = c.args[2] as number;
      expect(x).toBe(134); // card text column (x + 54), not right-aligned
      expect(y).toBeGreaterThanOrEqual(160);
      expect(y).toBeLessThanOrEqual(224);
    }
  });

  it('paints every node label and tag inside its own box (FE-V2)', () => {
    setupCanvas();
    paintLog.length = 0;
    act(() => {
      api().updateNode('client', { label: 'Client Gateway' });
    });
    for (const node of api().nodes) {
      for (const text of [node.label, node.tag]) {
        // Long text is ellipsized by the renderer: match on a stable prefix.
        const prefix = text.slice(0, 12);
        const calls = paintLog.filter((c) => c.op === 'fillText' && typeof c.args[0] === 'string' && (c.args[0] as string).startsWith(prefix));
        expect(calls.length, `${node.id} "${text}" painted`).toBeGreaterThan(0);
        // Another node may share the same text; at least one paint must land in this node.
        const inside = calls.some((c) => {
          const x = c.args[1] as number;
          const y = c.args[2] as number;
          return x >= node.x && x < node.x + node.w && y >= node.y && y <= node.y + node.h;
        });
        expect(inside, `${node.id} "${text}" inside its box`).toBe(true);
      }
    }
  });

  it('renders no health mark on nodes', () => {
    setupCanvas();
    paintLog.length = 0;
    act(() => {
      api().updateNode('client', { details: 'mimkmimk.ml' });
    });
    const texts = paintLog.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).not.toContain('Healthy');
    expect(texts).not.toContain('99.98%');
  });

  it('dragging a node does not create an edge', () => {
    const { canvas } = setupCanvas();
    const before = api().edges.length;
    const click = (x: number, y: number) => {
      act(() => {
        canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0 }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
      });
    };
    click(350, 320); // select 'auth' (world 300,280)
    // Grab 'order' 20 px inside its corner: the 8 px edge band starts a
    // connection drag (R1-E01-T07), the interior moves the node.
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 590, clientY: 150, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 620, clientY: 180, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
    expect(api().edges.length).toBe(before);
    const order = api().nodes.find((n) => n.id === 'order');
    expect(order?.x).toBe(550);
    expect(order?.y).toBe(120);
  });
});

describe('tool rail icons', () => {
  it('renders an icon for every rail button', () => {
    const { container } = setupCanvas();
    // R1-E14-T02: inline 18 px stroke SVGs from Main.dc.html replace the old /icons/tools set.
    const btns = Array.from(container.querySelectorAll('.vertical-tool-rail .rail-btn'));
    expect(btns.length).toBe(11);
    for (const btn of btns) {
      const svg = btn.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('18');
      expect(btn.querySelector('img')).toBeNull();
    }
  });

  it('exposes the four shape tools with labels', () => {
    const { container } = setupCanvas();
    // R1-E01-T04: icon-only rail; the tool name is the accessible name.
    const labels = Array.from(container.querySelectorAll('.vertical-tool-rail .rail-btn')).map((el) => el.getAttribute('aria-label'));
    for (const expected of ['Service (S)', 'Gateway (G)', 'Database (D)', 'Queue (Q)']) {
      expect(labels).toContain(expected);
    }
  });
});
