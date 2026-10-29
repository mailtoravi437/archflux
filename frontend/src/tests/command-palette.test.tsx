import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import CommandPalette from '../components/CommandPalette';
import { registerCommands, type Command } from '../lib/commands';

function paletteCmd(id: string, title: string, extra: Partial<Command> = {}): Command {
  return { id, title, group: 'Edit', run: () => {}, ...extra };
}

function renderPalette(onClose: () => void) {
  return render(
    <MemoryRouter initialEntries={['/canvas']}>
      <DiagramProvider>
        <CommandPalette onClose={onClose} />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

const registered: Array<() => void> = [];
const reg = (cmds: Command[]) => registered.push(registerCommands(cmds));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  registered.forEach((off) => off());
  registered.length = 0;
  act(() => {
    cleanup();
  });
});

describe('command palette (R1-E10-T03, SC-19)', () => {
  it('Enter runs the active command and closes; Esc closes', () => {
    const run = vi.fn();
    const onClose = vi.fn();
    reg([paletteCmd('t.save', 'Save the file', { run })]);
    act(() => {
      renderPalette(onClose);
    });
    // Both the dialog and its input are labelled "Command palette"; the input
    // is the combobox.
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(document.activeElement).toBe(input); // autoFocus lands in the field
    fireEvent.change(input, { target: { value: 'Save the file' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Esc path (the first palette is still mounted; it stays until AppShell
    // unmounts it on close in the real app).
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('focus returns to where it was when the palette unmounts (SC-19)', () => {
    reg([paletteCmd('t.save', 'Save the file')]);
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    expect(document.activeElement).toBe(before);

    act(() => {
      renderPalette(vi.fn());
    });
    // While open, focus lives in the palette field.
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
    // Unmount (AppShell closing the palette) restores the opener.
    act(() => {
      cleanup();
    });
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('shows the Recent section first, then grouped commands', () => {
    reg([
      paletteCmd('t.one', 'Zulu command', { group: 'Advanced' }),
      paletteCmd('t.two', 'Alpha command', { group: 'File' }),
    ]);
    localStorage.setItem('archflux:commands:recent:v1', JSON.stringify(['t.one']));
    act(() => {
      renderPalette(vi.fn());
    });
    const listbox = screen.getByRole('listbox', { name: 'Commands' });
    const rows = Array.from(listbox.querySelectorAll('[role="option"]'));
    // The Recent section comes first: the most recently used command is the
    // first row in a section labelled "Recent"; grouped commands follow.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(listbox.textContent).toContain('Recent');
    expect(rows[0]?.textContent).toContain('Zulu command');
    expect(listbox.textContent).toContain('Alpha command');
  });

  it('typing filters through the registry and shows the shortcut', () => {
    reg([paletteCmd('t.zoom', 'Zoom in', { group: 'View', shortcut: '⌘+' })]);
    act(() => {
      renderPalette(vi.fn());
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Zoom in' } });
    const rows = screen.getAllByRole('option');
    expect(rows.some((r) => r.textContent?.includes('Zoom in'))).toBe(true);
    expect(rows.some((r) => r.textContent?.includes('⌘+'))).toBe(true);
  });

  it('an unknown query shows the empty state', () => {
    reg([paletteCmd('t.zoom', 'Zoom in', { group: 'View' })]);
    act(() => {
      renderPalette(vi.fn());
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'qqqqnope' } });
    expect(screen.getByText(/No commands match/)).toBeTruthy();
  });
});
