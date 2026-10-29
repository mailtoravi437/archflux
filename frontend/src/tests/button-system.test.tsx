/// <reference types="node" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
// Vitest does not load CSS (`?raw` resolves to ''), so read the source file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Button, type ButtonSize } from '../design-system/components/Button';
import { Input } from '../design-system/components/Input';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

const HEIGHTS: Record<ButtonSize, string> = { sm: '28px', md: '32px', lg: '40px' };

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('R1-E01-T02 button and input system', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders each size with its height class', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount } = render(<Button size={size}>Go {size}</Button>);
      const btn = screen.getByRole('button', { name: `Go ${size}` });
      expect(btn).toHaveClass('btn', `btn--${size}`);
      expect(rule(`.btn.btn--${size}`)).toContain(`height: ${HEIGHTS[size]}`);
      unmount();
    }
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button', { name: variant })).toHaveClass(`btn--${variant}`);
      unmount();
    }
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn--danger');
    // Deprecated alias: .btn-xs matches sm and uses the UI font.
    const xs = rule('.btn-xs');
    expect(xs).toContain('height: 28px');
    expect(xs).toMatch(/font-family:\s*var\(--ui-font\)/);
  });

  it('icon-only button requires aria-label', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<Button icon={<svg />} />);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('aria-label'));
    unmount();
    err.mockClear();
    render(<Button icon={<svg />} aria-label="Undo" />);
    expect(err).not.toHaveBeenCalled();
    const btn = screen.getByRole('button', { name: 'Undo' });
    expect(btn).toHaveClass('btn--icon');
  });

  it('inputs are 32px with 13px text and the accent focus ring', () => {
    render(<Input label="Title" />);
    expect(screen.getByLabelText('Title')).toHaveClass('input');
    const input = rule('.input');
    expect(input).toContain('height: 32px');
    expect(input).toContain('font-size: var(--text-md)');
    const focus = rule('.input:focus, .input:focus-visible');
    expect(focus).toContain('border-color: var(--accent-cyan)');
    expect(focus).toContain('0 0 0 2px color-mix(in srgb, var(--accent-cyan) 35%, transparent)');
  });
});
