// BUG-LIVE-018: Merge tab for a local checkpoint shows no fabricated check result.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import GitScreen from '../screens/GitScreen';

const h: { api: ReturnType<typeof useDiagram> | null } = { api: null };
function Grab() { const d = useDiagram(); useEffect(() => { h.api = d; }); return null; }
const mount = () => render(<MemoryRouter><DiagramProvider><Grab /><GitScreen /></DiagramProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); h.api = null; });
afterEach(cleanup);

describe('Merge tab honesty', () => {
  it('shows the empty state with no checkpoint', () => {
    mount();
    expect(screen.getByTestId('pr-empty')).toBeTruthy();
  });
  it('a tagged local checkpoint shows no pass/READY and names the document', () => {
    mount();
    act(() => h.api!.tagCheckpoint('untitled'));
    expect(screen.getByTestId('pr-checks-none').textContent).toBe('No checks run for a local checkpoint.');
    expect(screen.getByTestId('pr-no-checks').textContent).toContain('no checks run');
    expect(document.body.textContent).not.toMatch(/READY|Checks Passed/);
    expect(document.body.textContent).not.toContain('PASSED — arch-lint (snapshot)');
    expect(document.body.textContent).toContain(`${h.api!.docTitle} — checkpoint “untitled”`);
    expect(document.body.textContent).not.toContain('PR: untitled');
  });
});
