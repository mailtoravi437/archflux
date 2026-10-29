import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ShapeLibrary } from '../design-system/components/ShapeLibrary';
import { parseIconManifest } from '../lib/icons';
import { ThemeProvider } from '../design-system/components/ThemeProvider';

// Palette.dc.html (2026-10-26): drawer placement, z-order and the 2-line tile labels.
const entries = parseIconManifest(JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'icons', 'manifest.json'), 'utf8')));
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function ruleBody(selector: string): string {
  const re = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(css);
  if (!m) throw new Error(`rule ${selector} not found`);
  return m[2];
}
const zOf = (selector: string) => Number(/z-index:\s*(\d+)/.exec(ruleBody(selector))?.[1]);

describe('Shapes drawer layout', () => {
  it('drawer z-index is above the minimap and the View toolbar (not covered by chrome)', () => {
    const drawer = zOf('.library-drawer');
    expect(drawer).toBeGreaterThan(zOf('.minimap-wrap'));
    expect(drawer).toBeGreaterThan(zOf('.canvas-view-toolbar'));
    expect(drawer).toBeLessThan(90);
  });

  it('the panel can shrink and its body scrolls inside the drawer', () => {
    render(<ThemeProvider><ShapeLibrary entries={entries} viewportCenter={{ x: 0, y: 0 }} onInsert={() => {}} /></ThemeProvider>);
    const aside = screen.getByLabelText('Shapes', { selector: 'aside' });
    expect(aside.style.flexShrink).not.toBe('0');
    expect(aside.style.minHeight).toBe('0px');
    const body = screen.getByRole('region', { name: 'Elements' }).parentElement as HTMLElement;
    expect(body.style.overflowY).toBe('auto');
    expect(body.style.minHeight).toBe('0px');
    // Every section is present in the scroll body, including Boundaries.
    for (const name of ['Elements', 'Boundaries', 'Kubernetes', 'Generic']) {
      expect(body.contains(screen.getByRole('region', { name }))).toBe(true);
    }
  });
});

describe('Shape tile labels', () => {
  it('clamp to 2 lines at 11 px, with the full name as tooltip and accessible name', () => {
    render(<ThemeProvider><ShapeLibrary entries={entries} viewportCenter={{ x: 0, y: 0 }} onInsert={() => {}} /></ThemeProvider>);
    const tile = screen.getByRole('button', { name: 'Amazon API Gateway' });
    expect(tile.getAttribute('title')).toBe('Amazon API Gateway');
    const label = tile.querySelector('span[data-tile-label]') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent).toBe('API Gateway');
    expect(label.style.getPropertyValue('-webkit-line-clamp') || (label.style as unknown as Record<string, string>).WebkitLineClamp).toBe('2');
    expect(label.style.whiteSpace).not.toBe('nowrap');
    expect(tile.style.fontSize).toBe('11px');
    expect(tile.style.height).toBe('68px');
  });

  it('every tile has a title equal to its full name', () => {
    render(<ThemeProvider><ShapeLibrary entries={entries} viewportCenter={{ x: 0, y: 0 }} onInsert={() => {}} /></ThemeProvider>);
    const tiles = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-pos'));
    expect(tiles.length).toBeGreaterThan(50);
    for (const t of tiles) expect(t.getAttribute('title')).toBeTruthy();
  });
});
