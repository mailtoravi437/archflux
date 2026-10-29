/**
 * Mermaid flowchart importer (R1-E09-T02). Sync, no dependencies, pure.
 * Supports the EPIC-09 subset; anything else becomes a warning, never a throw.
 * Mermaid has no coordinates, so nodes are placed with `layeredLayout` and
 * subgraph boundaries are fitted around their children.
 */
import type { ArchEdge, ArchNode, ElementKind } from '../../types';
import { layeredLayout, type LayoutDir } from '../layout';
import {
  DEFAULT_BOUNDARY_STROKE,
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_STROKE,
  failure,
  finish,
  fitBoundaries,
  splitNameTechnology,
  titleFromFileName,
  tooLarge,
} from './shared';
import type { ImportResult, ImportWarning } from './types';

const NODE_W = 200;
const NODE_H = 80;
const PAGE_ID = 'pg-1';

interface MNode {
  id: string;
  label: string;
  kind: ElementKind;
  displayStyle: 'card' | 'shape';
  shaped: boolean;
  subgraph?: string;
}

interface MSubgraph {
  id: string;
  title: string;
  parent?: string;
}

interface MEdge {
  from: string;
  to: string;
  label: string;
  relKind: NonNullable<ArchEdge['relKind']>;
  arrow: NonNullable<ArchEdge['arrow']>;
}

/** Node shapes, longest opener first. */
const SHAPES: { open: string; close: string; kind: ElementKind; style: 'card' | 'shape' }[] = [
  { open: '(((', close: ')))', kind: 'service', style: 'card' },
  { open: '[(', close: ')]', kind: 'database', style: 'shape' },
  { open: '[[', close: ']]', kind: 'service', style: 'card' },
  { open: '[/', close: '/]', kind: 'queue', style: 'shape' },
  { open: '[\\', close: '\\]', kind: 'queue', style: 'shape' },
  { open: '((', close: '))', kind: 'service', style: 'card' },
  { open: '{{', close: '}}', kind: 'service', style: 'card' },
  { open: '([', close: '])', kind: 'service', style: 'card' },
  { open: '(', close: ')', kind: 'service', style: 'card' },
  { open: '[', close: ']', kind: 'service', style: 'card' },
  { open: '{', close: '}', kind: 'gateway', style: 'card' },
  { open: '>', close: ']', kind: 'note', style: 'card' },
];

const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*/;

/** Link operators. Groups: 1 '<'?, 2 body. Label forms are handled separately. */
const LINK_RE = /^(<)?(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-)/;
/** `-- text -->`, `== text ==>`, `-. text .->` (open, text, close). */
const TEXT_LINK_RE = /^(<)?(--|==|-\.)\s*(.+?)\s*(-{2,}>|-{3,}|={2,}>|={3,}|\.-+>|\.-+)/;

function cleanText(raw: string): string {
  let t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/#quot;/g, '"');
}

function linkKind(body: string, bidir: boolean): { relKind: MEdge['relKind']; arrow: MEdge['arrow'] } {
  const headed = body.endsWith('>');
  const dotted = body.includes('.');
  if (bidir && headed) return { relKind: dotted ? 'async' : 'bidirectional', arrow: 'both' };
  return { relKind: dotted ? 'async' : 'sync', arrow: headed ? 'end' : 'none' };
}

/** Splits a line into statements on `;` outside brackets and quotes. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '[' || ch === '(' || ch === '{')) depth++;
    else if (!quoted && (ch === ']' || ch === ')' || ch === '}')) depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0 && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

interface Parser {
  nodes: Map<string, MNode>;
  subgraphs: Map<string, MSubgraph>;
  edges: MEdge[];
  stack: string[];
  warnings: ImportWarning[];
  stylesIgnored: boolean;
}

function touchNode(p: Parser, id: string, shape?: { label: string; kind: ElementKind; style: 'card' | 'shape' }): void {
  if (p.subgraphs.has(id)) return;
  const existing = p.nodes.get(id);
  if (!existing) {
    p.nodes.set(id, {
      id,
      label: shape?.label ?? id,
      kind: shape?.kind ?? 'service',
      displayStyle: shape?.style ?? 'card',
      shaped: !!shape,
      subgraph: p.stack[p.stack.length - 1],
    });
  } else {
    if (shape && !existing.shaped) {
      existing.label = shape.label;
      existing.kind = shape.kind;
      existing.displayStyle = shape.style;
      existing.shaped = true;
    }
    // Mentioning a node inside a subgraph moves it there (Mermaid behaviour).
    if (p.stack.length > 0) existing.subgraph = p.stack[p.stack.length - 1];
  }
}

/** Parses `id` plus an optional shape at `s[i]`. Returns the end index, or -1. */
function parseNode(p: Parser, s: string, i: number, out: string[]): number {
  const m = ID_RE.exec(s.slice(i));
  if (!m) return -1;
  let id = m[0];
  // `A-->B` without spaces: the id regex must not eat link dashes or dots.
  const cut = id.search(/(--|==|-\.|\.-)/);
  if (cut > 0) id = id.slice(0, cut);
  else if (cut === 0) return -1;
  id = id.replace(/[.-]+$/, '');
  if (id === '') return -1;
  let j = i + id.length;
  let shape: { label: string; kind: ElementKind; style: 'card' | 'shape' } | undefined;
  for (const sh of SHAPES) {
    if (!s.startsWith(sh.open, j)) continue;
    const end = s.indexOf(sh.close, j + sh.open.length);
    if (end < 0) continue;
    shape = { label: cleanText(s.slice(j + sh.open.length, end)), kind: sh.kind, style: sh.style };
    j = end + sh.close.length;
    break;
  }
  if (s.startsWith(':::', j)) {
    const cls = /^:::[\w-]+/.exec(s.slice(j));
    if (cls) {
      j += cls[0].length;
      p.stylesIgnored = true;
    }
  }
  touchNode(p, id, shape);
  out.push(id);
  return j;
}

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** Parses `A & B --> C -->|x| D` style statements. Returns false when nothing parsed. */
function parseChain(p: Parser, s: string, ref: string): boolean {
  let i = 0;
  const group = (): string[] | null => {
    const ids: string[] = [];
    i = skipWs(s, i);
    const end = parseNode(p, s, i, ids);
    if (end < 0) return null;
    i = end;
    for (;;) {
      const k = skipWs(s, i);
      if (s[k] !== '&') break;
      const next = parseNode(p, s, skipWs(s, k + 1), ids);
      if (next < 0) return null;
      i = next;
    }
    return ids;
  };
  let left = group();
  if (!left) return false;
  for (;;) {
    i = skipWs(s, i);
    if (i >= s.length) return true;
    const rest = s.slice(i);
    let label = '';
    let kind: { relKind: MEdge['relKind']; arrow: MEdge['arrow'] };
    const tm = TEXT_LINK_RE.exec(rest);
    const lm = LINK_RE.exec(rest);
    if (lm) {
      kind = linkKind(lm[2], lm[1] === '<');
      i += lm[0].length;
      const pipe = /^\s*\|([^|]*)\|/.exec(s.slice(i));
      if (pipe) {
        label = cleanText(pipe[1]);
        i += pipe[0].length;
      }
    } else if (tm) {
      kind = linkKind(tm[2] + tm[4], tm[1] === '<');
      label = cleanText(tm[3]);
      i += tm[0].length;
    } else {
      p.warnings.push({ code: 'unsupported_syntax', message: `Could not read "${rest}" (line ${ref}); the rest of the line was skipped.`, sourceRef: ref });
      return true;
    }
    const right = group();
    if (!right) {
      p.warnings.push({ code: 'unsupported_syntax', message: `A connection on line ${ref} has no target and was skipped.`, sourceRef: ref });
      return true;
    }
    for (const a of left) for (const b of right) p.edges.push({ from: a, to: b, label, ...kind });
    left = right;
  }
}

function parseSubgraph(p: Parser, rest: string, ref: string): void {
  const m = /^([A-Za-z0-9_][\w.-]*)\s*\[(.*)\]\s*$/.exec(rest);
  let id: string;
  let title: string;
  if (m) {
    id = m[1];
    title = cleanText(m[2]);
  } else {
    title = cleanText(rest) || `Group ${p.subgraphs.size + 1}`;
    id = /^[A-Za-z0-9_][\w.-]*$/.test(rest.trim()) ? rest.trim() : `sg${p.subgraphs.size + 1}`;
  }
  if (p.subgraphs.has(id)) {
    p.warnings.push({ code: 'duplicate_subgraph', message: `Subgraph "${id}" is defined twice (line ${ref}); the second is merged into the first.`, sourceRef: ref });
  } else {
    p.subgraphs.set(id, { id, title, parent: p.stack[p.stack.length - 1] });
    // A node referenced before its subgraph was declared becomes the boundary.
    p.nodes.delete(id);
  }
  p.stack.push(id);
}

const HEADER_RE = /^(flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?\s*;?\s*$/i;

export function importMermaid(src: string, fileName: string): ImportResult {
  const big = tooLarge('mermaid', src);
  if (big) return big;
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const p: Parser = { nodes: new Map(), subgraphs: new Map(), edges: [], stack: [], warnings: [], stylesIgnored: false };

  let dir: LayoutDir | null = null;
  for (let li = 0; li < lines.length; li++) {
    const ref = String(li + 1);
    const raw = lines[li].replace(/%%.*$/, '').trim();
    if (raw === '') continue;
    if (dir === null) {
      if (raw.startsWith('---')) {
        // YAML front matter: skip to its closing fence.
        let k = li + 1;
        while (k < lines.length && lines[k].trim() !== '---') k++;
        li = k;
        continue;
      }
      const h = HEADER_RE.exec(raw);
      if (!h) {
        const kind = raw.split(/\s+/)[0];
        return failure('mermaid', `Only Mermaid flowcharts can be imported; this file starts with "${kind}".`);
      }
      const d = (h[2] ?? 'TB').toUpperCase();
      dir = d === 'TD' ? 'TB' : (d as LayoutDir);
      continue;
    }
    for (const stmt of splitStatements(raw)) {
      const word = stmt.split(/\s+/)[0];
      if (word === 'subgraph') {
        parseSubgraph(p, stmt.slice('subgraph'.length).trim(), ref);
      } else if (word === 'end') {
        if (p.stack.length === 0)
          p.warnings.push({ code: 'unmatched_end', message: `"end" on line ${ref} has no open subgraph.`, sourceRef: ref });
        else p.stack.pop();
      } else if (word === 'classDef' || word === 'class' || word === 'style' || word === 'linkStyle') {
        p.stylesIgnored = true;
      } else if (word === 'direction') {
        p.warnings.push({ code: 'unsupported_statement', message: `Per-subgraph direction (line ${ref}) is ignored.`, sourceRef: ref });
      } else if (word === 'click' || word === 'accTitle' || word === 'accDescr' || word === 'accTitle:' || word === 'accDescr:') {
        p.warnings.push({ code: 'unsupported_statement', message: `"${word}" on line ${ref} is not supported and was ignored.`, sourceRef: ref });
      } else if (!parseChain(p, stmt, ref)) {
        p.warnings.push({ code: 'unsupported_statement', message: `Line ${ref} ("${stmt}") was not understood and was ignored.`, sourceRef: ref });
      }
    }
  }
  if (dir === null) return failure('mermaid', 'This file has no "flowchart" or "graph" header.');
  if (p.stack.length > 0)
    p.warnings.push({ code: 'unclosed_subgraph', message: `${p.stack.length} subgraph(s) are missing "end"; they were closed at the end of the file.` });
  if (p.stylesIgnored)
    p.warnings.push({ code: 'styles_ignored', message: 'classDef, class, style and linkStyle statements were ignored.' });

  return build(p, dir, titleFromFileName(fileName, 'Imported flowchart'));
}

const nodeId = (id: string) => `n-${id}`;

function build(p: Parser, dir: LayoutDir, title: string): ImportResult {
  const leaves: ArchNode[] = [...p.nodes.values()].map((n) => {
    const { label, technology } = splitNameTechnology(n.label);
    const node: ArchNode = {
      id: nodeId(n.id),
      type: n.kind === 'database' ? 'db' : n.kind === 'gateway' || n.kind === 'note' ? n.kind : 'service',
      label: label || n.id,
      tag: technology,
      technology,
      health: '',
      x: 0,
      y: 0,
      w: NODE_W,
      h: NODE_H,
      stroke: DEFAULT_NODE_STROKE,
      kind: n.kind,
      displayStyle: n.displayStyle,
      pageId: PAGE_ID,
    };
    if (n.subgraph) node.parentId = nodeId(n.subgraph);
    return node;
  });
  const edges: ArchEdge[] = p.edges.map((e, i) => {
    const edge: ArchEdge = {
      id: `e-${i + 1}`,
      from: nodeId(e.from),
      to: nodeId(e.to),
      label: e.label,
      color: DEFAULT_EDGE_COLOR,
      relKind: e.relKind,
      arrow: e.arrow,
    };
    if (e.relKind === 'async') {
      edge.dashed = true;
      edge.lineStyle = 'dashed';
    }
    return edge;
  });

  const boundaries: ArchNode[] = [...p.subgraphs.values()].map((sg) => {
    const b: ArchNode = {
      id: nodeId(sg.id),
      type: 'boundary',
      label: sg.title,
      tag: '',
      health: '',
      x: 0,
      y: 0,
      w: NODE_W,
      h: NODE_H,
      stroke: DEFAULT_BOUNDARY_STROKE,
      kind: 'boundary',
      boundaryKind: 'c4-system',
      pageId: PAGE_ID,
    };
    if (sg.parent) b.parentId = nodeId(sg.parent);
    return b;
  });
  // An empty subgraph is laid out like a node (same footprint) so it gets a slot.
  const parents = new Set([...leaves, ...boundaries].map((n) => n.parentId).filter((x): x is string => typeof x === 'string'));
  const filled = boundaries.filter((b) => parents.has(b.id));
  const empty = boundaries.filter((b) => !parents.has(b.id));

  const horizontal = dir === 'LR' || dir === 'RL';
  const laidOut = layeredLayout(
    [...empty, ...leaves],
    edges,
    dir,
    horizontal ? { rankGap: NODE_W + 100, nodeGap: NODE_H + 60 } : { rankGap: NODE_H + 80, nodeGap: NODE_W + 40 },
  );
  // Boundaries first so they sit behind their children.
  const all = fitBoundaries([...filled, ...laidOut]);
  all.forEach((n, i) => (n.z = i));

  return finish({
    format: 'mermaid',
    title,
    nodes: all,
    edges,
    pages: [{ id: PAGE_ID, name: 'Page 1', order: 0 }],
    warnings: p.warnings,
    skipped: 0,
  });
}
