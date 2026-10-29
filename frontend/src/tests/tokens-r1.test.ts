/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
// Vitest does not load CSS (`?raw` resolves to ''), so read the source file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio } from '../design-system/validateTokens';
import { Button } from '../design-system/components/Button';
import { Input } from '../design-system/components/Input';
import { Tabs } from '../design-system/components/Tabs';
import { ThemeProvider } from '../design-system/components/ThemeProvider';
import * as palette from '../screens/canvas/palette';
import { readdirSync } from 'node:fs';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

/** Declarations of the first rule whose selector list starts with `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

function token(body: string, name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(body);
  expect(m, `missing ${name}`).not.toBeNull();
  return (m?.[1] ?? '').trim();
}

const light = block(':root, [data-theme="light"]');

describe('R1-E01-T01 design tokens', () => {
  it('light theme text colours meet 4.5:1 on panel', () => {
    expect(token(light, '--bg-app')).toBe('#F6F7F9');
    expect(token(light, '--bg-panel')).toBe('#FFFFFF');
    expect(token(light, '--border-panel')).toBe('#E3E6EB');
    expect(token(light, '--text-main')).toBe('#1B1F27');
    expect(token(light, '--text-muted')).toBe('#5B6474');
    expect(token(light, '--accent-cyan')).toBe('#4F46E5');
    const panel = token(light, '--bg-panel');
    const app = token(light, '--bg-app');
    for (const name of ['--text-main', '--text-muted', '--text-dim', '--accent-cyan']) {
      const fg = token(light, name);
      expect(contrastRatio(fg, panel), `${name} on panel`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(fg, app), `${name} on app`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every theme defines the type scale and code font', () => {
    const themes = [light, block('[data-theme="dark"]'), block('[data-theme="blueprint"]')];
    const scale: Record<string, string> = {
      '--text-xs': '11px', '--text-sm': '12px', '--text-md': '13px', '--text-lg': '15px', '--text-xl': '20px',
      '--lh-xs': '16px', '--lh-sm': '18px', '--lh-md': '20px', '--lh-lg': '22px', '--lh-xl': '28px',
    };
    for (const body of themes) {
      expect(token(body, '--code-font')).toBe('var(--mono-font)');
      for (const [name, value] of Object.entries(scale)) expect(token(body, name)).toBe(value);
    }
  });

  it('buttons, inputs and tabs use the UI font', () => {
    render(
      React.createElement(ThemeProvider, null,
        React.createElement(Button, null, 'Save'),
        React.createElement(Input, { 'aria-label': 'Name' }),
        React.createElement(Tabs, { tabs: [{ id: 'a', label: 'One' }] }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('btn');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass('input');
    expect(screen.getByRole('tab', { name: 'One' }).style.fontFamily).toMatch(/Inter|--ui-font/);
    // The classes those controls carry resolve to the UI font, never mono.
    for (const sel of ['button, input, select, textarea, label', '.btn.btn--sm, .btn.btn--md, .btn.btn--lg', '.input', '.btn-xs', '.utility-tab', '.sidebar-tab-btn', '.inspector-label', '.doc-title-input']) {
      expect(block(sel), sel).toMatch(/font-family:\s*var\(--ui-font\)/);
    }
    // Mono stays only for code and diffs.
    const monoRules = [...css.matchAll(/([^{}]+)\{[^}]*font-family:\s*var\(--(?:mono|code)-font\)/g)].map((m) => (m[1] ?? '').trim());
    for (const sel of monoRules) expect(sel).toMatch(/code|kbd|\.mono|diff/);
  });
});

describe('R1-E01-T09 legacy accent retirement', () => {
  it('light theme has no #635BFF left', () => {
    const bodies = [...css.matchAll(/(?:^|\n):root, \[data-theme="light"\] \{([^}]*)\}/g)].map((m) => m[1] ?? '');
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body.toUpperCase()).not.toContain('#635BFF');
    for (const name of ['--brand-primary', '--border-focus', '--connector-active', '--node-border-selected']) {
      expect(bodies.some((b) => b.includes(`${name}: var(--accent-cyan);`)), name).toBe(true);
    }
    expect(css).toMatch(/outline:\s*2px solid var\(--accent-cyan\);/);
  });

  it('canvas renderers and canvas screens use the light accent, not #635BFF', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(resolve(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) ? [resolve(dir, d.name)] : []);
    const offenders = [...walk(resolve(process.cwd(), 'src/canvas')), ...walk(resolve(process.cwd(), 'src/screens/canvas'))]
      .filter((f) => /#635BFF/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('canvas screens use sized button classes', () => {
    const files = [resolve(process.cwd(), 'src/screens/CanvasScreen.tsx'),
      ...readdirSync(resolve(process.cwd(), 'src/screens/canvas')).filter((f) => f.endsWith('.tsx')).map((f) => resolve(process.cwd(), 'src/screens/canvas', f))];
    expect(files.filter((f) => /btn-xs/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('screens use sized button classes', () => {
    const dir = resolve(process.cwd(), 'src/screens');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== 'CanvasScreen.tsx') // CanvasScreen is a hotspot-locked file (BACKLOG)
      .filter((f) => /className="btn-xs"/.test(readFileSync(resolve(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no legacy accent in light-theme rules and no btn-xs in the shell components', () => {
    // Everything outside the dark and blueprint token blocks (lines of those blocks start at their selector).
    const withoutThemes = css
      .replace(/\n\[data-theme="(?:dark|blueprint)"\] \{[^}]*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutThemes.toUpperCase()).not.toContain('#635BFF');
    for (const f of ['AppShell', 'ConflictDialog', 'ImportWarnings', 'RevisionsSection']) {
      expect(readFileSync(resolve(process.cwd(), `src/components/${f}.tsx`), 'utf8'), f).not.toMatch(/btn-xs/);
    }
  });

  it('swatch palettes have unique values', () => {
    for (const list of [palette.STROKE_COLORS, palette.BORDER_SWATCHES, palette.FILL_SWATCHES]) {
      const up = list.map((c) => c.toUpperCase());
      expect(new Set(up).size).toBe(up.length);
    }
  });
});
