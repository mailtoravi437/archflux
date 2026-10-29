/**
 * Team templates (R1-E10-T07, CAP-S3): pure helpers. A team template is a normal server diagram
 * whose `tags` contain the reserved tag `template` and whose title ends with " (template)".
 * No React, no store, no network.
 */
import type { ImportedDoc } from './import/types';
import type { DiagramDoc } from '../types';

export const TEMPLATE_TAG = 'template';
const SUFFIX = ' (template)';

export const isTemplateTagged = (tags: readonly string[] | null | undefined): boolean =>
  Array.isArray(tags) && tags.some((t) => t.trim().toLowerCase() === TEMPLATE_TAG);

/** "<title> (template)", kept within the 80 character title limit. */
export function templateTitle(title: string): string {
  return `${title.slice(0, 80 - SUFFIX.length)}${SUFFIX}`;
}

export function stripTemplateSuffix(title: string): string {
  return title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title;
}

/** True for a doc that must stay out of the Library lists: tagged, or known to be a template by id. */
export function isTemplateDoc(doc: Pick<DiagramDoc, 'id' | 'tags'>, templateIds: ReadonlySet<string>): boolean {
  return templateIds.has(doc.id) || isTemplateTagged(doc.tags);
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The graph payload the server stores for a doc (same shape the canvas saves). */
export function graphOfDoc(doc: Pick<DiagramDoc, 'nodes' | 'edges' | 'strokes' | 'texts' | 'pages' | 'layers' | 'defaults'>) {
  return {
    nodes: clone(doc.nodes),
    edges: clone(doc.edges),
    strokes: clone(doc.strokes ?? []),
    texts: clone(doc.texts ?? []),
    ...(doc.pages ? { pages: clone(doc.pages) } : {}),
    ...(doc.layers ? { layers: clone(doc.layers) } : {}),
    ...(doc.defaults ? { defaults: { ...doc.defaults } } : {}),
  };
}

/** What using a template creates: a plain copy. It carries no tags, so it is never a template itself. */
export function templateToImport(doc: DiagramDoc): ImportedDoc {
  return {
    title: stripTemplateSuffix(doc.title),
    nodes: clone(doc.nodes),
    edges: clone(doc.edges),
    texts: clone(doc.texts ?? []),
    pages: clone(doc.pages ?? []),
    layers: clone(doc.layers ?? []),
  };
}
