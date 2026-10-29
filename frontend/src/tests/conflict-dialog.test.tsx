import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConflictDialog from '../components/ConflictDialog';
import type { ConflictAction } from '../state/conflict';

const conflict = { attemptedVersion: 3, serverVersion: 5, message: 'stale write' };

describe('ConflictDialog actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all three explicit actions with version contrast', () => {
    render(
      <ConflictDialog conflict={conflict} busyAction={null} onAction={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/v3/)).toBeTruthy();
    expect(screen.getByText(/v5/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload remote/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save mine anyway/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /duplicate as new diagram/i })).toBeTruthy();
  });

  it('dispatches the chosen action for each button', () => {
    const seen: ConflictAction[] = [];
    render(
      <ConflictDialog
        conflict={conflict}
        busyAction={null}
        onAction={(a) => seen.push(a)}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reload remote/i }));
    fireEvent.click(screen.getByRole('button', { name: /save mine anyway/i }));
    fireEvent.click(screen.getByRole('button', { name: /duplicate as new diagram/i }));
    expect(seen).toEqual(['reload', 'force', 'duplicate']);
  });

  it('says force-save preserves remote state as a revision', () => {
    render(
      <ConflictDialog conflict={conflict} busyAction={null} onAction={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText(/preserved as a revision/i)).toBeTruthy();
  });

  it('Esc dismisses the dialog', () => {
    const onClose = vi.fn();
    render(
      <ConflictDialog conflict={conflict} busyAction={null} onAction={() => {}} onClose={onClose} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables actions while one is busy', () => {
    render(
      <ConflictDialog conflict={conflict} busyAction="force" onAction={() => {}} onClose={() => {}} />,
    );
    for (const name of [/reload remote/i, /save mine anyway/i, /duplicate as new diagram/i]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});
