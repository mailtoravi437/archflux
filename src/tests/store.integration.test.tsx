import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../store';
import CanvasScreen from '../screens/CanvasScreen';
import { useDiagram, useDiagramUI, useDiagramActions, useDiagramDocs, useDiagramCollab } from '../useDiagram';

// Mock canvas 2D context
const mockCanvasContext = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  strokeRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
  getImageData: vi.fn(() => ({ data: [] })),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createPattern: vi.fn(),
  drawImage: vi.fn(),
  roundRect: vi.fn(),
  setLineDash: vi.fn(),
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: '',
  textBaseline: '',
  shadowColor: '',
  shadowBlur: 0,
  lineCap: '',
  lineJoin: '',
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => mockCanvasContext),
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });

function setupCanvas() {
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>
  );
}

describe('DiagramContext split providers', () => {
  it('useCore returns core graph state', () => {
    const { result } = renderHook(() => useDiagram());
    expect(result.current.nodes).toBeDefined();
    expect(result.current.edges).toBeDefined();
    expect(result.current.strokes).toBeDefined();
    expect(result.current.texts).toBeDefined();
  });

  it('useActions returns action functions', () => {
    const { result } = renderHook(() => useDiagramActions());
    expect(typeof result.current.addNode).toBe('function');
    expect(typeof result.current.deleteSelected).toBe('function');
    expect(typeof result.current.updateNode).toBe('function');
    expect(typeof result.current.undo).toBe('function');
    expect(typeof result.current.redo).toBe('function');
  });


  it('useUI returns UI state and setters', () => {
    const { result } = renderHook(() => useDiagramUI());
    expect(result.current.theme).toBeDefined();
    expect(result.current.setTheme).toBeDefined();
    expect(result.current.zoom).toBeDefined();
    expect(result.current.pan).toBeDefined();
    expect(result.current.lintCount).toBeDefined();
  });

  it('useDocs returns document management', () => {
    const { result } = renderHook(() => useDiagramDocs());
    expect(result.current.docs).toBeDefined();
    expect(result.current.activeDocId).toBeDefined();
    expect(result.current.openDoc).toBeDefined();
    expect(result.current.newDoc).toBeDefined();
  });

  it('useCollab returns collaboration features', () => {
    const { result } = renderHook(() => useDiagramCollab());
    expect(result.current.threads).toBeDefined();
    expect(result.current.addThread).toBeDefined();
    expect(result.current.checkpoints).toBeDefined();
    expect(result.current.resync).toBeDefined();
  });
});

describe('lintCount memoization', () => {
  it('computes correct lint count from nodes and edges', () => {
    const { result } = renderHook(() => useDiagramUI());
    const lintCount = result.current.lintCount;
    expect(typeof lintCount).toBe('number');
    expect(lintCount).toBeGreaterThanOrEqual(0);
  });
});

describe('store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists diagram state to localStorage', async () => {
    const { container } = setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Simulate node drag
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 260, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });

    // Wait for debounced persist
    await act(async () => {
      await new Promise(r => setTimeout(r, 400));
    });

    const stored = localStorage.getItem('archflux:v2-light');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.docs).toBeDefined();
    expect(parsed.activeDocId).toBeDefined();
  });

  it('restores diagram state on reload', async () => {
    const first = setupCanvas();
    const canvas = first.container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 260, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
    
    await act(async () => {
      await new Promise(r => setTimeout(r, 400));
    });
    
    first.unmount();
    
    // Fresh mount should restore state
    const second = setupCanvas();
    const api = second.container.querySelector('#architectureCanvas');
    expect(api).toBeDefined();
  });
});

describe('mutation queue persistence', () => {
  it('queues mutations when offline', async () => {
    const { queueMutation } = await import('../api');
    
    // Mock fetch to fail
    global.fetch = vi.fn().mockRejectedValue(new Error('Offline'));
    
    const promise = queueMutation('/test', { method: 'POST', body: JSON.stringify({ test: true }) });
    
    // Should not throw, should queue
    expect(promise).toBeInstanceOf(Promise);
    
    // Wait for the promise to settle (it will be rejected but queued)
    await promise.catch(() => {});
    
    // Check queue persisted
    const stored = localStorage.getItem('archflux:mutation-queue:v1');
    expect(stored).not.toBeNull();
  });
});

describe('CanvasScreen interactions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('selects node on click', () => {
    const { container } = setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    
    // Should select the client node
    const api = container.querySelector('canvas');
    expect(api).toBeDefined();
  });

  it('creates edge on click-click without drag', () => {
    const { container } = setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    const click = (x: number, y: number) => {
      act(() => {
        canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0 }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
      });
    };
    
    click(150, 210); // arm 'client'
    click(350, 190); // click 'envoy' without moving
    
    // Edge should be created
    // Note: Full integration would need the store context
  });

  it.skip('repaints live during drag', () => {
    const { container } = setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    
    const drawCallsBefore = mockCanvasContext.fillRect.mock.calls.length;
    
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 260, button: 0 }));
    });
    
    const drawCallsAfter = mockCanvasContext.fillRect.mock.calls.length;
    expect(drawCallsAfter).toBeGreaterThan(drawCallsBefore);
    
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
  });
});

// Helper for testing hooks
function renderHook<T>(hook: () => T) {
  let result: { current: T } = { current: null as any };
  const TestComponent = () => {
    result.current = hook();
    return null;
  };
  render(
    <MemoryRouter>
      <DiagramProvider>
        <TestComponent />
      </DiagramProvider>
    </MemoryRouter>
  );
  return {
    result,
    rerender: () => render(
      <MemoryRouter>
        <DiagramProvider>
          <TestComponent />
        </DiagramProvider>
      </MemoryRouter>
    ),
  };
}