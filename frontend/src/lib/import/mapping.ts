/**
 * Import mapping preview helpers (R1-E09-T03). Pure: detect the format, run the
 * matching importer, group the result into "source style groups" and re-map a
 * group to another kind before anything is created.
 */
import { validateArchImport } from '../archFormat';
import { importDrawio } from './drawio';
import { importMermaid } from './mermaid';
import { failure, titleFromFileName } from './shared';
import type { ArchNode, ElementKind } from '../../types';
import type { ImportFormat, ImportResult, ImportedDoc } from './types';

/** Extension first, then content. Returns null when nothing matches. */
export function detectImportFormat(fileName: string, text: string): ImportFormat | null {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (fileName.includes('.')) {
    if (ext === 'drawio') return 'drawio';
    if (ext === 'mmd' || ext === 'mermaid') return 'mermaid';
    if (ext === 'arch') return 'arch';
  }
  const head = text.trimStart();
  if (/^<\?xml|^<mxfile|^<mxGraphModel/.test(head) && /<mxfile|<mxGraphModel/.test(head.slice(0, 4000))) return 'drawio';
  if (/^---[\s\S]*?---\s*(flowchart|graph)\b/.test(head) || /^(%%[^\n]*\n\s*)*(flowchart|graph)\b/.test(head)) return 'mermaid';
  if (head.startsWith('{')) {
    try {
      const j: unknown = JSON.parse(text);
      if (typeof j === 'object' && j !== null && (j as { app?: unknown }).app === 'archflux') return 'arch';
    } catch {
      return null;
    }
  }
  if (ext === 'xml') return 'drawio';
  return null;
}

function runArch(text: string, fileName: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return failure('arch', 'The file is not valid JSON.');
  }
  const r = validateArchImport(data);
  if (!r.ok) return failure('arch', r.error);
  const boundaries = r.nodes.filter((n) => n.kind === 'boundary').length;
  return {
    ok: true,
    format: 'arch',
    doc: { title: titleFromFileName(fileName, 'Imported diagram'), nodes: r.nodes, edges: r.edges, pages: r.pages, layers: r.layers, texts: r.texts },
    stats: { pages: r.pages.length, nodes: r.nodes.length - boundaries, edges: r.edges.length, boundaries, skipped: 0 },
    warnings: r.warnings.map((message) => ({ code: 'arch_warning', message })),
  };
}

export async function runImport(fileName: string, text: string, format?: ImportFormat | null): Promise<ImportResult> {
  const f = format ?? detectImportFormat(fileName, text);
  if (f === 'drawio') return importDrawio(text, fileName);
  if (f === 'mermaid') return importMermaid(text, fileName);
  if (f === 'arch') return runArch(text, fileName);
  return failure('drawio', 'The format is not recognised. Use a .drawio, .mmd or .arch file.');
}

export const KIND_OPTIONS: ReadonlyArray<{ kind: ElementKind; label: string }> = [
  { kind: 'person', label: 'Person' },
  { kind: 'client', label: 'Client' },
  { kind: 'external', label: 'External system' },
  { kind: 'gateway', label: 'Gateway' },
  { kind: 'service', label: 'Service' },
  { kind: 'function', label: 'Function' },
  { kind: 'database', label: 'Database' },
  { kind: 'document-db', label: 'Document DB' },
  { kind: 'cache', label: 'Cache' },
  { kind: 'queue', label: 'Queue' },
  { kind: 'stream', label: 'Stream' },
  { kind: 'object-storage', label: 'Object storage' },
  { kind: 'search', label: 'Search' },
  { kind: 'cdn', label: 'CDN' },
  { kind: 'scheduler', label: 'Scheduler' },
  { kind: 'observability', label: 'Observability' },
  { kind: 'note', label: 'Note' },
];
const kindLabel = (k: ElementKind): string => KIND_OPTIONS.find((o) => o.kind === k)?.label ?? k;

export interface MappingGroup {
  key: string;
  /** e.g. "cylinder shapes" or "Service cards". */
  name: string;
  /** What the importer chose. */
  kind: ElementKind;
  count: number;
  sample: string;
}

const groupKey = (n: ArchNode): string => `${n.kind ?? 'service'}|${n.displayStyle ?? 'card'}`;

/** Groups the non-boundary elements by (importer kind, display style). */
export function mappingGroups(doc: ImportedDoc): MappingGroup[] {
  const out = new Map<string, MappingGroup>();
  for (const n of doc.nodes) {
    if (n.kind === 'boundary') continue;
    const kind = n.kind ?? 'service';
    const style = n.displayStyle ?? 'card';
    const key = groupKey(n);
    const g = out.get(key);
    if (g) {
      g.count++;
      continue;
    }
    const name = kind === 'database' && style === 'shape' ? 'cylinder shapes' : `${kindLabel(kind)} ${style === 'shape' ? 'shapes' : style === 'icon' ? 'icons' : 'cards'}`;
    out.set(key, { key, name, kind, count: 1, sample: n.label });
  }
  return [...out.values()];
}

const legacyType = (kind: ElementKind): string => (kind === 'database' ? 'db' : kind === 'gateway' || kind === 'stream' || kind === 'note' ? kind : 'service');

/** Returns a copy of `doc` with every element of each remapped group set to its new kind. */
export function applyKindMap(doc: ImportedDoc, map: Readonly<Record<string, ElementKind>>): ImportedDoc {
  if (Object.keys(map).length === 0) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      if (n.kind === 'boundary') return n;
      const to = map[groupKey(n)];
      return to && to !== n.kind ? { ...n, kind: to, type: legacyType(to) } : n;
    }),
  };
}
