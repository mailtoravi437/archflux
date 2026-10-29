import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

const latest: { v: DiagramContextValue | null } = { v: null };

function Probe() {
  latest.v = useDiagram();
  return null;
}

function setupStore(): DiagramContextValue {
  latest.v = null;
  render(
    <DiagramProvider>
      <Probe />
    </DiagramProvider>,
  );
  if (!latest.v) throw new Error('DiagramProvider did not provide context');
  // First run is an empty canvas; these suites exercise a populated one.
  if (latest.v.nodes.length === 0) act(() => seedSampleDiagram(latest.v!));
  return latest.v;
}

const api = () => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

describe('connectNodes (click-to-connect store path)', () => {
  it('creates a resolved route edge between two nodes', () => {
    setupStore();
    const before = api().edges.length;
    act(() => {
      api().connectNodes('client', 'envoy');
    });
    const edges = api().edges;
    expect(edges.length).toBe(before + 1);
    const created = edges[edges.length - 1];
    expect(created.from).toBe('client');
    expect(created.to).toBe('envoy');
    expect(created.isDangling).not.toBe(true);
  });

  it('creates a dangling wire when the target is null', () => {
    setupStore();
    const before = api().edges.length;
    act(() => {
      api().connectNodes('auth', null, { x: 10, y: 20 });
    });
    const edges = api().edges;
    expect(edges.length).toBe(before + 1);
    const created = edges[edges.length - 1];
    expect(created.to).toBeNull();
    expect(created.isDangling).toBe(true);
  });

  it('clears orphan flags on both ends of a new connection', () => {
    setupStore();
    expect(api().nodes.find((n) => n.id === 'legacy-billing')?.isOrphan).toBe(true);
    act(() => {
      api().connectNodes('legacy-billing', 'client');
    });
    const nodes = api().nodes;
    expect(nodes.find((n) => n.id === 'legacy-billing')?.isOrphan).toBe(false);
    expect(nodes.find((n) => n.id === 'client')?.isOrphan).toBe(false);
  });
});

describe('updateNode / updateEdge (inspector + linter quick-fix paths)', () => {
  it('patches label, tag and health on a node', () => {
    setupStore();
    act(() => {
      api().updateNode('client', { label: 'Renamed Client', tag: 'New Tag', health: 'Critical' });
    });
    const node = api().nodes.find((n) => n.id === 'client');
    expect(node?.label).toBe('Renamed Client');
    expect(node?.tag).toBe('New Tag');
    expect(node?.health).toBe('Critical');
  });

  it('patches inline details on a node', () => {
    setupStore();
    act(() => {
      api().updateNode('client', { details: 'us-east-1 · 3 replicas' });
    });
    expect(api().nodes.find((n) => n.id === 'client')?.details).toBe('us-east-1 · 3 replicas');
  });

  it('tags a protocol on an ambiguous edge (linter Tag REST path)', () => {
    setupStore();
    const target = api().edges.find((e) => e.to && !e.isDangling && !e.protocol);
    expect(target).toBeDefined();
    act(() => {
      api().updateEdge(target!.id, { protocol: 'REST' });
    });
    expect(api().edges.find((e) => e.id === target!.id)?.protocol).toBe('REST');
  });
});
