// R1-E12-T02: unknown paths render NotFoundState; the index route still redirects.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotFoundRoute } from '../app/NotFoundRoute';

afterEach(() => cleanup());

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

describe('not found route (R1-E12-T02)', () => {
  it('unknown path shows honest not-found copy and a link home', () => {
    render(
      <MemoryRouter initialEntries={['/nope/nothing']}>
        <Routes>
          <Route path="/" element={<Where />} />
          <Route path="*" element={<><NotFoundRoute /><Where /></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Not found' }).textContent).toContain('Page not found');
    expect(screen.getByTestId('where').textContent).toBe('/nope/nothing');
    fireEvent.click(screen.getByRole('button', { name: 'Go to home' }));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});
