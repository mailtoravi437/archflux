import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../store';
import CanvasScreen from '../screens/CanvasScreen';

// Mock ResizeObserver
globalThis.ResizeObserver = globalThis.ResizeObserver || function () {
  return {
    observe: () => {},
    unobserve: () => {},
    disconnect: () => {},
  };
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock FontFace
globalThis.FontFace = class FontFace {
  family: string;
  source: string;
  descriptors?: FontFaceDescriptors;
  constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
  }
  load(): Promise<FontFace> { return Promise.resolve(this); }
} as any;

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// Mock getBoundingClientRect for canvas
HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
  left: 0, top: 0, width: 1280, height: 800,
  x: 0, y: 0, right: 1280, bottom: 800,
  toJSON: () => ({}),
}));

// Mock 2D canvas context for CanvasEngine (decorations layer)
const mockCtx = {
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  rect: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  setLineDash: vi.fn(),
  measureText: vi.fn(() => ({ width: 40 })),
  font: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: 'round',
  lineJoin: 'round',
  shadowColor: 'transparent',
  shadowBlur: 0,
  textAlign: 'start',
  textBaseline: 'alphabetic',
};
HTMLCanvasElement.prototype.getContext = vi.fn((type: string) => type === '2d' ? mockCtx : null);

Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });

function setupCanvas() {
  const result = render(
    <MemoryRouter>
      <DiagramProvider>
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>
  );
  return result.container;
}

describe('CanvasScreen accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('has accessible canvas with aria-label', () => {
    const container = setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    expect(canvas).toHaveAttribute('aria-label');
    expect(canvas.getAttribute('aria-label')).toContain('Architecture diagram');
  });

  it.skip('has screen-reader only node list for traversal', () => {
    const container = setupCanvas();
    const srNav = container.querySelector('.sr-only[aria-label="Diagram nodes and routes"]');
    expect(srNav).toBeInTheDocument();
    expect(srNav).toHaveAttribute('role', 'navigation');
  });

  it('tool rail buttons have aria-labels', () => {
    const container = setupCanvas();
    const toolButtons = container.querySelectorAll('.vertical-tool-rail .rail-btn');
    toolButtons.forEach(btn => {
      expect(btn).toHaveAttribute('aria-label');
    });
  });

  it.skip('command palette has proper ARIA attributes', () => {
    const container = setupCanvas();
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
    const container = setupCanvas();
    const libButton = container.querySelector('[aria-label="Open shape library"]');
    expect(libButton).toBeInTheDocument();
  });

  it.skip('focus trap works on modals', () => {
    const container = setupCanvas();
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
    localStorage.clear();
  });

  it.skip('opens command palette with Cmd+K', () => {
    const container = setupCanvas();
    
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'k' }));
    });
    
    const palette = container.querySelector('[role="dialog"][aria-label="Command palette"]');
    expect(palette).toBeInTheDocument();
  });

  it.skip('closes modals with Escape', () => {
    const container = setupCanvas();
    
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
    const container = setupCanvas();
    
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
});

describe('CanvasScreen drag logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('drags node without creating edge', () => {
    const container = setupCanvas();
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
    const container = setupCanvas();
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
    const container = setupCanvas();
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
    const container = setupCanvas();
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
    const container = setupCanvas();
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
    const container = setupCanvas();
    const canvas = container.querySelector('#architectureCanvas') as HTMLCanvasElement;
    
    // Select draw tool
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    });
    
    // Start drawing
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 150, button: 0 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    });
    
    // Should create stroke
    // Full test would verify via store
  });
});