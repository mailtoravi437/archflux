// R1-E10-T02: New diagram dialog (SC-09).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import NewDiagramDialog from '../components/NewDiagramDialog';
import { resetLibraryState } from '../state/library';
import { blueprintGraph, blueprints } from '../data/blueprints';

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  latest.v = useDiagram();
  return null;
}
const store = () => {
  if (!latest.v) throw new Error('no store');
  return latest.v;
};

function mount(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
        <NewDiagramDialog onClose={onClose} />
      </DiagramProvider>
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => {
  localStorage.clear();
  resetLibraryState();
  latest.v = null;
});
afterEach(cleanup);

describe('New diagram dialog (R1-E10-T02)', () => {
  it('blank creates doc with chosen default style', async () => {
    const onClose = mount();
    const before = store().docs.length;
    const dlg = screen.getByRole('dialog', { name: 'New diagram' });
    fireEvent.change(within(dlg).getByLabelText('Name'), { target: { value: 'orders.arch' } });
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Card' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store().docs).toHaveLength(before + 1);
    expect(store().docTitle).toBe('orders.arch');
    expect(store().docDefaults.displayStyle).toBe('card');
  });

  it('template tab creates from blueprint', async () => {
    const onClose = mount();
    const before = store().docs.length;
    const bp = blueprints[0];
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${bp.title}`) }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store().docs).toHaveLength(before + 1);
    expect(store().nodes.length).toBeGreaterThan(0);
  });

  it('template cards show the real counts of the graph they create (BUG-LIVE-009)', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
    for (const bp of blueprints) {
      const g = blueprintGraph(bp.id);
      const card = screen.getByRole('button', { name: new RegExp(`^${bp.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
      expect(card.textContent).toContain(`${g.nodes.length} elements · ${g.edges.length} connections`);
    }
    const bp = blueprints.find((b) => b.id === 'multi-region-vpc')!;
    const g = blueprintGraph(bp.id);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${bp.title}`) }));
    await waitFor(() => expect(store().nodes.length).toBe(g.nodes.length));
    expect(store().edges.length).toBe(g.edges.length);
  });

  it('template diagram is named after the template, suffix only on collision (BUG-LIVE-019)', async () => {
    const bp = blueprints[4];
    const onClose = mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
    for (const [i, expected] of [`${bp.title}.arch`, `${bp.title} (2).arch`].entries()) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${bp.title}`) }));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(store().docTitle).toBe(expected));
    }
    const titles = store().docs.map((d) => d.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('AI tab explains R2 and creates nothing', () => {
    const onClose = mount();
    const before = store().docs.length;
    const tab = screen.getByRole('tab', { name: 'Generate with AI' });
    expect(tab.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(tab);
    expect(screen.getByText('AI drafts arrive in R2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
    expect(store().docs).toHaveLength(before);
    expect(onClose).not.toHaveBeenCalled();
  });
});
