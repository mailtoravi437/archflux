import { describe, it, expect, vi } from 'vitest';
import ExportDialog from '../components/export/ExportDialog';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShapeLibrary } from '../design-system/components/ShapeLibrary';
import { ThemeProvider } from '../design-system/components/ThemeProvider';
import { parseIconManifest } from '../lib/icons';
import { CHANGE_BADGE_COLORS } from '../screens/livingBadge';
import { meetsContrast } from '../design-system/validateTokens';

// R1-BUG-10/11: WCAG 2.5.3 label in name, and the Living change-badge contrast.
describe('R1 accessibility fixes', () => {
  it('app-bar search name starts with its visible text', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'AppShell.tsx'), 'utf8');
    expect(src).toContain('aria-label="Search ⌘K"');
  });

  it('Shapes panel tile visible text is contained in the accessible name', () => {
    const entries = parseIconManifest(JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'icons', 'manifest.json'), 'utf8')));
    render(<ThemeProvider><ShapeLibrary entries={entries} viewportCenter={{ x: 0, y: 0 }} pageId="pg-1" onInsert={() => undefined} /></ThemeProvider>);
    const tile = screen.getByRole('button', { name: 'Person element' });
    // The initial is drawn by CSS (data-letter), so the only text node is the label itself.
    expect(tile.textContent).toBe('Person');
    expect(tile.querySelector('[data-letter="P"]')).toBeTruthy();
  });

  it.each(Object.entries(CHANGE_BADGE_COLORS))('%s badge meets 4.5:1', (_k, c) => {
    expect(meetsContrast(c.fg, c.bg)).toBe(true);
  });

  it('Export dialog scroll panes are keyboard-focusable named regions and Esc closes it', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'export', 'ExportDialog.tsx'), 'utf8');
    expect(src).toContain('aria-label="Export options" tabIndex={0}');
    expect(src).toContain('aria-label="Export preview" tabIndex={0}');
    const onClose = vi.fn();
    render(<ExportDialog doc={{ id: 'd', title: 't', nodes: [], edges: [], createdAt: 0, updatedAt: 0 }} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
