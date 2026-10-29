import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import AppShell from '../components/AppShell';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { seedSampleDiagram } from './fixtures/sampleDiagram';

// R1-E14-T10: the status menu "Linter" item opens the lint list (AppBar.dc.html).

beforeEach(() => {
  localStorage.clear();
  globalThis.innerWidth = 1440;
  window.dispatchEvent(new Event('resize'));
});
afterEach(() => {
  globalThis.innerWidth = 1024;
  cleanup();
});

function setup() {
  const latest: { v: DiagramContextValue | null } = { v: null };
  function Probe() {
    latest.v = useDiagram();
    return null;
  }
  render(
    <MemoryRouter initialEntries={['/canvas']}>
      <DiagramProvider>
        <Probe />
        <AppShell />
      </DiagramProvider>
    </MemoryRouter>,
  );
  return () => {
    if (!latest.v) throw new Error('store context lost');
    return latest.v;
  };
}

describe('status menu opens the lint list', () => {
  it('opens the Architecture linter dialog with the current issue count', () => {
    const api = setup();
    act(() => seedSampleDiagram(api()));
    const count = api().lintCount;
    expect(count).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('status-button'));
    fireEvent.click(screen.getByRole('menuitem', { name: `Linter (${count} issues)` }));
    const dialog = screen.getByRole('dialog', { name: 'Architecture linter' });
    expect(within(dialog).getByText(String(count))).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Auto-Heal All' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Inspect' }).length).toBeGreaterThan(0);
  });

  it('closes on Escape and the Close button', () => {
    const api = setup();
    act(() => seedSampleDiagram(api()));
    const open = () => {
      fireEvent.click(screen.getByTestId('status-button'));
      fireEvent.click(screen.getByRole('menuitem', { name: /^Linter/ }));
    };
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Architecture linter' })).toBeNull();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close linter' }));
    expect(screen.queryByRole('dialog', { name: 'Architecture linter' })).toBeNull();
  });

  it('shows an honest zero state on an empty diagram', () => {
    setup();
    fireEvent.click(screen.getByTestId('status-button'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Linter (0 issues)' }));
    expect(within(screen.getByRole('dialog', { name: 'Architecture linter' })).getByText(/zero lint errors/i)).toBeInTheDocument();
  });
});
