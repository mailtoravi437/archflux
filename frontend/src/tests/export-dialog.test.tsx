// R1-E09-T04: Export dialog (SC-39).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExportDialog from '../components/export/ExportDialog';
import { buildPrintSections, exportDocument } from '../canvas/export/ExportPipeline';
import { scopeDoc } from '../lib/exportScope';
import type { ArchEdge, ArchNode, DiagramDoc } from '../types';

const node = (o: Partial<ArchNode> & Pick<ArchNode, 'id'>): ArchNode => ({
  type: 'service', label: o.id, tag: '', health: 'Unknown', x: 0, y: 0, w: 100, h: 50, stroke: '#2563EB', ...o,
});
const edge = (o: Partial<ArchEdge> & Pick<ArchEdge, 'id' | 'from'>): ArchEdge => ({ label: '', color: '#6B7280', ...o });

const doc: DiagramDoc = {
  id: 'doc-x',
  title: 'Checkout',
  nodes: [
    node({ id: 'a', x: 0 }),
    node({ id: 'b', x: 300 }),
    node({ id: 'c', x: 600, layerId: 'ly-hidden' }),
    node({ id: 'p2', x: 0, y: 400, pageId: 'pg-2' }),
  ],
  edges: [edge({ id: 'e1', from: 'a', to: 'b' }), edge({ id: 'e2', from: 'b', to: 'c' })],
  pages: [{ id: 'pg-1', name: 'Context', order: 0 }, { id: 'pg-2', name: 'Containers', order: 1 }],
  layers: [
    { id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false },
    { id: 'ly-hidden', name: 'Notes', order: 1, visible: false, locked: false },
  ],
  createdAt: 0,
  updatedAt: 0,
};

function readBlob(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

let blobs: Blob[];
beforeEach(() => {
  blobs = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    blobs.push(b as Blob);
    return 'blob:test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('export dialog (R1-E09-T04)', () => {
  it('selection scope exports only selected nodes', async () => {
    render(<ExportDialog doc={doc} selectedIds={['a', 'b']} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^\.arch/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export .arch' }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const out = JSON.parse(await readBlob(blobs[0])) as { nodes: { id: string }[]; edges: { id: string }[] };
    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out.edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('selection is disabled when nothing is selected', () => {
    render(<ExportDialog doc={doc} onClose={() => {}} />);
    expect((screen.getByRole('radio', { name: 'Selection' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('hidden layers excluded unless opted in', async () => {
    const without = await exportDocument(doc, { format: 'json', scope: 'all', includeHiddenLayers: false });
    const idsWithout = (JSON.parse(await readBlob(without.blob as Blob)).nodes as { id: string }[]).map((n) => n.id);
    expect(idsWithout).not.toContain('c');
    const withHidden = await exportDocument(doc, { format: 'json', scope: 'all', includeHiddenLayers: true });
    const parsed = JSON.parse(await readBlob(withHidden.blob as Blob));
    expect((parsed.nodes as { id: string }[]).map((n) => n.id)).toContain('c');
    // The .arch path now carries pages and layers (R1-E00-T05 finding).
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.layers).toHaveLength(2);
  });

  it('all pages PDF produces one section per page', () => {
    const ctx = { isDark: false, icons: new Map<string, string>() };
    const sections = buildPrintSections(doc, { format: 'print', scope: 'all', includeHiddenLayers: false }, ctx);
    expect(sections.map((s) => s.name)).toEqual(['Context', 'Containers']);
    const one = buildPrintSections(scopeDoc(doc, { scope: 'page', pageId: 'pg-2' }), { format: 'print', scope: 'page' }, ctx);
    expect(one).toHaveLength(1);
  });

  it('transparent background omits bg rect in SVG', async () => {
    const solid = await exportDocument(doc, { format: 'svg', background: 'white' });
    const clear = await exportDocument(doc, { format: 'svg', background: 'transparent' });
    const count = (t: string) => (t.match(/<rect /g) ?? []).length;
    const solidSvg = await readBlob(solid.blob as Blob);
    const clearSvg = await readBlob(clear.blob as Blob);
    expect(solidSvg).toContain('fill="#FFFFFF"/>');
    expect(count(clearSvg)).toBe(count(solidSvg) - 1);
  });

  it('shows a size estimate for PNG and honest empty scope', () => {
    render(<ExportDialog doc={doc} onClose={() => {}} />);
    expect(screen.getByRole('status', { name: 'Size estimate' }).textContent).toMatch(/^≈ \d+×\d+ px$/);
    cleanup();
    render(<ExportDialog doc={{ ...doc, nodes: [], edges: [] }} onClose={() => {}} />);
    expect(screen.getByText('Nothing to export in this scope.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export PNG' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ExportDialog doc={doc} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
