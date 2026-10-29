import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';

const latest: { v: DiagramContextValue | null } = { v: null };

describe('probe', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); latest.v = null; });
  it('newDoc shape inside provider', () => {
    render(
      <MemoryRouter>
        <DiagramProvider>
          {(() => {
            const P = () => { latest.v = useDiagram(); return null; };
            return <P />;
          })()}
        </DiagramProvider>
      </MemoryRouter>,
    );
    console.log('before docs:', JSON.stringify(latest.v?.docs.map((d) => [d.id, d.title])), 'active:', latest.v?.activeDocId);
    act(() => latest.v?.newDoc());
    console.log('after docs:', JSON.stringify(latest.v?.docs.map((d) => [d.id, d.title])), 'active:', latest.v?.activeDocId);
    expect(true).toBe(true);
  });
});
