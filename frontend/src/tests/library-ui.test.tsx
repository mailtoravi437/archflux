// R1-E06-T04: Library UI: folder tree, breadcrumbs, star, move (SC-06).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import DashboardScreen from '../screens/DashboardScreen';
import { resetLibraryState } from '../state/library';
import { sampleNodes, sampleEdges } from './fixtures/sampleDiagram';

const realFetch = globalThis.fetch;

function seed() {
  const now = Date.now();
  const docs = [
    { id: 'doc-a', title: 'alpha.arch', nodes: sampleNodes, edges: sampleEdges, createdAt: now, updatedAt: now - 1000 },
    { id: 'doc-b', title: 'beta.arch', nodes: [], edges: [], createdAt: now, updatedAt: now - 2000 },
  ];
  localStorage.setItem('archflux:v2-light', JSON.stringify({ docs, activeDocId: 'doc-a', nodes: docs[0].nodes, edges: docs[0].edges, docTitle: docs[0].title }));
}

function renderLibrary(entry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DiagramProvider>
        <DashboardScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

async function createFolder(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
  const dlg = screen.getByRole('dialog', { name: 'New folder' });
  fireEvent.change(within(dlg).getByLabelText('Folder name'), { target: { value: name } });
  fireEvent.click(within(dlg).getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  resetLibraryState();
  seed();
  globalThis.fetch = (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], total: 0 }) })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe('Library UI (R1-E06-T04)', () => {
  it('creates a folder and navigates into it via breadcrumbs', async () => {
    renderLibrary();
    await createFolder('Payments');
    const tree = screen.getByRole('tree', { name: 'Folders' });
    fireEvent.click(within(tree).getByRole('treeitem', { name: /Payments/ }));
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Payments').getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('This folder is empty')).toBeTruthy();
    fireEvent.click(within(crumbs).getByRole('button', { name: 'Library' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull());
    expect(screen.getByText('alpha.arch')).toBeTruthy();
  });

  it('star toggle filters Starred view', async () => {
    const first = renderLibrary();
    const star = screen.getByRole('button', { name: 'Star alpha.arch' });
    expect(star.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(star);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Star alpha.arch' }).getAttribute('aria-pressed')).toBe('true'));
    first.unmount();
    renderLibrary('/dashboard?view=starred');
    expect(await screen.findByText('alpha.arch')).toBeTruthy();
    expect(screen.queryByText('beta.arch')).toBeNull();
  });

  it('Move to… dialog moves doc', async () => {
    renderLibrary();
    await createFolder('Platform');
    fireEvent.click(screen.getByRole('button', { name: 'Options for beta.arch' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    const dlg = screen.getByRole('dialog', { name: /Move “beta.arch”/ });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Platform' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Move “beta.arch”/ })).toBeNull());
    fireEvent.click(within(screen.getByRole('tree', { name: 'Folders' })).getByRole('treeitem', { name: /Platform/ }));
    await waitFor(() => expect(screen.queryByText('alpha.arch')).toBeNull());
    expect(screen.getByText('beta.arch')).toBeTruthy();
  });

  it('tree supports arrow-key navigation', async () => {
    renderLibrary();
    await createFolder('Alpha');
    await createFolder('Beta');
    const tree = screen.getByRole('tree', { name: 'Folders' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items).toHaveLength(2);
    items[0].focus();
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'End' });
    expect(document.activeElement).toBe(items[1]);
  });
});
