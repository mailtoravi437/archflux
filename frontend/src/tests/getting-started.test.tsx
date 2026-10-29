// R1-E11-T05: Getting-started card component.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import GettingStarted from '../components/checklist/GettingStarted';
import { setSession } from '../state/session';

function renderCard() {
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <GettingStarted />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setSession({ mode: 'guest' });
});
afterEach(cleanup);

describe('GettingStarted card', () => {
  it('shows real progress and hides GitHub on Free', () => {
    renderCard();
    const card = screen.getByRole('region', { name: 'Getting started' });
    expect(card.textContent).toContain('of 5');
    expect(card.textContent).not.toContain('Connect GitHub');
    expect(screen.getByRole('progressbar', { name: 'Getting started progress' }).getAttribute('aria-valuemax')).toBe('5');
  });

  it('dismiss removes the card and stays dismissed', () => {
    const { unmount } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss checklist' }));
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull();
    unmount();
    renderCard();
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull();
  });
});
