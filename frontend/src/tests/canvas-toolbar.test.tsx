import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CanvasToolbar } from '../screens/canvas/CanvasToolbar';

function setup() {
  const p = { zoomAt: vi.fn(), onFit: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), setMiniOpen: vi.fn(), onShowPanel: vi.fn() };
  render(
    <MemoryRouter>
      <CanvasToolbar zoom={1} miniOpen dockOpen {...p} />
    </MemoryRouter>,
  );
  return p;
}

describe('canvas toolbar', () => {
  it('undo/redo buttons call actions and stay enabled', () => {
    const p = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo);
    fireEvent.click(redo);
    expect(p.onUndo).toHaveBeenCalledTimes(1);
    expect(p.onRedo).toHaveBeenCalledTimes(1);
  });
  it('every button has an accessible name', () => {
    setup();
    for (const b of screen.getAllByRole('button')) expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim().length).toBeGreaterThan(0);
  });
});
