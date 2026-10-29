// R1-E12-T02: states library applied across screens (library, trash, route fallback).
// Canvas banner rows (offline / 429 / priority) need CanvasScreen wiring and are not covered here.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { lazy } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import DashboardScreen from '../screens/DashboardScreen';
import TrashScreen from '../screens/TrashScreen';
import { withFallback } from '../app/withFallback';
import { resetLibraryState } from '../state/library';

const realFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  resetLibraryState();
  globalThis.fetch = (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], total: 0 }) })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

describe('states wiring (R1-E12-T02)', () => {
  it('library empty uses EmptyState', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard?view=starred']}>
        <DiagramProvider>
          <DashboardScreen />
        </DiagramProvider>
      </MemoryRouter>,
    );
    const empty = screen.getByRole('region', { name: 'No starred diagrams' });
    expect(within(empty).getByText('Star a diagram to find it here.')).toBeTruthy();
  });

  it('trash empty uses EmptyState', () => {
    render(
      <MemoryRouter>
        <DiagramProvider>
          <TrashScreen />
        </DiagramProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Trash is empty' })).toBeTruthy();
  });

  it('route fallback shows a Skeleton only after 300ms', async () => {
    const Never = lazy(() => new Promise<{ default: () => null }>(() => {}));
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      render(withFallback(<Never />));
      expect(screen.queryByRole('status', { name: 'Loading screen' })).toBeNull();
      act(() => { vi.advanceTimersByTime(350); });
      expect(screen.getByRole('status', { name: 'Loading screen' }).getAttribute('aria-busy')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });
});
