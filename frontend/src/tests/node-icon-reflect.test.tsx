/**
 * R1-E05 (fix): an icon chosen in the Inspector (Replace icon picker or the provider grid) must show
 * in the node's icon slot for card, icon and shape styles, and the legacy renderer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { drawNodePass } from '../canvas/render/nodePass';
import type { NodeIconSource, NodePaintFlags } from '../canvas/render/types';
import type { IconEntry } from '../lib/icons';
import type { ArchNode, DisplayStyle } from '../types';
import { Inspector } from '../screens/canvas/Inspector';
import { CanvasLocalContext, type CanvasLocalValue } from '../screens/canvas/CanvasLocalContext';
import { recordingCtx } from './fixtures/recordingCtx';

const flags: NodePaintFlags = { isDark: false, selected: false, pending: false, showPorts: false };
const loaded = { complete: true, naturalWidth: 32 } as HTMLImageElement;
const requested: string[] = [];
const icons: NodeIconSource = { get: (s) => { requested.push(s); return loaded; }, ensure: () => {} };
const entries: IconEntry[] = [
  { id: 'generic/database', set: 'generic', name: 'Database', keywords: [], kinds: ['database'], src: '/icons/generic/database.svg' },
];
const base: ArchNode = { id: 'n1', type: 'service', label: 'Orders DB', tag: '', health: '', x: 0, y: 0, w: 200, h: 80, stroke: '', kind: 'database', size: 'M' };

const styles: (DisplayStyle | undefined)[] = ['card', 'icon', 'shape', undefined];

function draws(node: ArchNode, withEntries = true) {
  const { ctx, calls } = recordingCtx();
  requested.length = 0;
  drawNodePass(ctx, node, icons, { ...flags, iconEntries: withEntries ? entries : undefined });
  return { calls, requested: [...requested] };
}

describe('node icon rendering', () => {
  for (const displayStyle of styles) {
    const label = displayStyle ?? 'legacy';
    it(`${label}: an iconRef pick draws the registry image`, () => {
      const n = { ...base, displayStyle, iconRef: { set: 'generic', id: 'generic/database' } } as ArchNode;
      const { calls } = draws(n);
      expect(calls.some((c) => c.op === 'drawImage')).toBe(true);
    });
    it(`${label}: a provider-grid pick (iconSrc, no iconRef) draws the image, not path text`, () => {
      const n = { ...base, displayStyle, iconSrc: '/icons/node-icons/database.svg' } as ArchNode;
      const { calls } = draws(n);
      expect(calls.some((c) => c.op === 'drawImage')).toBe(true);
      expect(calls.some((c) => c.op === 'fillText' && String(c.args[0]).includes('/icons/'))).toBe(false);
    });
  }
  it('a legacy emoji `icon` still renders as text', () => {
    const { calls } = draws({ ...base, displayStyle: 'card', icon: '🔥' });
    expect(calls.some((c) => c.op === 'fillText' && c.args[0] === '🔥')).toBe(true);
  });
  it('a legacy `icon` that is an image path draws the image, not path text', () => {
    const { calls } = draws({ ...base, displayStyle: 'card', icon: '/icons/node-icons/database.svg' });
    expect(calls.some((c) => c.op === 'drawImage')).toBe(true);
    expect(calls.some((c) => c.op === 'fillText' && String(c.args[0]).includes('/icons/'))).toBe(false);
  });
});

const writes = vi.hoisted(() => ({ updateNode: vi.fn(), nodes: [] as ArchNode[] }));
vi.mock('../state/useDiagram', () => ({
  useDiagram: () => ({
    nodes: writes.nodes, edges: [], selectedId: 'n1', setSelectedId: () => {}, panToNode: () => {},
    updateNode: writes.updateNode, updateEdge: () => {}, updateText: () => {}, deleteText: () => {}, deleteEdge: () => {},
    deleteSelected: () => {}, duplicateSelected: () => {}, setDisplayStyle: () => {}, multiSel: [],
    checkpoint: () => {}, docDefaults: {}, setDocDefaults: () => {},
  }),
  useDiagramActions: () => ({ checkpoint: () => {}, updateNode: writes.updateNode }),
}));

function renderInspector(selected: ArchNode) {
  writes.nodes = [selected];
  const local: CanvasLocalValue = {
    selected, selectedEdge: null, selectedText: null, selToolbarPos: null,
    setSelectedEdgeId: () => {}, setSelectedTextId: () => {}, beginTextEdit: () => {},
  };
  return render(
    <CanvasLocalContext.Provider value={local}><Inspector checkpointInspector={() => {}} /></CanvasLocalContext.Provider>,
  );
}

describe('Inspector icon section', () => {
  beforeEach(() => {
    writes.updateNode.mockClear();
    localStorage.clear();
    localStorage.setItem('archflux:inspector:sections:v1', JSON.stringify({ icon: true }));
  });
  it('a grid pick writes the image field the canvas reads and drops the old iconRef', () => {
    renderInspector(base);
    fireEvent.click(screen.getByRole('button', { name: 'Provider icon database' }));
    expect(writes.updateNode).toHaveBeenCalledWith('n1', { iconSrc: '/icons/node-icons/database.svg', iconRef: undefined, icon: undefined });
  });
  it('the summary names an iconRef pick', () => {
    renderInspector({ ...base, iconRef: { set: 'generic', id: 'generic/database' } });
    expect(screen.getByRole('button', { name: /^Icon\b.*database/i })).toBeTruthy();
  });
  it('the summary names a grid pick and says None for "No icon"', () => {
    const { unmount } = renderInspector({ ...base, iconSrc: '/icons/node-icons/lambda.svg' });
    expect(screen.getByRole('button', { name: /^Icon\b.*lambda/i })).toBeTruthy();
    unmount();
    renderInspector({ ...base, iconRef: null, iconSrc: '/icons/node-icons/lambda.svg' });
    expect(screen.getByRole('button', { name: /^Icon\s*None/i })).toBeTruthy();
  });
});
