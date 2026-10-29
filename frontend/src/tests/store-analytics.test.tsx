import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';

vi.mock('../lib/analytics', () => ({ track: vi.fn(), flush: vi.fn(), setAnalyticsEnabled: vi.fn() }));

import { track } from '../lib/analytics';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  const v = useDiagram();
  useEffect(() => {
    latest.v = v;
  });
  return null;
}
const api = () => latest.v!;

describe('store analytics call sites', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
    render(<DiagramProvider><Probe /></DiagramProvider>);
  });

  it('addNode tracks element_added with the kind only', () => {
    act(() => api().addNode('db', 0, 0));
    expect(track).toHaveBeenCalledWith('element_added', { kind: 'db' });
  });

  it('connectNodes tracks relationship_added with relKind', () => {
    act(() => api().addNode('service', 0, 0));
    act(() => api().addNode('db', 400, 0));
    const [a, b] = api().nodes;
    act(() => api().connectNodes(a.id, b.id));
    expect(track).toHaveBeenCalledWith('relationship_added', { relKind: 'sync' });
  });

  it('insertConnected adds node and edge as one undo step with distinct edge ids', () => {
    act(() => api().addNode('service', 0, 0));
    const src = api().nodes[0];
    const mk = (id: string) => ({ ...src, id, x: 300, y: 0, label: id });
    act(() => api().insertConnected(mk('q1'), src.id));
    act(() => api().insertConnected(mk('q2'), src.id));
    expect(api().nodes.map((n) => n.id)).toEqual([src.id, 'q1', 'q2']);
    expect(api().edges).toHaveLength(2);
    expect(new Set(api().edges.map((e) => e.id)).size).toBe(2);
    act(() => api().undo());
    expect(api().nodes.map((n) => n.id)).toEqual([src.id, 'q1']);
    expect(api().edges).toHaveLength(1);
    act(() => api().undo());
    expect(api().nodes).toHaveLength(1);
    expect(api().edges).toHaveLength(0);
  });
});
