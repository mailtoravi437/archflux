/**
 * ArchFlux multi-layer canvas engine (LucidChart-parity architecture).
 *
 * Four stacked HTML canvases (bottom → top), each redrawing only when its
 * own dirty flag is set:
 *  1. grid        — dots/lines pattern (dirty only on viewport/config change)
 *  2. content     — edges, nodes, ink strokes, text, review pins, ports
 *  3. selection   — resize grips, alignment guides
 *  4. decorations — remote collaboration cursors
 *
 * Drawing itself is NOT duplicated here: every content primitive delegates to
 * the shared passes in render.ts (same functions CanvasScreen uses), so a
 * node is pixel-identical whether the app runs single-canvas or layered.
 *
 * Interaction (pointer events, hit-testing, snapping) stays in CanvasScreen
 * via canvasGeometry.ts. Deliberately no React imports.
 */
import type { ArchEdge, ArchNode, FreeStroke, FreeText } from '../types';
import { edgePoints, type ConnectorCurve } from '../canvasGeometry';
import {
  drawEdgePass,
  drawFreeTextPass,
  drawInkPass,
  drawNodePass,
  type NodeIconSource,
} from './render';

export type LayerName = 'grid' | 'content' | 'selection' | 'decorations';
export type GridStyle = 'dots' | 'lines' | 'none';

export interface ViewportTransform {
  /** Screen-space offset of world origin. */
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirty: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AwarenessCursor {
  userId: string;
  userName: string;
  userColor: string;
  x: number;
  y: number;
}

export interface AlignmentGuide {
  vertical: boolean;
  at: number;
}

export interface CanvasScene {
  nodes: ArchNode[];
  edges: ArchEdge[];
  strokes: FreeStroke[];
  texts: FreeText[];
  /** Node ids currently selected (engine mirrors the store selection). */
  selectedIds: string[];
  selectedEdgeId?: string | null;
  /** Connector source node id; renders pending glow + ports for all nodes. */
  pendingFrom: string | null;
  /** Show connector ports on every node (connector tool armed). */
  showPorts: boolean;
  /** Live in-progress ink (drawn last, unreleased). */
  pendingInk?: { pts: { x: number; y: number }[]; color: string; width: number } | null;
  cursors: AwarenessCursor[];
  alignGuides: AlignmentGuide[];
}

export interface EngineConfig {
  viewport: ViewportTransform;
  isDark: boolean;
  gridStyle: GridStyle;
  connectorCurve: ConnectorCurve;
  /** Whether routes honor the orthogonal midX rule (`orthogonal` setting). */
  orthogonal: boolean;
  devicePixelRatio: number;
}

const LAYER_ORDER: LayerName[] = ['grid', 'content', 'selection', 'decorations'];

export class CanvasEngine {
  private layers = new Map<LayerName, CanvasLayer>();
  private config: EngineConfig;
  private width = 0;
  private height = 0;
  private iconCache = new Map<string, HTMLImageElement>();

  /** Issued when an async icon finishes loading so the host can repaint. */
  onIconsSettled: (() => void) | null = null;

  /** Last-rendered input keys per layer (layers repaint only when these change). */
  private layerKeys = new Map<LayerName, string>();

  /**
   * Stable serialization of a layer's render inputs. Cursors are compared by
   * reference; everything else by value so equal frames skip work entirely.
   */
  private layerInputKey(name: LayerName, scene: CanvasScene): string {
    const { viewport, isDark, gridStyle } = this.config;
    switch (name) {
      case 'grid':
        return `${viewport.x}|${viewport.y}|${viewport.zoom}|${gridStyle}|${isDark}|${this.width}x${this.height}`;
      case 'selection':
        return `${viewport.x}|${viewport.y}|${viewport.zoom}|${isDark}|${scene.selectedIds.join(',')}|${scene.pendingFrom ?? ''}|${scene.alignGuides.map((g) => `${g.vertical ? 'v' : 'h'}${g.at}`).join(',')}`;
      case 'content': {
        // Graph changes are detected by reference identity (the store replaces
        // arrays/objects immutably); settings by value.
        const refs = [scene.nodes, scene.edges, scene.strokes, scene.texts, scene.pendingInk, scene.selectedEdgeId, scene.pendingFrom, scene.showPorts];
        let refDiff = '';
        for (let i = 0; i < refs.length; i++) {
          if (refs[i] !== this.lastContentRefs[i]) refDiff += `${i};`;
        }
        this.lastContentRefs = refs;
        return `${refDiff}|${viewport.x}|${viewport.y}|${viewport.zoom}|${isDark}|${this.config.orthogonal}|${this.config.connectorCurve}`;
      }
      case 'decorations':
        return `${viewport.x}|${viewport.y}|${viewport.zoom}|${scene.cursors.map((c) => `${c.userId}:${c.x}:${c.y}`).join('|')}`;
    }
  }

  /** Previous content references (identity comparison for graph changes). */
  private lastContentRefs: unknown[] = [];

  constructor(config: EngineConfig) {
    this.config = config;
  }

  // ==================== LIFECYCLE ====================

  /** Attach stacked canvases to a positioned container. Mount a subset (e.g. everything except 'content') when the host owns a content canvas. */
  mount(container: HTMLElement, layers: LayerName[] = LAYER_ORDER): void {
    this.unmount();
    for (const name of LAYER_ORDER) {
      if (!layers.includes(name)) continue;
      const canvas = document.createElement('canvas');
      canvas.className = 'af-canvas-layer';
      canvas.dataset.layer = name;
      Object.assign(canvas.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
      });
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CanvasEngine: 2d context unavailable');
      this.layers.set(name, { canvas, ctx, dirty: true });
      container.appendChild(canvas);
    }
    this.resize(container.clientWidth, container.clientHeight);
  }

  unmount(): void {
    for (const layer of this.layers.values()) layer.canvas.remove();
    this.layers.clear();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const dpr = this.config.devicePixelRatio;
    this.layerKeys.clear();
    for (const layer of this.layers.values()) {
      layer.canvas.width = Math.max(1, Math.round(width * dpr));
      layer.canvas.height = Math.max(1, Math.round(height * dpr));
      layer.canvas.style.width = `${width}px`;
      layer.canvas.style.height = `${height}px`;
      layer.dirty = true;
    }
  }

  destroy(): void {
    this.unmount();
    this.iconCache.clear();
    this.onIconsSettled = null;
  }

  /** The stacked canvas for a layer (for tests or direct composition). */
  layerCanvas(name: LayerName): HTMLCanvasElement | undefined {
    return this.layers.get(name)?.canvas;
  }

  get size(): Bounds {
    return { x: 0, y: 0, w: this.width, h: this.height };
  }

  // ==================== CONFIG ====================

  setViewport(viewport: Partial<ViewportTransform>): void {
    const prev = this.config.viewport;
    this.config.viewport = { ...this.config.viewport, ...viewport };
    if (prev.zoom !== this.config.viewport.zoom || prev.x !== this.config.viewport.x || prev.y !== this.config.viewport.y) {
      if (this.layers.has('grid')) this.layers.get('grid')!.dirty = true;
      if (this.layers.has('content')) this.layers.get('content')!.dirty = true;
    }
  }

  setConfig(updates: Partial<Omit<EngineConfig, 'viewport'>>): void {
    const gridTouched = updates.gridStyle !== undefined && updates.gridStyle !== this.config.gridStyle;
    const curveTouched = updates.connectorCurve !== undefined && updates.connectorCurve !== this.config.connectorCurve;
    const paletteTouched = updates.isDark !== undefined && updates.isDark !== this.config.isDark;
    const routeTouched = updates.orthogonal !== undefined && updates.orthogonal !== this.config.orthogonal;
    this.config = { ...this.config, ...updates };
    if (gridTouched && this.layers.has('grid')) this.layers.get('grid')!.dirty = true;
    if ((gridTouched || curveTouched || paletteTouched || routeTouched) && this.layers.has('content')) {
      this.layers.get('content')!.dirty = true;
    }
  }

  // ==================== COORDINATES ====================

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const { x: px, y: py, zoom } = this.config.viewport;
    return { x: x * zoom + px, y: y * zoom + py };
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    const { x: px, y: py, zoom } = this.config.viewport;
    return { x: (x - px) / zoom, y: (y - py) / zoom };
  }

  /** Expanded world-space view rect (for culling). */
  viewportWorldRect(): Bounds {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.width, this.height);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  // ==================== RENDER ====================

  /** Full render pass; layers redraw only when their render inputs changed. */
  render(scene: CanvasScene): void {
    if (!this.layers.size) return;
    for (const name of this.layers.keys()) {
      const key = this.layerInputKey(name, scene);
      const prev = this.layerKeys.get(name);
      if (prev !== key) {
        this.layers.get(name)!.dirty = true;
        this.layerKeys.set(name, key);
      }
    }
    this.ensureIcons(scene.nodes);
    this.applyLayer('grid', () => this.drawGrid());
    this.applyLayer('content', () => this.drawContent(scene));
    this.applyLayer('selection', () => this.drawSelection(scene));
    this.applyLayer('decorations', () => this.drawCursors(scene));
  }

  /** Force a layer to repaint on the next render() (host-driven invalidation). */
  invalidate(...names: LayerName[]): void {
    for (const name of names) {
      if (this.layers.has(name)) {
        this.layers.get(name)!.dirty = true;
        this.layerKeys.delete(name);
      }
    }
  }

  /** Composite all layers into one canvas covering `worldRect` (export path). */
  compositeWorld(worldRect: Bounds, scale: number, background?: string): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(worldRect.w * scale));
    out.height = Math.max(1, Math.round(worldRect.h * scale));
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('CanvasEngine: 2d context unavailable');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    const dpr = this.config.devicePixelRatio || 1;
    for (const name of LAYER_ORDER) {
      const layer = this.layers.get(name);
      if (!layer) continue;
      const sp = this.worldToScreen(worldRect.x, worldRect.y);
      const f = scale / dpr;
      ctx.drawImage(layer.canvas, -sp.x * f, -sp.y * f, layer.canvas.width * f, layer.canvas.height * f);
    }
    return out;
  }

  private applyLayer(name: LayerName, draw: () => void): void {
    const layer = this.layers.get(name);
    if (!layer || !layer.dirty) return;
    draw();
    layer.dirty = false;
  }

  // ==================== GRID ====================

  private drawGrid(): void {
    const layer = this.layers.get('grid')!;
    const ctx = layer.ctx;
    const dpr = this.config.devicePixelRatio;
    const { zoom, x: panX, y: panY } = this.config.viewport;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const spacing = 20 * zoom;
    if (spacing < 8) return; // too dense while zoomed out
    ctx.fillStyle = this.config.isDark ? '#232936' : '#E9EDF2';

    if (this.config.gridStyle === 'dots') {
      const r = zoom > 1.5 ? 1.2 : 1;
      for (let sx = panX % spacing; sx < this.width; sx += spacing) {
        for (let sy = panY % spacing; sy < this.height; sy += spacing) {
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (this.config.gridStyle === 'lines') {
      ctx.strokeStyle = this.config.isDark ? '#232936' : '#E9EDF2';
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let sx = panX % spacing; sx < this.width; sx += spacing) {
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      for (let sy = panY % spacing; sy < this.height; sy += spacing) {
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();
    }
  }

  // ==================== CONTENT ====================

  private drawContent(scene: CanvasScene): void {
    const layer = this.layers.get('content')!;
    const ctx = layer.ctx;
    const dpr = this.config.devicePixelRatio;
    const { zoom, x: panX, y: panY } = this.config.viewport;
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, panX * dpr, panY * dpr);
    ctx.clearRect(-panX / zoom, -panY / zoom, this.width / zoom, this.height / zoom);

    const view = this.viewportWorldRect();
    const inView = (x: number, y: number, bw = 0, bh = 0): boolean => {
      const pad = 80;
      return x + bw >= view.x - pad && x <= view.x + view.w + pad && y + bh >= view.y - pad && y <= view.y + view.h + pad;
    };
    const isDark = this.config.isDark;

    for (const edge of scene.edges) {
      const pts = edgePoints(edge, scene.nodes ?? [], this.config.orthogonal, this.config.connectorCurve);
      if (!pts || !pts.some((p) => inView(p.x, p.y))) continue;
      drawEdgePass(ctx, edge, scene.nodes ?? [], {
        isDark,
        selected: scene.selectedEdgeId === edge.id,
        orthogonal: this.config.orthogonal,
        curve: this.config.connectorCurve,
      });
    }

    for (const node of scene.nodes) {
      if (!inView(node.x, node.y, node.w, node.h)) continue;
      drawNodePass(ctx, node, this.iconSource, {
        isDark,
        selected: scene.selectedIds.includes(node.id),
        pending: scene.pendingFrom === node.id,
        showPorts: scene.showPorts,
      });
    }

    for (const stroke of scene.strokes) {
      if (stroke.pts.length < 2 || !stroke.pts.some((p) => inView(p.x, p.y))) continue;
      drawInkPass(ctx, stroke.pts, stroke.color, stroke.width, false);
    }

    for (const text of scene.texts) {
      if (!inView(text.x, text.y, 60, text.fontSize + 8)) continue;
      drawFreeTextPass(ctx, text, false, isDark);
    }

    if (scene.pendingInk && scene.pendingInk.pts.length > 0) {
      drawInkPass(ctx, scene.pendingInk.pts, scene.pendingInk.color, scene.pendingInk.width, false);
    }
  }

  // ==================== SELECTION LAYER ====================

  private drawSelection(scene: CanvasScene): void {
    const layer = this.layers.get('selection')!;
    const ctx = layer.ctx;
    const dpr = this.config.devicePixelRatio;
    const { x: panX, y: panY, zoom } = this.config.viewport;
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, panX * dpr, panY * dpr);
    ctx.clearRect(-panX / zoom, -panY / zoom, this.width / zoom, this.height / zoom);
    const isDark = this.config.isDark;

    // Resize grips on the single selected node (multi-select handled by marquee)
    if (scene.selectedIds.length === 1 && !scene.pendingFrom) {
      const sel = scene.nodes.find((n) => n.id === scene.selectedIds[0]);
      if (sel) {
        const grip = 12 / Math.max(zoom, 0.1);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = isDark ? '#8B83FF' : '#635BFF';
        ctx.lineWidth = 1.5 / Math.max(zoom, 0.1);
        for (const h of [
          { x: sel.x + sel.w, y: sel.y + sel.h / 2 },
          { x: sel.x + sel.w / 2, y: sel.y + sel.h },
          { x: sel.x + sel.w, y: sel.y + sel.h },
        ]) {
          ctx.fillRect(h.x - grip / 2, h.y - grip / 2, grip, grip);
          ctx.strokeRect(h.x - grip / 2, h.y - grip / 2, grip, grip);
        }
      }
    }

    // Live alignment guides for an in-flight snapped drag
    if (scene.alignGuides.length > 0) {
      const view = this.viewportWorldRect();
      ctx.save();
      ctx.strokeStyle = '#635BFF';
      ctx.lineWidth = 1.5 / Math.max(zoom, 0.1);
      ctx.setLineDash([6 / Math.max(zoom, 0.1), 4 / Math.max(zoom, 0.1)]);
      for (const g of scene.alignGuides) {
        ctx.beginPath();
        if (g.vertical) {
          ctx.moveTo(g.at, view.y);
          ctx.lineTo(g.at, view.y + view.h);
        } else {
          ctx.moveTo(view.x, g.at);
          ctx.lineTo(view.x + view.w, g.at);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ==================== DECORATIONS LAYER ====================

  private drawCursors(scene: CanvasScene): void {
    const layer = this.layers.get('decorations')!;
    const ctx = layer.ctx;
    const dpr = this.config.devicePixelRatio;
    const { x: panX, y: panY, zoom } = this.config.viewport;
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, panX * dpr, panY * dpr);
    ctx.clearRect(-panX / zoom, -panY / zoom, this.width / zoom, this.height / zoom);

    for (const cursor of scene.cursors) {
      const s = 12 / Math.max(zoom, 0.1);
      ctx.save();
      ctx.fillStyle = cursor.userColor;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5 / Math.max(zoom, 0.1);
      // Arrow pointer
      ctx.beginPath();
      ctx.moveTo(cursor.x, cursor.y);
      ctx.lineTo(cursor.x + s * 0.7, cursor.y + s);
      ctx.lineTo(cursor.x + s * 0.9, cursor.y + s * 0.55);
      ctx.lineTo(cursor.x + s * 1.35, cursor.y + s * 1.1);
      ctx.lineTo(cursor.x + s * 1.65, cursor.y + s * 0.9);
      ctx.lineTo(cursor.x + s * 1.1, cursor.y + s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Name pill
      ctx.font = "11px 'Inter', -apple-system, sans-serif";
      const w = ctx.measureText(cursor.userName).width;
      ctx.beginPath();
      ctx.roundRect(cursor.x + s, cursor.y + s, w + 10, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(cursor.userName, cursor.x + s + 5, cursor.y + s + 8);
      ctx.restore();
    }
  }

  // ==================== ICONS ====================

  /**
   * NodeIconSource bridge into the engine's own cache; the pass asks (drawn
   * only when loaded) and ensure() registers async loads that trigger
   * onIconsSettled so hosts can schedule a repaint.
   */
  private iconSource: NodeIconSource = {
    get: (src) => this.iconCache.get(src) ?? null,
    ensure: (src) => {
      if (this.iconCache.has(src)) return;
      const img = new Image();
      img.onload = () => {
        this.iconCache.set(src, img);
        this.layerKeys.delete('content');
        this.onIconsSettled?.();
      };
      img.onerror = () => this.onIconsSettled?.();
      img.src = src;
    },
  };

  private ensureIcons(nodes: ArchNode[]): void {
    let started = false;
    for (const node of nodes) {
      const src = node.iconSrc;
      if (!src || this.iconCache.has(src)) continue;
      // Placeholder marks the load as started; replaced on success.
      this.iconCache.set(src, new Image());
      started = true;
      const img = new Image();
      img.onload = () => {
        this.iconCache.set(src, img);
        this.layerKeys.delete('content');
        this.onIconsSettled?.();
      };
      img.onerror = () => {
        this.iconCache.delete(src); // allow retry next render
      };
      img.src = src;
    }
    if (started) {
      this.layers.get('content') && (this.layers.get('content')!.dirty = true);
      this.layerKeys.delete('content');
    }
  }
}
