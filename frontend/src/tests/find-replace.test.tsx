import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { findMatches, replaceAll, similarTo, type FindQuery } from '../state/ops/findReplace';
import type { DocState } from '../state/ops/types';
import type { ArchNode, ArchEdge } from '../types';

function node(id: string, extra: Partial<ArchNode> = {}): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x: 0, y: 0, w: 120, h: 60, stroke: '#000', ...extra };
}

function edge(id: string, from: string, label: string): ArchEdge {
  return { id, from, to: null, label, color: '' };
}

function doc(nodes: ArchNode[], edges: ArchEdge[] = []): DocState {
  return {
    nodes,
    edges,
    strokes: [],
    texts: [],
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }],
  };
}

const q = (text: string, extra: Partial<FindQuery> = {}): FindQuery => ({
  text,
  fields: ['label', 'technology', 'edgeLabel', 'properties'],
  caseSensitive: false,
  wholeWord: false,
  pageScope: 'page',
  ...extra,
});

describe('find and replace ops (R1-E10-T05)', () => {
  it('finds in label and technology', () => {
    const s = doc([
      node('a', { label: 'Order Service', technology: 'Node.js' }),
      node('b', { label: 'Payments Gateway', technology: 'order-db' }),
      node('c', { label: 'Unrelated' }),
    ]);
    const m = findMatches(s, q('order'), 'pg-1');
    expect(m.map((x) => x.id)).toEqual(['a', 'b']);
    expect(m[0].field).toBe('label');
    expect(m[1].field).toBe('technology');
  });

  it('whole word', () => {
    const s = doc([node('a', { label: 'Order Service' }), node('b', { label: 'Preordering desk' })]);
    const whole = findMatches(s, q('order', { wholeWord: true }), 'pg-1');
    expect(whole.map((x) => x.id)).toEqual(['a']);
    const partial = findMatches(s, q('order', { wholeWord: false }), 'pg-1');
    expect(partial.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('replaces every matched field and leaves $-literals intact', () => {
    const s = doc([
      node('a', { label: 'Order Service', properties: { owner: 'order team' } }),
      node('b', { label: 'order-cli' }),
    ], [edge('e1', 'a', 'creates order')]);
    const out = replaceAll(s, q('order'), 'budget', 'pg-1');
    expect(out.edges[0].label).toBe('creates budget');
    const a = out.nodes.find((n) => n.id === 'a');
    const b = out.nodes.find((n) => n.id === 'b');
    expect(a?.label).toBe('budget Service');
    expect(a?.properties?.owner).toBe('budget team');
    expect(b?.label).toBe('budget-cli');
    expect(out.nodes.every((n) => !n.label.includes('order'))).toBe(true);
  });

  it('page scope: all searches nodes on other pages; page stays on the active page', () => {
    const s: DocState = {
      ...doc([node('a', { label: 'Alpha', pageId: 'pg-1' }), node('b', { label: 'Alpha', pageId: 'pg-2' })]),
      pages: [
        { id: 'pg-1', name: 'Page 1', order: 0 },
        { id: 'pg-2', name: 'Page 2', order: 1 },
      ],
    };
    expect(findMatches(s, q('alpha'), 'pg-1').map((x) => x.id)).toEqual(['a']);
    expect(findMatches(s, q('alpha', { pageScope: 'all' }), 'pg-1').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('select similar picks same kind on the page', () => {
    const s = doc([
      node('a', { kind: 'database' }),
      node('b', { kind: 'database' }),
      node('c', { kind: 'service' }),
      node('d', { kind: 'database', pageId: 'pg-2' }),
    ]);
    expect(similarTo(s, 'a')).toEqual(['a', 'b']);
  });
});

// The store action is a one-undo-step wrapper (spec: UI/Actions part).
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
const sd = (): Diagram => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

describe('store find and replace (R1-E10-T05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('replace all is one undo step', () => {
    mount();
    act(() => sd().loadGraph(
      [node('a', { label: 'Order Service' }), node('b', { label: 'order-cli' })],
      [],
    ));
    expect(sd().nodes.map((n) => [n.id, n.label])).toEqual([['a', 'Order Service'], ['b', 'order-cli']]);
    const nBefore = sd().canUndo;
    act(() => sd().replaceAll(q('order'), 'request', 'pg-1'));
    const labels = sd().nodes.map((n) => n.label).sort();
    expect(labels).toEqual(['request Service', 'request-cli'].sort());
    act(() => sd().undo());
    expect(sd().nodes.map((n) => n.label).sort()).toEqual(['Order Service', 'order-cli'].sort());
    expect(sd().canUndo).toBe(nBefore);
  });
});
