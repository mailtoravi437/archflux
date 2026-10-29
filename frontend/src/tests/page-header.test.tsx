import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import DashboardScreen from '../screens/DashboardScreen';
import ReviewsScreen from '../screens/ReviewsScreen';
import LivingScreen from '../screens/LivingScreen';
import BlueprintsScreen from '../screens/BlueprintsScreen';
import SettingsLayout from '../screens/SettingsLayout';
import { PageHeader } from '../components/PageHeader';

const realFetch = globalThis.fetch;

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

const SCREENS: [string, () => React.ReactElement][] = [
  ['Library', () => <DashboardScreen />],
  ['Review', () => <ReviewsScreen />],
  ['Sync', () => <LivingScreen />],
  ['Blueprints', () => <BlueprintsScreen />],
  ['Settings', () => <SettingsLayout />],
];

describe('PageHeader (R1-E01-T08)', () => {
  it('each page renders one h1 and at most one primary button in its header', () => {
    for (const [title, make] of SCREENS) {
      const { unmount } = render(
        <MemoryRouter>
          <DiagramProvider>{make()}</DiagramProvider>
        </MemoryRouter>,
      );
      expect(screen.getAllByRole('heading', { level: 1 }), title).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title);
      const header = screen.getByTestId('page-header');
      const primaries = header.querySelectorAll('.btn--primary, .libpage-btn--primary');
      expect(primaries.length, title).toBeLessThanOrEqual(1);
      unmount();
    }
  });

  it('renders the subtitle and actions', () => {
    render(<PageHeader title="T" subtitle="S" actions={<button>Go</button>} />);
    expect(screen.getByText('S')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
  });
});
