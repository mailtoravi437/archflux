import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ToolPalette } from '../components/ToolPalette';
import type { CanvasTool } from '../state/useDiagram';

// R1-E01-T04 / R1-E14-T02: the rail is icon-only; every button is named
// "<Tool name> (<shortcut>)", and keyboard focus shows that name as a tooltip.

function renderRail() {
  const noop = () => {};
  return render(
    <ToolPalette
      tool={'select' as CanvasTool}
      setTool={noop}
      lockedTool={null}
      setLockedTool={noop}
      setPendingFrom={noop}
      pushToast={noop}
      libOpen={false}
      setLibOpen={noop}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('tool rail', () => {
  // R1-E14-T02 supersedes the E01-T04 naming: the accessible name carries the key,
  // "Select (V)", matching Main.dc.html; the native title is "Select  V".
  it('every rail button has aria-label matching its tooltip name', () => {
    renderRail();
    const rail = screen.getByRole('toolbar', { name: 'Canvas tools' });
    const buttons = within(rail).getAllByRole('button');
    expect(buttons.length).toBe(11);
    for (const btn of buttons) {
      const name = btn.getAttribute('aria-label');
      expect(name).toMatch(/^(.+) \((.+)\)$/);
      expect(btn.getAttribute('title')).toMatch(/^.+ {2}\S+$/);
      fireEvent.focus(btn);
      const tip = screen.getByRole('tooltip');
      expect(tip.textContent).toBe(name);
      expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
      fireEvent.blur(btn);
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
    // The library entry is "Shapes library (L)" with title "Shapes  L".
    const lib = within(rail).getByRole('button', { name: 'Shapes library (L)' });
    expect(lib.getAttribute('title')).toBe('Shapes  L');
  });

  it('tooltip shows the rebound shortcut and appears on keyboard focus', () => {
    localStorage.setItem('archflux:settings:v1', JSON.stringify({ shortcuts: { Select: 'X' } }));
    renderRail();
    const btn = screen.getByRole('button', { name: 'Select (X)' });
    expect(btn.getAttribute('title')).toBe('Select  X');
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip').textContent).toBe('Select (X)');
    fireEvent.blur(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('no rail text is truncated with an ellipsis', () => {
    renderRail();
    const rail = screen.getByRole('toolbar', { name: 'Canvas tools' });
    // Icon-only: no visible captions or group headings remain to truncate.
    expect(rail.textContent?.trim()).toBe('');
    for (const el of Array.from(rail.querySelectorAll<HTMLElement>('*'))) {
      expect(getComputedStyle(el).textOverflow).not.toBe('ellipsis');
    }
    // Three groups, separated by two 24×1 dividers (Main.dc.html L76, L83).
    expect(rail.querySelectorAll('[role="separator"]').length).toBe(2);
  });
});
