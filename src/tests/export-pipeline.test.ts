/**
 * Export pipeline unit tests — pure builders only (SVG/CSV/bounds/routing
 * are dependency-free so failures here never imply DOM/canvas issues).
 */
import { describe, expect, it } from 'vitest';
import {
  buildCSV,
  buildSVG,
  computeContentBounds,
  edgePolyline,
  escapeXml,
} from '../canvas/export/ExportPipeline';
import type { ArchEdge, ArchNode, DiagramDoc } from '../types';

const node = (o: Partial<ArchNode> & Pick<ArchNode, 'id'>): ArchNode => ({
  type: 'service',
  label: o.id,
  tag: '',
  health: 'Unknown',
  x: 0, y: 0, w: 100, h: 50,
  stroke: '#2563EB',
  ...o,
});

const edge = (o: Partial<ArchEdge> & Pick<ArchEdge, 'id' | 'from' | 'to'>): ArchEdge => ({
  label: '',
  color: '#6B7280',
  ...o,
});

const doc: DiagramDoc = {
  id: 'doc-1',
  title: 'Test Doc',
  nodes: [node({ id: 'a', x: 0, y: 0, w: 170, h: 70 }), node({ id: 'b', x: 300, y: 0, w: 170, h: 70 })],
  edges: [edge({ id: 'e1', from: 'a', to: 'b', label: 'REST', protocol: 'REST' })],
  createdAt: 0,
  updatedAt: 0,
};

describe('escapeXml', () => {
  it('escapes all five XML entities in one pass-safe order', () => {
    expect(escapeXml('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&apos;');
  });

  it('does not double-escape plain text', () => {
    expect(escapeXml('api gateway')).toBe('api gateway');
  });
});

describe('computeContentBounds', () => {
  it('unions node box, dangling edge coords, strokes, and texts', () => {
    const b = computeContentBounds(
      doc.nodes,
      [...doc.edges, edge({ id: 'e2', from: 'b', to: null, targetCoords: { x: 700, y: 400 } })],
      [{ id: 's1', pts: [{ x: -50, y: -50 }, { x: 200, y: 100 }], color: '#000', width: 2 }],
      [{ id: 't1', x: 100, y: 500, text: 'hello', fontSize: 16, color: '#000' }],
    );
    expect(b).toEqual({ minX: -50, minY: -50, maxX: 701, maxY: 506.4 }); // text box: y-16 .. y+0.4*fontSize
  });

  it('applies padding', () => {
    const b = computeContentBounds(doc.nodes, doc.edges, [], [], 10);
    expect(b).toEqual({ minX: -10, minY: -10, maxX: 470 + 10, maxY: 70 + 10 });
  });

  it('returns null for an empty document', () => {
    expect(computeContentBounds([], [])).toBeNull();
  });
});

describe('edgePolyline', () => {
  it('routes right→left between side-aligned nodes', () => {
    const pts = edgePolyline(doc.edges[0], doc.nodes)!;
    expect(pts[0]).toEqual({ x: 170, y: 35 });
    expect(pts.at(-1)).toEqual({ x: 300, y: 35 });
    expect(pts).toHaveLength(4); // orthogonal: sx, midX, midX, ex
  });

  it('routes bottom→top for vertically stacked nodes', () => {
    const stacked = [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 0, y: 200 })].map((n) => ({ ...n, w: 100, h: 50 }));
    const pts = edgePolyline(edge({ id: 'e', from: 'a', to: 'b' }), stacked)!;
    expect(pts[0].y).toBe(50);
    expect(pts.at(-1)!.y).toBe(200);
  });

  it('returns null when the from node is missing', () => {
    expect(edgePolyline(edge({ id: 'e', from: 'ghost', to: 'b' }), doc.nodes)).toBeNull();
  });
});

describe('buildSVG', () => {
  it('produces a tightly-cropped standalone SVG with defs, edges, and nodes', () => {
    const svg = buildSVG(doc, { format: 'svg' }, { isDark: false, icons: new Map() });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<defs>');
    expect(svg).toContain('id="a"');
    expect(svg).toContain('>REST</text>');
    // viewbox starts at padding offset around the 0..470 content
    expect(svg).toContain('viewBox="-40 -40 550 150"');
  });

  it('escapes hostile labels so output remains valid XML', () => {
    const hostile: DiagramDoc = {
      ...doc,
      title: '"><script>alert(1)</script>',
      nodes: [node({ id: '{{inj}}', label: 'a"b&c' })],
      edges: [],
    };
    const svg = buildSVG(hostile, { format: 'svg' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('href="{{inj}}"');
    expect(svg).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('embeds icons as data URIs and skips missing ones', () => {
    const icons = new Map([['/icons/aws/ec2.svg', 'data:image/svg+xml;base64,QUJD']]);
    const withIcon: DiagramDoc = { ...doc, nodes: [node({ id: 'a', iconSrc: '/icons/aws/ec2.svg' }), node({ id: 'b', iconSrc: '/icons/missing.svg' })], edges: [] };
    const svg = buildSVG(withIcon, { format: 'svg' }, { isDark: false, icons });
    expect(svg).toContain('href="data:image/svg+xml;base64,QUJD"');
    expect(svg).not.toContain('missing.svg" href');
  });

  it('hides strokes and texts when excluded', () => {
    const withInk: DiagramDoc = {
      ...doc,
      strokes: [{ id: 's1', pts: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', width: 2 }],
      texts: [{ id: 't1', x: 0, y: 0, text: 'note', fontSize: 14, color: '#000' }],
    };
    const withSvg = buildSVG(withInk, { format: 'svg' });
    const withoutSvg = buildSVG(withInk, { format: 'svg', includeStrokes: false, includeTexts: false });
    expect(withSvg).toContain('>note</text>');
    expect(withoutSvg).not.toContain('>note</text>');
    expect(withoutSvg).not.toContain('stroke-width="2" stroke-linecap');
  });

  it('returns empty string for an empty document', () => {
    const empty: DiagramDoc = { ...doc, nodes: [], edges: [] };
    expect(buildSVG(empty, { format: 'svg' })).toBe('');
  });
});

describe('buildCSV', () => {
  it('emits shape + connector sections with RFC4180 quoting for commas', () => {
    const messy: DiagramDoc = {
      ...doc,
      nodes: [node({ id: 'a', label: 'db, primary', details: 'line1\nline2' })],
      edges: [edge({ id: 'e1', from: 'a', to: 'b', label: 'he said "go"' })],
    };
    const csv = buildCSV(messy);
    expect(csv).toMatch(/^# document,Test Doc,/m); // RFC 4180: no comma ⇒ no quoting
    expect(csv).toContain('section,type,id,label');
    expect(csv).toContain('shape,service,a,"db, primary"');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"he said ""go"""');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('defaults missing optional fields to empty cells', () => {
    const csv = buildCSV(doc);
    const row = csv.split('\n').find((l) => l.startsWith('shape,service,a,'))!;
    expect(row.split(',')).toHaveLength(14);
  });
});
