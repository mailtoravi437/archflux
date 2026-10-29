import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Inspector } from '../screens/canvas/Inspector';
import { CanvasLocalContext, type CanvasLocalValue } from '../screens/canvas/CanvasLocalContext';
import type { ArchEdge, ArchNode } from '../types';

// R1-E14-T03: Inspector content matches Main.dc.html L180–L237 and DisplayStyles.dc.html.

const writes = vi.hoisted(() => ({
  updateNode: vi.fn(),
  setDisplayStyle: vi.fn(),
  duplicateSelected: vi.fn(),
  deleteSelected: vi.fn(),
  edges: [] as ArchEdge[],
  nodes: [] as ArchNode[],
}));

vi.mock('../state/useDiagram', () => ({
  useDiagram: () => ({
    nodes: writes.nodes,
    edges: writes.edges,
    selectedId: 'svc',
    setSelectedId: () => {},
    panToNode: () => {},
    updateNode: writes.updateNode,
    updateEdge: () => {},
    updateText: () => {},
    deleteText: () => {},
    deleteEdge: () => {},
    deleteSelected: writes.deleteSelected,
    duplicateSelected: writes.duplicateSelected,
    setDisplayStyle: writes.setDisplayStyle,
    multiSel: [],
    checkpoint: () => {},
    docDefaults: {},
    setDocDefaults: () => {},
  }),
}));

const node: ArchNode = {
  id: 'svc', type: 'service', label: 'Orders API', tag: 'Spring Boot', health: 'Healthy',
  x: 0, y: 0, w: 170, h: 70, stroke: '#2563EB',
};

function edge(id: string, from: string, to: string): ArchEdge {
  return { id, from, to, label: '', color: '#6B7280' } as unknown as ArchEdge;
}

function renderInspector(overrides: Partial<ArchNode> = {}) {
  const selected = { ...node, ...overrides };
  writes.nodes = [selected];
  const local: CanvasLocalValue = {
    selected,
    selectedEdge: null,
    selectedText: null,
    selToolbarPos: null,
    setSelectedEdgeId: () => {},
    setSelectedTextId: () => {},
    beginTextEdit: () => {},
  };
  return render(
    <CanvasLocalContext.Provider value={local}>
      <Inspector checkpointInspector={() => {}} />
    </CanvasLocalContext.Provider>,
  );
}

function openSection(name: string) {
  const btn = screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });
  if (btn.getAttribute('aria-expanded') !== 'true') act(() => { fireEvent.click(btn); });
}

beforeEach(() => {
  localStorage.clear();
  writes.updateNode.mockClear();
  writes.duplicateSelected.mockClear();
  writes.deleteSelected.mockClear();
  writes.edges = [];
});

describe('inspector fidelity (R1-E14-T03)', () => {
  it('header shows kind and connection count', () => {
    writes.edges = [edge('e1', 'svc', 'db'), edge('e2', 'gw', 'svc'), edge('e3', 'x', 'y')];
    renderInspector();
    expect(screen.getByRole('heading', { name: 'Orders API' })).toBeInTheDocument();
    // Two of the three edges touch the node.
    expect(screen.getByText('Service · 2 connections')).toBeInTheDocument();
  });

  it('colour swatches are six named unique colours', () => {
    renderInspector();
    openSection('Appearance');
    const group = screen.getByRole('group', { name: 'Colour' });
    const swatches = within(group).getAllByRole('button');
    expect(swatches.map((b) => b.getAttribute('aria-label'))).toEqual(['Blue', 'Violet', 'Green', 'Amber', 'Red', 'Gray']);
    // The node's current stroke (#2563EB) is the pressed swatch.
    expect(within(group).getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Violet' })).toHaveAttribute('aria-pressed', 'false');
    // Picking a colour writes the stroke.
    fireEvent.click(within(group).getByRole('button', { name: 'Violet' }));
    expect(writes.updateNode).toHaveBeenCalledWith('svc', { stroke: '#7C3AED' });
  });

  it('display radiogroup writes displayStyle', () => {
    renderInspector();
    openSection('Appearance');
    const group = screen.getByRole('radiogroup', { name: 'Display' });
    // Card is the default when displayStyle is unset.
    expect(within(group).getByRole('radio', { name: 'Card' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: 'Icon' }));
    // Goes through the store action so the size resets and it is one undo step (R1-E02-T05).
    expect(writes.setDisplayStyle).toHaveBeenCalledWith(['svc'], 'icon');
  });

  it('border radiogroup maps to strokeWidth', () => {
    renderInspector({ strokeWidth: 1.5 });
    openSection('Appearance');
    const group = screen.getByRole('radiogroup', { name: 'Border' });
    expect(within(group).getByRole('radio', { name: 'Regular' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: 'Thin' }));
    expect(writes.updateNode).toHaveBeenLastCalledWith('svc', { strokeWidth: 1, borderDashed: false });
    fireEvent.click(within(group).getByRole('radio', { name: 'Bold' }));
    expect(writes.updateNode).toHaveBeenLastCalledWith('svc', { strokeWidth: 2.5, borderDashed: false });
    fireEvent.click(within(group).getByRole('radio', { name: 'Dashed' }));
    expect(writes.updateNode).toHaveBeenLastCalledWith('svc', { borderDashed: true });
  });

  it('footer has Duplicate and Delete', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(writes.duplicateSelected).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(writes.deleteSelected).toHaveBeenCalledTimes(1);
    // The "Jump to node" select is gone; the outline and search replace it.
    expect(screen.queryByLabelText('Jump to node')).toBeNull();
  });
});
