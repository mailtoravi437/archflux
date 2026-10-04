import { expect, vi } from 'vitest';

// Suppress console.errors during tests (they're often expected)
const originalError = console.error;
console.error = (...args) => {
  if (/Test failed|Warning|CSP|Script error/.test(String(args[0]))) {
    return originalError.apply(console, args);
  }
};

// Restore after each test
afterEach(() => {
  console.error = originalError;
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value || '';
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    key() {
      return Object.keys(store)[0] || null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

globalThis.localStorage = localStorageMock;

// Mock window.matchMedia
globalThis.matchMedia = globalThis.matchMedia || function (query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
};

// Mock ResizeObserver
globalThis.ResizeObserver = globalThis.ResizeObserver || function () {
  const callbacks = [];
  return {
    observe: () => {},
    unobserve: () => {},
  };
};

// Mock CSS font loading
globalThis.FontFace = globalThis.FontFace || function (family, style) {
  return {
    load: () => Promise.resolve(),
    status: 'loaded',
    family,
    style,
  };
};

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || function (cb) {
  return setTimeout(cb, 0);
};
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;