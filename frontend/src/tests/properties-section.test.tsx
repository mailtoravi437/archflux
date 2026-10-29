import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { PropertiesSection } from '../screens/canvas/PropertiesSection';

const latest: { v: DiagramContextValue | null } = { v: null };
function Host() {
  const d = useDiagram();
  latest.v = d;
  const node = d.nodes[0];
  return node ? <PropertiesSection node={node} /> : null;
}
const api = () => latest.v!;

function mount() {
  render(<DiagramProvider><Host /></DiagramProvider>);
  act(() => api().addNode('service', 100, 100));
  fireEvent.click(screen.getByRole('button', { name: /^Properties/ }));
}

beforeEach(() => { localStorage.clear(); });

describe('Properties section', () => {
  it('edits owner and shows it on card line', () => {
    mount();
    const owner = screen.getByLabelText('Owner');
    fireEvent.focus(owner);
    fireEvent.change(owner, { target: { value: 'Platform' } });
    expect(api().nodes[0].properties?.owner).toBe('Platform');
    fireEvent.change(screen.getByLabelText('Show on card'), { target: { value: 'owner' } });
    expect(api().docDefaults.propertyLine).toBe('owner');
    expect(screen.getByText('Card line: Owner: Platform')).toBeTruthy();
  });

  it('rejects invalid custom key with message', () => {
    mount();
    fireEvent.change(screen.getByLabelText('New property key'), { target: { value: 'Bad Key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
    expect(screen.getByRole('alert').textContent).toMatch(/camelCase/);
    expect(api().nodes[0].properties).toBeUndefined();
  });

  it('one undo per field edit', () => {
    mount();
    const owner = screen.getByLabelText('Owner');
    fireEvent.focus(owner);
    fireEvent.change(owner, { target: { value: 'P' } });
    fireEvent.change(owner, { target: { value: 'Pl' } });
    fireEvent.change(owner, { target: { value: 'Platform' } });
    expect(api().nodes[0].properties?.owner).toBe('Platform');
    act(() => api().undo());
    expect(api().nodes[0].properties?.owner).toBeUndefined();
  });
});
