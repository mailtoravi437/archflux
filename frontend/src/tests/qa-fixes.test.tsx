import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import LoginScreen from '../screens/LoginScreen';
import { freshnessBadgeLabel } from '../lib/honesty';

// FRONTEND_SPEC v1.6.0 QA findings FE-Q5, FE-Q6, FE-Q12.

beforeEach(() => {
  localStorage.clear();
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <LoginScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

describe('dashboard status badge (FE-Q6)', () => {
  it('never calls a local doc "Drift"', () => {
    expect(freshnessBadgeLabel('local')).toBeNull();
    expect(freshnessBadgeLabel('drift')?.text).toBe('⚠ Unsynced changes');
    expect(freshnessBadgeLabel('fresh')?.text).toBe('● Synced');
  });
});

describe('login screen', () => {
  it('offers one real SSO (SAML) tab and no simulated SSO sign-in (FE-Q12)', () => {
    renderLogin();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Magic Link', 'Google', 'SSO (SAML)', 'OIDC']);
    expect(screen.queryByLabelText('SSO organization')).toBeNull();
  });

  it('shows the mock-email developer note only in dev builds (FE-Q5)', () => {
    renderLogin();
    const note = screen.queryByText(/mock email provider/i);
    if (import.meta.env.DEV) expect(note).not.toBeNull();
    else expect(note).toBeNull();
  });
});
