import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import LivingScreen from '../screens/LivingScreen';
import { sampleWorkspaceStorage } from './fixtures/sampleDiagram';

// Sync.dc.html (SC-32) incl. the "R1 STATES" frame.
function mount(seedSample = false) {
  localStorage.clear();
  if (seedSample) {
    const s = sampleWorkspaceStorage();
    localStorage.setItem(s.key, s.value);
  }
  return render(
    <MemoryRouter>
      <DiagramProvider><LivingScreen /></DiagramProvider>
    </MemoryRouter>,
  );
}
afterEach(() => cleanup());
beforeEach(() => localStorage.clear());

describe('Sync screen structure', () => {
  it('has the artboard header: h1 Sync, subtitle, Re-sync and Add source', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sync');
    expect(screen.getByText('Compare this diagram with what is running. Connect a source to detect drift.')).toBeTruthy();
    const header = screen.getByTestId('page-header');
    const resync = within(header).getByRole('button', { name: 'Re-sync' });
    const add = within(header).getByRole('button', { name: 'Add source' });
    expect(resync.className).toMatch(/libpage-btn--secondary/);
    expect(add.className).toMatch(/libpage-btn--primary/);
  });

  it('shows the four stat cards with honest empty values', () => {
    mount();
    const stats = screen.getByTestId('sync-stats');
    const cards = Array.from(stats.children).map((c) => c.textContent);
    expect(cards).toEqual(['StatusNot connected', 'Sources0', 'Mapped services0', 'Last re-syncNever']);
  });

  it('has h2 sections Drift, Sources, Files and Activity and none of the old titles', () => {
    mount();
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(['Drift', 'Sources', 'Files', 'Activity']);
    for (const old of ['Live Status Overview', 'Active Live Data Connectors', 'Live Schema & Topology Drift', 'File Transfer', 'Sync Activity Log']) {
      expect(screen.queryByText(new RegExp(old.replace(/[&]/g, '.')))).toBeNull();
    }
  });

  it('Sources: honest empty text and the three dashed buttons, no fake connectors', () => {
    mount();
    expect(screen.getByTestId('connectors-empty').textContent).toBe("No sources yet. Record where this diagram's truth lives.");
    for (const n of ['Kubernetes cluster', 'OpenAPI contract', 'Terraform state']) {
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
    }
    expect(document.querySelectorAll('.connector-row').length).toBe(0);
  });

  it('Files: Download .arch, SVG, CSV, Import .arch', () => {
    mount();
    for (const n of ['Download .arch', 'SVG', 'CSV', 'Import .arch']) {
      expect(screen.getByRole('button', { name: n }), n).toBeTruthy();
    }
  });

  it('Activity: honest empty text', () => {
    mount();
    expect(screen.getByText('No re-sync attempts yet.')).toBeTruthy();
  });

  it('drops the preserve-layout checkbox, the name input and the connection callout', () => {
    mount();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('New connector name')).toBeNull();
    expect(screen.queryByRole('note', { name: 'Connection notice' })).toBeNull();
  });
});

describe('Sync drift (derived from the canvas)', () => {
  it('empty canvas: honest empty state, never claims a match with upstream', () => {
    const { container } = mount();
    expect(screen.getByText('No drift on the canvas')).toBeTruthy();
    expect(screen.getByText('Derived from the canvas until a source is connected')).toBeTruthy();
    expect(container.textContent).not.toMatch(/matches upstream/i);
  });

  it('rows: Isolated with Bind, Dangling with Remove, both with Dismiss', () => {
    mount(true);
    const isolated = screen.getByTestId('drift-row-lint-orphan-legacy-billing');
    expect(within(isolated).getByText('Isolated')).toBeTruthy();
    expect(within(isolated).getByText('Legacy Billing Worker')).toBeTruthy();
    expect(within(isolated).getByText('No routes in or out')).toBeTruthy();
    expect(within(isolated).getByRole('button', { name: 'Bind' })).toBeTruthy();
    expect(within(isolated).getByRole('button', { name: 'Dismiss' })).toBeTruthy();

    const dangling = screen.getByTestId('drift-row-lint-dangle-dangle-wire');
    expect(within(dangling).getByText('Dangling')).toBeTruthy();
    expect(within(dangling).getByText('Auth Gateway → ?')).toBeTruthy();
    expect(within(dangling).getByText('Route has no target')).toBeTruthy();
    expect(within(dangling).getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(within(dangling).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('Mapped services counts canvas elements; Dismiss hides a row', () => {
    mount(true);
    expect(screen.getByTestId('sync-stats').textContent).toContain('Mapped services9');
    const row = screen.getByTestId('drift-row-lint-orphan-legacy-billing');
    fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('drift-row-lint-orphan-legacy-billing')).toBeNull();
    expect(screen.getByTestId('drift-row-lint-dangle-dangle-wire')).toBeTruthy();
  });

  it('Remove deletes the dangling route from the canvas', () => {
    mount(true);
    const row = screen.getByTestId('drift-row-lint-dangle-dangle-wire');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByTestId('drift-row-lint-dangle-dangle-wire')).toBeNull();
  });
});

describe('Sync sources and re-sync', () => {
  it('Add source opens the dialog; the dashed Terraform button preselects the type', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Terraform state' }));
    const dialog = screen.getByRole('dialog', { name: 'Add source' });
    expect((within(dialog).getByLabelText('Connector type') as HTMLSelectElement).value).toBe('Terraform');
  });

  it('a saved source is always Not connected and counted in Sources', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    const dialog = screen.getByRole('dialog', { name: 'Add source' });
    fireEvent.change(within(dialog).getByLabelText('Connector name'), { target: { value: 'My cluster' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save connector' }));
    const row = document.querySelector('.connector-row') as HTMLElement;
    expect(row.textContent).toContain('My cluster');
    expect(row.textContent).toContain('Not connected');
    expect(row.textContent).not.toMatch(/\bConnected\b(?<!Not connected)/);
    expect(screen.getByTestId('sync-stats').textContent).toContain('Sources1');
  });

  it('a saved source has no Retry button, only Remove, and shows Not connected', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    const dialog = screen.getByRole('dialog', { name: 'Add source' });
    fireEvent.change(within(dialog).getByLabelText('Connector name'), { target: { value: 'My cluster' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save connector' }));
    const row = document.querySelector('.connector-row') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /retry/i })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Remove My cluster' })).toBeTruthy();
    expect(row.textContent).toContain('Not connected');
    expect(row.textContent).not.toMatch(/polling/i);
  });

  it('Re-sync with no connected source is honest: no progress, no toast, one Activity line, Last re-sync stays Never', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Re-sync' }));
    expect(screen.getByTestId('sync-stats').textContent).toContain('StatusNot connected');
    expect(screen.getByTestId('sync-stats').textContent).toContain('Last re-syncNever');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.body.textContent).not.toMatch(/polling|simulated/i);
    const activity = screen.getByRole('region', { name: 'Activity' });
    expect(within(activity).getByText('No re-sync: no live source is connected')).toBeTruthy();
    expect(screen.queryByText('No re-sync attempts yet.')).toBeNull();
  });

  it('Add source saves honestly: Not connected at once, no Polling, no simulated text, honest toast', async () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
      const dialog = screen.getByRole('dialog', { name: 'Add source' });
      fireEvent.change(within(dialog).getByLabelText('Connector name'), { target: { value: 'My cluster' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save connector' }));
      const row = document.querySelector('.connector-row') as HTMLElement;
      expect(row.textContent).toContain('Not connected');
      expect(document.body.textContent).not.toMatch(/polling|simulated/i);
      await vi.advanceTimersByTimeAsync(1500);
      expect(document.body.textContent).not.toMatch(/polling|simulated/i);
      expect(document.body.textContent).not.toMatch(/poll public or local specs/i);
      expect(JSON.stringify(localStorage.getItem('archflux:connectors:v1'))).not.toMatch(/olling/);
    } finally {
      vi.useRealTimers();
    }
  });
});
