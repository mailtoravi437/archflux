import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { DiagramProvider } from '../store';

function setupShell() {
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <AppShell />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

function tabIconSrc(container: HTMLElement, href: string): string | null {
  const anchor = container.querySelector(`a[href="${href}"]`);
  if (!anchor) return null;
  return anchor.querySelector('img')?.getAttribute('src') ?? null;
}

describe('AppShell screen-tab icons', () => {
  it('uses a gear icon for Settings (not the chat bubble)', () => {
    const { container } = setupShell();
    expect(tabIconSrc(container, '/settings/general')).toContain('settings.svg');
  });

  it('uses distinct semantic icons for Library, Blueprints and Living Sync', () => {
    const { container } = setupShell();
    expect(tabIconSrc(container, '/dashboard')).toContain('library.svg');
    expect(tabIconSrc(container, '/blueprints')).toContain('blueprint.svg');
    expect(tabIconSrc(container, '/living')).toContain('sync.svg');
  });

  it('keeps the comment icon for Reviews & Merge', () => {
    const { container } = setupShell();
    expect(tabIconSrc(container, '/reviews')).toContain('comment.svg');
  });
});
