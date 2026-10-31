import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Inspector } from '../screens/canvas/Inspector';
import { CanvasLocalContext, type CanvasLocalValue } from '../screens/canvas/CanvasLocalContext';
import type { ArchEdge, ArchNode } from '../types';

// R1-E14-T08: nothing-selected outline rows match States.dc.html "Inspector, nothing selected".

const LONG = 'Multi-Region AWS VPC with Global Accelerator & Failover';
const h = vi.hoisted(() => ({ setSelectedId: vi.fn(), nodes: [] as ArchNode[], edges: [] as ArchEdge[] }));

vi.mock('../state/useDiagram', () => ({
  useDiagram: () => ({
    nodes: h.nodes, edges: h.edges, selectedId: null, setSelectedId: h.setSelectedId, panToNode: () => {},
    updateNode: () => {}, updateEdge: () => {}, updateText: () => {}, deleteText: () => {}, deleteEdge: () => {},
    deleteSelected: () => {}, duplicateSelected: () => {}, setDisplayStyle: () => {}, multiSel: [], checkpoint: () => {},
    docDefaults: {}, setDocDefaults: () => {},
    pages: [], activePageId: '',
  }),
}));

function n(id: string, label: string, x: number): ArchNode {
  return { id, type: 'service', label, tag: 'Spring Boot', health: 'Healthy', x, y: 0, w: 170, h: 70, stroke: '#2563EB' } as ArchNode;
}

function setup() {
  h.nodes = [n('a', LONG, 0), n('b', 'Same name', 10), n('c', 'Same name', 20)];
  h.edges = [{ id: 'e1', from: 'a', to: 'b', label: '', color: '#6B7280' }, { id: 'e2', from: 'c', to: 'a', label: '', color: '#6B7280' }] as unknown as ArchEdge[];
  const local: CanvasLocalValue = {
    selected: null, selectedEdge: null, selectedText: null, selToolbarPos: null,
    setSelectedEdgeId: () => {}, setSelectedTextId: () => {}, beginTextEdit: () => {},
  };
  return render(
    <CanvasLocalContext.Provider value={local}>
      <Inspector checkpointInspector={() => {}} />
    </CanvasLocalContext.Provider>,
  );
}

describe('inspector outline rows (R1-E14-T08)', () => {
  it('row accessible name has the full node name and a connection count label', () => {
    setup();
    expect(screen.getByText(/Nothing selected/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: /Diagram outline/ });
    const row = within(list).getByRole('listitem', { name: new RegExp(`^${LONG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, .*2 connections$`) });
    expect(row).toHaveAttribute('title', LONG);
    expect(row.textContent).not.toMatch(/↔/);
  });

  it('name is one ellipsised line and the row selects the node', () => {
    setup();
    const list = screen.getByRole('list', { name: /Diagram outline/ });
    const row = within(list).getAllByRole('listitem')[0];
    const name = within(row).getByText(LONG);
    expect(name.style.textOverflow).toBe('ellipsis');
    expect(name.style.whiteSpace).toBe('nowrap');
    expect(name.style.overflow).toBe('hidden');
    expect(row.tagName).toBe('BUTTON');
    fireEvent.click(row);
    expect(h.setSelectedId).toHaveBeenCalledWith('a');
  });

  it('same-named nodes get separate rows and a singular count label', () => {
    setup();
    const rows = within(screen.getByRole('list', { name: /Diagram outline/ })).getAllByRole('listitem', { name: /^Same name/ });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Same name, Spring Boot, 1 connection',
      'Same name, Spring Boot, 1 connection',
    ]);
  });
});
