import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { DiagramProvider, type DiagramContextValue } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { api as http } from '../lib/api';
import { clearSession, setSession } from '../state/session';

const latest: { v: DiagramContextValue | null } = { v: null };
function Probe() {
  const v = useDiagram();
  useEffect(() => {
    latest.v = v;
  });
  return null;
}
const api = () => latest.v!;

describe('checkpoints keep pages and layers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    render(<DiagramProvider><Probe /></DiagramProvider>);
  });

  it('restoring a local checkpoint restores its pages', () => {
    act(() => api().addNode('service', 0, 0));
    act(() => { api().addPage('Second'); });
    act(() => { api().addLayer('Overlay'); });
    expect(api().pages).toHaveLength(2);
    act(() => api().tagCheckpoint('with two pages'));
    const cp = api().checkpoints[0];
    expect(cp.pages).toHaveLength(2);
    expect(cp.layers).toHaveLength(2);
    // Change pages after the checkpoint, then restore.
    act(() => { api().addPage('Third'); });
    act(() => { api().deletePage(api().pages[1].id); });
    expect(api().pages.map((p) => p.name)).not.toEqual(cp.pages!.map((p) => p.name));
    act(() => api().restoreCheckpoint(cp.id));
    expect(api().pages.map((p) => p.name)).toEqual(cp.pages!.map((p) => p.name));
    expect(api().layers.map((l) => l.name)).toEqual(cp.layers!.map((l) => l.name));
  });

  it('local docs have no role, so editing is allowed', () => {
    expect(api().role).toBeNull();
    act(() => api().addNode('db', 0, 0));
    expect(api().nodes.length).toBeGreaterThan(0);
  });
});

describe('read-only roles', () => {
  const ID = '123e4567-e89b-42d3-a456-426614174000';
  beforeEach(() => {
    localStorage.clear();
    const now = Date.now();
    const doc = { id: ID, title: 'shared.arch', nodes: [], edges: [], createdAt: now, updatedAt: now };
    localStorage.setItem('archflux:v2-light', JSON.stringify({ docs: [doc], activeDocId: ID, nodes: [], edges: [], docTitle: doc.title }));
    setSession({ mode: 'email', email: 'v@example.com' });
    vi.spyOn(http, 'listDiagrams').mockResolvedValue({ data: [] } as never);
    vi.spyOn(http.access, 'state').mockResolvedValue({ data: { state: 'ok', role: 'viewer' } });
  });

  it('a viewer cannot change the diagram through the store', async () => {
    render(<DiagramProvider><Probe /></DiagramProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(api().role).toBe('viewer');
    act(() => api().addNode('service', 0, 0));
    expect(api().nodes).toHaveLength(0);
    expect(api().toasts.some((t) => t.text.startsWith('View only'))).toBe(true);
    clearSession();
  });
});
