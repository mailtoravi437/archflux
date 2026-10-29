/**
 * Selection toolbar placement (Main.dc.html "Selection toolbar placement rule", 2026-10-26).
 * The bar sits ABOVE the selection box with a fixed gap, and flips BELOW when there is no room above,
 * so it never covers the selected element. All values are in canvas-container pixels.
 */
export const TOOLBAR_GAP = 12;
/** Default bar height (6 px padding + 28 px controls + border) used before the bar is measured. */
export const TOOLBAR_HEIGHT = 44;
/** Minimum distance from the container's top edge. */
export const TOOLBAR_MIN_TOP = 8;

export interface ToolbarPlacementInput {
  /** Top and bottom edges of the selection box on screen. */
  selTop: number;
  selBottom: number;
  barHeight: number;
}

export function placeContextToolbar({ selTop, selBottom, barHeight }: ToolbarPlacementInput): { top: number; placement: 'above' | 'below' } {
  const above = selTop - TOOLBAR_GAP - barHeight;
  if (above >= TOOLBAR_MIN_TOP) return { top: above, placement: 'above' };
  return { top: selBottom + TOOLBAR_GAP, placement: 'below' };
}
