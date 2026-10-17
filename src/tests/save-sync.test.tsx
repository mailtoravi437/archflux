import { describe, expect, it, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { DiagramProvider } from '../store';
import { useDiagram } from '../useDiagram';

type Store = ReturnType<typeof useDiagram>;
const latest: { v: Store | null } = { v: null };

function Probe() {
  latest.v = useDiagram();
  return null;
}

function setupStore(): Store {
  localStorage.clear();
  latest.v = null;
  render(
    <DiagramProvider>
      <Probe />
    </DiagramProvider>,
  );
  if (!latest.v) throw new Error('DiagramProvider did not provide context');
  return latest.v;
}

const store = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

describe('importArch safety (PROD-006/007)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hard failure leaves the previous graph unchanged', () => {
    setupStore();
    const before = store().nodes.map((n) => n.id);
    expect(before.length).toBeGreaterThan(0);
    let result: { imported: boolean; warnings: string[] } | null = null;
    act(() => {
      result = store().importArch({ bogus: true } as never);
    });
    expect(result?.imported).toBe(false);
    expect(store().nodes.map((n) => n.id)).toEqual(before);
  });

  it('applies valid imports and surfaces warnings to the caller', () => {
    setupStore();
    let result: { imported: boolean; warnings: string[] } | null = null;
    act(() => {
      result = store().importArch({
        nodes: [{ id: 'w1', x: 1, y: 2, w: 3, h: 4 }],
        edges: [],
        extra: 1,
      } as never);
    });
    expect(result?.imported).toBe(true);
    expect((result?.warnings ?? []).length).toBeGreaterThan(0);
    expect(store().nodes.some((n) => n.id === 'w1')).toBe(true);
  });
});

describe('resync failure visibility (PROD-008)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('offline resync leaves a Sync-failed state (not a silent toast)', () => {
    const nav = window.navigator as Navigator & { onLine: boolean };
    const wasOnline = nav.onLine;
    Object.defineProperty(nav, 'onLine', { value: false, configurable: true });
    try {
      setupStore();
      expect(store().isOnline).toBe(false);
      act(() => {
        store().resync();
      });
      expect(store().syncError).toMatch(/Sync failed/);
      expect(store().freshnessLabel).toContain('Sync failed');
    } finally {
      Object.defineProperty(nav, 'onLine', { value: wasOnline, configurable: true });
    }
  });
});
