/**
 * Import contract (EPIC-09 header). Importers are pure: they never touch the
 * store, and the mapping preview (R1-E09-T03) shows the result before anything
 * is created.
 */
import type { DiagramDoc } from '../../types';

export interface ImportWarning {
  code: string;
  message: string;
  /** Source reference, e.g. the draw.io cell id or the Mermaid line number. */
  sourceRef?: string;
}

export type ImportFormat = 'drawio' | 'mermaid' | 'arch';

/**
 * `texts` is included beside the epic's Pick so draw.io `text;` cells can map to
 * FreeText (the epic's mapping table asks for that, but its Pick omitted the field).
 */
export type ImportedDoc = Pick<DiagramDoc, 'title' | 'nodes' | 'edges' | 'pages' | 'layers' | 'texts'>;

export interface ImportStats {
  pages: number;
  /** Elements, boundaries excluded. */
  nodes: number;
  edges: number;
  boundaries: number;
  skipped: number;
}

export interface ImportResult {
  ok: boolean;
  format: ImportFormat;
  /** Already normalised with `normalizeDoc`. Absent when `ok` is false. */
  doc?: ImportedDoc;
  stats: ImportStats;
  warnings: ImportWarning[];
  error?: string;
}

export const IMPORT_LIMITS = { bytes: 5_000_000, nodes: 5000, edges: 10000, pages: 50 };
