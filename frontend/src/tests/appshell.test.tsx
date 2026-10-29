import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { DiagramProvider } from '../state/store';

function setupShell(route = '/canvas') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <DiagramProvider>
        <AppShell />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

// R1-E14-T01 replaced the icon tabs, the ⚙ button and the ⋯ overflow with the
// AppBar.dc.html layout; these tests pin where those controls went.
describe('AppShell app bar chrome (R1-E14-T01)', () => {
  it('logo is the cube glyph tile, not the ⚡ emoji', () => {
    setupShell();
    const logo = screen.getByRole('link', { name: 'ArchFlux — go to Library' });
    expect(logo.querySelector('.appbar-brand__tile svg')).toBeTruthy();
    expect(logo.textContent).not.toContain('⚡');
    expect(logo.textContent).toContain('ArchFlux');
  });

  it('has no ⚙ settings button and no ⋯ overflow in the bar', () => {
    const { container } = setupShell();
    const banner = screen.getByRole('banner');
    expect(container.querySelector('a[href="/settings/general"]')).toBeNull();
    expect(banner.querySelector('[data-testid="appbar-more"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /More app actions/ })).toBeNull();
  });

  it('Settings lives in the avatar menu with Theme, Profile & team and Sign in', () => {
    setupShell();
    fireEvent.click(screen.getByRole('button', { name: /Account/ }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    const items = Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')).map((m) => m.textContent ?? '');
    expect(items.some((t) => t.includes('Theme:'))).toBe(true);
    expect(items.some((t) => t.includes('Settings'))).toBe(true);
    expect(items.some((t) => t.includes('Profile & team'))).toBe(true);
    expect(items.some((t) => t.includes('Sign in'))).toBe(true);
  });

  it('avatar is the initial with no status dot', () => {
    setupShell();
    const avatar = screen.getByRole('button', { name: /Account/ });
    expect(avatar.classList.contains('appbar-avatar')).toBe(true);
    expect(avatar.textContent?.trim()).toMatch(/^[A-Z]$/);
    expect(avatar.querySelectorAll('span').length).toBe(1);
  });
});
