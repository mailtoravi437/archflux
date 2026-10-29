import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import type { ArchNode } from '../types';

type Diagram = ReturnType<typeof useDiagram>;

const latest: { v: Diagram | null } = { v: null };
function Probe() {
  const d = useDiagram();
  useEffect(() => {
    latest.v = d;
  });
  return null;
}

function mount() {
  latest.v = null;
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
      </DiagramProvider>
    </MemoryRouter>,
  );
}

const s = (): Diagram => {
  if (!latest.v) throw new Error('store context lost');
  return latest.v;
};

function node(id: string, extra: Partial<ArchNode> = {}): ArchNode {
  return { id, type: 'service', label: id, tag: '', health: 'ok', x: 0, y: 0, w: 120, h: 60, stroke: '#000', ...extra };
}

/** Adds one node via the store and returns its id. */
function addNodeHere(x = 10, y = 10): string {
  const before = new Set(s().nodes.map((n) => n.id));
  act(() => s().addNode('service', x, y));
  const added = s().nodes.find((n) => !before.has(n.id));
  if (!added) throw new Error('addNode added nothing');
  return added.id;
}

describe('pages and layers in the store (R1-E00-T04)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('new doc has one page and default layer', () => {
    mount();
    expect(s().pages).toEqual([{ id: 'pg-1', name: 'Page 1', order: 0 }]);
    expect(s().layers).toEqual([{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }]);
    expect(s().activePageId).toBe('pg-1');
    expect(s().docDefaults).toEqual({});
  });

  it('addPage activates the new page and new nodes land on it', () => {
    mount();
    let id = '';
    act(() => {
      id = s().addPage('Detail');
    });
    expect(s().pages.map((p) => p.name)).toEqual(['Page 1', 'Detail']);
    expect(s().activePageId).toBe(id);
    const nid = addNodeHere();
    expect(s().nodes.find((n) => n.id === nid)?.pageId).toBe(id);
    act(() => {
      s().addText(5, 5, 'hello', 14, '#000');
      s().addStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }], '#000', 2);
    });
    expect(s().texts[0]?.pageId).toBe(id);
    expect(s().strokes[0]?.pageId).toBe(id);
  });

  it('deletePage removes its elements and edges; last page cannot be deleted', () => {
    mount();
    const keep = addNodeHere();
    let p2 = '';
    act(() => {
      p2 = s().addPage();
    });
    const a = addNodeHere(100, 0);
    const b = addNodeHere(300, 0);
    act(() => s().connectNodes(a, b));
    act(() => s().connectNodes(keep, a));
    act(() => s().addText(5, 5, 'on page 2', 14, '#000'));
    expect(s().edges).toHaveLength(2);
    act(() => s().deletePage(p2));
    expect(s().pages.map((p) => p.id)).toEqual(['pg-1']);
    expect(s().nodes.map((n) => n.id)).toEqual([keep]);
    expect(s().edges).toHaveLength(0);
    expect(s().texts).toHaveLength(0);
    expect(s().activePageId).toBe('pg-1');
    act(() => s().deletePage('pg-1'));
    expect(s().pages).toHaveLength(1);
    expect(s().nodes).toHaveLength(1);
    expect(s().toasts.map((t) => t.text)).toContain('A diagram needs at least one page');
  });

  it('duplicatePage copies elements with fresh ids and remaps edges', () => {
    mount();
    const parent = addNodeHere(0, 0);
    const child = addNodeHere(20, 20);
    act(() => s().updateNode(child, { parentId: parent }));
    act(() => s().connectNodes(parent, child));
    const originals = new Set(s().nodes.map((n) => n.id));
    let copyPage = '';
    act(() => {
      copyPage = s().duplicatePage('pg-1');
    });
    expect(s().pages).toHaveLength(2);
    expect(s().activePageId).toBe(copyPage);
    const copies = s().nodes.filter((n) => n.pageId === copyPage);
    expect(copies).toHaveLength(2);
    copies.forEach((n) => expect(originals.has(n.id)).toBe(false));
    const copyParent = copies.find((n) => n.label === s().nodes.find((o) => o.id === parent)?.label)!;
    const copyChild = copies.find((n) => n.id !== copyParent.id)!;
    expect(copyChild.parentId).toBe(copyParent.id);
    const copyEdge = s().edges.find((e) => e.from === copyParent.id);
    expect(copyEdge?.to).toBe(copyChild.id);
    expect(s().edges).toHaveLength(2);
    // The source page is untouched.
    expect(s().nodes.filter((n) => n.pageId === 'pg-1').map((n) => n.id).sort()).toEqual([...originals].sort());
  });

  it('undo restores a deleted page with its elements', () => {
    mount();
    let p2 = '';
    act(() => {
      p2 = s().addPage('Detail');
    });
    const nid = addNodeHere();
    act(() => s().deletePage(p2));
    expect(s().pages).toHaveLength(1);
    expect(s().nodes).toHaveLength(0);
    act(() => s().undo());
    expect(s().pages.map((p) => p.id)).toEqual(['pg-1', p2]);
    expect(s().nodes.find((n) => n.id === nid)?.pageId).toBe(p2);
    act(() => s().redo());
    expect(s().pages).toHaveLength(1);
  });

  it('deleteLayer moves elements to default layer', () => {
    mount();
    let ly = '';
    act(() => {
      ly = s().addLayer('Infra');
    });
    expect(s().layers.map((l) => l.name)).toEqual(['Default', 'Infra']);
    const nid = addNodeHere();
    act(() => s().moveToLayer([nid], ly));
    expect(s().nodes.find((n) => n.id === nid)?.layerId).toBe(ly);
    act(() => s().updateLayer(ly, { visible: false }));
    expect(s().layers.find((l) => l.id === ly)?.visible).toBe(false);
    act(() => s().deleteLayer(ly));
    expect(s().layers.map((l) => l.id)).toEqual(['ly-default']);
    expect(s().nodes.find((n) => n.id === nid)?.layerId).toBe('ly-default');
    act(() => s().deleteLayer('ly-default'));
    expect(s().layers).toHaveLength(1);
  });

  it('pages survive persist → reload', async () => {
    const view = mount();
    let p2 = '';
    act(() => {
      p2 = s().addPage('Detail');
    });
    act(() => s().setDocDefaults({ displayStyle: 'icon' }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    view.unmount();
    mount();
    expect(s().pages.map((p) => [p.id, p.name])).toEqual([
      ['pg-1', 'Page 1'],
      [p2, 'Detail'],
    ]);
    expect(s().layers.map((l) => l.id)).toEqual(['ly-default']);
    expect(s().docDefaults).toEqual({ displayStyle: 'icon' });
  });

  it('mergeGraph remaps parentId of renamed nodes', () => {
    mount();
    const existing = addNodeHere();
    act(() =>
      s().mergeGraph(
        [node(existing, { kind: 'boundary' }), node('kid', { parentId: existing, linkPageId: 'pg-missing' })],
        [],
      ),
    );
    const renamed = `${existing}-2`;
    expect(s().nodes.map((n) => n.id)).toEqual([existing, renamed, 'kid']);
    const kid = s().nodes.find((n) => n.id === 'kid');
    expect(kid?.parentId).toBe(renamed);
    expect(kid?.linkPageId).toBeUndefined();
  });

  it('importArch v2 restores pages and layers', () => {
    mount();
    const pages = [
      { id: 'pg-a', name: 'Overview', order: 0 },
      { id: 'pg-b', name: 'Detail', order: 1 },
    ];
    const layers = [
      { id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false },
      { id: 'ly-x', name: 'Infra', order: 1, visible: false, locked: true },
    ];
    let res = { imported: false, warnings: [] as string[] };
    act(() => {
      res = s().importArch({
        app: 'ArchFlux',
        version: 2,
        nodes: [node('a', { pageId: 'pg-b', layerId: 'ly-x' }), node('b')],
        edges: [],
        pages,
        layers,
        defaults: { size: 'L' },
      } as unknown as Parameters<Diagram['importArch']>[0]);
    });
    expect(res.imported).toBe(true);
    expect(s().pages).toEqual(pages);
    expect(s().layers).toEqual(layers);
    expect(s().docDefaults).toEqual({ size: 'L' });
    expect(s().activePageId).toBe('pg-a');
    expect(s().nodes.find((n) => n.id === 'a')).toMatchObject({ pageId: 'pg-b', layerId: 'ly-x' });
    // One undo step brings back the previous page set.
    act(() => s().undo());
    expect(s().pages).toEqual([{ id: 'pg-1', name: 'Page 1', order: 0 }]);
  });
});
