// R1-E12-T05: product events at call sites. track() is mocked; assertions check name + enum-like props only.
// element_added / relationship_added / export_completed are covered by store-analytics.test.tsx and
// search by global-search.test.tsx; this file covers diagram_created and import_completed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/analytics', () => ({ track: vi.fn(), flush: vi.fn(), setAnalyticsEnabled: vi.fn() }));

import { track } from '../lib/analytics';
import { DiagramProvider } from '../state/store';
import DashboardScreen from '../screens/DashboardScreen';

const realFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(track).mockClear();
  globalThis.fetch = (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], total: 0 }) })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DiagramProvider>
        <DashboardScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

describe('analytics wiring (R1-E12-T05)', () => {
  it('creating a blank diagram from the library tracks diagram_created with source only', async () => {
    renderLibrary();
    fireEvent.click(screen.getAllByRole('button', { name: /^(New diagram|Create blank)$/ })[0]);
    // the New diagram dialog is open; submit the blank form
    const dlg = await screen.findByRole('dialog');
    const create = Array.from(dlg.querySelectorAll('button')).find((b) => /^Create/.test(b.textContent ?? ''));
    expect(create).toBeTruthy();
    fireEvent.click(create as HTMLButtonElement);
    await waitFor(() => expect(track).toHaveBeenCalledWith('diagram_created', { source: 'blank' }));
  });

  it('a completed import tracks import_completed with format and node count, never content', async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Import .arch' }));
    const dlg = await screen.findByRole('dialog', { name: /Import a diagram/ });
    const ta = dlg.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(ta).toBeTruthy();
    fireEvent.change(ta as HTMLTextAreaElement, { target: { value: 'flowchart TD\n  A[API] --> B[(DB)]' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); });
    fireEvent.click(await screen.findByRole('button', { name: 'Import as new diagram' }));
    await waitFor(() => expect(track).toHaveBeenCalledWith('import_completed', { format: 'mermaid', nodes: 2 }));
    expect(track).toHaveBeenCalledWith('diagram_created', { source: 'import' });
  });
});
