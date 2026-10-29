import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { DiagramProvider } from '../state/store';
import { Inspector, INSPECTOR_SECTIONS_KEY } from '../screens/canvas/Inspector';
import { CanvasLocalContext, type CanvasLocalValue } from '../screens/canvas/CanvasLocalContext';
import type { ArchNode } from '../types';

// R1-E01-T06: the Inspector is split into collapsible sections whose open
// state persists, and the shape picker is a labelled radiogroup.

const node: ArchNode = {
  id: 'svc', type: 'service', label: 'Orders API', tag: 'Spring Boot', health: 'Healthy',
  x: 0, y: 0, w: 170, h: 70, stroke: '#2563EB',
};

function renderInspector() {
  const local: CanvasLocalValue = {
    selected: node,
    selectedEdge: null,
    selectedText: null,
    selToolbarPos: null,
    setSelectedEdgeId: () => {},
    setSelectedTextId: () => {},
    beginTextEdit: () => {},
  };
  return render(
    <DiagramProvider>
      <CanvasLocalContext.Provider value={local}>
        <Inspector checkpointInspector={() => {}} />
      </CanvasLocalContext.Provider>
    </DiagramProvider>,
  );
}

// Section buttons may carry a summary (e.g. "Icon None"), so match the title at the start.
const sectionButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });

beforeEach(() => {
  localStorage.clear();
});

describe('inspector sections', () => {
  it('Content and Appearance are open by default; others collapsed', () => {
    renderInspector();
    // Header: title and "kind · connections" subtitle (R1-E14-T03).
    expect(screen.getByText('Service · 0 connections')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Orders API' })).toBeTruthy();
    expect(sectionButton('Content').getAttribute('aria-expanded')).toBe('true');
    expect(sectionButton('Appearance').getAttribute('aria-expanded')).toBe('true');
    for (const name of ['Icon', 'Metadata']) {
      expect(sectionButton(name).getAttribute('aria-expanded')).toBe('false');
    }
    const content = screen.getByRole('region', { name: 'Content' });
    expect(within(content).getByLabelText('Label')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Node shape' })).toBeNull();
  });

  it('toggle persists across remount', () => {
    const first = renderInspector();
    act(() => {
      fireEvent.click(sectionButton('Appearance'));
      fireEvent.click(sectionButton('Content'));
    });
    expect(JSON.parse(localStorage.getItem(INSPECTOR_SECTIONS_KEY) ?? '{}')).toEqual({ appearance: false, content: false });
    first.unmount();
    renderInspector();
    expect(sectionButton('Appearance').getAttribute('aria-expanded')).toBe('false');
    expect(sectionButton('Content').getAttribute('aria-expanded')).toBe('false');
  });

  it('survives corrupt or blocked storage', () => {
    localStorage.setItem(INSPECTOR_SECTIONS_KEY, '{not json');
    renderInspector();
    expect(sectionButton('Content').getAttribute('aria-expanded')).toBe('true');
  });

  it('shape picker is replaced by the Display radiogroup (R1-E14-T03)', () => {
    renderInspector();
    expect(screen.queryByRole('radiogroup', { name: 'Node shape' })).toBeNull();
    const group = screen.getByRole('radiogroup', { name: 'Display' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Icon', 'Card', 'Shape']);
  });
});
