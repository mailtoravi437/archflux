import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { layeredLayout } from '../lib/layout';
import type { ArchNode, ArchEdge } from '../types';

type Diagram = ReturnType<typeof useDiagram>;

const latest: { v: Diagram | null } = { v: null };
function Probe() {
  const d = useDiagram();
  useEffect(() => {
    latest.v = d;
  });
  return null;
}

function mount() {
  latest.v = null;
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

const s = (): Diagram => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

function node(id: string, x = 0, y = 0): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x, y, w: 120, h: 60, stroke: '#000' };
}

function edge(from: string, to: string): ArchEdge {
  return { id: `e-${from}-${to}`, from, to, label: '', color: '' };
}

function load(nodes: ArchNode[], edges: ArchEdge[]) {
  act(() => s().loadGraph(nodes, edges));
}

beforeEach(() => {
  localStorage.clear();
});

describe('store layout via lib/layout.ts (R1-E09-T05)', () => {
  it('dag layout on a cycle terminates', () => {
    mount();
    // A→B→A is the regression from R1-BUG-03: the old inline copy never terminated.
    load([node('a'), node('b')], [edge('a', 'b'), edge('b', 'a')]);
    expect(() => {
      act(() => s().applyLayout('dag'));
    }).not.toThrow();
    const laid = new Map(s().nodes.map((n) => [n.id, n]));
    expect(laid.size).toBe(2);
    expect(laid.get('a')).toBeDefined();
    expect(laid.get('b')).toBeDefined();
  });

  it('dag layout output unchanged for acyclic sample', () => {
    mount();
    const sample = [node('a', 500, 500), node('b', 0, 0), node('c', 40, 90)];
    const sampleEdges = [edge('a', 'b'), edge('b', 'c')];
    load(sample, sampleEdges);
    act(() => s().applyLayout('dag'));
    const expected = layeredLayout(sample, sampleEdges, 'LR');
    const byId = new Map(s().nodes.map((n) => [n.id, n]));
    for (const exp of expected) {
      const got = byId.get(exp.id);
      expect(got?.x).toBe(exp.x);
      expect(got?.y).toBe(exp.y);
    }
  });
});
