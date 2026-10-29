import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../lib/analytics', () => ({ track: vi.fn(), flush: vi.fn(), setAnalyticsEnabled: vi.fn() }));
import { track } from '../lib/analytics';
import CompareView from '../components/compare/CompareView';
import { revertChangeAndSave } from '../components/compare/revert';
import { buildCompareScene } from '../state/compare';
import { semanticDiff } from '../lib/semanticDiff';
import type { DocState } from '../state/ops/types';
import type { ArchEdge, ArchNode } from '../types';

function node(over: Partial<ArchNode> & { id: string }): ArchNode {
  return { type: 'service', label: over.id, tag: '', health: '', x: 0, y: 0, w: 100, h: 60, stroke: '#000', ...over };
}
function edge(over: Partial<ArchEdge> & { id: string }): ArchEdge {
  return { from: 'a', to: 'b', label: '', color: '#000', ...over };
}
function doc(nodes: ArchNode[], edges: ArchEdge[] = []): DocState {
  return {
    nodes, edges, strokes: [], texts: [],
    pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }],
    layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }],
  };
}
function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

const before = doc([node({ id: 'a', label: 'API' }), node({ id: 'lock', label: 'Payment Lock', x: 300, y: 200 }), node({ id: 'm', label: 'Mover', x: 10, y: 10 })]);
const after = doc([node({ id: 'a', label: 'API v2' }), node({ id: 'm', label: 'Mover', x: 400, y: 10 }), node({ id: 'saga', label: 'Saga', x: 500, y: 300 })]);

const props = { before, after, beforeLabel: 'v11 · Saga orchestration', afterLabel: 'Current', isDark: false, canRevert: true, onSwap: () => {}, onExit: () => {}, onRevert: () => {} };

describe('compare view (R1-E08-T04)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom has no 2D context; the scene and pan state are asserted without pixels.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('tracks compare_opened once per opening, with no props', () => {
    vi.mocked(track).mockClear();
    const { rerender } = render(<CompareView {...props} />);
    rerender(<CompareView {...props} isDark />);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('compare_opened');
  });

  it('renders removed nodes as ghosts with diff flag', () => {
    const scene = buildCompareScene(before, after, false);
    const ghost = scene.nodes.find((n) => n.node.id === 'lock');
    expect(ghost?.status.diff).toBe('removed');
    expect(scene.nodes.find((n) => n.node.id === 'saga')?.status.diff).toBe('added');
    expect(scene.nodes.find((n) => n.node.id === 'a')?.status.diff).toBe('changed');
    // The ghost comes from the before side: it is not in the after document.
    expect(after.nodes.some((n) => n.id === 'lock')).toBe(false);
    render(<CompareView {...props} />);
    expect(screen.getByRole('region', { name: 'Removed 1' })).toBeTruthy();
    expect(screen.getByText('Comparing v11 · Saga orchestration → Current')).toBeTruthy();
  });

  it('change list click pans to element', () => {
    render(<CompareView {...props} />);
    const canvas = screen.getByTestId('compare-canvas');
    const before0 = canvas.getAttribute('data-pan-x');
    fireEvent.click(screen.getByRole('button', { name: 'Saga' }));
    expect(canvas.getAttribute('data-focus')).toBe('saga');
    // viewport 800x520 in jsdom: node centre (550, 330) lands in the middle.
    expect(canvas.getAttribute('data-pan-x')).toBe(String(800 / 2 - 550));
    expect(canvas.getAttribute('data-pan-y')).toBe(String(520 / 2 - 330));
    expect(canvas.getAttribute('data-pan-x')).not.toBe(before0);
  });

  it('revert this change saves with source revert and leaves other edits', async () => {
    const puts: Array<{ body: Record<string, unknown>; url: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'GET') return respond(200, { data: { id: 'd', graph: { defaults: { propertyLine: 'owner' } }, version: 3 } });
      puts.push({ url, body: JSON.parse(String(init?.body)) });
      return respond(200, { data: { id: 'd', version: 4 } });
    });
    const change = semanticDiff(before, after).changes.find((c) => c.id === 'a')!;
    const next = await revertChangeAndSave('123e4567-e89b-12d3-a456-426614174000', change, after, 3);
    expect(puts).toHaveLength(1);
    expect(puts[0].body.source).toBe('revert');
    expect(puts[0].body.version).toBe(3);
    const graph = puts[0].body.graph as { nodes: ArchNode[]; defaults?: unknown };
    expect(graph.nodes.find((n) => n.id === 'a')?.label).toBe('API');
    // Other edits stay: the moved node and the added node are untouched; defaults are preserved.
    expect(graph.nodes.find((n) => n.id === 'm')?.x).toBe(400);
    expect(graph.nodes.some((n) => n.id === 'saga')).toBe(true);
    expect(graph.defaults).toEqual({ propertyLine: 'owner' });
    expect(next.nodes).toEqual(graph.nodes);
  });

  it('layout changes hidden by default', () => {
    render(<CompareView {...props} />);
    expect(screen.queryByRole('region', { name: /^Moved/ })).toBeNull();
    expect(buildCompareScene(before, after, false).moves).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show layout changes' }));
    expect(screen.getByRole('region', { name: 'Moved 1' })).toBeTruthy();
    expect(buildCompareScene(before, after, true).moves).toEqual([{ id: 'm', from: { x: 60, y: 40 }, to: { x: 450, y: 40 } }]);
  });

  it('Esc exits compare and restores editing', async () => {
    const onExit = vi.fn();
    render(<CompareView {...props} onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'j' });
    await waitFor(() => expect(screen.getByTestId('compare-canvas').getAttribute('data-focus')).not.toBe(''));
  });
});
