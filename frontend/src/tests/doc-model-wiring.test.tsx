import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiagramProvider, serverDiagramToDoc } from '../state/store';
import { useDiagramDocs } from '../state/useDiagram';
import type { DiagramDocsContextValue } from '../state/store';
import { validateArchImport } from '../lib/archFormat';

const STORE_KEY = 'archflux:v2-light';

const latest: { v: DiagramDocsContextValue | null } = { v: null };
function Probe() {
  const docs = useDiagramDocs();
  useEffect(() => {
    latest.v = docs;
  });
  return null;
}

function v1Node(id: string, extra: Record<string, unknown> = {}) {
  return { id, type: 'service', label: id, tag: 'Go 1.22', health: 'ok', x: 0, y: 0, w: 120, h: 60, stroke: '#000', ...extra };
}

describe('normalizeDoc wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    latest.v = null;
  });

  it('a v1 localStorage doc loads with pages and layers', () => {
    const doc = {
      id: 'doc-v1',
      title: 'legacy.arch',
      nodes: [v1Node('a'), v1Node('b', { type: 'db' })],
      edges: [{ id: 'e1', from: 'a', to: 'b', label: 'x', color: '#000', dashed: true }],
      strokes: [],
      createdAt: 1,
      updatedAt: 2,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify({ docs: [doc], activeDocId: doc.id }));
    render(
      <MemoryRouter>
        <DiagramProvider>
          <Probe />
        </DiagramProvider>
      </MemoryRouter>,
    );
    const loaded = latest.v?.docs.find((d) => d.id === 'doc-v1');
    expect(loaded?.pages).toEqual([{ id: 'pg-1', name: 'Page 1', order: 0 }]);
    expect(loaded?.layers?.[0]?.id).toBe('ly-default');
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.nodes.find((n) => n.id === 'b')).toMatchObject({ kind: 'database', displayStyle: 'shape', pageId: 'pg-1', layerId: 'ly-default' });
    expect(loaded?.edges[0]?.relKind).toBe('async');
  });

  it('serverDiagramToDoc keeps pages from the server graph', () => {
    const pages = [
      { id: 'pg-a', name: 'Overview', order: 0 },
      { id: 'pg-b', name: 'Detail', order: 1 },
    ];
    const layers = [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }];
    const doc = serverDiagramToDoc({
      id: '0b9e6f3c-2c4a-4d8e-9f00-1234567890ab',
      title: 'server.arch',
      version: 3,
      graph: {
        nodes: [v1Node('a', { pageId: 'pg-b' }), v1Node('b')],
        edges: [],
        pages,
        layers,
        defaults: { displayStyle: 'icon' },
      },
    });
    expect(doc?.pages).toEqual(pages);
    expect(doc?.layers).toEqual(layers);
    expect(doc?.defaults).toEqual({ displayStyle: 'icon' });
    expect(doc?.nodes.find((n) => n.id === 'a')?.pageId).toBe('pg-b');
    expect(doc?.nodes.find((n) => n.id === 'b')?.pageId).toBe('pg-a');
    expect(doc?.serverVersion).toBe(3);
  });

  it('.arch v1 import yields normalised nodes', () => {
    const res = validateArchImport({
      app: 'ArchFlux',
      version: 1,
      nodes: [v1Node('a'), v1Node('b', { type: 'db' })],
      edges: [{ id: 'e1', from: 'a', to: 'b', label: 'x', color: '#000' }],
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.nodes.find((n) => n.id === 'a')).toMatchObject({ kind: 'service', technology: 'Go 1.22', pageId: 'pg-1', layerId: 'ly-default' });
    expect(res.nodes.find((n) => n.id === 'b')).toMatchObject({ kind: 'database', displayStyle: 'shape' });
    expect(res.edges[0]?.relKind).toBe('sync');
  });
});
