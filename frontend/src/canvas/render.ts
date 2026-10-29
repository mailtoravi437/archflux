/**
 * Canvas render passes — the single source of truth for how ArchFlux draws
 * nodes, edges, ink, text, and review pins on a 2D context.
 *
 * Consumers:
 *  - CanvasScreen draw() (single-canvas main editor)
 *  - CanvasEngine (multi-layer engine; composition is in CanvasEngine)
 *
 * Pure: no React, no store access. Passes take a plain options bag with the
 * palette/selection flags they need. Vendor-icon loading is abstracted behind
 * NodeIconSource so each consumer can hook its own cache and repaint logic.
 *
 * This file is a barrel: the passes live in ./render/* (R1-E00-T07).
 */
export * from './render/types';
export * from './render/edges';
export * from './render/boundaries';
export * from './render/nodes';
export * from './render/nodePass';
export * from './render/shapes';
export * from './render/annotations';
