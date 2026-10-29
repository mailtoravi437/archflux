// R1-E04-T06: Format painter and multi-select styling.
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider } from '../state/store';
import { useDiagram } from '../state/useDiagram';
import { copyStyle, pasteStyle, STYLE_KEYS } from '../state/ops/style';
import { formatPainterShortcut, useFormatPainter, type FormatPainter } from '../screens/canvas/useFormatPainter';
import { MultiAppearance } from '../screens/canvas/MultiAppearance';
import type { ArchNode } from '../types';

type Diagram = ReturnType<typeof useDiagram>;
const latest: { v: Diagram | null; fp: FormatPainter | null; select: (ids: string[]) => void } = { v: null, fp: null, select: () => {} };
function Probe() {
  const d = useDiagram();
  const [selection, setSelection] = useState<string[]>([]);
  const fp = useFormatPainter({ nodes: d.nodes, selectedIds: selection, pasteStyle: d.pasteStyle });
  useEffect(() => {
    latest.v = d;
    latest.fp = fp;
    latest.select = setSelection;
  }, [d, fp, setSelection]);
  return null;
}
const s = (): Diagram => latest.v!;

function mount(extra?: () => React.ReactNode) {
  latest.v = null;
  latest.fp = null;
  return render(
    <MemoryRouter>
      <DiagramProvider>
        <Probe />
        {extra?.()}
      </DiagramProvider>
    </MemoryRouter>,
  );
}

const find = (label: string): ArchNode => s().nodes.find((n) => n.label === label)!;
function addLabelled(label: string, x: number): string {
  let id: string | null = null;
  act(() => {
    id = s().addNode('service', x, 100);
  });
  const node = s().nodes[s().nodes.length - 1];
  act(() => s().updateNode(node.id, { label }));
  return id ?? node.id;
}

describe('format painter', () => {
  it('copy/paste style applies stroke+fill to 2 nodes in one undo', () => {
    mount();
    const a = addLabelled('A', 100);
    const b = addLabelled('B', 400);
    const c = addLabelled('C', 700);
    act(() => s().updateNode(a, { stroke: '#DC2626', fill: '#FEE2E2', strokeWidth: 1 }));
    const before = { b: find('B'), c: find('C') };
    const style = copyStyle(find('A'));
    expect(Object.keys(style)).toEqual([...STYLE_KEYS]);
    act(() => s().pasteStyle([b, c], style));
    for (const label of ['B', 'C']) {
      expect(find(label).stroke).toBe('#DC2626');
      expect(find(label).fill).toBe('#FEE2E2');
      expect(find(label).strokeWidth).toBe(1);
    }
    expect(find('A').stroke).toBe('#DC2626');
    act(() => s().undo());
    expect(find('B').stroke).toBe(before.b.stroke);
    expect(find('C').fill).toBe(before.c.fill);
    expect(find('A').fill).toBe('#FEE2E2');
  });

  it('inspector shows Mixed for differing fills', () => {
    mount();
    const a = addLabelled('A', 100);
    const b = addLabelled('B', 400);
    act(() => s().updateNode(a, { fill: '#DBEAFE' }));
    act(() => s().updateNode(b, { fill: '#DCFCE7' }));
    const { rerender } = render(
      <DiagramProvider>
        <MultiAppearance nodes={s().nodes} />
      </DiagramProvider>,
    );
    void rerender;
    const fill = screen.getByRole('group', { name: 'Fill' });
    expect(within(fill).getByText('Mixed')).toBeTruthy();
    expect(within(fill).getAllByRole('button').every((b2) => b2.getAttribute('aria-pressed') !== 'true')).toBe(true);
  });
});

describe('format painter details', () => {
  it('pasteStyle skips locked nodes and returns the same state when nothing changes', () => {
    const mk = (id: string, over: Partial<ArchNode> = {}): ArchNode => ({ id, type: 'service', label: id, tag: '', health: '', x: 0, y: 0, w: 100, h: 50, stroke: '#2563EB', ...over });
    const st = { nodes: [mk('a'), mk('b', { locked: true })], edges: [], strokes: [], texts: [], pages: [], layers: [] };
    const out = pasteStyle(st, ['a', 'b'], { stroke: '#DC2626' });
    expect(out.nodes[0].stroke).toBe('#DC2626');
    expect(out.nodes[1].stroke).toBe('#2563EB');
    expect(pasteStyle(out, ['a'], { stroke: '#DC2626' })).toBe(out);
    expect(pasteStyle(st, ['a'], { label: 'x' })).toBe(st);
  });

  it('shortcuts use Ctrl+Alt+C / Ctrl+Alt+V and the armed button pastes once', () => {
    expect(formatPainterShortcut({ code: 'KeyC', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false })).toBe('copy');
    expect(formatPainterShortcut({ code: 'KeyV', ctrlKey: false, metaKey: true, altKey: true, shiftKey: false })).toBe('paste');
    expect(formatPainterShortcut({ code: 'KeyV', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBeNull();
    mount();
    const a = addLabelled('A', 100);
    const b = addLabelled('B', 400);
    act(() => s().updateNode(a, { stroke: '#7C3AED' }));
    act(() => latest.select([a]));
    act(() => {
      fireEvent.keyDown(window, { code: 'KeyC', ctrlKey: true, altKey: true });
    });
    expect(latest.fp!.copied?.stroke).toBe('#7C3AED');
    act(() => latest.select([b]));
    act(() => {
      fireEvent.keyDown(window, { code: 'KeyV', ctrlKey: true, altKey: true });
    });
    expect(find('B').stroke).toBe('#7C3AED');
    // One-shot button.
    act(() => latest.select([a]));
    act(() => {
      latest.fp!.arm();
    });
    expect(latest.fp!.armed).toBe(true);
    act(() => s().updateNode(b, { stroke: '#15803D' }));
    act(() => {
      latest.fp!.applyArmed([b]);
    });
    expect(find('B').stroke).toBe('#7C3AED');
    expect(latest.fp!.armed).toBe(false);
    expect(latest.fp!.applyArmed([b])).toBe(false);
  });
});
