/**
 * Multi-format export pipeline (LucidChart ucbhLh-parity dispatcher).
 *
 * Formats:
 *  - json  → .arch document (delegates to buildArchExport, PROD-006/007)
 *  - svg   → vector export with inline icon embedding (LucidChart ucbbLh)
 *  - png   → raster export via SVG rasterization (scale-aware, DPR-aware)
 *  - csv   → tabular shape/edge data (LucidChart ucb7Kh) for spreadsheets
 *  - print → browser print dialog (PDF via user agent; no pdfkit dependency)
 *
 * Pure builders (buildSVG, buildCSV, escapeXml) are dependency-free and fully
 * unit-testable — mirroring the canvasGeometry.ts convention. Only raster
 * export touches DOM APIs.
 */
import type { ArchEdge, ArchNode, DiagramDoc, FreeStroke, FreeText } from '../../types';
import { buildArchExport } from '../../archFormat';
import { edgePoints } from '../../canvasGeometry';

export type ExportFormat = 'json' | 'svg' | 'png' | 'csv' | 'print';

export interface ExportOptions {
  format: ExportFormat;
  /** File name without extension (derived from doc title when omitted). */
  fileName?: string;
  /** Raster scale for PNG (1 = CSS px, 2 = retina). */
  scale?: number;
  /** Page background: 'white' | 'dark' | 'transparent'. */
  background?: 'white' | 'dark' | 'transparent';
  /** Padding in world units around content bounds. */
  padding?: number;
  /** Include freehand strokes / free text in vector+raster output. */
  includeStrokes?: boolean;
  includeTexts?: boolean;
}

export interface ExportResult {
  blob: Blob | null;
  fileName: string;
  mimeType: string;
  /** Human-readable summary for the toast (e.g. "12 shapes, 8 connectors"). */
  summary: string;
}

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULTS: Required<Omit<ExportOptions, 'format' | 'fileName'>> = {
  scale: 2,
  background: 'white',
  padding: 40,
  includeStrokes: true,
  includeTexts: true,
};

// ==================== BOUNDS ====================

/** Union bounds of nodes (primary), dangling edge coords, strokes, texts. */
export function computeContentBounds(
  nodes: ArchNode[],
  edges: ArchEdge[],
  strokes: FreeStroke[] = [],
  texts: FreeText[] = [],
  padding = 0,
): ContentBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number, w = 0, h = 0): void => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  };
  for (const n of nodes) grow(n.x, n.y, n.w, n.h);
  for (const e of edges) if (!e.to && e.targetCoords) grow(e.targetCoords.x, e.targetCoords.y, 1, 1);
  for (const s of strokes) for (const p of s.pts) grow(p.x, p.y, 1, 1);
  for (const t of texts) grow(t.x, t.y - t.fontSize, t.text.length * t.fontSize * 0.6, t.fontSize * 1.4);
  if (!Number.isFinite(minX)) return null;
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

// ==================== XML / SVG HELPERS ====================

/** Proper XML attribute/text escaping (unlike naive replace chains). */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Route an edge the same way the canvas draw pass does — delegated to the
 * shared geometry helper (chain-sourced: draw, hit-test, export all match).
 */
export function edgePolyline(edge: ArchEdge, nodes: ArchNode[]): { x: number; y: number }[] | null {
  return edgePoints(edge, nodes, true, 'orthogonal');
}

function polylineToPath(pts: { x: number; y: number }[]): string {
  return 'M' + pts.map((p) => `${round(p.x)} ${round(p.y)}`).join(' L');
}

function round(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function dashArray(edge: ArchEdge): string {
  const style = edge.lineStyle ?? (edge.dashed ? 'dashed' : 'solid');
  if (style === 'dashed') return ' stroke-dasharray="6,4"';
  if (style === 'dotted') return ' stroke-dasharray="2,4"';
  return '';
}

const ARROW_ID = 'afx-arrow';

function svgDefs(): string {
  return (
    '<defs>' +
    `<marker id="${ARROW_ID}" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">` +
    '<path d="M0 0 L8 4 L0 8 Z" stroke="none" fill="context-stroke"/>' +
    '</marker>' +
    '</defs>'
  );
}

// ==================== ICON INLINING ====================

const iconDataCache = new Map<string, string>();

/**
 * Fetch each iconSrc and convert to a data URI so exports are self-contained
 * (vendor SVGs live at /icons/** — fine in-app, broken in exported files).
 * Failures resolve to null and the icon is skipped, never thrown.
 */
export async function inlineIcons(iconSrcs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.allSettled(
    [...new Set(iconSrcs)].map(async (src) => {
      const cached = iconDataCache.get(src);
      if (cached) { out.set(src, cached); return; }
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        const text = await res.text();
        const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        iconDataCache.set(src, dataUri);
        out.set(src, dataUri);
      } catch {
        // offline or missing asset — skip silently, shape renders without icon
      }
    }),
  );
  return out;
}

/** Data URIs computed synchronously when the caller already has them. */
export function prewarmIconCache(): Map<string, string> {
  return iconDataCache;
}

// ==================== SVG BUILDER (pure once icons are inlined) ====================

export interface SvgBuildContext {
  isDark: boolean;
  icons: Map<string, string>;
}

/**
 * Build a full-document SVG string. Bounds determine the viewBox so output is
 * tightly cropped like LucidChart's SVG export, not a viewport screenshot.
 */
export function buildSVG(
  doc: DiagramDoc,
  options: ExportOptions,
  ctx: SvgBuildContext = { isDark: false, icons: new Map() },
): string {
  const opts = { ...DEFAULTS, ...options };
  const strokes = opts.includeStrokes ? doc.strokes ?? [] : [];
  const texts = opts.includeTexts ? doc.texts ?? [] : [];
  const bounds = computeContentBounds(doc.nodes, doc.edges, strokes, texts, opts.padding);
  if (!bounds) return '';

  const w = Math.ceil(bounds.maxX - bounds.minX);
  const h = Math.ceil(bounds.maxY - bounds.minY);
  const bg =
    opts.background === 'transparent' ? 'none'
      : opts.background === 'dark' || ctx.isDark ? '#0B0E14'
        : '#FFFFFF';

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="${round(bounds.minX)} ${round(bounds.minY)} ${w} ${h}">`,
  );
  parts.push(`<title>${escapeXml(doc.title)}</title>`);
  parts.push(svgDefs());
  if (bg !== 'none') parts.push(`<rect x="${round(bounds.minX)}" y="${round(bounds.minY)}" width="${w}" height="${h}" fill="${bg}"/>`);

  // Edges under nodes (same z-order as canvas)
  for (const edge of doc.edges) {
    const pts = edgePolyline(edge, doc.nodes);
    if (!pts) continue;
    const color = edge.isDangling ? '#98600A' : edge.color || '#6B7280';
    const sw = 2;
    const arrow = edge.arrow ?? 'end';
    const markerStart = arrow === 'both' ? ` marker-start="url(#${ARROW_ID})"` : '';
    const markerEnd = arrow !== 'none' ? ` marker-end="url(#${ARROW_ID})"` : '';
    parts.push(
      `<path d="${polylineToPath(pts)}" fill="none" stroke="${color}" stroke-width="${sw}"${dashArray(edge)}` +
      `${markerStart}${markerEnd}/>`,
    );
    if (edge.label) {
      const mid = pts[Math.floor(pts.length / 2)];
      parts.push(
        `<text x="${round(mid.x)}" y="${round(mid.y - 8)}" font-family="Inter, sans-serif" font-size="12" ` +
        `font-weight="600" fill="${color}" text-anchor="middle">${escapeXml(edge.label)}</text>`,
      );
      if (edge.protocol) {
        parts.push(
          `<text x="${round(mid.x)}" y="${round(mid.y + 8)}" font-family="Inter, sans-serif" font-size="10" ` +
          `fill="${color}" opacity="0.7" text-anchor="middle">${escapeXml(edge.protocol)}</text>`,
        );
      }
    }
  }

  // Nodes
  for (const node of doc.nodes) {
    parts.push(buildNodeSVG(node, ctx));
  }

  // Ink strokes
  for (const stroke of strokes) {
    if (stroke.pts.length < 2) continue;
    const path = polylineToPath(stroke.pts);
    parts.push(`<path d="${path}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Free text
  for (const text of texts) {
    const family = text.fontFamily ? `'${text.fontFamily}', cursive` : 'Inter, sans-serif';
    const weight = text.bold ? '700' : '400';
    const style = text.italic ? ' font-style="italic"' : '';
    if (text.fill && text.fill !== 'transparent') {
      parts.push(
        `<rect x="${round(text.x - 4)}" y="${round(text.y - text.fontSize - 2)}" ` +
        `width="${round(textWidth(text, 12)) + 8}" height="${round(text.fontSize * 1.5 + 4)}" ` +
        `rx="4" fill="${text.fill}"${text.border ? ` stroke="${text.color}" stroke-width="1"` : ''}/>`,
      );
    }
    parts.push(
      `<text x="${round(text.x)}" y="${round(text.y)}" font-family="${family}" font-size="${text.fontSize}" ` +
      `font-weight="${weight}" fill="${text.color}"${style}>${escapeXml(text.text)}</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function textWidth(text: FreeText, fallbackCharW: number): number {
  return Math.max(40, text.text.length * text.fontSize * 0.55 || fallbackCharW * 8);
}

function buildNodeSVG(node: ArchNode, ctx: SvgBuildContext): string {
  const bg = node.fill ?? (ctx.isDark ? '#191D25' : '#FFFFFF');
  const stroke = node.stroke || '#C7CDD7';
  const parts: string[] = [];
  parts.push(`<g id="${escapeXml(node.id)}">`);

  if (node.shape === 'cylinder') {
    const ry = node.h * 0.15;
    parts.push(
      `<path d="M${node.x} ${round(node.y + ry)}` +
      ` V${round(node.y + node.h - ry)}` +
      ` A${round(node.w / 2)} ${round(ry)} 0 0 0 ${node.x + node.w} ${round(node.y + node.h - ry)}` +
      ` V${round(node.y + ry)}" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>`,
      `<ellipse cx="${round(node.x + node.w / 2)}" cy="${round(node.y + ry)}" rx="${round(node.w / 2)}" ry="${round(ry)}" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>`,
    );
  } else {
    const rx = node.shape === 'rounded' ? 10 : 6;
    parts.push(`<rect x="${round(node.x)}" y="${round(node.y)}" width="${round(node.w)}" height="${round(node.h)}" rx="${rx}" fill="${bg}" stroke="${stroke}" stroke-width="${node.strokeWidth ?? 1.5}"/>`);
    if (node.shape !== 'logo') {
      parts.push(`<line x1="${round(node.x)}" y1="${round(node.y + 32)}" x2="${round(node.x + node.w)}" y2="${round(node.y + 32)}" stroke="${stroke}" stroke-width="1" opacity="0.5"/>`);
    }
  }

  // Icon: embedded data URI, else emoji glyph fallback
  const hasIcon = node.icon || node.iconSrc;
  if (node.iconSrc && ctx.icons.has(node.iconSrc)) {
    const size = node.shape === 'logo' ? Math.min(node.w, node.h) : 24;
    const ix = node.shape === 'logo' ? node.x + (node.w - size) / 2 : node.x + 10;
    const iy = node.shape === 'logo' ? node.y + (node.h - size) / 2 : node.y + 7;
    parts.push(`<image x="${round(ix)}" y="${round(iy)}" width="${round(size)}" height="${round(size)}" href="${ctx.icons.get(node.iconSrc)}"/>`);
  } else if (node.icon) {
    const size = node.shape === 'logo' ? Math.min(node.w, node.h) * 0.7 : 20;
    const ix = node.shape === 'logo' ? node.x + node.w / 2 : node.x + 12;
    const iy = node.shape === 'logo' ? node.y + node.h / 2 : node.y + 22;
    parts.push(
      `<text x="${round(ix)}" y="${round(iy)}" font-size="${round(size)}" text-anchor="${node.shape === 'logo' ? 'middle' : 'start'}" dominant-baseline="central">${escapeXml(node.icon)}</text>`,
    );
  }

  if (node.shape !== 'logo') {
    const textX = node.x + (hasIcon ? 42 : 14);
    parts.push(
      `<text x="${round(textX)}" y="${round(node.y + 20)}" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="${ctx.isDark ? '#F9FAFB' : '#1F2937'}">${escapeXml(node.label)}</text>`,
    );
    if (node.tag) {
      parts.push(`<text x="${round(textX)}" y="${round(node.y + 40)}" font-family="Inter, sans-serif" font-size="11" fill="${ctx.isDark ? '#9CA3AF' : '#6B7280'}">${escapeXml(node.tag)}</text>`);
    }
    if (node.details?.trim()) {
      const maxChars = Math.max(8, Math.floor((node.w - (hasIcon ? 42 : 14) - 8) / 6));
      const lines = node.details.split('\n').slice(0, 3);
      lines.forEach((line, i) => {
        const t = line.length > maxChars ? line.slice(0, maxChars) + '…' : line;
        parts.push(`<text x="${round(textX)}" y="${round(node.y + 58 + i * 13)}" font-family="Inter, sans-serif" font-size="10" fill="${ctx.isDark ? '#9CA3AF' : '#6B7280'}">${escapeXml(t)}</text>`);
      });
    }
  }
  parts.push('</g>');
  return parts.join('\n');
}

// ==================== CSV BUILDER (pure) ====================

/** CSV cell with RFC 4180 quoting. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Single-file CSV (LucidChart ucb7Kh parity): a Shapes section followed by a
 * Connectors section, importable into Sheets/Excel. Returns header+rows text.
 */
export function buildCSV(doc: DiagramDoc): string {
  const lines: string[] = [];
  lines.push(`# document,${csvCell(doc.title)},id,${csvCell(doc.id)},exported,${new Date().toISOString()}`);
  lines.push('');
  lines.push('section,type,id,label,tag,health,x,y,width,height,port,repo,source,details');
  for (const n of doc.nodes) {
    lines.push([
      'shape', n.type, n.id, n.label, n.tag, n.health, n.x, n.y, n.w, n.h,
      n.port ?? '', n.repo ?? '', n.source ?? '', n.details ?? '',
    ].map(csvCell).join(','));
  }
  lines.push('');
  lines.push('section,type,id,from,to,label,protocol,arrow,lineStyle,dangling');
  for (const e of doc.edges) {
    lines.push([
      'connector', 'edge', e.id, e.from, e.to ?? '', e.label, e.protocol ?? '',
      e.arrow ?? 'end', e.lineStyle ?? (e.dashed ? 'dashed' : 'solid'),
      e.isDangling ? 'true' : 'false',
    ].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

// ==================== RASTER ====================

/**
 * Rasterize an SVG string to PNG blob. SVG loads in an <img> via data URL so
 * no server round-trip is needed; fonts must be system-safe in the SVG.
 */
export function svgToPngBlob(svg: string, scale: number, background: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        if (background !== 'transparent') {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b); }, 'image/png');
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ==================== DISPATCHER ====================

function mimeFor(format: ExportFormat): string {
  switch (format) {
    case 'json': return 'application/json';
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'csv': return 'text/csv';
    default: return 'application/octet-stream';
  }
}

function extFor(format: ExportFormat): string {
  switch (format) {
    case 'json': return 'arch';
    case 'svg': return 'svg';
    case 'png': return 'png';
    case 'csv': return 'csv';
    default: return 'txt';
  }
}

function sluggedFileName(doc: DiagramDoc, options: ExportOptions): string {
  const base = options.fileName ?? doc.title;
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';
  return `${slug}.${extFor(options.format)}`;
}

/**
 * LucidChart-style export dispatcher. Pure formats build in-memory strings,
 * raster awaits icon inlining, print delegates to window.print(). Returns a
 * Blob (or null for print) plus metadata for the UI toast — the caller owns
 * persistence.
 */
export async function exportDocument(doc: DiagramDoc, options: ExportOptions): Promise<ExportResult> {
  const fileName = sluggedFileName(doc, options);
  const summary = `${doc.nodes.length} shapes, ${doc.edges.length} connectors`;

  switch (options.format) {
    case 'json': {
      const payload = buildArchExport({
        nodes: doc.nodes,
        edges: doc.edges,
        strokes: doc.strokes ?? [],
        texts: doc.texts ?? [],
        docTitle: doc.title,
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: mimeFor('json') });
      return { blob, fileName, mimeType: mimeFor('json'), summary };
    }
    case 'svg': {
      const opts = { ...DEFAULTS, ...options };
      const icons = await inlineIcons(doc.nodes.map((n) => n.iconSrc).filter((s): s is string => Boolean(s)));
      const svg = buildSVG(doc, opts, { isDark: opts.background === 'dark', icons });
      return { blob: new Blob([svg], { type: mimeFor('svg') }), fileName, mimeType: mimeFor('svg'), summary };
    }
    case 'png': {
      const opts = { ...DEFAULTS, ...options };
      const icons = await inlineIcons(doc.nodes.map((n) => n.iconSrc).filter((s): s is string => Boolean(s)));
      const svg = buildSVG(doc, opts, { isDark: opts.background === 'dark', icons });
      const background = opts.background === 'dark' ? '#0B0E14' : opts.background === 'transparent' ? 'transparent' : '#FFFFFF';
      const blob = await svgToPngBlob(svg, opts.scale, background);
      return { blob, fileName, mimeType: mimeFor('png'), summary };
    }
    case 'csv': {
      const csv = buildCSV(doc);
      return { blob: new Blob([csv], { type: mimeFor('csv') }), fileName, mimeType: mimeFor('csv'), summary };
    }
    case 'print': {
      // Replace document content with a print-only SVG page, trigger dialog,
      // restore afterwards. Keeps LucidChart's print-service (`ucbHr`) flow
      // without a PDF library dependency.
      const opts = { ...DEFAULTS, ...options };
      const icons = await inlineIcons(doc.nodes.map((n) => n.iconSrc).filter((s): s is string => Boolean(s)));
      const svg = buildSVG(doc, opts, { isDark: false, icons });
      const container = document.createElement('div');
      container.innerHTML = svg;
      container.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;';
      const previousBodyAriaHidden = document.body.getAttribute('aria-hidden');
      document.body.appendChild(container);
      document.body.setAttribute('aria-hidden', 'true');
      await new Promise((r) => requestAnimationFrame(r));
      window.print();
      container.remove();
      if (previousBodyAriaHidden === null) document.body.removeAttribute('aria-hidden');
      else document.body.setAttribute('aria-hidden', previousBodyAriaHidden);
      return { blob: null, fileName, mimeType: 'application/pdf', summary };
    }
  }
}

/** Trigger a browser download for an ExportResult blob (no-op for print). */
export function downloadExport(result: ExportResult): void {
  if (!result.blob) return;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
