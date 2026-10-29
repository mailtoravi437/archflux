import type { ArchNode, ArchEdge, FreeStroke, FreeText, Page, Layer } from '../../types';
export interface DocState { nodes: ArchNode[]; edges: ArchEdge[]; strokes: FreeStroke[]; texts: FreeText[]; pages: Page[]; layers: Layer[]; }
export type DocOp<A extends unknown[] = []> = (s: DocState, ...args: A) => DocState;
