import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import DashboardScreen from '../screens/DashboardScreen';

// R1-E09-T03: the import dialog is mounted from the Library button and from a file drop.

const realFetch = globalThis.fetch;

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DiagramProvider>
        <DashboardScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: [], total: 0 }),
  })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe('import dialog entry points', () => {
  it('the Library Import button opens the import dialog', () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Import .arch' }));
    expect(screen.getByRole('dialog', { name: /Import a diagram/ })).toBeTruthy();
  });

  it('dropping a .mmd file on the Library opens the dialog with the file read', async () => {
    const { container } = renderLibrary();
    const file = new File(['flowchart TD\n  A[API] --> B[(DB)]'], 'flow.mmd', { type: 'text/plain' });
    const screenEl = container.querySelector('.libpage-screen');
    if (!screenEl) throw new Error('no library screen');
    fireEvent.drop(screenEl, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Review import: flow\.mmd/ })).toBeTruthy());
  });
});
