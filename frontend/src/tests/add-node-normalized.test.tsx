// BUG-LIVE-011: a freshly placed node must equal the same node after a reload.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { normalizeNode } from '../lib/docModel';
import type { CanvasTool } from '../types';

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  const value = useDiagram();
  useEffect(() => {
    latest.v = value;
  });
  return null;
}

beforeEach(() => {
  localStorage.clear();
  latest.v = null;
});
afterEach(cleanup);

describe('addNode normalisation (BUG-LIVE-011)', () => {
  it.each<CanvasTool>(['service', 'gateway', 'db', 'stream'])('a fresh %s node is already in its reloaded shape', (tool) => {
    render(<DiagramProvider><Probe /></DiagramProvider>);
    act(() => latest.v!.addNode(tool, 120, 80));
    const node = latest.v!.nodes[0];
    expect(node.kind).toBeTruthy();
    expect(node.displayStyle).toBeTruthy();
    expect(node.pageId).toBeTruthy();
    expect(node.layerId).toBeTruthy();
    expect(node.technology).toBe(node.tag);
    // Reload runs normalizeNode over the saved node: it must change nothing.
    expect(normalizeNode(node, { id: '', title: '', nodes: [], edges: [], createdAt: 0, updatedAt: 0 })).toEqual(node);
  });

  it('a fresh node with no connections is flagged as not connected', () => {
    render(<DiagramProvider><Probe /></DiagramProvider>);
    act(() => latest.v!.addNode('service', 10, 10));
    expect(latest.v!.nodes[0].isOrphan).toBe(true);
  });
});
