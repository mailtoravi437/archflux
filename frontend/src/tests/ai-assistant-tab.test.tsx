import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CanvasScreen from '../screens/CanvasScreen';
import { DiagramProvider } from '../state/store';

// R1-E14-T10: the dock "AI assistant" tab is an honest R2 placeholder (Assistant.dc.html "R1 state").

beforeAll(() => {
  const ctx = new Proxy({}, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 10 }) : typeof p === 'string' ? () => undefined : undefined), set: () => true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});
beforeEach(() => localStorage.clear());

function openAssistantTab() {
  render(
    <MemoryRouter>
      <DiagramProvider>
        <CanvasScreen />
      </DiagramProvider>
    </MemoryRouter>,
  );
  const tablist = screen.getByRole('tablist', { name: 'Right panel' });
  fireEvent.click(within(tablist).getByRole('tab', { name: 'AI assistant' }));
  return { tablist, panel: screen.getByRole('tabpanel', { name: 'AI assistant' }) };
}

describe('AI assistant dock tab (R2 placeholder)', () => {
  it('has the exact dock tab labels and no Linter tab', () => {
    const { tablist } = openAssistantTab();
    expect(within(tablist).getAllByRole('tab').map((t) => t.textContent?.replace(/\s+\d+$/, ''))).toEqual(['Inspector', 'AI assistant', 'Live', 'History']);
    expect(within(tablist).queryByRole('tab', { name: /linter/i })).toBeNull();
  });

  it('shows the R2 notice and what it will do', () => {
    const { panel } = openAssistantTab();
    expect(within(panel).getByRole('heading', { name: 'Assistant arrives in R2' })).toBeInTheDocument();
    expect(within(panel).getByText('Coming in R2')).toBeInTheDocument();
    expect(within(panel).getByText(/What it will do/)).toBeInTheDocument();
    expect(within(panel).getByText(/status menu/i)).toBeInTheDocument();
  });

  it('has no generated content and no controls that act', () => {
    const { panel } = openAssistantTab();
    expect(panel.querySelectorAll('button, input, textarea, select, a, [role="button"]').length).toBe(0);
    expect(within(panel).queryByText(/Send|Accept change|Discard|Ask the assistant|Redis cache/)).toBeNull();
  });
});
