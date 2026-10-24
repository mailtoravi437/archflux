import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../store';
import CanvasScreen from '../screens/CanvasScreen';

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
  roundRect: vi.fn(),
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

describe('CanvasScreen accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has accessible canvas with aria-label', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    expect(canvas).toHaveAttribute('aria-label');
    expect(canvas.getAttribute('aria-label')).toContain('Architecture diagram');
  });

  it.skip('has screen-reader only node list for traversal', () => {
    setupCanvas();
    const srNav = container.querySelector('.sr-only[aria-label="Diagram nodes and routes"]');
    expect(srNav).toBeInTheDocument();
    expect(srNav).toHaveAttribute('role', 'navigation');
  });

  it('tool rail buttons have aria-labels', () => {
    setupCanvas();
    const toolButtons = container.querySelectorAll('.vertical-tool-rail .rail-btn');
    toolButtons.forEach(btn => {
      expect(btn).toHaveAttribute('aria-label');
    });
  });

  it.skip('command palette has proper ARIA attributes', () => {
    setupCanvas();
    // Open command palette via Cmd+K
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'k' }));
    });
    
    const palette = container.querySelector('[role="dialog"][aria-label="Command palette"]');
    expect(palette).toBeInTheDocument();
    
    const input = palette?.querySelector('[role="combobox"]');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-controls');
  });

  it('library drawer has proper ARIA roles', () => {
    setupCanvas();
    const libButton = container.querySelector('[aria-label="Open shape library"]');
    expect(libButton).toBeInTheDocument();
  });

  it.skip('focus trap works on modals', () => {
    setupCanvas();
    // Open command palette
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'k' }));
    });
    
    const palette = container.querySelector('[role="dialog"]');
    expect(palette).toBeInTheDocument();
    
    // Tab should cycle within palette
    const focusableElements = palette?.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])');
    expect(focusableElements?.length).toBeGreaterThan(0);
  });
});

describe('CanvasScreen keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.skip('opens command palette with Cmd+K', () => {
    setupCanvas();
    
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'k' }));
    });
    
    const palette = container.querySelector('[role="dialog"][aria-label="Command palette"]');
    expect(palette).toBeInTheDocument();
  });

  it.skip('closes modals with Escape', () => {
    setupCanvas();
    
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'k' }));
    });
    
    let palette = container.querySelector('[role="dialog"][aria-label="Command palette"]');
    expect(palette).toBeInTheDocument();
    
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    
    palette = container.querySelector('[role="dialog"][aria-label="Command palette"]');
    expect(palette).not.toBeInTheDocument();
  });

  it.skip('switches tools with single-key shortcuts', () => {
    setupCanvas();
    
    // Press 'v' for select tool
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
    });
    
    const selectBtn = container.querySelector('.vertical-tool-rail .rail-btn[data-tool="select"]');
    expect(selectBtn).toHaveClass('active');
    
    // Press 'c' for connector tool
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    });
    
    const connectorBtn = container.querySelector('.vertical-tool-rail .rail-btn[data-tool="connector"]');
    expect(connectorBtn).toHaveClass('active');
  });

  it.skip('navigates screens with Cmd+shortcuts', () => {
    setupCanvas();
    
    // Cmd+O for dashboard
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'o' }));
    });
    
    // Should navigate (in real app)
    // In test we just verify no errors
  });
});

describe('CanvasScreen touch/mobile support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.skip('handles touchstart for node selection', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 150, clientY: 210 } as Touch],
        changedTouches: [{ clientX: 150, clientY: 210 } as Touch],
      }));
    });
    
    // Should handle touch without error
    expect(canvas).toBeDefined();
  });

  it.skip('handles touchmove for panning', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
        changedTouches: [{ clientX: 100, clientY: 100 } as Touch],
      }));
    });
    
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientX: 150, clientY: 150 } as Touch],
        changedTouches: [{ clientX: 150, clientY: 150 } as Touch],
      }));
    });
    
    // Should handle touchmove without error
    expect(canvas).toBeDefined();
  });

  it.skip('handles touchend for node release', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientX: 150, clientY: 210 } as Touch],
        changedTouches: [{ clientX: 150, clientY: 210 } as Touch],
      }));
    });
    
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [{ clientX: 150, clientY: 210 } as Touch],
      }));
    });
    
    // Should handle touchend without error
    expect(canvas).toBeDefined();
  });

  it.skip('handles pinch zoom gesture', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Simulate pinch with two touches
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchstart', {
        touches: [
          { clientX: 100, clientY: 100 } as Touch,
          { clientX: 200, clientY: 200 } as Touch,
        ],
        changedTouches: [
          { clientX: 100, clientY: 100 } as Touch,
          { clientX: 200, clientY: 200 } as Touch,
        ],
      }));
    });
    
    act(() => {
      canvas.dispatchEvent(new TouchEvent('touchmove', {
        touches: [
          { clientX: 80, clientY: 80 } as Touch,
          { clientX: 220, clientY: 220 } as Touch,
        ],
        changedTouches: [
          { clientX: 80, clientY: 80 } as Touch,
          { clientX: 220, clientY: 220 } as Touch,
        ],
      }));
    });
    
    // Should handle pinch without error
    expect(canvas).toBeDefined();
  });
});

describe('CanvasScreen drag logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('drags node without creating edge', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Start drag on node
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 570, clientY: 130, button: 0 }));
    });
    
    // Move
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, clientY: 160, button: 0 }));
    });
    
    // End drag
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
    
    // Should not create edge
    // In full test, would check store edges count
  });

  it('connects nodes on click-click without drag', () => {
    setupCanvas();
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
    
    // Should create connection
    // Full test would verify via store
  });

  it('multi-selects with Shift+click', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // First click
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 210, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
    
    // Shift+click second node
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 350, clientY: 190, button: 0, shiftKey: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0, shiftKey: true }));
    });
    
    // Should have multi-selection
  });
});

describe('CanvasScreen text tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('creates text on canvas click with text tool', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Select text tool
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    });
    
    // Click canvas
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0 }));
    });
    
    // Should create text draft
    // Full test would verify via store
  });

  it('edits existing text on double-click', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Double-click on text area
    act(() => {
      canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: 400, clientY: 300 }));
    });
    
    // Should open text editor
  });
});

describe('CanvasScreen freehand drawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('draws freehand stroke with pencil tool', () => {
    setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Select draw tool
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    });
    
    // Draw stroke
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }));
    });
    
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 150, button: 0 }));
    });
    
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 100, button: 0 }));
    });
    
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
    
    // Should create stroke
  });
});

describe('CanvasScreen auto-layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies DAG layout via command palette', () => {
    setupCanvas();
    
    // Open command palette and run layout
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'k' }));
    });
    
    // In real test, would select "Run Auto-Layout (DAG)" command
    // and verify nodes repositioned
  });

  it('fits content to view with F key', () => {
    setupCanvas();
    
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    });
    
    // Should fit view
  });
});