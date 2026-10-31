// BUG-LIVE-006 (mobile): the library sidebar collapses behind a toggle.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { LibrarySidebar } from '../components/library/LibrarySidebar';

afterEach(cleanup);

describe('LibrarySidebar on phones (BUG-LIVE-006)', () => {
  it('offers a keyboard-operable toggle that opens and closes the nav', () => {
    render(<MemoryRouter><DiagramProvider><LibrarySidebar active="home" /></DiagramProvider></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Show workspace menu' });
    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(nav.id);
    expect(nav.className).not.toContain('is-open');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide workspace menu' }).getAttribute('aria-expanded')).toBe('true');
    expect(nav.className).toContain('is-open');
    fireEvent.click(screen.getByRole('button', { name: 'Hide workspace menu' }));
    expect(nav.className).not.toContain('is-open');
  });

  it('css hides the sidebar and stacks the shell at <=720px, toggle hidden on desktop', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.libside-toggle \{ display: none; \}/);
    const block = css.slice(css.indexOf('@media (max-width: 720px) {\n  .libshell'));
    expect(block).toMatch(/\.libshell \{ flex-direction: column/);
    expect(block).toMatch(/\.libside \{ display: none;/);
    expect(block).toMatch(/\.libside\.is-open \{ display: flex; \}/);
  });
});
