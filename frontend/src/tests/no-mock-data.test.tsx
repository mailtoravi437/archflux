import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';

// FRONTEND_SPEC "No mock data" (v1.5.0) acceptance 1–4.

const latest: { v: DiagramContextValue | null } = { v: null };

function Probe() {
  latest.v = useDiagram();
  return null;
}

function freshStore(): DiagramContextValue {
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

const api = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

beforeEach(() => {
  localStorage.clear();
});

describe('first run (FE-M1, FE-M5)', () => {
  it('starts with one empty untitled document and no review state', () => {
    const s = freshStore();
    expect(s.nodes).toHaveLength(0);
    expect(s.edges).toHaveLength(0);
    expect(s.docs).toHaveLength(1);
    expect(s.docTitle).toBe('untitled.arch');
    expect(s.threads).toHaveLength(0);
    expect(s.checkpoints).toHaveLength(0);
    expect(s.syncLog).toHaveLength(0);
    expect(s.driftCount).toBe(0);
    expect(s.freshness).toBe('local');
  });
});

describe('resync without a connected source (FE-M2)', () => {
  it('leaves the graph unchanged and reports Not connected', () => {
    freshStore();
    act(() => {
      api().addNode('service', 100, 100);
    });
    const before = api().nodes.map((n) => n.id);
    act(() => {
      api().resync();
    });
    expect(api().nodes.map((n) => n.id)).toEqual(before);
    expect(api().freshness).toBe('local');
    expect(api().freshnessLabel).toMatch(/Not connected/);
    expect(api().syncError).toBeNull();
  });
});

describe('lint heal without demo ids (FE-M7)', () => {
  it('binds an isolated node to the most-connected node', () => {
    freshStore();
    const N = (id: string) => ({ id, type: 'service', label: id, tag: 't', health: 'ok', x: 0, y: 0, w: 100, h: 50, stroke: '#000' });
    act(() => {
      api().loadGraph(
        [N('hub'), N('a'), N('b'), N('lonely')],
        [
          { id: 'e1', from: 'hub', to: 'a', label: '', color: '#000' },
          { id: 'e2', from: 'hub', to: 'b', label: '', color: '#000' },
        ],
      );
    });
    act(() => {
      api().healOrphan('lonely', true);
    });
    const healed = api().edges.find((e) => e.to === 'lonely');
    expect(healed?.from).toBe('hub');
  });
});

describe('shipped source contains no fabricated content (acceptance 1, 4)', () => {
  const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../tests/**', '!../assets/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('has no mocks module and no app import of tests/', () => {
    expect(Object.keys(sources).some((p) => /\/mocks\.tsx?$/.test(p))).toBe(false);
    const offenders = Object.entries(sources)
      .filter(([, text]) => /from ['"][./]*tests\//.test(text))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('contains none of the former demo names, PRs or diagram ids', () => {
    const banned = /Elena|Marcus T\.|Fraud Detection Worker|PR #14[0-2]|checkout-event-driven-mesh/;
    const offenders = Object.entries(sources)
      .filter(([, text]) => banned.test(text))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});
