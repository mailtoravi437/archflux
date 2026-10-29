// R1-E09-T03: Import mapping preview (SC-10).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportDialog from '../components/import/ImportDialog';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';

type Diagram = ReturnType<typeof useDiagram>;
const latest: { v: Diagram | null } = { v: null };
function Probe() {
  const d = useDiagram();
  useEffect(() => {
    latest.v = d;
  });
  return null;
}

const drawio = readFileSync(join(__dirname, 'fixtures', 'drawio', 'two-page.drawio'), 'utf8');
const MERMAID = 'flowchart LR\n  A[API] --> B[(Orders DB)]\n  B --> C[(Audit DB)]\n';

function mount(onClose = vi.fn(), onImported = vi.fn()) {
  latest.v = null;
  render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
        <ImportDialog onClose={onClose} onImported={onImported} />
      </DiagramProvider>
    </MemoryRouter>,
  );
  return { onClose, onImported };
}

async function pasteAndContinue(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Paste diagram text' }), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('ImportDialog', () => {
  it('detects mermaid from pasted text', () => {
    mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste diagram text' }), { target: { value: MERMAID } });
    expect(screen.getByRole('status').textContent).toContain('Detected format: Mermaid');
  });

  it('shows stats and warnings', async () => {
    mount();
    await pasteAndContinue(drawio);
    await screen.findByText(/2 pages · 6 elements · 5 connections · 1 boundary · \d+ skipped/);
    const toggle = screen.getByRole('button', { name: 'Show warnings' });
    fireEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Import warnings' }).children.length).toBeGreaterThan(0);
  });

  it('remapping cylinder group to cache changes kinds', async () => {
    mount();
    await pasteAndContinue(MERMAID);
    const sel = await screen.findByRole('combobox', { name: 'Map cylinder shapes to' });
    expect(within(sel).getByRole('option', { name: 'Database' })).toBeTruthy();
    fireEvent.change(sel, { target: { value: 'cache' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import as new diagram' }));
    });
    const doc = latest.v!.docs.find((d) => d.id === latest.v!.activeDocId)!;
    expect(doc.nodes.filter((n) => n.kind === 'cache')).toHaveLength(2);
    expect(doc.nodes.filter((n) => n.kind === 'database')).toHaveLength(0);
  });

  it('import as new creates doc and opens it', async () => {
    const { onClose, onImported } = mount();
    const before = latest.v!.docs.length;
    await pasteAndContinue(MERMAID);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Import as new diagram' }));
    });
    await waitFor(() => expect(latest.v!.docs.length).toBe(before + 1));
    expect(latest.v!.docTitle).toBe('pasted');
    expect(latest.v!.nodes).toHaveLength(3);
    expect(onImported).toHaveBeenCalledWith('new');
    expect(onClose).toHaveBeenCalled();
  });

  it('invalid file shows error and creates nothing', async () => {
    mount();
    const before = latest.v!.docs.length;
    await pasteAndContinue('<mxfile><diagram><oops');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("We couldn't read this file");
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import as new diagram' })).toBeNull();
    expect(latest.v!.docs.length).toBe(before);
  });

  it('add to this diagram appends a page in one undo step', async () => {
    mount();
    const pagesBefore = latest.v!.pages.length;
    await pasteAndContinue(MERMAID);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Add to this diagram' }));
    });
    expect(latest.v!.pages.length).toBe(pagesBefore + 1);
    expect(latest.v!.nodes).toHaveLength(3);
    act(() => latest.v!.undo());
    expect(latest.v!.pages.length).toBe(pagesBefore);
    expect(latest.v!.nodes).toHaveLength(0);
  });
});
