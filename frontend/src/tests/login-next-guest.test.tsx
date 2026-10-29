import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import LoginScreen from '../screens/LoginScreen';

// R1-BUG (routes audit): a guest opening a shared link /d/:id is sent to /login?next=/d/:id.
// Login used to bounce any session (guest included) back to `next`, which sent the guest to
// /login again, an endless redirect loop ("Maximum update depth exceeded").

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DiagramProvider>
        <Routes>
          <Route path="/login" element={<><LoginScreen /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </DiagramProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());

describe('login redirect with ?next', () => {
  it('keeps a guest on the login page when next points at a shared link', () => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderAt('/login?next=%2Fd%2Fabc');
    expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Fd%2Fabc');
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
  });

  it('sends a signed-in user on to next', () => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'email', email: 'a@b.co' }));
    renderAt('/login?next=%2Fd%2Fabc');
    expect(screen.getByTestId('where').textContent).toBe('/d/abc');
  });

  it('still sends a guest without next to the library', () => {
    localStorage.setItem('archflux:session', JSON.stringify({ mode: 'guest' }));
    renderAt('/login');
    expect(screen.getByTestId('where').textContent).toBe('/dashboard');
  });
});
