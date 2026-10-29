// R1-E10-T06: Quick-add: type to create and connect.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import QuickAdd from '../components/quickadd/QuickAdd';
import QuickAddHost from '../components/quickadd/QuickAddHost';
import { parseIconManifest } from '../lib/icons';
import { nextFreeSlot, planQuickAdd, quickAddSuggestions } from '../lib/quickAdd';
import type { ArchNode } from '../types';

const entries = parseIconManifest(JSON.parse(readFileSync('public/icons/manifest.json', 'utf8')));
const svc = (id: string, x: number, y: number): ArchNode => ({
  id, type: 'service', kind: 'service', label: id, tag: '', health: 'ok', x, y, w: 200, h: 80, stroke: '#2563EB',
});

function seed(nodes: ArchNode[]) {
  const now = Date.now();
  const doc = { id: 'doc-a', title: 'a.arch', nodes, edges: [], createdAt: now, updatedAt: now };
  localStorage.setItem('archflux:v2-light', JSON.stringify({ docs: [doc], activeDocId: 'doc-a', nodes, edges: [], docTitle: doc.title }));
}

function Probe() {
  const { nodes, edges, selectedId, setSelectedId, undo } = useDiagram();
  return (
    <>
      <button type="button" onClick={() => setSelectedId('svc')}>select svc</button>
      <button type="button" onClick={undo}>undo</button>
      <output data-testid="probe">{JSON.stringify({
        nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, icon: n.iconRef?.id, x: n.x, y: n.y })),
        edges: edges.map((e) => [e.from, e.to]),
        selectedId,
      })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
  nodes: Array<{ id: string; kind?: string; icon?: string; x: number; y: number }>;
  edges: Array<[string, string]>;
  selectedId: string | null;
};

function setup() {
  render(
    <MemoryRouter initialEntries={['/canvas']}>
      <DiagramProvider>
        <Probe />
        <QuickAdd onClose={() => {}} entries={entries} />
      </DiagramProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('select svc'));
}
const input = () => screen.getByRole('combobox', { name: 'Quick add element' });
const addByTyping = (v: string) => {
  fireEvent.change(input(), { target: { value: v } });
  fireEvent.keyDown(input(), { key: 'Enter' });
};

beforeEach(() => {
  localStorage.clear();
  seed([svc('svc', 100, 100)]);
});
afterEach(() => act(() => cleanup()));

describe('Quick-add (R1-E10-T06)', () => {
  it('suggests a Cache with the ElastiCache icon for "redis"', () => {
    const [first] = quickAddSuggestions(entries, 'redis');
    expect(first.kind).toBe('cache');
    expect(first.icon?.id).toBe('aws/amazon-elasticache');
  });

  it('creates and connects a cache to the selected service', async () => {
    setup();
    await waitFor(() => expect(state().selectedId).toBe('svc'));
    addByTyping('redis');
    await waitFor(() => expect(state().nodes).toHaveLength(2));
    const s = state();
    const added = s.nodes.find((n) => n.id !== 'svc')!;
    expect(added.kind).toBe('cache');
    expect(added.icon).toBe('aws/amazon-elasticache');
    expect(s.edges).toEqual([['svc', added.id]]);
    expect(s.selectedId).toBe(added.id);
  });

  it('create and connect is one undo step', async () => {
    setup();
    await waitFor(() => expect(state().selectedId).toBe('svc'));
    addByTyping('redis');
    await waitFor(() => expect(state().nodes).toHaveLength(2));
    fireEvent.click(screen.getByText('undo'));
    await waitFor(() => expect(state().nodes).toHaveLength(1));
    expect(state().edges).toHaveLength(0);
  });

  it('chains: second Enter connects from the new node', async () => {
    setup();
    await waitFor(() => expect(state().selectedId).toBe('svc'));
    addByTyping('redis');
    await waitFor(() => expect(state().nodes).toHaveLength(2));
    const first = state().nodes.find((n) => n.id !== 'svc')!;
    addByTyping('queue');
    await waitFor(() => expect(state().nodes).toHaveLength(3));
    const s = state();
    const second = s.nodes.find((n) => n.id !== 'svc' && n.id !== first.id)!;
    expect(second.kind).toBe('queue');
    expect(s.edges).toContainEqual([first.id, second.id]);
    expect(s.edges).toHaveLength(2);
  });

  it('placement avoids overlap', () => {
    const src = svc('src', 0, 0);
    const taken = svc('t', 280, 0); // exactly the first slot to the right (200 wide + 80 gap)
    const slot = nextFreeSlot(src, [taken], { w: 200, h: 80 }, 'LR');
    expect(slot.x).toBe(280);
    expect(slot.y).toBeGreaterThanOrEqual(taken.y + taken.h);
    const node = planQuickAdd({ source: src, nodes: [src, taken], suggestion: quickAddSuggestions(entries, 'cache')[0], direction: 'TD' });
    expect(node.y).toBe(src.h + 80);
    expect(node.x).toBe(0);
  });

  it('Ctrl+Enter on a single selected node opens quick-add; Esc closes it', async () => {
    render(
      <MemoryRouter initialEntries={['/canvas']}>
        <DiagramProvider>
          <Probe />
          <QuickAddHost />
        </DiagramProvider>
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull(); // nothing selected: nothing opens
    fireEvent.click(screen.getByText('select svc'));
    await waitFor(() => expect(state().selectedId).toBe('svc'));
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    const dlg = await screen.findByRole('dialog', { name: 'Quick add' });
    expect(dlg).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Quick add element' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull();
  });

  it('Esc closes', () => {
    let closed = 0;
    render(
      <MemoryRouter>
        <DiagramProvider>
          <QuickAdd onClose={() => { closed++; }} entries={entries} />
        </DiagramProvider>
      </MemoryRouter>,
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(closed).toBe(1);
  });
});
