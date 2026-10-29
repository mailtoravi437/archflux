import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
vi.mock('../lib/analytics', () => ({ track: vi.fn(), flush: vi.fn(), setAnalyticsEnabled: vi.fn() }));
import HistoryPanel, { type PairSide } from '../components/history/HistoryPanel';
import PairCompare from '../components/compare/PairCompare';
import type { DocState } from '../state/ops/types';
import type { ArchNode } from '../types';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const T = Date.parse('2026-10-20T10:00:00Z');
function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}
const rev = (id: string, minutes: number, name: string | null) => ({
  id, diagramId: ID, parentRevisionId: null, contentHash: 'h', authorId: 'u1', authorName: 'Dana', source: 'import',
  message: null, name, description: null, createdAt: new Date(T + minutes * 60_000).toISOString(),
});
function node(id: string, label: string): ArchNode {
  return { id, type: 'service', label, tag: '', health: '', x: 0, y: 0, w: 100, h: 60, stroke: '#000' };
}
function doc(nodes: ArchNode[]): DocState {
  return { nodes, edges: [], strokes: [], texts: [], pages: [{ id: 'pg-1', name: 'Page 1', order: 0 }], layers: [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }] };
}
const snap = (nodes: ArchNode[]) => ({ nodes, edges: [], strokes: [], texts: [], pages: [], layers: [] });

const revs = [rev('r3', 30, 'Gamma'), rev('r2', 20, 'Beta'), rev('r1', 10, 'Alpha')];
const base = { diagramId: ID, cloud: true, canEdit: true, localCheckpoints: [], onCompare: () => {}, onRestoreLocal: () => {}, onRestored: () => {} };

function mockServer(urls: string[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/checkpoints')) return respond(200, { data: [] });
    if (url.endsWith('/revisions')) return respond(200, { data: revs });
    const m = /\/revisions\/([^/]+)$/.exec(url);
    if (m) return respond(200, { data: { ...revs.find((r) => r.id === m[1]), snapshot: snap([node('n-' + m[1], 'Node ' + m[1])]) } });
    return respond(404, {});
  });
}
const tick = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }));

describe('two-entry compare: history picker (R1-E08-T04)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('exactly two ticked entries enable Compare; one or three disable it', async () => {
    mockServer([]);
    render(<HistoryPanel {...base} onComparePair={() => {}} />);
    await screen.findByRole('checkbox', { name: /Select Alpha for compare/ });
    const btn = () => screen.getByRole('button', { name: 'Compare selected versions' }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Select two versions to compare');
    tick(/Alpha/);
    expect(btn().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Select one more version');
    tick(/Beta/);
    expect(btn().disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('2 selected · older on the left');
    tick(/Gamma/);
    expect(btn().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Select only two versions · 3 selected');
  });

  it('passes the two entries older-left and fetches both revision payloads', async () => {
    const urls: string[] = [];
    mockServer(urls);
    const onComparePair = vi.fn();
    render(<HistoryPanel {...base} onComparePair={onComparePair} />);
    await screen.findByRole('checkbox', { name: /Select Alpha for compare/ });
    tick(/Gamma/); // ticked newer first on purpose
    tick(/Alpha/);
    fireEvent.click(screen.getByRole('button', { name: 'Compare selected versions' }));
    expect(onComparePair).toHaveBeenCalledTimes(1);
    const [left, right] = onComparePair.mock.calls[0] as [PairSide, PairSide];
    expect(left.label).toBe('Alpha');
    expect(right.label).toBe('Gamma');
    expect(left.isCurrent).toBe(false);
    expect(right.isCurrent).toBe(true); // r3 is the newest revision = current
    const l = await left.load();
    expect(l.nodes.map((n) => n.id)).toEqual(['n-r1']);
    expect(urls.some((u) => u.endsWith('/revisions/r1'))).toBe(true);
  });
});

describe('two-entry compare: compare view sides (R1-E08-T04)', () => {
  beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
  afterEach(() => vi.restoreAllMocks());

  const older = { label: 'Alpha', doc: doc([node('a', 'A one'), node('gone', 'Gone')]), isCurrent: false };
  const newer = { label: 'Beta', doc: doc([node('a', 'A two'), node('fresh', 'Fresh')]), isCurrent: false };
  const live = { label: 'Current', doc: doc([node('live', 'Live only')]), isCurrent: true };

  it('shows older left, diffs the two picked versions (not the current doc), and Swap flips them', () => {
    render(<PairCompare left={older} right={newer} canEdit onRevert={() => {}} onExit={() => {}} isDark={false} />);
    expect(screen.getByText('Comparing Alpha → Beta')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Removed 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gone' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fresh' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Live only' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(screen.getByText('Comparing Beta → Alpha')).toBeTruthy();
    // Swapped: what was added is now removed.
    expect(screen.getByRole('region', { name: 'Added 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gone' })).toBeTruthy();
  });

  it('offers "Revert this change" only when the right side is the current version', () => {
    const { rerender } = render(<PairCompare left={older} right={newer} canEdit onRevert={() => {}} onExit={() => {}} isDark={false} />);
    expect(screen.queryByRole('button', { name: /^Revert this change/ })).toBeNull();
    rerender(<PairCompare left={older} right={live} canEdit onRevert={() => {}} onExit={() => {}} isDark={false} />);
    expect(screen.getAllByRole('button', { name: /^Revert this change/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(screen.queryByRole('button', { name: /^Revert this change/ })).toBeNull();
    rerender(<PairCompare left={older} right={live} canEdit={false} onRevert={() => {}} onExit={() => {}} isDark={false} />);
    expect(screen.queryByRole('button', { name: /^Revert this change/ })).toBeNull();
  });
});
